"""Repair an exported soldier character in Blender and write it back as FBX.

The US and German riflemen came out of an auto-rig/texturing pipeline with three defects that
Babylon shows plainly:

- ~1-2% of triangles are wound inside-out, which back-face culling turns into holes onto the
  body underneath (fixed by Blender's recalculation plus a ray test for whole inverted patches);
- both embed their albedo as "texture_0.png", which collides in Babylon's texture cache, and the
  albedo is also wired into the emissive slot;
- the German skin sits behind its skeleton (the rig was fitted to the US body): arm, leg and head
  joints are 4-10 cm in front of the vertices they drive.

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
import sys
import tempfile

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# Limb/head bones whose joints should sit inside the skin they drive. Spine bones are left out:
# their weights also cover the backpack and pouches, so their skin centroid is not the body core.
FIT_BONES = ["Head", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftUpLeg", "LeftLeg",
             "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"]


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--texture-name", required=True)
    parser.add_argument("--fit-skin", action="store_true", help="move the skin onto its skeleton")
    return parser.parse_args(values)


def objects():
    mesh = [o for o in bpy.data.objects if o.type == "MESH"]
    rig = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(mesh) != 1 or len(rig) != 1:
        raise RuntimeError("expected one mesh and one armature")
    return mesh[0], rig[0]


def forward_axis(rig):
    head, front = rig.pose.bones["Head"], rig.pose.bones["headfront"]
    axis = (rig.matrix_world @ front.head) - (rig.matrix_world @ head.head)
    axis.z = 0
    return axis.normalized()


def skin_offset(mesh, rig, axis):
    """Mean forward distance from each fit bone's midpoint to the centroid of the skin it drives."""
    names = {g.index: g.name for g in mesh.vertex_groups}
    sums = {}
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.weight > 0.5 and names[g.group] in FIT_BONES:
                entry = sums.setdefault(names[g.group], [Vector(), 0])
                entry[0] += mesh.matrix_world @ v.co
                entry[1] += 1
    offsets = []
    for name, (total, count) in sums.items():
        bone = rig.pose.bones[name]
        mid = rig.matrix_world @ ((bone.head + bone.tail) / 2)
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


def clean_material(mesh, texture_name):
    for slot in mesh.material_slots:
        tree = slot.material.node_tree
        bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
        base = bsdf.inputs["Base Color"].links[0].from_node.name
        # Keep only albedo -> Base Color: drop the emissive copy, the alpha link and the unused
        # normal-map node. (Node wrappers are recreated on access, so compare by name.)
        for node in list(tree.nodes):
            if node.type in ("TEX_IMAGE", "NORMAL_MAP") and node.name != base:
                tree.nodes.remove(node)
        # Re-embed the albedo under a unique file name so Babylon's texture cache cannot confuse
        # the two soldiers. The packed image is written out first because packing reads a file.
        image = tree.nodes[base].image
        path = os.path.join(tempfile.mkdtemp(), texture_name + ".png")
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        if image.packed_file:
            image.unpack(method="REMOVE")
        image.name = texture_name
        image.filepath = path
        image.reload()
        image.pack()


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
    flipped = fix_winding(mesh)
    clean_material(mesh, options.texture_name)
    bpy.ops.export_scene.fbx(
        filepath=options.output, use_selection=False, object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False, primary_bone_axis="Y", secondary_bone_axis="X",
        bake_anim=False, path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    print("FIXED %s: skin offset %.3f -> %.3f m, rewound %d faces" % (options.output, before, after, flipped))


if __name__ == "__main__":
    main()
