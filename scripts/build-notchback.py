"""Build Tally's Notchback: Tally's understated AWD coupe, no external assets.

Explicitly regenerates assets/cars/ns-notchback-01.blend. Use export-notchback.py
for subsequent hand edits. Coordinates are runtime X right, Y up, nose -Z.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SLUG = 'ns-notchback-01'
SOURCE = ROOT / f'assets/cars/{SLUG}.blend'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def coord(p):
    return Vector((p[0], -p[2], p[1]))

def material(name, color, rough=.4, metal=0, emission=0):
    def linear(c):
        return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    rgb = [linear(int(color[i:i+2], 16) / 255) for i in (0,2,4)]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Emission Color'].default_value = (*rgb, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat

paint = material('car-paint', '29272f', .32, .4)
violet = material('tally-violet', '8548c7', .36, .35)
black = material('satin-black', '16191c', .6, .15)
glass = material('smoked-glass', '17222a', .18, .5)
chrome = material('wheel-finish', '777581', .23, .85)
rubber = material('tire-rubber', '111315', .9)
red = material('tail-lamp', 'ff321b', .28, .1, 3)
white = material('head-lamp', 'fff0ca', .22, .1, 3)
amber = material('amber-marker', 'ff981c', .3, .1, 1.8)

def empty(name, parent=None, location=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = coord(location)
    return obj

root = empty(SLUG)
root['authoring'] = 'Original NIGHTSHIFT Notchback; Tally, Blacklist number one'
body = empty('body-shell', root)

def mesh(name, verts, faces, mat, parent=body, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([coord(v) for v in verts], [], faces)
    data.update()
    bm = bmesh.new(); bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data); bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
        mod.width = bevel; mod.segments = 2
    return obj

FACES = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]
def box(name, center, size, mat, parent=body, bevel=.01):
    x,y,z = [s/2 for s in size]; cx,cy,cz = center
    return mesh(name, [(cx+dx,cy+dy,cz+dz) for dx,dy,dz in
        [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]], FACES, mat, parent, bevel)

# Low two-door coupe, long bonnet and a clean, unadorned notchback.
shell = box('coachwork', (0,.64,0), (2.04,.60,4.40), paint, bevel=0)
cutters = []
for axle,z in [('front',-1.48),('rear',1.48)]:
    for side,suffix in [(-1,'left'),(1,'right')]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=.49, depth=1.25,
            location=coord((side*1.15,.40,z)), rotation=(0,math.pi/2,0))
        cutter=bpy.context.object; cutter.name=f'clearance-{axle}-{suffix}'
        mod=shell.modifiers.new(cutter.name,'BOOLEAN'); mod.operation='DIFFERENCE'; mod.solver='EXACT'; mod.object=cutter
        cutters.append(cutter)
mod=shell.modifiers.new('Coachwork edge','BEVEL'); mod.width=.025; mod.segments=2
box('bonnet', (0,.953,-1.39), (1.83,.026,1.53), paint)
mesh('coupe-cabin', [(-.94,.94,-.66),(.94,.94,-.66),(.76,1.40,-.18),(-.76,1.40,-.18),
    (-.94,.94,1.43),(.94,.94,1.43),(.76,1.40,.73),(-.76,1.40,.73)], FACES, paint, bevel=.018)
mesh('windshield', [(-.86,.995,-.611),(.86,.995,-.611),(.71,1.345,-.246),(-.71,1.345,-.246)],[(0,1,2,3)],glass)
mesh('rear-window', [(-.855,.999,1.354),(.855,.999,1.354),(.71,1.345,.828),(-.71,1.345,.828)],[(0,3,2,1)],glass)
box('boot-lid',(0,.952,1.83),(1.84,.024,.64),paint)
for side,label in [(-1,'left'),(1,'right')]:
    mesh(f'door-glass-{label}',[(side*.923,1.00,-.53),(side*.787,1.34,-.14),
        (side*.787,1.34,.34),(side*.923,1.00,.34)],[(0,1,2,3)],glass)
    mesh(f'quarter-glass-{label}',[(side*.923,1.00,.42),(side*.787,1.34,.42),
        (side*.787,1.34,.70),(side*.923,1.00,1.23)],[(0,1,2,3)],glass)
    box(f'door-handle-{label}',(side*1.028,.80,.39),(.018,.025,.16),black,bevel=.003)
    box(f'violet-shoulder-{label}',(side*1.025,.922,0),(.012,.022,4.20),violet,bevel=.001)
    box(f'mirror-{label}',(side*1.09,1.005,-.50),(.17,.09,.18),paint)
    box(f'headlight-{label}',(side*.73,.80,-2.218),(.46,.085,.025),white)
    box(f'taillight-{label}',(side*.74,.79,2.225),(.42,.055,.02),red)
    # Two groups of five: four uprights and one diagonal per group.
    for group in range(2):
        z0=-.32+group*.25
        for stroke in range(4):
            box(f'tally-{label}-{group}-{stroke}',(side*1.027,.75,z0+stroke*.045),(.012,.105,.009),violet,bevel=0)
        mesh(f'tally-{label}-{group}-slash',[(side*1.035,.699,z0-.022),(side*1.035,.709,z0-.022),
            (side*1.035,.801,z0+.157),(side*1.035,.791,z0+.157)],[(0,1,2,3)],violet)
box('front-grille',(0,.79,-2.218),(.90,.08,.025),black)
box('lower-intake',(0,.46,-2.216),(1.60,.13,.025),black)
box('front-lip',(0,.35,-2.21),(1.96,.045,.08),black)
box('violet-rear-inset',(0,.78,2.209),(1.94,.135,.022),violet)
box('rear-plate',(0,.57,2.215),(.34,.12,.018),black)
box('exhaust',(-.65,.30,2.16),(.14,.09,.15),chrome)

def lathe(name, profile, mat, parent, side=1):
    n=32
    verts=[(side*x, math.cos(i*math.tau/n)*r, math.sin(i*math.tau/n)*r) for x,r in profile for i in range(n)]
    faces=[]
    for row in range(len(profile)):
        for i in range(n):
            a=row*n+i; b=row*n+(i+1)%n
            c=((row+1)%len(profile))*n+(i+1)%n; d=((row+1)%len(profile))*n+i
            faces.append((a,b,c,d))
    obj=mesh(name,verts,faces,mat,parent)
    for face in obj.data.polygons: face.use_smooth=True

for axle,z in [('front',-1.48),('rear',1.48)]:
    for side,label in [(-1,'left'),(1,'right')]:
        corner=f'{axle}-{label}'
        pivot=empty(f'wheel-{corner}',root,(side*.92,.4,z))
        rolling=empty(f'rolling-{corner}',pivot)
        w=.14
        lathe(f'tire-{corner}',[(-w,.23),(-w,.32),(-w*.7,.36),(w*.7,.36),(w,.32),(w,.23)],rubber,rolling)
        lathe(f'rim-{corner}',[(w,.24),(w,.265),(w-.045,.265),(w-.06,.22),(w-.06,.05),(w-.08,.05),(w-.08,.24)],chrome,rolling,side)
        lathe(f'wheel-disc-{corner}',[(w-.065,.224),(w-.065,0),(w-.08,0),(w-.08,.224)],black,rolling,side)
        for spoke in range(6):
            angle=spoke*math.tau/6
            points=[]
            for x in [side*(w-.045),side*(w-.012)]:
                for r,a in [(.055,angle-.36),(.23,angle-.13),(.23,angle+.13),(.055,angle+.36)]:
                    points.append((x,math.cos(a)*r,math.sin(a)*r))
            mesh(f'spoke-{corner}-{spoke}',points,FACES,chrome,rolling,bevel=.003)
        for lug in range(5):
            angle=lug*math.tau/5
            box(f'lug-{corner}-{lug}',(side*(w-.05),math.cos(angle)*.065,math.sin(angle)*.065),(.025,.022,.022),chrome,rolling,bevel=.003)

for cutter in cutters:
    cutter.hide_render=True; cutter.hide_set(True); cutter.display_type='WIRE'
# Broad studio lights and two inspectable views, excluded from GLB export.
floor=box('studio-floor',(0,-.065,0),(200,.1,200),material('studio-floor','1e2630',.7),None)
for name,loc,energy,color in [('key',(2,6,-3),1700,(1,.88,.73)),('fill',(-4,3,-1),1300,(.55,.72,1)),('rim',(2,4,5),2000,(1,.9,.72))]:
    data=bpy.data.lights.new('studio-'+name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=5; data.color=color
    lamp=bpy.data.objects.new('studio-'+name,data); bpy.context.collection.objects.link(lamp)
    lamp.location=coord(loc); lamp.rotation_euler=(coord((0,.7,0))-lamp.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=1200; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.world.color=(.17,.17,.17)
scene.view_settings.view_transform='AgX'
cameras=[]
for label,loc in [('front',(6,3.0,-6.7)),('rear',(-6,2.8,6.7))]:
    data=bpy.data.cameras.new('studio-'+label); data.type='ORTHO'; data.ortho_scale=6.8
    cam=bpy.data.objects.new('studio-'+label,data); bpy.context.collection.objects.link(cam)
    cam.location=coord(loc); cam.rotation_euler=(coord((0,.7,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    cameras.append((label,cam))
scene.camera=cameras[0][1]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
# Source-only archive; deliberately no runtime export.
if '--render' in sys.argv:
    for label,cam in cameras:
        scene.camera=cam; scene.render.filepath=str(ROOT/f'artifacts/{SLUG}-{label}.png')
        bpy.ops.render.render(write_still=True)
