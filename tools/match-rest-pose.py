"""Re-pose a soldier into the animation library's rest pose and re-bind the skin to it.

The backend retargets a clip by preserving each bone's rotation *relative to its rest pose*
(`retargetClips` in `battle/modules/53-fbx-soldier-backend.js`): when the clip rig sits at its rest,
the model sits at its own. So the two rest poses have to agree, or every clip is off by the
difference. The library is authored in a T-pose; the older characters happen to be within ~15
degrees of it and look right, but the generator's characters come in an A-pose, 44-45 degrees out
at the shoulder and elbow, which folds the arms in across the chest in every single clip.

This turns the model's rest pose into the library's: each bone is rotated to the orientation the
library's rig has for it (positions and bone lengths stay the model's own, so the body keeps its
proportions), the deformed mesh is baked at that pose, and the pose becomes the new rest.

Bone names are matched through the same canonicalisation the backend uses, so either naming dialect
works. Bones the library does not have (extra end bones) keep their orientation and simply ride
along with their parent.

Run with Blender:
  Blender -b --factory-startup --python tools/match-rest-pose.py -- \\
    --input <rigged>.fbx --rest-from "Assets/animations/<any clip>.fbx" --output <out>.fbx
"""
import argparse
import math
import re
import sys

import bpy
from mathutils import Matrix

SPINE = {"mixamo": {"spine": "spine0", "spine1": "spine1", "spine2": "spine2"},
         "legacy": {"spine02": "spine0", "spine01": "spine1", "spine": "spine2"}}
ALIAS = {"headtopend": "headend", "headend": "headend",
         "lefttoeend": "lefttoeend", "righttoeend": "righttoeend"}


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="rigged soldier FBX")
    parser.add_argument("--rest-from", required=True, help="any clip from Assets/animations")
    parser.add_argument("--output", required=True)
    parser.add_argument("--report-only", action="store_true",
                        help="print the rest offsets and exit without writing")
    return parser.parse_args(values)


def scheme_of(names):
    return "legacy" if any("spine02" in str(n).lower() for n in names) else "mixamo"


def canon(name, scheme):
    n = re.sub(r"[^a-z0-9]", "", re.sub(r"^mixamorig[:_]?", "", str(name).lower()))
    return SPINE[scheme].get(n) or ALIAS.get(n, n)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def rest_orientations(rig):
    """World-space rest orientation of every bone, by canonical name."""
    names = [b.name for b in rig.data.bones]
    scheme = scheme_of(names)
    mw = rig.matrix_world
    return {canon(b.name, scheme): (mw @ b.matrix_local).to_quaternion() for b in rig.data.bones}


def offsets(rig, reference):
    """Angle between each bone's rest orientation and the reference's, in degrees."""
    out = {}
    for name, q in rest_orientations(rig).items():
        if name in reference:
            # a quaternion's .angle runs to 2*pi; the rotation is the shorter way round.
            angle = q.rotation_difference(reference[name]).angle
            out[name] = math.degrees(min(angle, 2 * math.pi - angle))
    return out


def worst(report, keys=("leftarm", "rightarm", "leftforearm", "rightforearm")):
    return max((report.get(k, 0.0) for k in keys), default=0.0)


def repose(rig, reference):
    """Rotate every bone onto the reference's orientation, parents first. Bone positions follow
    from the chain, so the model keeps its own proportions; only orientations are replaced."""
    for bone in rig.data.bones:
        rig.pose.bones[bone.name].rotation_mode = "QUATERNION"
    ordered = sorted(rig.pose.bones, key=lambda pb: len(pb.parent_recursive))
    scheme = scheme_of([b.name for b in rig.data.bones])
    moved = 0
    for pb in ordered:
        target = reference.get(canon(pb.name, scheme))
        if target is None:
            continue
        # pose_bone.matrix is armature space; keep the head the chain already put it at.
        head = (rig.matrix_world @ pb.head)
        want = Matrix.Translation(head) @ target.to_matrix().to_4x4()
        pb.matrix = rig.matrix_world.inverted() @ want
        bpy.context.view_layer.update()
        moved += 1
    return moved


def rebind(rig, mesh):
    """Bake the posed shape into the mesh, make the pose the rest pose, and bind again."""
    modifier = next((m for m in mesh.modifiers if m.type == "ARMATURE"), None)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action="DESELECT")
    mesh.select_set(True)
    if modifier:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply()
    bpy.ops.object.mode_set(mode="OBJECT")
    new = mesh.modifiers.new("Armature", "ARMATURE")
    new.object = rig


def main():
    o = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    reference = rest_orientations(next(x for x in load(o.rest_from) if x.type == "ARMATURE"))
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    objects = load(o.input)
    rig = next(x for x in objects if x.type == "ARMATURE")
    mesh = next(x for x in objects if x.type == "MESH")
    before = offsets(rig, reference)
    print("REST before: worst arm %.1f deg (%s)" % (
        worst(before), ", ".join("%s %.0f" % (k, before[k]) for k in sorted(before) if before[k] > 5)[:200]))
    if o.report_only:
        return
    print("REPOSED %d bones" % repose(rig, reference))
    rebind(rig, mesh)
    after = offsets(rig, reference)
    print("REST after: worst arm %.2f deg, worst any bone %.2f deg" % (
        worst(after), max(after.values()) if after else 0.0))
    if worst(after) > 1.0:
        raise RuntimeError("the arms did not reach the library's rest pose")
    bpy.ops.export_scene.fbx(
        filepath=o.output, use_selection=False, object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    print("MATCHED %s" % o.output)


if __name__ == "__main__":
    main()
