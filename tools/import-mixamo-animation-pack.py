#!/usr/bin/env python3
"""Convert raw Mixamo FBX clips in Assets/animations into shared runtime GLBs.
Run: blender --background --python tools/import-mixamo-animation-pack.py -- --input-dir Assets/animations --output-dir Assets/runtime/animations
Raw FBXs stay untouched. Navigation owns world X/Z; locomotion is normalized in-place while vertical motion is preserved.
"""
from __future__ import annotations
import argparse,json,re,sys
from pathlib import Path
try: import bpy
except ImportError as exc: raise SystemExit("Run with Blender Python") from exc
LOCOMOTION_PREFIXES=("walk ","run ","sprint ")
REQUIRED_BONES={"mixamorig:Hips","mixamorig:Spine","mixamorig:Spine1","mixamorig:Spine2","mixamorig:Neck","mixamorig:Head","mixamorig:LeftArm","mixamorig:LeftForeArm","mixamorig:LeftHand","mixamorig:RightArm","mixamorig:RightForeArm","mixamorig:RightHand","mixamorig:LeftUpLeg","mixamorig:LeftLeg","mixamorig:LeftFoot","mixamorig:RightUpLeg","mixamorig:RightLeg","mixamorig:RightFoot"}
def parse_args():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []; p=argparse.ArgumentParser(); p.add_argument("--input-dir",required=True); p.add_argument("--output-dir",required=True); return p.parse_args(argv)
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def clear_scene():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.actions,bpy.data.armatures,bpy.data.meshes,bpy.data.materials):
        for block in list(blocks):
            if block.users==0: blocks.remove(block)
def armature():
    a=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
    if len(a)!=1: raise RuntimeError(f"expected one armature, found {len(a)}")
    return a[0]
def action_for(a):
    if a.animation_data and a.animation_data.action: return a.animation_data.action
    acts=list(bpy.data.actions)
    if len(acts)!=1: raise RuntimeError(f"expected one action, found {len(acts)}")
    if not a.animation_data: a.animation_data_create()
    a.animation_data.action=acts[0]; return acts[0]
def validate(a):
    missing=sorted(REQUIRED_BONES-{b.name for b in a.data.bones})
    if missing: raise RuntimeError("noncanonical Mixamo rig; missing: "+", ".join(missing))
def strip_horizontal(action):
    changed=0
    # Blender's imported Mixamo coordinate system uses X/Y as ground plane and Z as vertical.
    for fc in action.fcurves:
        if 'pose.bones["mixamorig:Hips"]' not in fc.data_path or not fc.data_path.endswith("location") or fc.array_index not in (0,1) or not fc.keyframe_points: continue
        base=fc.keyframe_points[0].co.y
        for kp in fc.keyframe_points: kp.co.y=base; kp.handle_left.y=base; kp.handle_right.y=base
        changed+=1
    return changed
def discard_meshes():
    for o in list(bpy.context.scene.objects):
        if o.type=="MESH": bpy.data.objects.remove(o,do_unlink=True)
def export(a,act,out):
    bpy.ops.object.select_all(action="DESELECT"); a.select_set(True); bpy.context.view_layer.objects.active=a; a.animation_data.action=act; act.name=out.stem
    bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",use_selection=True,export_animations=True,export_nla_strips=False,export_frame_range=True,export_skins=True,export_morph=False)
def main():
    ns=parse_args(); src=Path(ns.input_dir); dst=Path(ns.output_dir); dst.mkdir(parents=True,exist_ok=True); records=[]; failures=[]; files=sorted(src.glob("*.fbx"),key=lambda p:p.name.lower())
    if not files: raise SystemExit(f"No FBX files in {src}")
    for f in files:
        clear_scene()
        try:
            bpy.ops.import_scene.fbx(filepath=str(f),use_anim=True,automatic_bone_orientation=False); a=armature(); validate(a); act=action_for(a); name=slug(f.stem); in_place=f.stem.lower().startswith(LOCOMOTION_PREFIXES); curves=strip_horizontal(act) if in_place else 0; discard_meshes(); out=dst/(name+".glb"); export(a,act,out)
            records.append({"clip":name,"source":f.name,"file":out.name,"inPlaceXZ":in_place,"rootCurvesNormalized":curves,"frames":[int(act.frame_range[0]),int(act.frame_range[1])],"fps":int(bpy.context.scene.render.fps)}); print(f"[mixamo] {f.name} -> {out.name}")
        except Exception as exc: failures.append({"source":f.name,"error":str(exc)}); print(f"[mixamo] FAILED {f.name}: {exc}",file=sys.stderr)
    (dst/"manifest.json").write_text(json.dumps({"version":2,"rig":"mixamo","shared":True,"source":"Assets/animations/*.fbx","rootMotion":"locomotion horizontal travel stripped; vertical preserved","clips":records,"failures":failures},indent=2)+"\n")
    if failures: raise SystemExit(f"{len(failures)} clip(s) failed")
    print(f"[mixamo] converted {len(records)} clips")
if __name__=="__main__": main()
