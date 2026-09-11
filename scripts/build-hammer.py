"""Build Rivet's Hammer: original notchback drag coupe, no external assets.

Explicitly regenerates assets/cars/ns-hammer-01.blend. Use export-hammer.py
for subsequent hand edits. Coordinates are runtime X right, Y up, nose -Z.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SLUG = 'ns-hammer-01'
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

paint = material('car-paint', 'd6c9a6', .32, .4)
black = material('satin-black', '16191c', .6, .15)
glass = material('smoked-glass', '17222a', .18, .5)
chrome = material('wheel-finish', 'aeb4ba', .23, .85)
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
root['authoring'] = 'Original NIGHTSHIFT Hammer; Rivet drag rival'
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

# One sealed slab of coachwork, cut away around all four working wheels.
shell = box('coachwork', (0,.625,0), (2.13,.59,4.54), paint, bevel=0)
cutters = []
for axle,z in [('front',-1.48),('rear',1.48)]:
    for side,suffix in [(-1,'left'),(1,'right')]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=.49, depth=1.25,
            location=coord((side*1.15,.40,z)), rotation=(0,math.pi/2,0))
        cutter = bpy.context.object; cutter.name=f'clearance-{axle}-{suffix}'
        mod = shell.modifiers.new(cutter.name, 'BOOLEAN'); mod.operation='DIFFERENCE'
        mod.solver='EXACT'; mod.object=cutter
        cutters.append(cutter)
mod=shell.modifiers.new('Coachwork edge', 'BEVEL'); mod.width=.025; mod.segments=2
# Long black bonnet, a raised cowl intake and a short square boot.
box('black-bonnet', (0,.929,-1.29), (1.69,.025,1.78), black)
mesh('hood-scoop', [(-.42,.94,-1.78),(.42,.94,-1.78),(.36,1.14,-1.68),(-.36,1.14,-1.68),
    (-.42,.94,-.67),(.42,.94,-.67),(.35,1.18,-.72),(-.35,1.18,-.72)], FACES, black, bevel=.012)
box('scoop-mouth', (0,1.055,-1.78), (.59,.105,.018), rubber, bevel=.002)
# Closed trapezoidal greenhouse; exterior glazing remains opaque and inset.
verts=[(-.91,.92,-.50),(.91,.92,-.50),(.77,1.43,-.10),(-.77,1.43,-.10),
    (-.91,.92,1.06),(.91,.92,1.06),(.77,1.41,.70),(-.77,1.41,.70)]
mesh('greenhouse',verts,FACES,paint,bevel=.018)
mesh('windshield',[(-.82,.978,-.466),(.82,.978,-.466),(.70,1.372,-.154),(-.70,1.372,-.154)],[(0,1,2,3)],glass)
mesh('rear-window',[(-.81,.99,1.016),(.81,.99,1.016),(.70,1.353,.754),(-.70,1.353,.754)],[(0,3,2,1)],glass)
for side,label in [(-1,'left'),(1,'right')]:
    mesh(f'side-window-{label}', [(side*.899,.997,-.38),(side*.792,1.365,-.065),
        (side*.792,1.345,.64),(side*.899,.997,.91)],[(0,1,2,3)],glass)
    box(f'door-handle-{label}', (side*1.073,.83,.44), (.022,.035,.16), chrome, bevel=.003)
    box(f'side-stripe-{label}', (side*1.068,.87,.16), (.012,.065,1.75), black, bevel=.001)
    box(f'mirror-{label}', (side*1.115,1.014,-.32), (.15,.09,.19), black)
    box(f'headlight-{label}', (side*.76,.745,-2.285), (.40,.19,.035), white)
    box(f'taillight-{label}', (side*.76,.75,2.285), (.41,.15,.035), red)
    box(f'front-marker-{label}', (side*.80,.43,-2.285), (.16,.06,.035), amber)
    box(f'exhaust-{label}', (side*.65,.30,2.26), (.15,.11,.20), chrome)
box('front-grille', (0,.735,-2.285), (.92,.20,.04), black)
box('front-bumper', (0,.5,-2.29), (2.10,.10,.09), chrome)
box('rear-bumper', (0,.49,2.29), (2.10,.10,.09), chrome)
box('rear-black-panel', (0,.75,2.274), (1.99,.27,.022), black)
box('rear-ducktail', (0,.99,2.15), (2.02,.11,.16), black)
box('rear-plate', (0,.63,2.30), (.32,.11,.015), chrome)

# Deep-dish wheels. Front tyres are narrow; rear slicks are 36 cm wide.
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
        w=.11 if axle=='front' else .18
        lathe(f'tire-{corner}',[(-w,.23),(-w,.32),(-w*.7,.36),(w*.7,.36),(w,.32),(w,.23)],rubber,rolling)
        lathe(f'rim-{corner}',[(w,.22),(w,.245),(w-.035,.245),(w-.075,.20),(w-.075,.055),(w-.09,.055),(w-.09,.22)],chrome,rolling,side)
        lathe(f'wheel-disc-{corner}',[(w-.065,.204),(w-.065,0),(w-.082,0),(w-.082,.204)],black,rolling,side)
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
exec(compile((ROOT/'scripts/export-hammer.py').read_text(), 'export-hammer.py', 'exec'))
if '--render' in sys.argv:
    for label,cam in cameras:
        scene.camera=cam; scene.render.filepath=str(ROOT/f'artifacts/{SLUG}-{label}.png')
        bpy.ops.render.render(write_still=True)
