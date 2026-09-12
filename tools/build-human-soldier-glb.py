"""Build the runtime soldier GLB from the Human Soldier Animations FREE package.

Run with Blender, after extracting the selected FBX files into ``--source``:

  Blender --background --factory-startup --python tools/build-human-soldier-glb.py -- \
    --source /path/to/extracted-fbx --output Assets/models/human-soldier.glb

The package uses one compatible male skeleton for its model and clips.  We retain the
model's original skin skeleton and copy compatible clip channels onto it, then export
named NLA tracks that Babylon exposes as animation groups.  Rebinding the mesh to the
animation FBX's visually similar rig is intentionally avoided: its inverse bind matrices
are different and will explode the mesh at runtime.
"""
import argparse
import os
import sys

import bpy


BASE_MODEL = "HumanM_Model.fbx"
CLIPS = {
    "idle": "HumanM@MilitaryIdle01.fbx",
    "walk": "HumanM@Walk01_Forward.fbx",
    "aim": "HumanM@Rifle_Aim01.fbx",
    "fire": "HumanM@Rifle_Aim01_Shoot01.fbx",
    "reload": "HumanM@Rifle_Reload01.fbx",
    "death.front": "HumanM@Death01.fbx",
    "death.back": "HumanM@Death02.fbx",
    "death.side": "HumanM@Death03.fbx",
}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def import_fbx(path):
    before_objects = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    objects = [obj for obj in bpy.data.objects if obj not in before_objects]
    actions = [action for action in bpy.data.actions if action not in before_actions]
    return objects, actions


def delete_objects(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        if obj and obj.name in bpy.data.objects:
            obj.select_set(True)
    bpy.ops.object.delete()


def retarget_action(source_action, target_armature, track_name):
    """Copy only channels that the model's skin skeleton can actually evaluate."""
    action = source_action.copy()
    action.name = track_name
    target_bones = set(target_armature.pose.bones.keys())
    for curve in list(action.fcurves):
        path = curve.data_path
        if path.startswith('pose.bones["'):
            bone_name = path.split('"', 2)[1]
            if bone_name not in target_bones:
                action.fcurves.remove(curve)
        else:
            # The non-root-motion clips do not need source Rig object transforms.  Keeping
            # them would apply FBX helper-object offsets to the model armature itself.
            action.fcurves.remove(curve)
    return action


def main():
    args = parse_args()
    source = os.path.abspath(args.source)
    output = os.path.abspath(args.output)
    required = [BASE_MODEL, *CLIPS.values()]
    absent = [name for name in required if not os.path.isfile(os.path.join(source, name))]
    if absent:
        raise RuntimeError("Missing package files: " + ", ".join(absent))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    model_objects, _ = import_fbx(os.path.join(source, BASE_MODEL))
    meshes = [obj for obj in model_objects if obj.type == "MESH"]
    model_armatures = [obj for obj in model_objects if obj.type == "ARMATURE"]
    if not meshes or not model_armatures:
        raise RuntimeError("The package model did not import as a skinned mesh with an armature")
    model_armature = model_armatures[0]

    actions = []
    for track_name, filename in CLIPS.items():
        imported_objects, imported_actions = import_fbx(os.path.join(source, filename))
        rigs = [obj for obj in imported_objects if obj.type == "ARMATURE"]
        if len(rigs) != 1 or len(imported_actions) != 1:
            raise RuntimeError("Expected one armature/action in " + filename)
        action = retarget_action(imported_actions[0], model_armature, track_name)
        actions.append(action)
        delete_objects(imported_objects)

    # Keep the FBX model hierarchy and its armature untouched.  Its bind pose is what the
    # body mesh was authored against; the clips only supply pose channels for those bones.
    for mesh in meshes:
        mesh.name = "HumanSoldierBody"
    model_armature.name = "HumanSoldierRig"
    model_armature.animation_data_create()
    model_armature.animation_data.action = None
    for action in actions:
        track = model_armature.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 0, action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]

    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_materials="EXPORT",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_merge_animation="NLA_TRACK",
        export_anim_single_armature=True,
        export_force_sampling=True,
        export_yup=True,
    )
    print("Wrote", output, "with tracks", ", ".join(CLIPS))


if __name__ == "__main__":
    main()
