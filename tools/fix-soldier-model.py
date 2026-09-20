"""Repair an exported soldier character in Blender and write it back as FBX.

The US and German riflemen came out of an auto-rig/texturing pipeline with three defects that
Babylon shows plainly:

- ~1-2% of triangles are wound inside-out, which back-face culling turns into holes onto the
  body underneath (fixed by Blender's recalculation plus a ray test for whole inverted patches);
- both embed their albedo as "texture_0.png", which collides in Babylon's texture cache, and the
  albedo is also wired into the emissive slot;
- the German skin sits behind its skeleton (the rig was fitted to the US body): arm, leg and head
  joints are 4-10 cm in front of the vertices they drive.

Newer exports (the per-role US models) are remeshed into one surface but carry small pinches: a
stray "fin" triangle sharing an edge with two others next to a 1-7 edge hole. `--clean` removes the
fins and closes the holes (new faces take their neighbours' UVs; weights are per vertex).

This script fixes the mesh only. The armature (bone names, rest transforms) is exported unchanged,
so the shared animation clips keep binding by name. The skin is moved rather than the bones
because the clips set the hips position absolutely.

Run with Blender:
  Blender -b --factory-startup --python tools/fix-soldier-model.py -- \
    --input Assets/soldiers/ge-rifleman-rigged.fbx --output Assets/soldiers/ge-rifleman-rigged.fbx \
    --texture-name ge-rifleman-albedo --fit-skin
"""
import argparse
import os
import re
import sys
import tempfile

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Limb/head bones whose joints should sit inside the skin they drive. Spine bones are left out:
# their weights also cover the backpack and pouches, so their skin centroid is not the body core.
FIT_BONES = ["head", "leftarm", "leftforearm", "rightarm", "rightforearm", "leftupleg", "leftleg",
             "leftfoot", "rightupleg", "rightleg", "rightfoot"]


def canon(name):
    """Bone names without rig dialect: 'mixamorig:LeftArm' and 'LeftArm' both read 'leftarm'."""
    return re.sub(r"[^a-z0-9]", "", re.sub(r"^mixamorig[:_]?", "", str(name).lower()))


def bone(rig, name):
    for pose_bone in rig.pose.bones:
        if canon(pose_bone.name) == name:
            return pose_bone
    return None


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--texture-name", required=True)
    parser.add_argument("--fit-skin", action="store_true", help="move the skin onto its skeleton")
    parser.add_argument("--keep-normal", action="store_true", help="keep the normal map")
    parser.add_argument("--clean", action="store_true", help="remove fin faces and close small holes")
    parser.add_argument("--max-hole", type=int, default=32, help="largest hole (edges) --clean closes")
    parser.add_argument("--texture-size", type=int, default=0, help="downscale the albedo to this size")
    return parser.parse_args(values)


def objects():
    mesh = [o for o in bpy.data.objects if o.type == "MESH"]
    rig = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(mesh) != 1 or len(rig) != 1:
        raise RuntimeError("expected one mesh and one armature")
    return mesh[0], rig[0]


def forward_axis(rig):
    """Which way the character faces: the toes point forward on every rig here. Older characters
    also carry a 'headfront' helper bone, which is used when the toes are missing."""
    for base, tip in (("lefttoebase", "lefttoeend"), ("righttoebase", "righttoeend"), ("head", "headfront")):
        a, b = bone(rig, base), bone(rig, tip)
        if a and b:
            axis = (rig.matrix_world @ b.head) - (rig.matrix_world @ a.head)
            axis.z = 0
            if axis.length > 1e-4:
                return axis.normalized()
    raise RuntimeError("cannot tell which way the rig faces")


def skin_offset(mesh, rig, axis):
    """Mean forward distance from each fit bone's midpoint to the centroid of the skin it drives."""
    names = {g.index: canon(g.name) for g in mesh.vertex_groups}
    sums = {}
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.weight > 0.5 and names[g.group] in FIT_BONES:
                entry = sums.setdefault(names[g.group], [Vector(), 0])
                entry[0] += mesh.matrix_world @ v.co
                entry[1] += 1
    offsets = []
    for name, (total, count) in sums.items():
        joint = bone(rig, name)
        if joint is None:
            continue
        mid = rig.matrix_world @ ((joint.head + joint.tail) / 2)
        offsets.append((mid - total / count).dot(axis))
    return sum(offsets) / len(offsets)


def fix_winding(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    before = [f.normal.copy() for f in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # recalc_face_normals leaves small patches that are inverted as a whole (nothing around them to
    # vote). Flip a face only on strong evidence: its front looks into the body (a ray along the
    # normal hits the mesh) while its back looks at open air (a ray the other way hits nothing).
    # A hidden inner layer (the body under the smock) sees geometry both ways and is left alone.
    tree = BVHTree.FromBMesh(bm)
    inside_out = []
    for face in bm.faces:
        centre, normal = face.calc_center_median(), face.normal
        eps = normal * 1e-4
        ahead = tree.ray_cast(centre + eps, normal)[0] is not None
        behind = tree.ray_cast(centre - eps, -normal)[0] is not None
        if ahead and not behind:
            inside_out.append(face)
    bmesh.ops.reverse_faces(bm, faces=inside_out)
    bm.normal_update()
    flipped = sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < 0)
    bm.to_mesh(mesh.data)
    bm.free()
    # The imported custom normals followed the old winding; let Blender derive them again.
    if mesh.data.has_custom_normals:
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for poly in mesh.data.polygons:
        poly.use_smooth = False
    return flipped


def topology_report(bm):
    return {
        "boundary": sum(1 for e in bm.edges if e.is_boundary),
        "multi": sum(1 for e in bm.edges if len(e.link_faces) > 2),
        "wire": sum(1 for e in bm.edges if not e.link_faces),
        "loose": sum(1 for v in bm.verts if not v.link_faces),
        "degenerate": sum(1 for f in bm.faces if f.calc_area() < 1e-12),
    }


def fill_uvs(bm, faces):
    """Give filled faces the UVs their vertices already have in a neighbouring face, preferring a
    face that shares an edge (so the patch samples one side of any UV seam)."""
    uv = bm.loops.layers.uv.active
    if uv is None:
        return
    new = set(faces)
    for face in faces:
        source = None
        for edge in face.edges:
            for other in edge.link_faces:
                if other not in new:
                    source = other
                    break
            if source:
                break
        for loop in face.loops:
            pick = None
            if source:
                pick = next((l for l in source.loops if l.vert == loop.vert), None)
            if pick is None:
                pick = next((l for l in loop.vert.link_loops if l.face not in new), None)
            if pick is not None:
                loop[uv].uv = pick[uv].uv.copy()


def edge_forward(edge, face):
    """True if `face` walks `edge` from verts[0] to verts[1]."""
    for loop in face.loops:
        if loop.edge == edge:
            return loop.vert == edge.verts[0]
    return None


def pair_faces(edge):
    """Split the faces on a pinched edge into the surfaces that continue across it: a face pairs
    with one that walks the edge the other way and whose normal is closest to its own. Faces left
    over (inconsistent winding, which fix_winding sorts out later) pair by normal alone."""
    fwd = [f for f in edge.link_faces if edge_forward(edge, f)]
    back = [f for f in edge.link_faces if not edge_forward(edge, f)]
    pairs = []
    while fwd and back:
        f, g = max(((f, g) for f in fwd for g in back), key=lambda p: p[0].normal.dot(p[1].normal))
        pairs.append((f, g))
        fwd.remove(f)
        back.remove(g)
    rest = fwd + back
    while len(rest) > 1:
        f, g = max(((f, g) for i, f in enumerate(rest) for g in rest[i + 1:]),
                   key=lambda p: abs(p[0].normal.dot(p[1].normal)))
        pairs.append((f, g))
        rest.remove(f)
        rest.remove(g)
    return pairs


def unpinch(bm):
    """Two surfaces touching along an edge (four faces on it, e.g. the helmet shell on the head)
    are separated: the edge is ripped and each face welded back to the face that continues its own
    surface (pair_faces). Edges this cannot settle are left for the final seam pass."""
    multi = [e for e in bm.edges if len(e.link_faces) > 2]
    if not multi:
        return 0
    plan = [(e.verts[0].co.copy(), e.verts[1].co.copy(), pair_faces(e)) for e in multi]
    bmesh.ops.split_edges(bm, edges=multi)
    targetmap = {}

    def root(v):
        while v in targetmap:
            v = targetmap[v]
        return v

    for a, b, pairs in plan:
        for f, g in pairs:
            if not (f.is_valid and g.is_valid):
                continue
            for p in (a, b):
                keep = root(min(f.verts, key=lambda v: (v.co - p).length))
                drop = root(min(g.verts, key=lambda v: (v.co - p).length))
                if keep is not drop:
                    targetmap[drop] = keep
    if targetmap:
        bmesh.ops.weld_verts(bm, targetmap=targetmap)
    return len(multi)


def seams(bm):
    """Boundary edges that lie exactly on another boundary edge: zero-width seams left where two
    surfaces were ripped apart. Their vertices coincide and carry the same weights, so they never
    open; they are not holes."""
    ends = {}
    for e in bm.edges:
        if e.is_boundary:
            key = frozenset(tuple(round(c, 6) for c in v.co) for v in e.verts)
            ends.setdefault(key, []).append(e)
    return {e for group in ends.values() if len(group) > 1 for e in group}


def clean_topology(mesh, max_hole):
    """Remove fin faces, separate surfaces pinched together along an edge, close small holes."""
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    before = topology_report(bm)
    removed = unpinched = filled = 0

    def tidy():
        bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges[:])
        wire = [e for e in bm.edges if not e.link_faces]
        if wire:
            bmesh.ops.delete(bm, geom=wire, context="EDGES")
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")

    def fill_holes():
        joined = seams(bm)
        boundary = [e for e in bm.edges if e.is_boundary and e not in joined]
        if not boundary:
            return 0
        made = bmesh.ops.holes_fill(bm, edges=boundary, sides=max_hole)["faces"]
        tris = bmesh.ops.triangulate(bm, faces=made)["faces"] if made else []
        fill_uvs(bm, tris)
        return len(tris)

    for _ in range(6):
        # Fins: triangles none of whose edges is shared normally (e.g. two open edges plus the
        # edge they are stuck onto a third face with).
        # One pass per round: repeating it would erode along the pinch line and widen the hole.
        fins = [f for f in bm.faces if all(e.is_boundary or len(e.link_faces) > 2 for e in f.edges)
                and any(len(e.link_faces) > 2 for e in f.edges)]
        if fins:
            removed += len(fins)
            bmesh.ops.delete(bm, geom=fins, context="FACES")
        unpinched += unpinch(bm)
        tidy()
        filled += fill_holes()
        if not topology_report(bm)["multi"]:
            break
    # Whatever is still pinched becomes a seam (ripped, not rewelded).
    left = [e for e in bm.edges if len(e.link_faces) > 2]
    if left:
        bmesh.ops.split_edges(bm, edges=left)
    tidy()
    filled += fill_holes()
    after = topology_report(bm)
    after["seam"] = len(seams(bm))
    after["open"] = after["boundary"] - after["seam"]
    bm.to_mesh(mesh.data)
    bm.free()
    print("CLEAN %s -> %s (removed %d fins, unpinched %d edges, seamed %d, filled %d triangles)" % (
        before, after, removed, unpinched, len(left), filled))
    return after


def embed_unique(image, name, size=0):
    """Re-embed an image under a unique file name (identical embedded names collide in Babylon's
    texture cache). The packed image is written out first because packing reads a file."""
    # JPEG keeps a 2048px albedo/normal around 1 MB instead of 4-5 MB as PNG.
    if size and max(image.size) > size:
        image.scale(size, size)
    path = os.path.join(tempfile.mkdtemp(), name + ".jpg")
    image.filepath_raw = path
    image.file_format = "JPEG"
    image.save(filepath=path, quality=92)
    if image.packed_file:
        image.unpack(method="REMOVE")
    image.name = name
    image.filepath = path
    image.reload()
    image.pack()


def clean_material(mesh, texture_name, keep_normal, size=0):
    for slot in mesh.material_slots:
        tree = slot.material.node_tree
        bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
        base = bsdf.inputs["Base Color"].links[0].from_node.name
        keep = {base}
        normal = bsdf.inputs["Normal"].links
        if keep_normal and normal and normal[0].from_node.type == "NORMAL_MAP":
            color = normal[0].from_node.inputs["Color"].links
            if color:
                keep |= {normal[0].from_node.name, color[0].from_node.name}
                embed_unique(color[0].from_node.image, texture_name + "-normal")
        # Keep albedo -> Base Color (plus the normal map when asked); drop the emissive copy, the
        # alpha link and unused nodes. (Node wrappers are recreated on access, so compare by name.)
        for node in list(tree.nodes):
            if node.type in ("TEX_IMAGE", "NORMAL_MAP") and node.name not in keep:
                tree.nodes.remove(node)
        embed_unique(tree.nodes[base].image, texture_name, size)


def main():
    options = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=options.input)
    mesh, rig = objects()
    axis = forward_axis(rig)
    before = skin_offset(mesh, rig, axis)
    if options.fit_skin:
        # Vertex coordinates are in the mesh's space; the bind pose is re-derived on export.
        shift = mesh.matrix_world.inverted().to_3x3() @ (axis * before)
        for v in mesh.data.vertices:
            v.co += shift
    after = skin_offset(mesh, rig, axis)
    if options.clean:
        clean_topology(mesh, options.max_hole)
    flipped = fix_winding(mesh)
    clean_material(mesh, options.texture_name, options.keep_normal, options.texture_size)
    bpy.ops.export_scene.fbx(
        filepath=options.output, use_selection=False, object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    print("FIXED %s: skin offset %.3f -> %.3f m, rewound %d faces" % (options.output, before, after, flipped))


if __name__ == "__main__":
    main()
