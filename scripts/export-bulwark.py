"""Export an opened Bulwark .blend without regenerating or saving over hand edits.

blender assets/cars/ns-bulwark-01.blend --background --python scripts/export-bulwark.py

Unlike the coupe there is no optimize step yet: the rival has no runtime
consumer, so the raw GLB stays in artifacts/ rather than shipping to public/.
"""
from pathlib import Path
import bpy

# __file__ may be the builder when executed by build-bulwark.py.
asset_root = Path(__file__).resolve().parent.parent
raw_path = asset_root / "artifacts/ns-bulwark-01.raw.glb"
raw_path.parent.mkdir(parents=True, exist_ok=True)
export_root = bpy.data.objects.get("ns-bulwark-01")
if export_root is None:
    raise RuntimeError("Missing ns-bulwark-01 root; open the Bulwark source .blend first")
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
    export_copyright="Original NIGHTSHIFT rival car geometry",
)
print(f"Exported {raw_path}")
