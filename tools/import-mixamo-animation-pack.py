#!/usr/bin/env python3
"""Normalize a directory of Mixamo FBX clips into reusable animation-only GLBs.

Run with Blender, for example:
  blender --background --python tools/import-mixamo-animation-pack.py -- \
    --input-dir /path/to/fbx --output-dir Assets/soldiers/animations/pro-rifle

Policy:
- navigation owns world X/Z, so locomotion clips are made in-place;
- Y is preserved (jump/death vertical motion remains available);
- imported meshes/materials are discarded; only the Mixamo armature/action is exported;
- clips are named deterministically so every compatible Mixamo soldier can share them.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

try:
    import bpy
except ImportError as exc:
    raise SystemExit("Run this script with Blender's Python (blender --background --python ...)") from exc

LOCOMOTION_PREFIXES = ("walk ", "run ", "sprint ")
REQUIRED_BONES = {
    "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
    "mixamorig:Neck", "mixamorig:Head", "mixamorig:LeftArm", "mixamorig:LeftForeArm",
    "mixamorig:LeftHand", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
    "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot",
    "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot",
}


def args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input-dir", required=True)
    p.add_argument("--output-dir", required=True)
    return p.parse_args(argv)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.materials):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def find_armature():
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise RuntimeError(f"expected one armature, found {len(arms)}")
    return arms[0]


def find_action(arm):
    if arm.animation_data and arm.animation_data.action:
        return arm.animation_data.action
    actions = list(bpy.data.actions)
    if len(actions) == 1:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = actions[0]
        return actions[0]
    raise RuntimeError(f"expected one action, found {len(actions)}")


def validate_mixamo(arm) -> None:
    names = {b.name for b in arm.data.bones}
    missing = sorted(REQUIRED_BONES - names)
    if missing:
        raise RuntimeError("not the canonical Mixamo hierarchy; missing: " + ", ".join(missing))


def strip_root_xz(action) -> int:
    """Zero Hips X/Z translation while preserving the first-frame offset and all Y motion."""
    changed = 0
    for fc in action.fcurves:
        path = fc.data_path
        if 'pose.bones["mixamorig:Hips"]' not in path or not path.endswith("location"):
            continue
        # Blender location indices: X=0, Y=1, Z=2. Mixamo FBX is converted by Blender;
        # horizontal motion is X/Y after FBX import and vertical is Z. Preserve vertical Z.
        if fc.array_index not in (0, 1):
            continue
        if not fc.keyframe_points:
            continue
        base = fc.keyframe_points[0].co.y
        for kp in fc.keyframe_points:
            kp.co.y = base
            kp.handle_left.y = base
            kp.handle_right.y = base
        changed += 1
    return changed


def discard_meshes() -> None:
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)


def export_clip(arm, action, output: Path) -> None:
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.animation_data.action = action
    action.name = output.stem
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_animations=True, export_nla_strips=False, export_frame_range=True,
        export_skins=True, export_morph=False,
    )


def main() -> None:
    ns = args()
    src, dst = Path(ns.input_dir), Path(ns.output_dir)
    dst.mkdir(parents=True, exist_ok=True)
    records = []
    failures = []
    files = sorted(src.glob("*.fbx"), key=lambda p: p.name.lower())
    if not files:
        raise SystemExit(f"No FBX files found in {src}")
    for fbx in files:
        clear_scene()
        try:
            bpy.ops.import_scene.fbx(filepath=str(fbx), use_anim=True, automatic_bone_orientation=False)
            arm = find_armature()
            validate_mixamo(arm)
            action = find_action(arm)
            clip = slug(fbx.stem)
            in_place = fbx.stem.lower().startswith(LOCOMOTION_PREFIXES)
            root_curves = strip_root_xz(action) if in_place else 0
            discard_meshes()
            out = dst / f"{clip}.glb"
            export_clip(arm, action, out)
            records.append({"clip": clip, "source": fbx.name, "file": out.name,
                            "inPlaceXZ": in_place, "rootCurvesNormalized": root_curves,
                            "frames": [int(action.frame_range[0]), int(action.frame_range[1])],
                            "fps": int(bpy.context.scene.render.fps)})
            print(f"[mixamo] {fbx.name} -> {out.name} inPlaceXZ={in_place}")
        except Exception as exc:
            failures.append({"source": fbx.name, "error": str(exc)})
            print(f"[mixamo] FAILED {fbx.name}: {exc}", file=sys.stderr)
    manifest = {"version": 1, "rig": "mixamo", "shared": True,
                "rootMotion": "locomotion X/Z stripped; vertical preserved",
                "clips": records, "failures": failures}
    (dst / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if failures:
        raise SystemExit(f"{len(failures)} clip(s) failed; see manifest.json")
    print(f"[mixamo] imported {len(records)} clips")

if __name__ == "__main__":
    main()
