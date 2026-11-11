import bpy, pathlib, json, math
from mathutils import Matrix, Vector
root=pathlib.Path(__file__).resolve().parents[3]/'inspiration'/'buildings-streets-pack'/'source'
out=root.parent/'audition'
out.mkdir(exist_ok=True)
records=[]
for file,name in [('Buildings pack3.blend','shop_front14'),('Buildings pack3.blend','warehouse_front'),('Buildings pack part 2.blend','apartment_block8')]:
    bpy.ops.wm.open_mainfile(filepath=str(root/file),load_ui=False,use_scripts=False)
    source=bpy.data.objects[name]
    obj=bpy.data.objects.new(name,source.data.copy())
    # Source mesh local axes differ from world axes. Bake the source matrix first.
    obj.data.transform(source.matrix_world)
    coords=[v.co.copy() for v in obj.data.vertices]
    lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    for v in obj.data.vertices: v.co-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    obj.data.calc_loop_triangles()
    mats=[]
    for slot,mat in enumerate(list(obj.data.materials)):
        if not mat: continue
        images=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image] if mat.use_nodes else []
        for im in images:
            candidate=root/'textures'/im.name
            if not candidate.is_file(): candidate=root/'textures'/pathlib.Path(im.filepath.replace('\\','/')).name
            if not im.packed_file and candidate.is_file():
                im.filepath=str(candidate); im.reload()
            print('IMAGE',im.name,im.filepath,list(im.size),im.source)
        mats.append({'name':mat.name,'images':[im.name for im in images]})
        # Translate legacy diffuse/mix shaders to glTF PBR, preserving the source images.
        replacement=bpy.data.materials.new(mat.name+'_gltf')
        replacement.use_nodes=True
        nodes=replacement.node_tree.nodes; links=replacement.node_tree.links
        shader=nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value=.82
        color=next((im for im in images if 'NORMAL' not in im.name.upper()),None)
        normal=next((im for im in images if 'NORMAL' in im.name.upper()),None)
        if color:
            tex=nodes.new('ShaderNodeTexImage');tex.image=color
            links.new(tex.outputs['Color'],shader.inputs['Base Color'])
        else:
            shader.inputs['Base Color'].default_value=(.12,.18,.21,1) if 'GLASS' in mat.name.upper() else (.4,.4,.4,1)
        if normal:
            tex=nodes.new('ShaderNodeTexImage');tex.image=normal; tex.image.colorspace_settings.name='Non-Color'
            nm=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],shader.inputs['Normal'])
        obj.data.materials[slot]=replacement
    isolated=bpy.data.scenes.new('Asset audition export')
    isolated.collection.objects.link(obj)
    bpy.context.window.scene=isolated
    obj.hide_viewport=False; obj.hide_render=False; obj.hide_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active=obj
    target=out/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    records.append({'name':name,'sourceBlend':file,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'sourceDimensionsXYZ':list(hi-lo),'materials':mats,'glbBytes':target.stat().st_size})
(out/'inventory.json').write_text(json.dumps(records,indent=2))
print('EXPORT_COMPLETE')
