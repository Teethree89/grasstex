"""Give an unrigged character the armature of a rigged twin from the same generator.

Tripo exports a character twice: a rigged one (armature, skin weights) and, for most of the
per-role characters, only an unrigged mesh. The unrigged ones cannot be used: the backend binds
clips by bone name. They are all the same base body in the same A-pose, normalised to the same
height, differing only in gear, so the rigged twin's armature and weights transfer across.

  1. Align: the mesh is fitted to the twin by bounding box, then refined by a few rounds of
     closest-point fitting (scale + translation only, as in `remesh-soldier-model.py`).
  2. Skin: weights are copied from the twin (nearest face, interpolated), limited to 4 influences
     and normalised, and the mesh is parented to the twin's armature.

The armature is exported exactly as it came in, so bone names and rest transforms (and with them
every clip, the retargeting and the weapon calibration) match the twin's. Gear the twin does not
have (an ammo box on the belt, a slung rifle) takes the weights of the nearest twin surface, which
is what it should follow anyway; check the lineup for anything that hangs off the wrong joint.

The mesh keeps its own UVs and albedo, still full size: run `fix-soldier-model.py` on the result
to rewind faces and embed a downscaled albedo under a unique name.

Run with Blender:
  Blender -b --factory-startup --python tools/rig-soldier-model.py -- \\
    --input tripo_convert_<id>.fbx --rigged tripo_convert_<rigged id>.fbx \\
    --output <intermediate>.fbx --name us-gunner
"""
import argparse
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="unrigged mesh (textured)")
    parser.add_argument("--rigged", required=True, help="rigged twin (same base body and pose)")
    parser.add_argument("--output", required=True)
    parser.add_argument("--name", required=True, help="object name")
    parser.add_argument("--max-gap", type=float, default=0.05,
                        help="fail if the 95%% surface gap to the twin exceeds this (metres)")
    return parser.parse_args(values)


def load(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def select_only(*objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def world_points(obj, limit=None):
    step = max(1, len(obj.data.vertices) // limit) if limit else 1
    mw = obj.matrix_world
    verts = obj.data.vertices
    return [mw @ verts[i].co for i in range(0, len(verts), step)]


def bounds(points):
    return (Vector([min(p[i] for p in points) for i in range(3)]),
            Vector([max(p[i] for p in points) for i in range(3)]))


def align(mesh, twin):
    """Scale + translate the mesh onto the twin; returns the mean/95th surface gap (m)."""
    mesh.data.transform(mesh.matrix_world)
    mesh.matrix_world = Matrix.Identity(4)
    tp = world_points(twin)
    tlo, thi = bounds(tp)
    mlo, mhi = bounds(world_points(mesh))
    s = (thi.z - tlo.z) / (mhi.z - mlo.z)
    t = (tlo + thi) / 2 - (mlo + mhi) / 2 * s
    mesh.data.transform(Matrix.Translation(t) @ Matrix.Scale(s, 4))
    # Closest-point refinement, scale + translation only (same pose, same orientation).
    for _ in range(4):
        mp = world_points(mesh)
        mtree = KDTree(len(mp))
        for i, p in enumerate(mp):
            mtree.insert(p, i)
        mtree.balance()
        pairs = [(p, mtree.find(p)[0]) for p in tp]
        cs = sum((q for _, q in pairs), Vector()) / len(pairs)
        ct = sum((p for p, _ in pairs), Vector()) / len(pairs)
        num = sum((p - ct).dot(q - cs) for p, q in pairs)
        den = sum((q - cs).length_squared for _, q in pairs)
        k = num / den if den else 1.0
        mesh.data.transform(Matrix.Translation(ct) @ Matrix.Scale(k, 4) @ Matrix.Translation(-cs))
    mp = world_points(mesh)
    mtree = KDTree(len(mp))
    for i, p in enumerate(mp):
        mtree.insert(p, i)
    mtree.balance()
    gaps = sorted(mtree.find(p)[2] for p in tp)
    return sum(gaps) / len(gaps), gaps[int(len(gaps) * .95)]


def skin(mesh, twin, rig):
    for g in twin.vertex_groups:
        mesh.vertex_groups.new(name=g.name)
    select_only(mesh)
    mod = mesh.modifiers.new("weights", "DATA_TRANSFER")
    mod.object = twin
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    mesh.parent = rig
    mesh.matrix_parent_inverse = rig.matrix_world.inverted()
    arm = mesh.modifiers.new("Armature", "ARMATURE")
    arm.object = rig
    return sum(1 for v in mesh.data.vertices if not v.groups)


def main():
    o = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    twin_objs = load(o.rigged)
    rig = next(x for x in twin_objs if x.type == "ARMATURE")
    twin = next(x for x in twin_objs if x.type == "MESH")
    mesh = next(x for x in load(o.input) if x.type == "MESH")
    mean, p95 = align(mesh, twin)
    print("ALIGN gap to rigged twin: mean %.4f m, 95%% %.4f m" % (mean, p95))
    if p95 > o.max_gap:
        raise RuntimeError("the mesh does not match the twin (95%% gap %.3f m > %.3f m): "
                           "different pose or body?" % (p95, o.max_gap))
    unweighted = skin(mesh, twin, rig)
    infl = max(len(v.groups) for v in mesh.data.vertices)
    print("SKIN max influences %d, unweighted %d" % (infl, unweighted))
    if unweighted:
        raise RuntimeError("%d vertices took no weight" % unweighted)
    bpy.data.objects.remove(twin, do_unlink=True)
    mesh.name = o.name
    bpy.ops.export_scene.fbx(
        filepath=o.output, use_selection=False, object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    print("RIGGED %s: %d bones, %d verts" % (o.output, len(rig.data.bones), len(mesh.data.vertices)))


if __name__ == "__main__":
    main()
