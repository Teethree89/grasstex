"""Bake Human Soldier package motions into tracks for the procedural Battle Soldier rig.

This intentionally exports only pose deltas for joints shared by the procedural body.  It does
not export the package mesh, skeleton, or inverse bind matrices, so the runtime never depends on
skinned-GLB compatibility.

Run with Blender:
  Blender --background --factory-startup --python tools/build-procedural-soldier-animations.py -- \
    --source /path/to/extracted-fbx --output battle/soldier-animations.js
"""
import argparse
import json
import os
import sys

import bpy


CLIPS = {
    "idle": "Animations/Male/Idles/HumanM@MilitaryIdle01.fbx",
    "walk": "Animations/Male/Movement/Walk/HumanM@Walk01_Forward.fbx",
    "aim": "Animations/Male/Combat/Rifle/HumanM@Rifle_Aim01.fbx",
    "fire": "Animations/Male/Combat/Rifle/HumanM@Rifle_Aim01_Shoot01.fbx",
    "reload": "Animations/Male/Combat/Rifle/HumanM@Rifle_Reload01.fbx",
    "death.front": "Animations/Male/Combat/HumanM@Death01.fbx",
    "death.back": "Animations/Male/Combat/HumanM@Death02.fbx",
    "death.side": "Animations/Male/Combat/HumanM@Death03.fbx",
}

# The destination names are properties of the existing procedural rig, not package node names.
BONES = {
    "hips": "B-hips", "spine": "B-spine", "chest": "B-chest", "neck": "B-neck",
    "head": "B-head", "upperArmR": "B-upperArm.R", "forearmR": "B-forearm.R",
    "upperArmL": "B-upperArm.L", "forearmL": "B-forearm.L", "thighR": "B-thigh.R",
    "shinR": "B-shin.R", "footR": "B-foot.R", "thighL": "B-thigh.L",
    "shinL": "B-shin.L", "footL": "B-foot.L",
}


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--sample-rate", type=int, default=15)
    return parser.parse_args(values)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def import_clip(path):
    clear_scene()
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    if len(rigs) != 1 or len(actions) != 1:
        raise RuntimeError("Expected exactly one rig/action in " + path)
    rig, action = rigs[0], actions[0]
    rig.animation_data_create()
    rig.animation_data.action = action
    return rig, action


def bake_clip(path, sample_rate):
    rig, action = import_clip(path)
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    start, end = action.frame_range
    duration = max(1.0 / sample_rate, (end - start) / fps)
    sample_count = max(2, round(duration * sample_rate) + 1)
    frames = []
    source_bones = {name: rig.pose.bones.get(name) for name in BONES.values()}
    if not all(source_bones.values()):
        raise RuntimeError("A required package bone is missing in " + path)
    for index in range(sample_count):
        frame = start + min(end - start, duration * fps * index / (sample_count - 1))
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
        values = []
        for source_name in BONES.values():
            quat = source_bones[source_name].matrix_basis.to_quaternion()
            values.extend(round(value, 6) for value in (quat.x, quat.y, quat.z, quat.w))
        frames.append(values)
    return {"duration": round(duration, 6), "frames": frames}


def main():
    options = args()
    source = os.path.abspath(options.source)
    missing = [relative for relative in CLIPS.values() if not os.path.isfile(os.path.join(source, relative))]
    if missing:
        raise RuntimeError("Missing package clip(s): " + ", ".join(missing))
    baked = {name: bake_clip(os.path.join(source, relative), options.sample_rate) for name, relative in CLIPS.items()}
    payload = {"version": 1, "sampleRate": options.sample_rate, "bones": list(BONES), "clips": baked}
    os.makedirs(os.path.dirname(os.path.abspath(options.output)), exist_ok=True)
    with open(options.output, "w", encoding="utf-8") as output:
        output.write("/* Generated from Human Soldier Animations FREE; see build-procedural-soldier-animations.py. */\n")
        output.write("window.BattleSoldierAnimationClips=")
        json.dump(payload, output, separators=(",", ":"))
        output.write(";\n")
    print("Wrote", options.output, "with", len(baked), "clips")


if __name__ == "__main__":
    main()
