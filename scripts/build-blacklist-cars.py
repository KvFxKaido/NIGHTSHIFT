"""Build one of the six remaining Blacklist bodies, using original geometry.

blender --background --python scripts/build-blacklist-cars.py -- --car=latch --render
Rebuilds its .blend, exports raw GLB, and optionally renders front/rear studio views.
Export subsequent hand edits with export-blacklist-car.py instead of rebuilding.
"""
import math
import sys
import argparse
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--car', required=True, choices=['latch','breakwater','wager','meridian','skim','reign'])
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
CAR = args.car
SLUG = f'ns-{CAR}-01'
PALETTES = {
    'latch': ('a6e52b', 'c6f542', '353a40'),
    'breakwater': ('e8c82a', 'ffdf36', '626972'),
    'wager': ('ca23c4', 'f03fe0', '93909b'),
    'meridian': ('aeb8c4', 'dce7ee', 'aeb8c4'),
    'skim': ('235ac8', '326def', '939bad'),
    'reign': ('eff2f4', 'ffffff', '929da7'),
}
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

paint = material('car-paint', PALETTES[CAR][0], .3, .28)
accent = material('identity-accent', PALETTES[CAR][1], .42, .15)
black = material('satin-black', '111820', .58, .15)
glass = material('smoked-glass', '12212a', .21, .45)
chrome = material('wheel-finish', PALETTES[CAR][2], .26, .65)
rubber = material('tire-rubber', '111315', .9)
red = material('tail-lamp', 'f32c28', .3, .1, 2)
white = material('head-lamp', 'e8f4ff', .24, .1, 2.5)
amber = material('amber-marker', 'ff9a28', .3, .1, 1.4)

def empty(name, parent=None, location=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = coord(location)
    return obj

root = empty(SLUG)
root['authoring'] = f'Original NIGHTSHIFT {CAR}; shared rig, individually authored body'
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

# The shared rig is the authority; authored silhouettes must fit around it.
import re
geometry_source = (ROOT/'src/render/car.ts').read_text()
def geometry(name):
    return float(re.search(r'\b'+name+r':\s*([0-9.]+)', geometry_source).group(1))
AXLE = geometry('axleZ'); TRACK = geometry('halfTrack')
WHEEL_Y = geometry('wheelCenterY'); RADIUS = geometry('tireRadius')
HALF_WIDTH = geometry('tireHalfWidth')
ARCH = RADIUS + geometry('archClearance')
cutters = []
SPOKES = {'latch':5, 'breakwater':8, 'wager':5, 'meridian':6, 'skim':8, 'reign':6}[CAR]

def coachwork(sections, chamfer=.09):
    """Eight vertices per cross-section give sports bodies faceted shoulders."""
    verts=[]
    for z,w,bottom,top in sections:
        edge = min(chamfer, (top-bottom)*.30)
        verts += [(-w+edge,bottom,z),(w-edge,bottom,z),
                  (w,bottom+edge,z),(w,top-edge,z),
                  (w-edge,top,z),(-w+edge,top,z),
                  (-w,top-edge,z),(-w,bottom+edge,z)]
    faces=[tuple(reversed(range(8)))]
    for i in range(len(sections)-1):
        for j in range(8):
            faces.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
    faces.append(tuple(range((len(sections)-1)*8,len(sections)*8)))
    shell=mesh('coachwork',verts,faces,paint)
    for axle,z in [('front',-AXLE),('rear',AXLE)]:
        for side,label in [(-1,'left'),(1,'right')]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=ARCH, depth=1.6,
                location=coord((side*1.20,WHEEL_Y,z)), rotation=(0,math.pi/2,0))
            cutter=bpy.context.object; cutter.name=f'clearance-{axle}-{label}'
            mod=shell.modifiers.new(cutter.name,'BOOLEAN')
            mod.operation='DIFFERENCE'; mod.solver='EXACT'; mod.object=cutter
            cutters.append(cutter)
    mod=shell.modifiers.new('Manufactured edge','BEVEL');mod.width=.015;mod.segments=2

def cabin(name, bottom, top, front, front_top, rear_top, rear, width, roof_width, roof_mat=None):
    """Closed cabin with separate glazing, inset borders and optional roof cap."""
    mesh(name,[(-width,bottom,front),(width,bottom,front),(roof_width,top,front_top),(-roof_width,top,front_top),
        (-width,bottom,rear),(width,bottom,rear),(roof_width,top,rear_top),(-roof_width,top,rear_top)],FACES,paint,bevel=.015)
    # Bilinear interpolation keeps glass on its actual sloping face.
    def face_window(label,corners):
        points=[]
        for u,v in [(.04,.075),(.96,.075),(.96,.925),(.04,.925)]:
            low=Vector(corners[0]).lerp(Vector(corners[1]),u)
            high=Vector(corners[3]).lerp(Vector(corners[2]),u)
            p=low.lerp(high,v)
            if label=='windshield': p.z-=.009
            elif label=='rear-glass': p.z+=.009
            points.append(tuple(p))
        mesh(label,points,[(0,1,2,3)],glass)
    face_window('windshield',[(-width,bottom,front),(width,bottom,front),(roof_width,top,front_top),(-roof_width,top,front_top)])
    face_window('rear-glass',[(-width,bottom,rear),(width,bottom,rear),(roof_width,top,rear_top),(-roof_width,top,rear_top)])
    for side,label in [(-1,'left'),(1,'right')]:
        # Narrow border on all four edges. Pillars below split this single surface.
        low_x=side*(width+(roof_width-width)*.075+.01)
        high_x=side*(width+(roof_width-width)*.925+.01)
        lo=bottom+(top-bottom)*.075; hi=bottom+(top-bottom)*.925
        f_lo=front+(front_top-front)*.075; f_hi=front+(front_top-front)*.925
        r_lo=rear+(rear_top-rear)*.075; r_hi=rear+(rear_top-rear)*.925
        mesh(f'side-glass-{label}',[(low_x,lo,f_lo+.035),(high_x,hi,f_hi+.035),
            (high_x,hi,r_hi-.035),(low_x,lo,r_lo-.035)],[(0,1,2,3)],glass)
    if roof_mat:
        box('hardtop-cap',(0,top+.009,(front_top+rear_top)/2),(roof_width*2,.025,rear_top-front_top+.04),roof_mat,bevel=.018)

def side_pillar(label, z, bottom, top, width, roof_width, thickness=.055):
    for side,name in [(-1,'left'),(1,'right')]:
        mesh(f'{label}-{name}',[(side*(width+.016),bottom,z-thickness/2),(side*(roof_width+.016),top,z-thickness/2),
            (side*(roof_width+.016),top,z+thickness/2),(side*(width+.016),bottom,z+thickness/2)],[(0,1,2,3)],paint)

def mirrors(y,z,x=1.07):
    for side,label in [(-1,'left'),(1,'right')]:
        box(f'mirror-{label}',(side*x,y,z),(.17,.085,.20),black)

def handles(z,y,x=1.03,label='door'):
    for side,name in [(-1,'left'),(1,'right')]:
        box(f'{label}-handle-{name}',(side*x,y,z),(.018,.025,.14),black,bevel=.003)

def disc(name, center, radius, mat, axis='z'):
    cx,cy,cz=center;n=32
    if axis=='z':
        points=[(cx,cy,cz)]+[(cx+math.cos(i*math.tau/n)*radius,cy+math.sin(i*math.tau/n)*radius,cz) for i in range(n)]
    else:
        points=[(cx,cy,cz)]+[(cx,cy+math.cos(i*math.tau/n)*radius,cz+math.sin(i*math.tau/n)*radius) for i in range(n)]
    mesh(name,points,[(0,i+1,(i+1)%n+1) for i in range(n)],mat)

def exhaust(z,x=-.67):
    box('exhaust',(x,.30,z),(.16,.085,.14),chrome)

def spoiler(z,y,width,style='wing'):
    for side,label in [(-1,'left'),(1,'right')]:
        box(f'{style}-pedestal-{label}',(side*width*.32,y-.10,z),(.075,.19,.13),black)
    box(style,(0,y,z),(width,.055,.24),paint,bevel=.015)

def build_latch():
    # A broad arcing liftback, high rear shoulders, hooked visor spoiler.
    coachwork([(-2.16,.91,.35,.68),(-1.95,1.01,.33,.86),(-1.48,1.05,.33,.95),
               (-.65,1.045,.33,.94),(.65,1.055,.33,.99),(1.48,1.065,.33,1.02),(2.16,1.02,.39,.91)])
    cabin('liftback-canopy',.94,1.48,-.85,-.29,.42,1.89,.93,.75)
    side_pillar('b-pillar',.43,.965,1.46,.923,.76,.08)
    spoiler(1.98,1.17,1.91,'visor-spoiler')
    mirrors(1.03,-.65);handles(.30,.84,1.053)
    box('liftback-rear-apron',(0,.57,2.163),(1.69,.23,.025),paint)
    for side,label in [(-1,'left'),(1,'right')]:
        mesh(f'swept-headlight-{label}',[(side*.40,.74,-2.172),(side*.86,.71,-2.172),
            (side*.87,.82,-2.105),(side*.48,.81,-2.105)],[(0,1,2,3)],white)
        box(f'tail-blade-{label}',(side*.65,.84,2.176),(.53,.065,.023),red)
        box(f'rocker-{label}',(side*1.048,.35,0),(.06,.065,1.82),black)
    box('nose-mouth',(0,.47,-2.17),(1.20,.12,.02),black)
    box('tail-plate',(0,.66,2.19),(.31,.11,.018),black)
    exhaust(2.12)

def build_breakwater():
    # Short enclosed utility body. The spare is a fixed body detail, not a fifth rig wheel.
    coachwork([(-2.05,.96,.41,1.02),(-1.48,1.05,.40,1.11),(-.62,1.05,.40,1.11),
               (1.48,1.05,.40,1.11),(2.01,1.01,.42,1.11)],.045)
    cabin('utility-cabin',1.09,1.89,-.83,-.55,1.75,1.94,.965,.90)
    side_pillar('b-pillar',.25,1.10,1.88,.965,.90,.11)
    side_pillar('cargo-pillar',1.10,1.10,1.88,.965,.90,.11)
    mirrors(1.22,-.72,1.11);handles(.10,.98,1.059)
    box('flat-bonnet',(0,1.123,-1.41),(1.81,.025,1.06),paint)
    for side,label in [(-1,'left'),(1,'right')]:
        box(f'roof-rail-{label}',(side*.83,1.94,.61),(.04,.05,2.37),black)
        box(f'utility-headlight-{label}',(side*.68,.90,-2.071),(.35,.17,.025),white)
        box(f'vertical-tail-{label}',(side*.87,.86,2.032),(.13,.32,.025),red)
        box(f'step-{label}',(side*1.064,.30,0),(.13,.08,1.65),black)
    box('utility-grille',(0,.90,-2.071),(.75,.20,.025),black)
    for i in range(4): box(f'grille-slat-{i}',(-.27+i*.18,.90,-2.09),(.026,.17,.012),chrome)
    box('front-bumper',(0,.49,-2.08),(1.99,.16,.15),black)
    box('rear-bumper',(0,.47,2.045),(1.96,.14,.12),black)
    box('tailgate',(0,.92,2.025),(1.51,.32,.025),paint)
    # Cylinder axis is runtime Z, authored by explicit rings to avoid object rotations.
    n=40;verts=[]
    for z,r in [(2.03,.31),(2.11,.36),(2.28,.36),(2.32,.29)]:
        verts.extend([(math.cos(i*math.tau/n)*r,1.14+math.sin(i*math.tau/n)*r,z) for i in range(n)])
    faces=[]
    for row in range(3):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    mesh('tailgate-spare',verts,faces,rubber)
    disc('spare-cover',(0,1.14,2.323),.292,paint)
    box('spare-cover-bar',(0,1.14,2.327),(.42,.06,.008),black)

def build_wager():
    # Softly faceted fenders, rounded canopy and a long, dropping fastback.
    coachwork([(-2.20,.87,.36,.60),(-2.00,1.00,.31,.82),(-1.48,1.08,.31,.96),
               (-.7,1.00,.31,.91),(.45,1.01,.31,.92),(1.48,1.09,.31,1.00),(2.20,.99,.37,.82)],.15)
    cabin('rotary-canopy',.90,1.30,-.58,-.06,.53,1.76,.88,.69)
    mirrors(.99,-.41,1.035);handles(.40,.79,1.013)
    box('bonnet',(0,.875,-1.31),(1.26,.018,1.12),paint)
    box('ducktail',(0,1.045,1.99),(1.80,.075,.26),paint,bevel=.026)
    for side,label in [(-1,'left'),(1,'right')]:
        mesh(f'headlamp-lens-{label}',[(side*.42,.64,-2.205),(side*.78,.64,-2.205),
            (side*.84,.79,-2.018),(side*.54,.80,-2.018)],[(0,1,2,3)],glass)
        box(f'driving-lamp-{label}',(side*.57,.59,-2.215),(.32,.065,.02),white)
        box(f'fender-vent-{label}',(side*1.01,.63,-.63),(.018,.13,.23),black)
        for i in range(2):disc(f'twin-tail-{label}-{i}',(side*(.51+i*.25),.72,2.230),.075,red)
    box('oval-intake',(0,.425,-2.207),(1.08,.095,.028),black,bevel=.04)
    box('tail-panel',(0,.71,2.203),(1.77,.22,.02),black)
    box('rear-apron',(0,.50,2.21),(1.74,.16,.02),paint)
    exhaust(2.18)

def build_meridian():
    # Long roof and upright cargo glass, deliberately four doors rather than a hatch.
    coachwork([(-2.20,.98,.35,.89),(-1.48,1.04,.33,.96),(-.65,1.04,.33,.96),
               (1.48,1.04,.33,.97),(2.23,1.00,.36,.93)],.065)
    cabin('wagon-cabin',.95,1.59,-.85,-.34,1.76,2.10,.94,.82)
    side_pillar('b-pillar',.35,.97,1.57,.94,.82,.08)
    side_pillar('cargo-pillar',1.16,.97,1.57,.94,.82,.09)
    mirrors(1.045,-.68);handles(.20,.83,1.046,'front-door');handles(1.0,.83,1.046,'rear-door')
    box('bonnet',(0,.965,-1.48),(1.81,.02,1.14),paint)
    for side,label in [(-1,'left'),(1,'right')]:
        box(f'roof-rail-{label}',(side*.77,1.635,.72),(.033,.04,1.91),black)
        box(f'sport-headlight-{label}',(side*.68,.79,-2.215),(.48,.12,.025),white)
        box(f'cargo-tail-{label}',(side*.83,.78,2.244),(.22,.24,.025),red)
        box(f'rocker-{label}',(side*1.047,.35,0),(.045,.06,1.84),black)
        box(f'door-seam-{label}',(side*1.047,.65,.39),(.006,.40,.012),black,bevel=0)
    box('wagon-grille',(0,.785,-2.215),(.72,.15,.025),black)
    box('lower-grille',(0,.47,-2.215),(1.75,.12,.025),black)
    box('tailgate-apron',(0,.66,2.242),(1.28,.25,.026),paint)
    box('rear-plate',(0,.70,2.262),(.32,.11,.016),black)
    box('rear-wiper',(0,1.13,2.025),(.46,.018,.02),black)
    exhaust(2.19)

def build_skim():
    # A compact two-seat hardtop on a low wedge, with a separate short rear deck.
    coachwork([(-2.10,.88,.35,.60),(-1.90,.97,.33,.83),(-1.48,1.00,.33,.91),
               (-.65,.99,.33,.89),(.60,.99,.33,.91),(1.48,1.02,.33,.94),(2.07,.96,.39,.81)],.11)
    cabin('roadster-cabin',.91,1.25,-.63,-.19,.35,.69,.84,.71,black)
    mirrors(1.005,-.48,1.02);handles(.32,.79,1.001)
    box('short-deck',(0,.925,1.25),(1.53,.018,1.03),paint)
    box('deck-ridge',(0,.966,1.91),(1.58,.035,.13),paint)
    for side,label in [(-1,'left'),(1,'right')]:
        # Flush covered lamp shapes, paired with narrow fixed night lamps.
        mesh(f'flush-pod-{label}',[(side*.43,.764,-1.97),(side*.77,.764,-1.97),
            (side*.77,.858,-1.67),(side*.43,.858,-1.67)],[(0,1,2,3)],black)
        box(f'fixed-headlight-{label}',(side*.60,.58,-2.113),(.32,.055,.025),white)
        box(f'tail-square-{label}',(side*.64,.70,2.084),(.31,.115,.023),red)
        box(f'flank-vent-{label}',(side*.995,.64,-.51),(.018,.07,.21),black)
    box('nose-slot',(0,.43,-2.106),(1.30,.095,.02),black)
    box('rear-apron',(0,.51,2.084),(1.49,.14,.023),paint)
    exhaust(2.04)

def build_reign():
    # Upright formal coupe: long flat bonnet, short cabin and a squared separate boot.
    coachwork([(-2.22,.99,.35,.89),(-1.48,1.06,.33,.99),(-.60,1.055,.33,.98),
               (.90,1.055,.33,.99),(1.48,1.08,.33,1.00),(2.24,1.035,.37,.95)],.055)
    cabin('upright-coupe',.98,1.48,-.64,-.24,.61,1.08,.93,.80)
    side_pillar('b-pillar',.27,1.0,1.46,.93,.80,.075)
    mirrors(1.08,-.49,1.09);handles(.37,.86,1.066)
    box('long-bonnet',(0,.995,-1.44),(1.84,.025,1.42),paint)
    box('separate-boot',(0,1.005,1.62),(1.87,.025,.98),paint)
    spoiler(1.96,1.28,1.97,'bridge-wing')
    for side,label in [(-1,'left'),(1,'right')]:
        box(f'rectangle-headlight-{label}',(side*.70,.79,-2.234),(.48,.13,.025),white)
        # Three small red squares per side replace the reference's exact round-lamp signature.
        for i in range(3):box(f'tail-cell-{label}-{i}',(side*(.45+i*.19),.80,2.264),(.105,.09,.025),red)
        box(f'rocker-{label}',(side*1.061,.36,0),(.055,.065,1.80),black)
    box('front-grille',(0,.79,-2.237),(.64,.14,.025),black)
    box('intercooler',(0,.46,-2.237),(1.23,.15,.025),black)
    for i in range(3):box(f'intercooler-slat-{i}',(0,.415+i*.043,-2.254),(1.09,.012,.01),chrome)
    box('tail-recess',(0,.80,2.247),(1.91,.21,.02),black)
    box('rear-apron',(0,.53,2.253),(1.81,.21,.024),paint)
    box('rear-plate',(0,.56,2.271),(.32,.11,.016),black)
    exhaust(2.21)

BUILDERS = {'latch':build_latch, 'breakwater':build_breakwater, 'wager':build_wager,
            'meridian':build_meridian, 'skim':build_skim, 'reign':build_reign}
BUILDERS[CAR]()


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
        for spoke in range(SPOKES):
            angle=spoke*math.tau/SPOKES
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
exec(compile((ROOT/'scripts/export-blacklist-car.py').read_text(), 'export-blacklist-car.py', 'exec'))
if args.render:
    for label,cam in cameras:
        scene.camera=cam; scene.render.filepath=str(ROOT/f'design/reference/cars/{CAR}-studio-{label}.png')
        bpy.ops.render.render(write_still=True)
