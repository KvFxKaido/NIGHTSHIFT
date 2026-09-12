"""Export an opened Kestrel .blend without regenerating or saving over hand edits.

blender assets/cars/ns-kestrel-01.blend --background --python scripts/export-kestrel.py
Then: node scripts/optimize-car.mjs --car=ns-kestrel-01
"""
from pathlib import Path
import bpy

# __file__ may be the builder when executed by build-kestrel.py.
asset_root = Path(__file__).resolve().parent.parent
raw_path = asset_root / "artifacts/ns-kestrel-01.raw.glb"
raw_path.parent.mkdir(parents=True, exist_ok=True)
export_root = bpy.data.objects.get("ns-kestrel-01")
if export_root is None:
    raise RuntimeError("Missing ns-kestrel-01 root; open the car source .blend first")
bpy.ops.object.select_all(action="DESELECT")
export_root.select_set(True)
for obj in export_root.children_recursive:
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = export_root
bpy.ops.export_scene.gltf(
    filepath=str(raw_path), export_format="GLB", use_selection=True,
    export_apply=True, export_yup=True, export_animations=False,
    export_cameras=False, export_lights=False, export_extras=True,
    export_texcoords=False, export_normals=True, export_materials="EXPORT",
    export_copyright="Original NIGHTSHIFT Kestrel car geometry",
)
print(f"Exported {raw_path}")
