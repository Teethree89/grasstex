"""Turn a generated rifle FBX into a small, game-ready weapon model.

The Meshy exports are ~2k triangles but carry four 2048px maps (albedo, normal, metallic,
roughness): ~19 MB per rifle for an object that covers a few hundred pixels on screen. This keeps
only the albedo, downscaled (512px JPEG by default), and lays the mesh out in the battle's weapon
convention so it drops into the existing hand calibration (see GRIP in
battle/modules/53-fbx-soldier-backend.js and battle/weapons.js):

- barrel along Babylon +Z (Blender -Y), top of the rifle up;
- scaled to the real overall length;
- butt plate `--butt` metres behind the grip origin, barrel top at `--bore` metres.

Run with Blender:
  Blender -b --factory-startup --python tools/prepare-weapon-model.py -- \
    --input M1Garand.fbx --output Assets/weapons/m1-garand.fbx --name m1-garand --length 1.107
"""
import argparse
import math
import os
import sys
import tempfile

import bpy
from mathutils import Matrix, Vector


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--length", type=float, required=True, help="real overall length, metres")
    parser.add_argument("--texture-size", type=int, default=512)
    parser.add_argument("--butt", type=float, default=0.40, help="butt plate distance behind the grip origin")
    parser.add_argument("--bore", type=float, default=0.03, help="height of the barrel top at the muzzle")
    parser.add_argument("--fold-bipod", action="store_true",
                        help="fold deployed bipod legs up along the barrel (for carrying and hip fire)")
    parser.add_argument("--bipod-drop", type=float, default=0.13,
                        help="legs are the geometry at least this far below the bore line")
    parser.add_argument("--bipod-ahead", type=float, default=0.20,
                        help="... and at least this far ahead of the grip origin")
    return parser.parse_args(values)


def section_height(verts, axis, lo, hi):
    zs = [v.z for v in verts if lo <= v[axis] <= hi]
    return (max(zs) - min(zs)) if zs else 0.0


def fold_bipod(mesh, bore, drop=0.13, ahead=0.20):
    """Fold deployed bipod legs forward along the barrel.

    In the prepared layout (muzzle toward -Y, up +Z, grip origin at 0, barrel top at `bore`) the
    legs are the geometry more than `drop` below the bore line and at least `ahead` in front of the
    grip (the pistol grip, trigger and stock are behind that). Legs modelled as long single quads
    (FG42) need a smaller `drop` so the selection reaches up to the hinge. They are rotated -90 degrees about X
    around their hinge (the top of the legs) so they point at the muzzle instead of the ground.
    """
    legs = [v for v in mesh.data.vertices if v.co.y < -ahead and v.co.z < bore - drop]
    if len(legs) < 8:
        print("FOLD no bipod legs found")
        return
    top = max(v.co.z for v in legs)
    upper = [v for v in legs if v.co.z > top - 0.03]
    hinge = Vector((0.0, sum(v.co.y for v in upper) / len(upper), top))
    fold = Matrix.Translation(hinge) @ Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Translation(-hinge)
    for v in legs:
        v.co = fold @ v.co
        # Deployed legs splay sideways; folded, they lie together under the barrel.
        v.co.x *= 0.25
    print("FOLD %d leg vertices about hinge y=%.3f z=%.3f" % (len(legs), hinge.y, hinge.z))


def main():
    o = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=o.input)
    meshes = [ob for ob in bpy.data.objects if ob.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError("expected one mesh")
    mesh = meshes[0]
    # Work in world space with an identity object transform.
    mesh.data.transform(mesh.matrix_world)
    mesh.matrix_world = Matrix.Identity(4)
    verts = [v.co.copy() for v in mesh.data.vertices]

    # Long axis: X or Y, whichever is longer. The muzzle is the end whose last tenth is thinner.
    ext = [max(v[i] for v in verts) - min(v[i] for v in verts) for i in range(3)]
    axis = 0 if ext[0] >= ext[1] else 1
    lo, hi = min(v[axis] for v in verts), max(v[axis] for v in verts)
    tenth = (hi - lo) * 0.1
    muzzle_high = section_height(verts, axis, hi - tenth, hi) < section_height(verts, axis, lo, lo + tenth)
    # Rotate about Z so the muzzle points to -Y (Babylon +Z after the FBX axis conversion).
    muzzle_dir = Vector((1, 0, 0) if axis == 0 else (0, 1, 0)) * (1 if muzzle_high else -1)
    rot = muzzle_dir.to_track_quat("-Y", "Z").to_matrix().to_4x4().inverted()
    mesh.data.transform(rot)

    verts = [v.co for v in mesh.data.vertices]
    ymin, ymax = min(v.y for v in verts), max(v.y for v in verts)
    scale = o.length / (ymax - ymin)
    mesh.data.transform(Matrix.Scale(scale, 4))
    verts = [v.co for v in mesh.data.vertices]
    ymin, ymax = min(v.y for v in verts), max(v.y for v in verts)
    xmid = (min(v.x for v in verts) + max(v.x for v in verts)) / 2
    muzzle_top = max(v.z for v in verts if v.y <= ymin + o.length * 0.12)
    # Butt (largest Y) at +butt (Babylon z = -butt); barrel top at the bore height.
    mesh.data.transform(Matrix.Translation((-xmid, o.butt - ymax, o.bore - muzzle_top)))

    if o.fold_bipod:
        fold_bipod(mesh, o.bore, o.bipod_drop, o.bipod_ahead)

    # Albedo only, downscaled and re-embedded under a unique name.
    for slot in mesh.material_slots:
        tree = slot.material.node_tree
        bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
        base = bsdf.inputs["Base Color"].links[0].from_node.name
        for node in list(tree.nodes):
            if node.type in ("TEX_IMAGE", "NORMAL_MAP") and node.name != base:
                tree.nodes.remove(node)
        for socket in ("Metallic", "Roughness"):
            for link in list(bsdf.inputs[socket].links):
                tree.links.remove(link)
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.7
        image = tree.nodes[base].image
        image.scale(o.texture_size, o.texture_size)
        path = os.path.join(tempfile.mkdtemp(), o.name + "-albedo.jpg")
        image.filepath_raw = path
        image.file_format = "JPEG"
        image.save(filepath=path, quality=90)
        if image.packed_file:
            image.unpack(method="REMOVE")
        image.name = o.name + "-albedo"
        image.filepath = path
        image.reload()
        image.pack()
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)

    mesh.name = o.name
    bpy.ops.export_scene.fbx(filepath=o.output, use_selection=False, object_types={"MESH"},
                             path_mode="COPY", embed_textures=True, mesh_smooth_type="FACE")
    verts = [v.co for v in mesh.data.vertices]
    print("PREPARED %s: %d tris, muzzle at y=%.3f (Babylon z=%.3f), butt at Babylon z=%.3f, bore %.3f" % (
        o.output, sum(len(p.vertices) - 2 for p in mesh.data.polygons), min(v.y for v in verts),
        -min(v.y for v in verts), -max(v.y for v in verts), o.bore))


if __name__ == "__main__":
    main()
