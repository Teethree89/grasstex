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
REQUIRED_BONES={"hips","spine","spine1","spine2","neck","head","leftarm","leftforearm","lefthand","rightarm","rightforearm","righthand","leftupleg","leftleg","leftfoot","rightupleg","rightleg","rightfoot"}
# Exporters commonly vary only in case, separators and zero-padding. Keep aliases
# anatomical and conservative: we are validating compatibility, not renaming source FBXs.
ALIASES={
    "pelvis":"hips",
    "spine0":"spine","spine00":"spine","spine01":"spine1","spine001":"spine1","spine02":"spine2","spine002":"spine2",
    "neck0":"neck","neck00":"neck","neck01":"neck",
    "head0":"head","head00":"head","head01":"head",
    "leftforearm0":"leftforearm","rightforearm0":"rightforearm",
    "leftupperarm":"leftarm","rightupperarm":"rightarm",
    "leftthigh":"leftupleg","rightthigh":"rightupleg",
    "leftcalf":"leftleg","rightcalf":"rightleg",
}
def parse_args():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []; p=argparse.ArgumentParser(); p.add_argument("--input-dir",required=True); p.add_argument("--output-dir",required=True); return p.parse_args(argv)
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def canonical_bone_name(name):
    n=name.strip()
    for sep in (":","|"):
        if sep in n: n=n.rsplit(sep,1)[-1]
    n=re.sub(r"^(mixamorig|mixamo)[_.-]?", "", n, flags=re.I)
    n=re.sub(r"[^a-z0-9]", "", n.lower())
    # Normalize zero-padded numbered anatomical chains: Spine01 -> spine1.
    m=re.fullmatch(r"(spine|neck|head)(0*[0-9]+)",n)
    if m: n=m.group(1)+str(int(m.group(2)))
    return ALIASES.get(n,n)
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
def bone_map(a):
    out={}
    for b in a.data.bones:
        key=canonical_bone_name(b.name)
        if key in out and out[key]!=b.name: raise RuntimeError(f"ambiguous anatomical bone {key}: {out[key]}, {b.name}")
        out[key]=b.name
    return out
def validate(a):
    names=bone_map(a); missing=sorted(REQUIRED_BONES-set(names))
    if missing:
        actual=", ".join(f"{b.name}->{canonical_bone_name(b.name)}" for b in sorted(a.data.bones,key=lambda x:x.name.lower()))
        raise RuntimeError("incompatible skeletal rig; missing anatomical bones: "+", ".join(missing)+"; normalized imported bones: "+actual)
    return names
def strip_horizontal(action,hips_name):
    changed=0; hips_path=f'pose.bones["{hips_name}"]'
    # Blender's imported Mixamo coordinate system uses X/Y as ground plane and Z as vertical.
    for fc in action.fcurves:
        if hips_path not in fc.data_path or not fc.data_path.endswith("location") or fc.array_index not in (0,1) or not fc.keyframe_points: continue
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
            bpy.ops.import_scene.fbx(filepath=str(f),use_anim=True,automatic_bone_orientation=False); a=armature(); names=validate(a); act=action_for(a); name=slug(f.stem); in_place=f.stem.lower().startswith(LOCOMOTION_PREFIXES); curves=strip_horizontal(act,names["hips"]) if in_place else 0; discard_meshes(); out=dst/(name+".glb"); export(a,act,out)
            records.append({"clip":name,"source":f.name,"file":out.name,"inPlaceXZ":in_place,"rootCurvesNormalized":curves,"hipsBone":names["hips"],"frames":[int(act.frame_range[0]),int(act.frame_range[1])],"fps":int(bpy.context.scene.render.fps)}); print(f"[mixamo] {f.name} -> {out.name} (hips={names['hips']})")
        except Exception as exc: failures.append({"source":f.name,"error":str(exc)}); print(f"[mixamo] FAILED {f.name}: {exc}",file=sys.stderr)
    (dst/"manifest.json").write_text(json.dumps({"version":4,"rig":"mixamo-compatible","shared":True,"source":"Assets/animations/*.fbx","rootMotion":"locomotion horizontal travel stripped; vertical preserved","clips":records,"failures":failures},indent=2)+"\n")
    if failures: raise SystemExit(f"{len(failures)} clip(s) failed")
    print(f"[mixamo] converted {len(records)} clips")
if __name__=="__main__": main()
