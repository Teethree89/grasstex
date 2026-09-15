#!/usr/bin/env python3
"""Convert raw rigged soldier FBXs in Assets/soldiers to clean runtime GLBs."""
import argparse,re,sys
from pathlib import Path
try: import bpy
except ImportError as exc: raise SystemExit("Run with Blender Python") from exc
REQUIRED={"hips","spine","head","lefthand","righthand","leftfoot","rightfoot"}
ALIASES={"pelvis":"hips","spine0":"spine","spine00":"spine","head0":"head","head00":"head","head01":"head"}
def args():
    av=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []; p=argparse.ArgumentParser(); p.add_argument("--input-dir",required=True); p.add_argument("--output-dir",required=True); return p.parse_args(av)
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def canonical_bone_name(name):
    n=name.strip()
    for sep in (":","|"):
        if sep in n: n=n.rsplit(sep,1)[-1]
    n=re.sub(r"^(mixamorig|mixamo)[_.-]?", "", n, flags=re.I)
    n=re.sub(r"[^a-z0-9]", "", n.lower())
    m=re.fullmatch(r"(spine|neck|head)(0*[0-9]+)",n)
    if m: n=m.group(1)+str(int(m.group(2)))
    return ALIASES.get(n,n)
def clear(): bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
def main():
    ns=args(); src=Path(ns.input_dir); dst=Path(ns.output_dir); dst.mkdir(parents=True,exist_ok=True); count=0
    for f in sorted(src.glob("*.fbx"),key=lambda p:p.name.lower()):
        clear(); bpy.ops.import_scene.fbx(filepath=str(f),use_anim=False,automatic_bone_orientation=False)
        arms=[o for o in bpy.context.scene.objects if o.type=="ARMATURE"]
        if len(arms)!=1: raise RuntimeError(f"{f.name}: expected one armature, found {len(arms)}")
        normalized={canonical_bone_name(b.name):b.name for b in arms[0].data.bones}
        missing=sorted(REQUIRED-set(normalized))
        if missing:
            actual=", ".join(f"{b.name}->{canonical_bone_name(b.name)}" for b in sorted(arms[0].data.bones,key=lambda x:x.name.lower()))
            raise RuntimeError(f"{f.name}: incompatible skeletal rig; missing {', '.join(missing)}; normalized imported bones: {actual}")
        # Soldier source filenames are the stable public identity; strip only the authoring suffix.
        name=re.sub(r"-rigged$","",slug(f.stem))
        # Preserve the intended public spelling even if an uploaded source filename has this known typo.
        name=name.replace("rifelman","rifleman")
        out=dst/(name+".glb")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(filepath=str(out),export_format="GLB",use_selection=True,export_animations=False,export_skins=True,export_morph=False)
        print(f"[soldier] {f.name} -> {out.name} (hips={normalized['hips']})"); count+=1
    if not count: raise SystemExit(f"No soldier FBXs in {src}")
if __name__=="__main__": main()
