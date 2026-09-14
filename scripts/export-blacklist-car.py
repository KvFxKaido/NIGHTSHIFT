"""Export an opened Blacklist car source without regenerating or saving it.

blender assets/cars/ns-latch-01.blend --background --python scripts/export-blacklist-car.py
node scripts/optimize-car.mjs --car=ns-latch-01
"""
from pathlib import Path
import bpy

asset_root = Path(__file__).resolve().parent.parent
ids = ('latch', 'breakwater', 'wager', 'meridian', 'skim', 'reign')
roots = [bpy.data.objects.get(f'ns-{car}-01') for car in ids]
roots = [root for root in roots if root is not None]
if len(roots) != 1:
    raise RuntimeError('Open exactly one Blacklist car source before exporting')
export_root = roots[0]
raw_path = asset_root / f'artifacts/{export_root.name}.raw.glb'
raw_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in [export_root, *export_root.children_recursive]:
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = export_root
bpy.ops.export_scene.gltf(
    filepath=str(raw_path), export_format='GLB', use_selection=True,
    export_apply=True, export_yup=True, export_animations=False,
    export_cameras=False, export_lights=False, export_extras=True,
    export_texcoords=False, export_normals=True, export_materials='EXPORT',
    export_copyright=f'Original NIGHTSHIFT {export_root.name} geometry',
)
print(f'Exported {raw_path}')
