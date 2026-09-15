#!/usr/bin/env python3
"""Convert raw rigged soldier FBXs in Assets/soldiers to clean runtime GLBs."""
import argparse,re,sys
from pathlib import Path
try: import bpy
except ImportError as exc: raise SystemExit("Run with Blender Python") from exc
REQUIRED={"mixamorig:Hips","mixamorig:Spine","mixamorig:Head","mixamorig:LeftHand","mixamorig:RightHand","mixamorig:LeftFoot","mixamorig:RightFoot"}
def args():
    av=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []; p=argparse.ArgumentParser(); p.add_argument("--input-dir",required=True); p.add_argument("--output-dir",required=True); return p.parse_args(av)
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def clear(): bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
def main():
    ns=args(); src=Path(ns.input_dir); dst=Path(ns.output_dir); dst.mkdir(parents=True,exist_ok=True); count=0
    for f in sorted(src.glob("*.fbx"),key=lambda p:p.name.lower()):
        clear(); bpy.ops.import_scene.fbx(filepath=str(f),use_anim=False,automatic_bone_orientation=False)
        arms=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
        if len(arms)!=1: raise RuntimeError(f"{f.name}: expected one armature, found {len(arms)}")
        missing=sorted(REQUIRED-{b.name for b in arms[0].data.bones})
        if missing: raise RuntimeError(f"{f.name}: noncanonical Mixamo rig; missing {', '.join(missing)}")
        # Soldier source filenames are the stable public identity; strip only the authoring suffix.
        name=re.sub(r"-rigged$","",slug(f.stem)); out=dst/(name+".glb")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",use_selection=True,export_animations=False,export_skins=True,export_morph=False)
        print(f"[soldier] {f.name} -> {out.name}"); count+=1
    if not count: raise SystemExit(f"No soldier FBXs in {src}")
if __name__=="__main__": main()
