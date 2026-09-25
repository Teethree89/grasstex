import bpy
op = bpy.context.active_operator

op.use_selection = False
op.use_visible = False
op.use_active_collection = False
op.collection = ''
op.global_scale = 1.0
op.apply_unit_scale = True
op.apply_scale_options = 'FBX_SCALE_NONE'
op.use_space_transform = True
op.bake_space_transform = False
op.use_mesh_modifiers = True
op.use_mesh_modifiers_render = True
op.mesh_smooth_type = 'FACE'
op.colors_type = 'SRGB'
op.prioritize_active_color = False
op.use_subsurf = False
op.use_mesh_edges = False
op.use_tspace = False
op.use_triangles = False
op.use_custom_props = False
op.primary_bone_axis = 'Y'
op.secondary_bone_axis = 'X'
op.armature_nodetype = 'NULL'
op.bake_anim = False
op.path_mode = 'COPY'
op.embed_textures = True
op.batch_mode = 'OFF'
op.use_batch_own_dir = True
op.axis_forward = '-Z'
op.axis_up = 'Y'
# Weapon: mesh only, albedo embedded.
op.object_types = {'MESH'}
op.add_leaf_bones = False
op.use_armature_deform_only = False
