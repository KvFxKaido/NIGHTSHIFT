"""Export the opened track, batching a temporary copy; never save over hand edits.

Source components stay individually editable. Shipping meshes are grouped by
spatial section and material, keeping draw calls bounded without one giant mesh.
"""
from pathlib import Path
import bpy
from mathutils import Matrix

project = Path(__file__).resolve().parent.parent
source_root = bpy.data.objects.get("blackglass-rivergate")
if source_root is None:
    raise RuntimeError("Open assets/tracks/blackglass/blackglass-rivergate.blend first")
if any(abs(source_root.matrix_world[i][j] - Matrix.Identity(4)[i][j]) > 1e-6
       for i in range(4) for j in range(4)):
    raise RuntimeError("Track root must remain at the world origin with identity transforms")

previous_selection = list(bpy.context.selected_objects)
previous_active = bpy.context.view_layer.objects.active
previous_mode = previous_active.mode if previous_active else "OBJECT"
if previous_mode != "OBJECT":
    # Commit Edit Mode's live mesh to the evaluated copy, without saving source.
    bpy.ops.object.mode_set(mode="OBJECT")
export_collection = bpy.data.collections.new("temporary-track-export")
bpy.context.scene.collection.children.link(export_collection)
temporary_meshes = []
try:
    root = bpy.data.objects.new("shipping-track-root", None)
    export_collection.objects.link(root)
    for key in source_root.keys():
        root[key] = source_root[key]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for section in source_root.children:
        group = bpy.data.objects.new("shipping-" + section.name, None)
        export_collection.objects.link(group)
        group.parent = root
        buckets = {}
        for obj in section.children_recursive:
            if obj.type == "EMPTY" and obj.name.startswith(("light-", "anchor-")):
                marker = bpy.data.objects.new(obj.name + "-export", None)
                export_collection.objects.link(marker)
                marker.parent = group
                marker.matrix_world = obj.matrix_world.copy()
                for key in obj.keys():
                    marker[key] = obj[key]
                continue
            if obj.type != "MESH":
                continue
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            try:
                mesh.calc_loop_triangles()
                for triangle in mesh.loop_triangles:
                    mat = mesh.materials[triangle.material_index]
                    if mat is None:
                        raise RuntimeError(f"Missing material on {obj.name}")
                    verts, faces = buckets.setdefault(mat.name, ([], []))
                    offset = len(verts)
                    verts.extend([tuple(obj.matrix_world @ mesh.vertices[i].co) for i in triangle.vertices])
                    faces.append((offset, offset + 1, offset + 2))
            finally:
                evaluated.to_mesh_clear()
        for material_name, (vertices, faces) in buckets.items():
            name = section.name + "-" + material_name
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(vertices, [], faces)
            mesh.materials.append(bpy.data.materials[material_name])
            mesh.update()
            temporary_meshes.append(mesh)
            obj = bpy.data.objects.new(name, mesh)
            export_collection.objects.link(obj)
            obj.parent = group

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    raw = project / "artifacts/blackglass-rivergate.raw.glb"
    raw.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(raw), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_animations=False,
        export_cameras=False, export_lights=False, export_extras=True,
        export_texcoords=False, export_normals=True, export_materials="EXPORT",
        export_copyright="Original NIGHTSHIFT Blackglass / Rivergate environment",
    )
    print(f"Exported temporary spatial/material batches: {raw}")
finally:
    for obj in list(export_collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(export_collection)
    for mesh in temporary_meshes:
        bpy.data.meshes.remove(mesh)
    for obj in previous_selection:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = previous_active
    if previous_active and previous_mode != "OBJECT":
        bpy.ops.object.mode_set(mode=previous_mode)
