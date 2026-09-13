"""Bake Human Soldier package motions into rig-local tracks for the procedural Battle Soldier.

Every FBX in the package carries its own armature rest pose (the idle/walk files and the rifle
files do not agree), so `matrix_basis` deltas cannot be mapped onto the procedural rig with a
fixed axis swap.  This baker instead reads each bone's *posed world orientation*, converts it to
Babylon's soldier space (X right, Y up, Z forward), rebuilds an equivalent frame for the
procedural joint (limbs hang along -Y, torso bones point along +Y, +Z faces forward), and stores
the resulting parent-relative quaternions.  The runtime applies them directly: no rest pose,
inverse bind matrix, skeleton, or mesh is exported.

Run with Blender:
  Blender --background --factory-startup --python tools/build-procedural-soldier-animations.py -- \
    --source /path/to/extracted-package --output /tmp/soldier-animations.js \
    --inline-soldier battle/soldier.js
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix, Vector


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

# Procedural joint -> (package bone, procedural parent joint, bone-direction sign).
# Sign +1: the package bone points along the joint's +Y (torso); -1: along -Y (hanging limbs).
# The feet are special: the package foot points forward, the procedural foot's +Z does.
BONES = {
    "hips": ("B-hips", None, 1),
    "spine": ("B-spine", "hips", 1),
    "chest": ("B-chest", "spine", 1),
    "neck": ("B-neck", "chest", 1),
    "head": ("B-head", "neck", 1),
    "upperArmR": ("B-upperArm.R", "chest", -1),
    "forearmR": ("B-forearm.R", "upperArmR", -1),
    "upperArmL": ("B-upperArm.L", "chest", -1),
    "forearmL": ("B-forearm.L", "upperArmL", -1),
    "thighR": ("B-thigh.R", "hips", -1),
    "shinR": ("B-shin.R", "thighR", -1),
    "footR": ("B-foot.R", "shinR", 0),
    "thighL": ("B-thigh.L", "hips", -1),
    "shinL": ("B-shin.L", "thighL", -1),
    "footL": ("B-foot.L", "shinL", 0),
}
PELVIS_HEIGHT_M = 0.91  # BODY.pelvisY in battle/soldier.js


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--inline-soldier", help="replace the generated-track block in soldier.js")
    parser.add_argument("--sample-rate", type=int, default=20)
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


def to_soldier_space(vector):
    # Imported package world: Z up, character faces -Y, character right is -X.
    return Vector((-vector.x, vector.z, -vector.y))


def bone_frame(rig, name):
    world = rig.matrix_world @ rig.pose.bones[name].matrix
    axes = [to_soldier_space(world.col[i].to_3d()).normalized() for i in range(3)]
    return axes, to_soldier_space(world.translation)


def orthonormal(y_axis, z_hint):
    y_axis = y_axis.normalized()
    z_axis = (z_hint - y_axis * z_hint.dot(y_axis)).normalized()
    x_axis = y_axis.cross(z_axis)
    return Matrix((x_axis, y_axis, z_axis)).transposed()


def pick_axis(axes, target, candidates):
    options = [(sign * axes[index], (index, sign)) for index in candidates for sign in (1, -1)]
    return max(options, key=lambda option: option[0].dot(target))[1]


def calibrate(rig):
    """Choose, once, which package bone axis plays the procedural joint's forward/up role."""
    choice = {}
    for joint, (bone, _, sign) in BONES.items():
        axes, _ = bone_frame(rig, bone)
        if sign == 0:
            choice[joint] = pick_axis(axes, Vector((0, 1, 0)), (0, 2))
        else:
            choice[joint] = pick_axis(axes, Vector((0, 0, 1)), (0, 2))
    return choice


def joint_world(rig, joint, choice):
    bone, _, sign = BONES[joint]
    axes, position = bone_frame(rig, bone)
    index, axis_sign = choice[joint]
    hint = axes[index] * axis_sign
    if sign == 0:
        return orthonormal(hint, axes[1]), position
    return orthonormal(axes[1] * sign, hint), position


def bake_clip(path, sample_rate, calibration):
    rig, action = import_clip(path)
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    start, end = action.frame_range
    duration = max(1.0 / sample_rate, (end - start) / fps)
    sample_count = max(2, round(duration * sample_rate) + 1)
    if calibration["axes"] is None:
        bpy.context.scene.frame_set(int(start))
        calibration["axes"] = calibrate(rig)
        _, hips = bone_frame(rig, "B-hips")
        calibration["hips"] = hips
    choice, rest_hips = calibration["axes"], calibration["hips"]
    scale = PELVIS_HEIGHT_M / rest_hips.y
    frames = []
    for index in range(sample_count):
        frame = start + min(end - start, duration * fps * index / (sample_count - 1))
        bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
        world = {}
        values = []
        for joint, (_, parent, _) in BONES.items():
            rotation, position = joint_world(rig, joint, choice)
            world[joint] = rotation
            local = rotation if parent is None else world[parent].transposed() @ rotation
            quat = local.to_quaternion()
            values.extend(round(value, 4) for value in (quat.x, quat.y, quat.z, quat.w))
            if joint == "hips":
                hips = position
        offset = (hips - rest_hips) * scale
        values.extend(round(value, 4) for value in (offset.x, offset.y, offset.z))
        frames.append(values)
    return {"duration": round(duration, 6), "frames": frames}


def main():
    options = args()
    source = os.path.abspath(options.source)
    missing = [relative for relative in CLIPS.values() if not os.path.isfile(os.path.join(source, relative))]
    if missing:
        raise RuntimeError("Missing package clip(s): " + ", ".join(missing))
    calibration = {"axes": None, "hips": None}
    baked = {name: bake_clip(os.path.join(source, relative), options.sample_rate, calibration) for name, relative in CLIPS.items()}
    payload = {
        "version": 2,
        "space": "procedural-rig-local",
        "sampleRate": options.sample_rate,
        "bones": list(BONES),
        "rootOffset": True,
        "clips": baked,
    }
    os.makedirs(os.path.dirname(os.path.abspath(options.output)), exist_ok=True)
    serialized = json.dumps(payload, separators=(",", ":"))
    with open(options.output, "w", encoding="utf-8") as output:
        output.write("/* Generated from Human Soldier Animations FREE; see build-procedural-soldier-animations.py. */\n")
        output.write("window.BattleSoldierAnimationClips=")
        output.write(serialized)
        output.write(";\n")
    if options.inline_soldier:
        with open(options.inline_soldier, "r", encoding="utf-8") as source_file:
            source = source_file.read()
        start = "  /* BAKED_TRACKS_START: generated; do not hand-edit. */"
        end = "  /* BAKED_TRACKS_END */"
        left, separator, rest = source.partition(start)
        if not separator or end not in rest:
            raise RuntimeError("Could not find baked-track markers in " + options.inline_soldier)
        _, _, right = rest.partition(end)
        baked_block = start + "\n  root.BattleSoldierAnimationClips=" + serialized + ";\n" + end
        with open(options.inline_soldier, "w", encoding="utf-8") as source_file:
            source_file.write(left + baked_block + right)
    print("Wrote", options.output, "with", len(baked), "clips; calibration", calibration["axes"])


if __name__ == "__main__":
    main()
