"""Build Tally's Vesper: original cab-forward RWD coupe, no external assets.

Explicitly regenerates assets/cars/ns-vesper-01.blend. Use export-vesper.py
for subsequent hand edits. Coordinates are runtime X right, Y up, nose -Z.
"""
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SLUG = 'ns-vesper-01'
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
tail_violet = material('violet-tail-band', '8130ef', .55, 0, 1.2)
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
root['authoring'] = 'Original NIGHTSHIFT Vesper; Tally, Blacklist number one'
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

# Shared wheel geometry is parsed from the authoritative TypeScript constants.
import re
geometry_source = (ROOT/'src/render/car.ts').read_text()
def geometry(name):
    return float(re.search(r'\b'+name+r':\s*([0-9.]+)', geometry_source).group(1))
AXLE = geometry('axleZ'); TRACK = geometry('halfTrack')
WHEEL_Y = geometry('wheelCenterY'); RADIUS = geometry('tireRadius')
HALF_WIDTH = geometry('tireHalfWidth'); STEER = geometry('maxSteerAngle')
ARCH = RADIUS + geometry('archClearance')
FRONT_REACH = AXLE + RADIUS*math.cos(STEER) + HALF_WIDTH*math.sin(STEER) + geometry('wheelWellMargin')
# Section loft: tapered nose, broad rear haunch, a flat rear engine deck.
sections=[(-2.20,.92,.40,.69),(-1.94,1.01,.34,.84),(-1.48,1.04,.34,.91),
          (-.75,1.035,.34,.91),(.55,1.055,.34,.93),(1.48,1.08,.34,.95),(2.20,1.04,.38,.92)]
verts=[]
for z,w,low,top in sections:
    verts += [(-w,low,z),(w,low,z),(w,top,z),(-w,top,z)]
faces=[(3,2,1,0)]
for i in range(len(sections)-1):
    for j in range(4): faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
faces.append(tuple(range((len(sections)-1)*4,len(sections)*4)))
shell=mesh('coachwork',verts,faces,paint)
cutters=[]
def cut(obj,cutter):
    mod=obj.modifiers.new(cutter.name,'BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    cutters.append(cutter)
for axle,z in [('front',-AXLE),('rear',AXLE)]:
    for side,label in [(-1,'left'),(1,'right')]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=ARCH,depth=1.35,
            location=coord((side*1.15,WHEEL_Y,z)),rotation=(0,math.pi/2,0))
        cutter=bpy.context.object;cutter.name=f'clearance-{axle}-{label}';cut(shell,cutter)
# The pods have actual open pockets, extending below their rotation sweep.
for side,label in [(-1,'left'),(1,'right')]:
    pocket=box(f'popup-pocket-{label}',(side*.65,.83,-1.80),(.46,.38,.50),black,None,0)
    cut(shell,pocket)
mod=shell.modifiers.new('Coachwork edge','BEVEL');mod.width=.018;mod.segments=2
# Cabin mass is deliberately ahead of centre; the rear third belongs to the engine.
mesh('forward-canopy',[(-.89,.91,-1.22),(.89,.91,-1.22),(.72,1.36,-.63),(-.72,1.36,-.63),
    (-.89,.93,.53),(.89,.93,.53),(.72,1.36,.02),(-.72,1.36,.02)],FACES,paint,bevel=.018)
mesh('windshield',[(-.85,.95,-1.178),(.85,.95,-1.178),(.69,1.328,-.683),(-.69,1.328,-.683)],[(0,1,2,3)],glass)
mesh('rear-glass',[(-.85,.975,.482),(.85,.975,.482),(.69,1.328,.069),(-.69,1.328,.069)],[(0,3,2,1)],glass)
box('engine-deck',(0,.951,1.35),(1.72,.022,1.48),paint)
for i in range(5):
    box(f'engine-deck-vent-{i}',(0,.967,.83+i*.11),(1.04,.008,.028),black,bevel=.002)
for side,label in [(-1,'left'),(1,'right')]:
    mesh(f'canopy-glass-{label}',[(side*.88,.967,-1.10),(side*.737,1.328,-.59),
        (side*.737,1.328,-.005),(side*.88,.975,.425)],[(0,1,2,3)],glass)
    box(f'mirror-{label}',(side*1.06,.99,-.95),(.18,.075,.20),paint)
    box(f'door-handle-{label}',(side*1.046,.835,.18),(.017,.025,.13),black)
    # Small horizontal intake, no borrowed NSX scoop outline.
    box(f'side-intake-{label}',(side*1.054,.69,.64),(.022,.14,.37),black)
    box(f'intake-blade-{label}',(side*1.07,.685,.64),(.025,.012,.33),violet)
    mesh(f'violet-shoulder-{label}',[(side*1.043,.885,-1.28),(side*1.043,.902,-1.28),
        (side*1.083,.932,1.50),(side*1.083,.915,1.50)],[(0,1,2,3)],violet)
    box(f'driving-light-{label}',(side*.60,.63,-2.214),(.44,.065,.025),white)
    # Hinge at the back edge; local -Z points forward. Rotate +X to raise.
    pod=empty(f'popup-{label}',body,(side*.65,.897,-1.57))
    mesh(f'popup-lid-{label}',[(-.21,-.15,-.43),(.21,-.15,-.43),(.21,-.09,-.43),(-.21,-.09,-.43),
        (-.21,-.06,0),(.21,-.06,0),(.21,0,0),(-.21,0,0)],FACES,paint,pod,.004)
    mesh(f'popup-lamp-{label}',[(-.16,-.151,-.40),(.16,-.151,-.40),
        (.16,-.111,-.21),(-.16,-.111,-.21)],[(0,1,2,3)],white,pod)
    for group in range(2):
        z0=-.50+group*.23
        for stroke in range(4):
            box(f'tally-{label}-{group}-{stroke}',(side*1.045,.74,z0+stroke*.043),(.009,.11,.010),violet,bevel=0)
        mesh(f'tally-{label}-{group}-slash',[(side*1.052,.683,z0-.02),(side*1.052,.696,z0-.02),
            (side*1.052,.801,z0+.15),(side*1.052,.788,z0+.15)],[(0,1,2,3)],violet)
# Fixed nose lights and lower fascia stay ahead of the full-lock tyre envelope.
assert 2.10 > FRONT_REACH
box('nose-intake',(0,.45,-2.208),(1.32,.105,.022),black)
box('front-lip',(0,.37,-2.19),(1.88,.035,.08),black)
box('tail-band',(0,.775,2.217),(2.04,.21,.028),tail_violet)
for side,label in [(-1,'left'),(1,'right')]:
    box(f'taillight-{label}',(side*.92,.64,2.219),(.18,.035,.025),red)
box('rear-valance',(0,.475,2.207),(1.79,.15,.035),black)
box('rear-plate',(0,.49,2.231),(.32,.105,.018),black)
box('exhaust',(-.65,.33,2.16),(.16,.08,.13),chrome)

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

for axle,z in [('front',-AXLE),('rear',AXLE)]:
    for side,label in [(-1,'left'),(1,'right')]:
        corner=f'{axle}-{label}'
        pivot=empty(f'wheel-{corner}',root,(side*TRACK,WHEEL_Y,z))
        rolling=empty(f'rolling-{corner}',pivot)
        w=HALF_WIDTH
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
exec(compile((ROOT/'scripts/export-vesper.py').read_text(), 'export-vesper.py', 'exec'))
if '--render' in sys.argv:
    for label,cam in cameras:
        scene.camera=cam; scene.render.filepath=str(ROOT/f'artifacts/{SLUG}-{label}.png')
        bpy.ops.render.render(write_still=True)
