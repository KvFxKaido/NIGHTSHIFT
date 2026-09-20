"""Add original interchangeable Cinder parts without rebuilding the stock body.

blender --background assets/cars/ns-cinder-01.blend --python scripts/build-cinder-parts.py
Then: node scripts/optimize-car.mjs --car=ns-cinder-01
All coordinates below are runtime metres, X right / Y up / nose -Z.
"""
import math
from pathlib import Path
import bpy
import bmesh


def install_parts():
    body = bpy.data.objects['body-shell']
    collection = body.users_collection[0]
    paint = bpy.data.materials['car-paint']
    trim = bpy.data.materials['rubber-trim']
    finish = bpy.data.materials['wheel-finish']
    # Window tint must not recolour the mirrors, which shared the stock glass.
    glass = bpy.data.materials.get('cinder-window-tint')
    if glass is None:
        glass = bpy.data.materials['smoked-glass'].copy()
        glass.name = 'cinder-window-tint'
    # Keep glTF material dedup from joining the independently editable windows
    # back to the mirrors. Runtime applies the chosen tint's exact roughness.
    glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .161
    for slot in bpy.data.objects['greenhouse'].material_slots:
        if slot.material.name in ['smoked-glass', 'cinder-window-tint']:
            slot.material = glass
    # Idempotent: keep authored factory geometry, replace only our variants.
    for obj in [obj for obj in bpy.data.objects if 'customizationSlot' in obj]:
        if obj['customizationOption'] == 'stock':
            for child in list(obj.children):
                child.parent = obj.parent
        else:
            for child in list(obj.children_recursive):
                bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(obj, do_unlink=True)

    def group(name, parent, slot, option):
        obj = bpy.data.objects.new(name, None)
        collection.objects.link(obj)
        obj.parent = parent
        obj['customizationSlot'] = slot
        obj['customizationOption'] = option
        return obj

    def mesh(name, vertices, faces, material, parent, bevel=.008):
        data = bpy.data.meshes.new(name)
        data.from_pydata([(x, -z, y) for x, y, z in vertices], [], faces)
        data.update()
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.parent = parent
        data.materials.append(material)
        if bevel:
            mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
            mod.width, mod.segments = bevel, 2
        return obj

    def loft(name, stations, material, parent):
        # Four-point cross sections (z, half width, bottom, top): sloped faces
        # give the lip a manufactured profile instead of an attached brick.
        verts = []
        for z, width, bottom, top in stations:
            verts.extend([(-width, bottom, z), (width, bottom, z),
                          (width, top, z), (-width, top, z)])
        faces = [(3, 2, 1, 0)]
        for row in range(len(stations)-1):
            for i in range(4):
                a, b = row*4+i, row*4+(i+1)%4
                faces.append((a, b, b+4, a+4))
        faces.append(tuple(range(len(verts)-4, len(verts))))
        return mesh(name, verts, faces, material, parent)

    stock = group('cinder-kit-stock', body, 'bodyKit', 'stock')
    for name in ['front-lip', 'sill-left', 'sill-right', 'rear-valance', 'trunk-lip']:
        bpy.data.objects[name].parent = stock
    street = group('cinder-kit-street', body, 'bodyKit', 'street')
    loft('street-front-lip', [(-2.36,.91,.22,.31), (-2.29,.995,.22,.405),
                            (-2.02,1.01,.25,.34)], paint, street)
    loft('street-front-blade', [(-2.385,.91,.215,.245), (-2.30,1.005,.215,.245),
                              (-2.035,1.015,.235,.265)], trim, street)
    # Stop inside the axles: the full-lock tyre envelope remains untouched.
    for side, label in [(-1,'left'), (1,'right')]:
        obj = loft('street-skirt-'+label, [(-.94,.05,.29,.36),(-.78,.067,.22,.38),
                                         (.78,.067,.22,.38),(.94,.05,.29,.36)], paint, street)
        obj.location.x = side*1.015
        # Keep the right spat outboard of the original exhaust (x .625-.775).
        obj = loft('street-rear-spat-'+label, [(1.97,.09,.25,.38),
                                             (2.19,.085,.22,.42),(2.29,.06,.24,.39)], paint, street)
        obj.location.x = side*.90
    loft('street-rear-valance', [(2.02,.92,.28,.35),(2.245,.92,.25,.38)], trim, street)
    loft('street-trunk-lip', [(1.91,.82,1.09,1.13),(2.08,.88,1.095,1.23),
                            (2.16,.86,1.10,1.215)], paint, street)
    # The first slice authored coherent kits; expose those same pieces as slots.
    for original, option in [(stock, 'stock'), (street, 'street')]:
        slots = {slot: group(f'cinder-{slot}-{option}', body, slot, option)
                 for slot in ['front', 'skirts', 'rear', 'spoiler']}
        for child in list(original.children):
            slot = 'spoiler' if 'trunk' in child.name else 'front' if 'front' in child.name else 'rear' if 'rear' in child.name else 'skirts'
            child.parent = slots[slot]
        bpy.data.objects.remove(original, do_unlink=True)
    group('cinder-spoiler-none', body, 'spoiler', 'none')
    race_front = group('cinder-front-race', body, 'front', 'race')
    loft('race-front-apron', [(-2.36,.94,.25,.38),(-2.23,1.015,.22,.42),
                            (-2.02,1.015,.26,.34)], paint, race_front)
    loft('race-splitter', [(-2.49,.93,.19,.225),(-2.35,1.065,.19,.23),
                         (-2.015,1.045,.225,.26)], trim, race_front)
    for side, label in [(-1,'left'), (1,'right')]:
        plate = loft('race-canard-'+label, [(-2.37,.11,.34,.365),(-2.12,.11,.40,.425)], trim, race_front)
        plate.location.x = side*.95
    race_skirts = group('cinder-skirts-race', body, 'skirts', 'race')
    for side, label in [(-1,'left'), (1,'right')]:
        skirt = loft('race-skirt-'+label, [(-.93,.055,.29,.38),(-.75,.085,.20,.40),
                                         (.72,.085,.20,.40),(.93,.06,.29,.38)], paint, race_skirts)
        skirt.location.x = side*1.015
        blade = loft('race-sill-blade-'+label, [(-.91,.06,.255,.285),(-.73,.115,.19,.22),
                                              (.70,.115,.19,.22),(.91,.06,.255,.285)], trim, race_skirts)
        blade.location.x = side*1.02
    race_rear = group('cinder-rear-race', body, 'rear', 'race')
    loft('race-rear-valance', [(2.015,.94,.285,.37),(2.245,.94,.29,.41)], trim, race_rear)
    loft('race-diffuser', [(1.98,.55,.20,.235),(2.36,.55,.29,.325)], trim, race_rear)
    for i, x in enumerate([-.51,-.26,0,.26,.51]):
        fin = loft(f'race-diffuser-fin-{i}', [(2.0,.012,.16,.235),(2.37,.012,.24,.325)], trim, race_rear)
        fin.location.x = x
    for side, label in [(-1,'left'), (1,'right')]:
        spat = loft('race-rear-spat-'+label, [(1.97,.09,.25,.40),(2.23,.085,.21,.43),
                                           (2.32,.06,.25,.39)], paint, race_rear)
        spat.location.x = side*.90
    wing = group('cinder-spoiler-wing', body, 'spoiler', 'wing')
    for side, label in [(-1,'left'), (1,'right')]:
        mount = loft('race-wing-mount-'+label, [(1.88,.055,1.095,1.16),(2.06,.055,1.095,1.16)], trim, wing)
        mount.location.x = side*.57
        riser = loft('race-wing-riser-'+label, [(1.95,.025,1.13,1.51),(2.055,.025,1.13,1.51)], trim, wing)
        riser.location.x = side*.57
        end = loft('race-wing-endplate-'+label, [(1.80,.014,1.46,1.62),(2.20,.014,1.48,1.63)], paint, wing)
        end.location.x = side*1.065
    loft('race-wing-airfoil', [(1.80,1.065,1.51,1.545),(2.08,1.065,1.52,1.56),
                              (2.20,1.065,1.56,1.585)], trim, wing)
    for axle in ['front','rear']:
        for side, label in [(-1,'left'), (1,'right')]:
            corner = axle+'-'+label
            rolling = bpy.data.objects['rolling-'+corner]
            factory = group('cinder-wheel-stock-'+corner, rolling, 'wheelDesign', 'stock')
            bpy.data.objects['five-spoke-'+corner].parent = factory
            sport = group('cinder-wheel-six-'+corner, rolling, 'wheelDesign', 'six')
            vertices, faces = [], []
            for spoke in range(6):
                angle = spoke*math.tau/6
                start = len(vertices)
                # Broad straight spokes, slightly dished; same tyre/barrel envelope.
                for x, radius, tangent in [(.084,.06,-.037),(.113,.246,-.026),
                    (.113,.246,.026),(.084,.06,.037),(.061,.06,-.037),
                    (.090,.246,-.026),(.090,.246,.026),(.061,.06,.037)]:
                    vertices.append((side*x, math.cos(angle)*radius-math.sin(angle)*tangent,
                                     math.sin(angle)*radius+math.cos(angle)*tangent))
                faces.extend(tuple(start+i for i in face) for face in
                    [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
            mesh('six-spoke-'+corner, vertices, faces, finish, sport, .003)
            split = group('cinder-wheel-mesh-'+corner, rolling, 'wheelDesign', 'mesh')
            vertices, faces = [], []
            for spoke in range(10):
                angle = spoke*math.tau/10
                for fork in [-1, 1]:
                    start = len(vertices)
                    for x, radius, tangent in [(.082,.061,-.010),(.114,.246,fork*.023-.009),
                        (.114,.246,fork*.023+.009),(.082,.061,.010),(.062,.061,-.010),
                        (.094,.246,fork*.023-.009),(.094,.246,fork*.023+.009),(.062,.061,.010)]:
                        vertices.append((side*x, math.cos(angle)*radius-math.sin(angle)*tangent,
                                         math.sin(angle)*radius+math.cos(angle)*tangent))
                    faces.extend(tuple(start+i for i in face) for face in
                        [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
            mesh('split-ten-'+corner, vertices, faces, finish, split, 0)


if __name__ == '__main__':
    install_parts()
    root = Path(__file__).resolve().parent.parent
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/cars/ns-cinder-01.blend'))
    exec(compile((root/'scripts/export-cinder.py').read_text(), str(root/'scripts/export-cinder.py'), 'exec'))
