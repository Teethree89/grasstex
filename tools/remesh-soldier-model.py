"""Rebuild a soldier from its high-poly source as a clean, rigged game mesh.

Meshy's rigged low-poly exports are remeshed into one surface but full of pinches (fin triangles,
surfaces welded along an edge, small holes) and have no finger bones. The same character's
high-poly export (~1M triangles, watertight) is a better source: this script remeshes it into an
even quad mesh of about `--faces` faces, bakes its colour onto new UVs, and skins it to the rigged
low-poly twin's armature with the twin's weights, so bone names and rest transforms (and with them
every clip, the retargeting and the weapon calibration) stay exactly as they were.

  1. Align: the high-poly is centred on the origin at another scale; it is fitted to the twin by
     bounding box, then refined by a few rounds of closest-point fitting (scale + translation).
  2. Remesh: decimate to ~`--decimate` triangles (speed), then Quadriflow to `--faces` quads.
  3. UVs + bake: Smart UV Project, then the high-poly's albedo is baked across (Cycles, diffuse
     colour only) at `--texture-size`, embedded as a JPEG under a unique name.
  4. Skin: parented to the twin's armature, weights copied from the twin (nearest face,
     interpolated), limited to 4 influences and normalised.

Run with Blender:
  Blender -b --factory-startup --python tools/remesh-soldier-model.py -- \\
    --high Captain_highpoly.fbx --rigged "new US models/US-captain.fbx" \\
    --output Assets/soldiers/us-captain.fbx --name us-captain --faces 5000
"""
import argparse
import os
import sys
import tempfile
import time

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--high", required=True, help="high-poly source (textured, unrigged)")
    parser.add_argument("--rigged", required=True, help="rigged low-poly twin (same pose)")
    parser.add_argument("--output", required=True)
    parser.add_argument("--name", required=True, help="object/texture base name")
    parser.add_argument("--faces", type=int, default=5000,
                        help="quad count wanted (Quadriflow lands ~10%% under its target; compensated)")
    parser.add_argument("--decimate", type=int, default=100000,
                        help="triangles before remeshing (Quadriflow gave up on 250k)")
    parser.add_argument("--texture-size", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--hand-tris", type=int, default=900,
                        help="triangles per hand, rebuilt from the high-poly (0 keeps Quadriflow's)")
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


def align(high, twin):
    """Scale + translate the high-poly onto the twin; returns the mean/95th surface gap (m)."""
    high.data.transform(high.matrix_world)
    high.matrix_world = Matrix.Identity(4)
    tp = world_points(twin)
    tlo, thi = bounds(tp)
    hlo, hhi = bounds(world_points(high, 50000))
    s = (thi.z - tlo.z) / (hhi.z - hlo.z)
    t = (tlo + thi) / 2 - (hlo + hhi) / 2 * s
    high.data.transform(Matrix.Translation(t) @ Matrix.Scale(s, 4))
    tree = KDTree(len(tp))
    for i, p in enumerate(tp):
        tree.insert(p, i)
    tree.balance()
    # Closest-point refinement, scale + translation only (same pose, same orientation). The twin
    # is the sparse set, so match each twin vertex to the nearest high-poly vertex.
    for _ in range(4):
        hp = world_points(high, 60000)
        htree = KDTree(len(hp))
        for i, p in enumerate(hp):
            htree.insert(p, i)
        htree.balance()
        pairs = [(p, htree.find(p)[0]) for p in tp]
        cs = sum((q for _, q in pairs), Vector()) / len(pairs)
        ct = sum((p for p, _ in pairs), Vector()) / len(pairs)
        num = sum((p - ct).dot(q - cs) for p, q in pairs)
        den = sum((q - cs).length_squared for _, q in pairs)
        k = num / den if den else 1.0
        high.data.transform(Matrix.Translation(ct) @ Matrix.Scale(k, 4) @ Matrix.Translation(-cs))
    hp = world_points(high, 60000)
    htree = KDTree(len(hp))
    for i, p in enumerate(hp):
        htree.insert(p, i)
    htree.balance()
    gaps = sorted(htree.find(p)[2] for p in tp)
    return sum(gaps) / len(gaps), gaps[int(len(gaps) * .95)]


def remesh(high, faces, decimate, seed):
    low = high.copy()
    low.data = high.data.copy()
    bpy.context.collection.objects.link(low)
    select_only(low)
    tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    if tris > decimate:
        mod = low.modifiers.new("decimate", "DECIMATE")
        mod.ratio = decimate / tris
        bpy.ops.object.modifier_apply(modifier=mod.name)
    low.data.materials.clear()
    # Quadriflow refuses meshes with imported custom split normals ("needs to be manifold and have
    # consistent normals"), even when the surface is both.
    if low.data.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    result = bpy.ops.object.quadriflow_remesh(target_faces=int(faces * 1.12), seed=seed, use_mesh_symmetry=False,
                                              use_preserve_sharp=False, use_preserve_boundary=False,
                                              smooth_normals=False)
    if "FINISHED" not in result:
        raise RuntimeError("Quadriflow failed")
    close_holes(low)
    return low


def close_holes(obj):
    """Quadriflow can leave a few small holes; close them and turn the fill back into quads."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        made = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)["faces"]
        tris = bmesh.ops.triangulate(bm, faces=made)["faces"]
        bmesh.ops.join_triangles(bm, faces=tris, angle_face_threshold=3.14, angle_shape_threshold=3.14)
        print("HOLES closed %d boundary edges" % len(boundary))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def in_hand(p, wrist, axis, start, reach=0.30, radius=0.10):
    """Inside the hand cylinder: past `start` along the hand bone, near its axis."""
    d = (p - wrist).dot(axis)
    return start < d < reach and ((p - wrist) - axis * d).length < radius


def hand_frames(rig):
    mw = rig.matrix_world
    for side in ("Left", "Right"):
        wrist = mw @ rig.data.bones[side + "Hand"].head_local
        tip = mw @ rig.data.bones[side + "Hand_End"].head_local
        yield side, wrist, (tip - wrist).normalized()


def cut(bm, wrist, axis, at):
    """Split the surface at the plane `at` metres along the hand and drop the hand side, only
    inside the hand cylinder (the plane would also slice thighs and pouches)."""
    near = [f for f in bm.faces if any(in_hand(v.co, wrist, axis, at - 0.06) for v in f.verts)]
    geom = list({x for f in near for x in list(f.verts) + list(f.edges)}) + near
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=wrist + axis * at, plane_no=axis)
    doomed = [f for f in bm.faces if in_hand(f.calc_center_median(), wrist, axis, at)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")


def refine_hands(low, high, rig, hand_tris):
    """Quadriflow's even density fuses the fingers into a mitten. Each hand is rebuilt from the
    high-poly (decimated: it simplifies but never merges the separate fingers) and bridged onto the
    quad body at the wrist with a 1 cm band."""
    frames = list(hand_frames(rig))
    bm = bmesh.new()
    bm.from_mesh(low.data)
    for side, wrist, axis in frames:
        cut(bm, wrist, axis, 0.0)
    bm.to_mesh(low.data)
    bm.free()
    for side, wrist, axis in frames:
        hand = high.copy()
        hand.data = high.data.copy()
        bpy.context.collection.objects.link(hand)
        bm = bmesh.new()
        bm.from_mesh(hand.data)
        keep = [f for f in bm.faces if in_hand(f.calc_center_median(), wrist, axis, 0.0)]
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in set(keep)], context="FACES")
        # Now trim it to start 1 cm past the body's cut (the other side of the cut goes).
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                               plane_co=wrist + axis * 0.01, plane_no=axis, clear_inner=True)
        bm.to_mesh(hand.data)
        bm.free()
        hand.data.materials.clear()
        select_only(hand)
        if hand.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        tris = sum(len(p.vertices) - 2 for p in hand.data.polygons)
        mod = hand.modifiers.new("decimate", "DECIMATE")
        mod.ratio = min(1.0, hand_tris / max(1, tris))
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print("HAND %s: %d -> %d tris" % (side, tris, sum(len(p.vertices) - 2 for p in hand.data.polygons)))
        select_only(low, hand)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.join()
    bm = bmesh.new()
    bm.from_mesh(low.data)
    for side, wrist, axis in frames:
        rim = [e for e in bm.edges if e.is_boundary
               and all(in_hand(v.co, wrist, axis, -0.02, reach=0.03, radius=0.12) for v in e.verts)]
        loops = edge_loops(rim)
        print("WRIST %s: loops %s" % (side, [len(x) for x in loops]))
        if len(loops) != 2:
            raise RuntimeError("expected the sleeve rim and the hand rim at the %s wrist" % side)
        made = bmesh.ops.bridge_loops(bm, edges=loops[0] + loops[1])["faces"]
        print("BRIDGE %s: %d faces" % (side, len(made)))
    bm.to_mesh(low.data)
    bm.free()
    close_holes(low)


def edge_loops(edges):
    left, loops = set(edges), []
    while left:
        loop, stack = [], [left.pop()]
        while stack:
            e = stack.pop()
            loop.append(e)
            for v in e.verts:
                for x in v.link_edges:
                    if x in left:
                        left.remove(x)
                        stack.append(x)
        loops.append(loop)
    return loops


def unwrap(obj):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(high, low, name, size):
    # The diffuse-colour pass is base colour x (1 - metallic): metal parts would bake black.
    for slot in high.material_slots:
        bsdf = next((n for n in slot.material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            for link in list(bsdf.inputs["Metallic"].links):
                slot.material.node_tree.links.remove(link)
            bsdf.inputs["Metallic"].default_value = 0.0
    image = bpy.data.images.new(name, size, size, alpha=False)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    low.data.materials.clear()
    low.data.materials.append(mat)
    tree.nodes.active = node
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = False
    scene.render.bake.cage_extrusion = 0.02
    scene.render.bake.max_ray_distance = 0.05
    scene.render.bake.margin = 8
    select_only(low, high)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    path = os.path.join(tempfile.mkdtemp(), name + ".jpg")
    image.filepath_raw = path
    image.file_format = "JPEG"
    image.save(filepath=path, quality=92)
    image.filepath = path
    image.reload()
    image.pack()
    return image


def skin(low, twin, rig):
    for g in twin.vertex_groups:
        low.vertex_groups.new(name=g.name)
    select_only(low)
    mod = low.modifiers.new("weights", "DATA_TRANSFER")
    mod.object = twin
    mod.use_vert_data = True
    mod.data_types_verts = {"VGROUP_WEIGHTS"}
    mod.vert_mapping = "POLYINTERP_NEAREST"
    mod.layers_vgroup_select_src = "ALL"
    mod.layers_vgroup_select_dst = "NAME"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    low.parent = rig
    low.matrix_parent_inverse = rig.matrix_world.inverted()
    arm = low.modifiers.new("Armature", "ARMATURE")
    arm.object = rig
    unweighted = sum(1 for v in low.data.vertices if not v.groups)
    return unweighted


def report(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    sizes = {}
    for f in bm.faces:
        sizes[len(f.verts)] = sizes.get(len(f.verts), 0) + 1
    out = {"verts": len(bm.verts), "faces": len(bm.faces), "tris": sum(len(f.verts) - 2 for f in bm.faces),
           "sides": sizes, "boundary": sum(1 for e in bm.edges if e.is_boundary),
           "multi": sum(1 for e in bm.edges if len(e.link_faces) > 2),
           "nonmanifold_verts": sum(1 for v in bm.verts if not v.is_manifold)}
    bm.free()
    return out


def main():
    o = args()
    started = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    twin_objs = load(o.rigged)
    rig = next(x for x in twin_objs if x.type == "ARMATURE")
    twin = next(x for x in twin_objs if x.type == "MESH")
    high = next(x for x in load(o.high) if x.type == "MESH")
    mean, p95 = align(high, twin)
    print("ALIGN gap to rigged twin: mean %.4f m, 95%% %.4f m" % (mean, p95))
    low = remesh(high, o.faces, o.decimate, o.seed)
    if o.hand_tris:
        refine_hands(low, high, rig, o.hand_tris)
    print("REMESH", report(low), "%.0fs" % (time.time() - started))
    unwrap(low)
    bake(high, low, o.name + "-albedo", o.texture_size)
    print("BAKED %dpx %.0fs" % (o.texture_size, time.time() - started))
    unweighted = skin(low, twin, rig)
    infl = max(len(v.groups) for v in low.data.vertices)
    print("SKIN max influences %d, unweighted %d" % (infl, unweighted))
    for x in (twin, high):
        bpy.data.objects.remove(x, do_unlink=True)
    low.name = o.name
    for poly in low.data.polygons:
        poly.use_smooth = True
    bpy.ops.export_scene.fbx(
        filepath=o.output, use_selection=False, object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    print("REBUILT %s: %s in %.0fs" % (o.output, report(low), time.time() - started))


if __name__ == "__main__":
    main()
