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
import re
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
    parser.add_argument("--mapping", default="POLYINTERP_NEAREST",
                        help="Blender vert_mapping for the weight transfer")
    parser.add_argument("--influences", type=int, default=8,
                        help="max bones per vertex (Babylon reads 8; fingers need the headroom)")
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


def canon(name):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"^mixamorig[:_]?", "", str(name).lower()))


def hand_pass(mesh, twin, rig, radius=0.13):
    """Redo the weights around each hand against a hand-local alignment.

    The body-wide fit lands within 1-2 cm, which is fine for a torso but not for fingers about 1 cm
    thick: whole fingers end up nearer the gap between two of the twin's fingers than their own, so
    most finger bones come out of the transfer owning no skin and the hand deforms as one paddle.
    Matching the hands to each other first, then taking each vertex's weights from the single
    nearest twin vertex, keeps the fingers separate."""
    groups = {g.name: g.index for g in mesh.vertex_groups}
    src_groups = {g.index: g.name for g in twin.vertex_groups}
    fixed = 0
    for side in ("left", "right"):
        bone = next((b for b in rig.data.bones if canon(b.name) == side + "hand"), None)
        if bone is None:
            continue
        centre = rig.matrix_world @ bone.head_local
        tm, sm = mesh.matrix_world, twin.matrix_world
        tgt = [v for v in mesh.data.vertices if ((tm @ v.co) - centre).length < radius]
        src = [v for v in twin.data.vertices if ((sm @ v.co) - centre).length < radius]
        if not tgt or not src:
            continue
        # line the two hands up with each other before matching vertex to vertex
        tc = sum(((tm @ v.co) for v in tgt), Vector()) / len(tgt)
        sc = sum(((sm @ v.co) for v in src), Vector()) / len(src)
        shift = tc - sc
        tree = KDTree(len(src))
        for i, v in enumerate(src):
            tree.insert((sm @ v.co) + shift, i)
        tree.balance()
        for v in tgt:
            near = src[tree.find(tm @ v.co)[1]]
            for g in v.groups:
                g.weight = 0.0
            for g in near.groups:
                name = src_groups.get(g.group)
                if name in groups:
                    mesh.vertex_groups[groups[name]].add([v.index], g.weight, "REPLACE")
            fixed += 1
        smooth(mesh, [v.index for v in tgt])
    return fixed


def smooth(mesh, indices, factor=0.5, repeat=4):
    """Nearest-vertex weights are noisy: neighbouring vertices can land on different finger bones
    and the hand tears into spikes. Smoothing across the surface settles that without merging the
    fingers, which are separate in the mesh and so never neighbours."""
    for v in mesh.data.vertices:
        v.select = False
    for i in indices:
        mesh.data.vertices[i].select = True
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=factor, repeat=repeat)
    bpy.ops.object.mode_set(mode="OBJECT")


def skin(mesh, twin, rig, influences=8, mapping="POLYINTERP_NEAREST"):
    for g in twin.vertex_groups:
        mesh.vertex_groups.new(name=g.name)
    select_only(mesh)
    mod = mesh.modifiers.new("weights", "DATA_TRANSFER")
    mod.object = twin
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = mapping
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print("HANDS reweighted %d vertices against a hand-local fit" % hand_pass(mesh, twin, rig))
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=influences)
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
    unweighted = skin(mesh, twin, rig, o.influences, o.mapping)
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
