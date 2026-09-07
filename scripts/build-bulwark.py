"""Create the Bulwark, a rival car, in Blender.

Run with Blender --background --python scripts/build-bulwark.py [-- --render].
This REBUILDS the source .blend; use export-bulwark.py to ship hand edits instead.
All design coordinates below are metres, X right, Y up, nose toward -Z.
Blender gets X right, Z up, nose toward +Y; glTF converts back without a shim.
No downloaded car, image, font, or texture is used.

Design brief (GDD 10, "The Bully": contact, blocking exits, pressure). The car
has to say what it will do before it does it, and the only reliable read at
night in a chase camera is the silhouette. So: the coupe is long, low and
tapered; this is wide, square and blunt. A near-vertical face, full width held
all the way to a squared tail, and one continuous lamp bar rather than a pair
of lights, because a bar stays legible in a mirror at speed.

It is a coupe utility: two doors, a short cab, and an open load bed. A square
saloon is a common shape, but a roof that stops two thirds of the way back is
rare and reads instantly even as a black shape with tail lights. It also puts
the car somewhere — the lap runs through Freight Gate, Container Wall and the
freight S-bends, and a load bed belongs in a freight district in a way a saloon
does not. The bed walls stay full width and rise ABOVE the cab beltline on
purpose: an open bed is a void where the boot used to be solid mass, and low
walls would leave a thin, light tail and undo the intimidation entirely.

The wheel pivots are NOT a style choice. CAR_GEOMETRY in src/render/car.ts owns
the track and wheelbase for the whole game, so this car is wide in the BODY over
the same axles. That is the intended look anyway: overhang without extra track
reads as slab-sided and heavy, where a pushed-out track would read as a racer.
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SLUG = "ns-bulwark-01"
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / f"assets/cars/{SLUG}.blend"
RAW = ROOT / f"artifacts/{SLUG}.raw.glb"
RENDER = ROOT / f"artifacts/{SLUG}-studio.png"
RENDER_REAR = ROOT / f"artifacts/{SLUG}-studio-rear.png"
for path in (SOURCE, RAW, RENDER, RENDER_REAR):
    path.parent.mkdir(parents=True, exist_ok=True)

# Shared with CAR_GEOMETRY in src/render/car.ts. Changing these here alone would
# ship a car whose wheels no longer sit on the axles the simulation drives.
HALF_TRACK = .92
WHEEL_CENTRE_Y = .40
AXLE_Z = 1.48


def coord(p):
    return Vector((p[0], -p[2], p[1]))


def linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color, roughness, metal=0, emission=0):
    color = tuple(linear(int(hex_color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)
model_collection = bpy.data.collections["Collection"]
model_collection.name = "Bulwark / export"
cutters_collection = bpy.data.collections.new("Wheel clearance / keep cutters")
bpy.context.scene.collection.children.link(cutters_collection)
studio_collection = bpy.data.collections.new("Studio / not exported")
bpy.context.scene.collection.children.link(studio_collection)

# Deliberately the same material NAMES as NS-01. The garage keys customization
# off car-paint and wheel-finish, and reusing them is how we find out whether
# that system is general or was only ever wired to the one car.
# Flat and chalky: gloss reads as a car somebody looks after.
paint = material("car-paint", "2b2d30", .42, .30)
trim = material("rubber-trim", "101418", .62, .12)
glass = material("smoked-glass", "111d2c", .16, .60)
rubber = material("tire-rubber", "15171b", .86)
wheel_finish = material("wheel-finish", "20242a", .38, .80)
alloy = material("machined-alloy", "9aa5b0", .28, .90)
brake = material("brake-steel", "3d454d", .60, .55)
headlamp = material("headlamp-ivory", "ffedc7", .30, 0, 3)
tail = material("tail-lamp", "ff1837", .25, 0, 2.5)
amber = material("amber-marker", "ff910e", .35, 0, 1.5)


def relink(obj, collection):
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def empty(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    model_collection.objects.link(obj)
    obj.parent = parent
    obj.location = coord(location)
    obj.empty_display_size = .16
    return obj


root = empty(SLUG)
root["asset_version"] = 1
root["authoring"] = "Original NIGHTSHIFT design; no third-party car geometry"
root["archetype"] = "bully"
body = empty("body-shell", root)


def mesh(name, verts, faces, mats, parent=body, indices=None, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([coord(v) for v in verts], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    model_collection.objects.link(obj)
    obj.parent = parent
    for mat in mats:
        data.materials.append(mat)
    if indices:
        for polygon, mat_index in zip(data.polygons, indices):
            polygon.material_index = mat_index
    if bevel:
        mod = obj.modifiers.new("Small manufactured edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = .45
    return obj


def box(name, center, size, mat, parent=body, bevel=.008):
    cx, cy, cz = center
    x, y, z = [value / 2 for value in size]
    verts = [(cx + dx, cy + dy, cz + dz)
             for dx, dy, dz in [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                               (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]]
    return mesh(name, verts, [(0,3,2,1), (4,5,6,7), (0,1,5,4),
                             (3,7,6,2), (0,4,7,3), (1,2,6,5)], [mat], parent, bevel=bevel)


# Cross-sections. Against NS-01 the nose arrives already wide and already tall
# instead of tapering to a point, full width is held from arch to arch, and the
# tail refuses to narrow. From behind this is a rectangle, not a wedge.
# (Z, half width, deck height, sill height)
STATIONS = [(-2.14,1.055,1.090,.320), (-2.00,1.110,1.140,.305),
            (-1.48,1.150,1.158,.295), (-.70,1.145,1.162,.295),
            (.40,1.145,1.170,.295), (.70,1.150,1.215,.300),
            (1.48,1.150,1.215,.300), (2.10,1.130,1.205,.318),
            (2.26,1.085,1.190,.350)]
verts = []
for z, width, top, bottom in STATIONS:
    # Reaches full width lower and holds it higher than the coupe's profile, and
    # tucks 52 mm at the shoulder instead of 95. That is most of the squareness.
    half = [(0,bottom), (width*.86,bottom), (width*.985,bottom+.055),
            (width,bottom+.145), (width,top-.085), (width-.052,top-.008), (0,top)]
    ring = half + [(-x,y) for x,y in reversed(half[1:-1])]
    verts.extend((x,y,z) for x,y in ring)
ring_count = 12
faces = [tuple(reversed(range(ring_count)))]
for station in range(len(STATIONS)-1):
    for i in range(ring_count):
        a = station*ring_count+i
        b = station*ring_count+(i+1)%ring_count
        faces.append((a,b,b+ring_count,a+ring_count))
faces.append(tuple(range((len(STATIONS)-1)*ring_count, len(verts))))
shell = mesh("coachwork", verts, faces, [paint, trim])

for axle, z, inner in [("front",-AXLE_Z,.575), ("rear",AXLE_Z,.725)]:
    for side, suffix in [(-1,"left"),(1,"right")]:
        # Wider than the coupe's opening in both radius and depth: the body is
        # 125 mm wider per side, so a shallower cutter would not break through.
        # The visible tyre-to-arch gap is what reads as sitting up, not slammed.
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.515,
            depth=1.7-inner, location=coord((side*(inner+1.7)/2,WHEEL_CENTRE_Y,z)),
            rotation=(0,math.pi/2,0))
        cutter = bpy.context.object
        cutter.name = f"clearance-{axle}-{suffix}"
        relink(cutter, cutters_collection)
        cutter.data.materials.append(paint)
        cutter.data.materials.append(trim)
        for face in cutter.data.polygons:
            face.material_index = 1
        cutter.hide_render = True
        cutter.display_type = "WIRE"
        cutter.hide_set(True)
        mod = shell.modifiers.new(f"Wheel opening / {axle} {suffix}", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cutter
# The bed is a real opening carved from the same lofted body, so its walls have
# thickness and its floor is the car's own material rather than a plate laid on
# top. The floor sits at 0.95 m, deliberately ABOVE the 0.915 m top of the rear
# wheel openings: any lower and the boolean would tear holes from the load space
# straight through into the wheel wells.
bed_cutter = box("clearance-bed-opening", (0,1.475,1.44), (2.06,1.05,1.52), trim,
                 parent=None, bevel=0)
relink(bed_cutter, cutters_collection)
bed_cutter.hide_render = True
bed_cutter.display_type = "WIRE"
bed_cutter.hide_set(True)
bed = shell.modifiers.new("Load bed", "BOOLEAN")
bed.operation = "DIFFERENCE"
bed.solver = "EXACT"
bed.object = bed_cutter

bevel = shell.modifiers.new("Highlight bevel / 10 mm", "BEVEL")
bevel.width = .010
bevel.segments = 2
bevel.limit_method = "ANGLE"
bevel.angle_limit = .50


# One closed greenhouse, same construction as NS-01: window faces and their
# surrounding metal share edges, so moving a pillar cannot open a hole.
gv, gf, gm = [], [], []


def face(points, material_index):
    offset = len(gv)
    gv.extend(points)
    gf.append(tuple(range(offset, offset+len(points))))
    gm.append(material_index)


def mix(a, b, t):
    return tuple(x+(y-x)*t for x,y in zip(a,b))


def window(points, border=.065):
    center = tuple(sum(p[i] for p in points)/4 for i in range(3))
    inner = [mix(p, center, border) for p in points]
    seal = [mix(p, center, border+.025) for p in points]
    for i in range(4):
        j = (i+1)%4
        face([points[i],points[j],inner[j],inner[i]], 0)
        face([inner[i],inner[j],seal[j],seal[i]], 2)
    face(seal, 1)


# A short two-door cab: upright screen, 760 mm of flat roof, near-vertical
# backlight, and a 335 mm glass band on a 1.16 m beltline. That last number is
# the difference between menacing and municipal — a tall greenhouse over a low
# shoulder reads as a family saloon no matter how square it is, so the shoulder
# comes up and the roof comes down until the side glass is a slot. The screen,
# roof front and beltline are unchanged from the saloon; only where the cab
# ENDS has moved, which is the whole edit.
fl=(-.90,1.160,-.86); fr=(.90,1.160,-.86)
tl=(-.815,1.495,-.42); tr=(.815,1.495,-.42)
rl=(-.825,1.492,.34); rr=(.825,1.492,.34)
bl=(-.92,1.155,.62); br=(.92,1.155,.62)
window([fl,fr,tr,tl], .075)
window([rl,rr,br,bl], .095)
face([tl,tr,rr,rl], 0)
face([fl,bl,br,fr], 0)
for f,t,r,b in [(fl,tl,rl,bl),(fr,tr,rr,br)]:
    # One light a side. There is no B-pillar to land on a door split any more,
    # and a divided window on a cab this short would read as clutter.
    window([f,t,r,b], .085)
greenhouse = mesh("greenhouse", gv, gf, [paint,glass,trim], indices=gm)
# Weld panel edges so the editable source is a connected shell, not loose quads.
bm=bmesh.new(); bm.from_mesh(greenhouse.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(greenhouse.data); bm.free()

# Non-planar quad triangulation and Boolean bevels can choose different diagonals
# on opposite sides. Mirror the evaluated positive-X half to make the visible
# surface (not merely its design control points) exactly bilateral.
for obj in (shell, greenhouse):
    mirror=obj.modifiers.new("Final bilateral surface / edit positive X", "MIRROR")
    mirror.use_axis=(True,False,False)
    mirror.use_bisect_axis=(True,False,False)
    mirror.use_clip=True
    mirror.merge_threshold=.00001


def width_at(z):
    for a,b in zip(STATIONS,STATIONS[1:]):
        if a[0] <= z <= b[0]:
            return a[1]+(b[1]-a[1])*(z-a[0])/(b[0]-a[0])
    return STATIONS[0 if z<0 else -1][1]


def deck_at(z):
    for a,b in zip(STATIONS,STATIONS[1:]):
        if a[0] <= z <= b[0]:
            return a[2]+(b[2]-a[2])*(z-a[0])/(b[0]-a[0])
    return STATIONS[0 if z<0 else -1][2]


def line(name, points, mat=trim, radius=.004):
    curve=bpy.data.curves.new(name,"CURVE")
    curve.dimensions="3D"
    curve.bevel_depth=radius
    curve.bevel_resolution=0
    spline=curve.splines.new("POLY")
    spline.points.add(len(points)-1)
    for p, value in zip(spline.points,points):
        p.co=(*coord(value),1)
    obj=bpy.data.objects.new(name,curve)
    model_collection.objects.link(obj)
    obj.parent=body
    curve.materials.append(mat)
    return obj


# One incised bonnet outline. Without it the shoulder-to-shoulder expanse ahead
# of the screen is a single undifferentiated plane, which is the one place this
# car looked unfinished rather than blunt.
# NAME MATTERS: it must sort after 'coachwork'. Blender 5.3 alpha's glTF
# exporter builds its material table on the first MESH primitive it gathers, and
# gathers body-shell's children in name order, so a curve sorting first dies with
# KeyError: 'material_identifiers'. The guard below turns that into English.
line("hood-shutline",
     [(-.86,deck_at(-.90)-.002,-.90)] +
     [(-.86,deck_at(z)-.002,z) for z in (-1.30,-1.70,-2.02)] +
     [(x,deck_at(-2.06)-.002,-2.06) for x in (-.62,0,.62)] +
     [(.86,deck_at(z)-.002,z) for z in (-2.02,-1.70,-1.30)] +
     [(.86,deck_at(-.90)-.002,-.90)])

# One door a side now. At 1.36 m it is a normal door, not a muscle-car door:
# the bed already says working vehicle, so the doors do not have to, and a long
# raked door would tip this from freight yard to hot rod.
DOOR = [(-.90,1.135),(-.90,.58),(-.82,.50),(.40,.50),(.46,.59),(.46,1.140)]
for side,suffix in [(-1,"left"),(1,"right")]:
    line(f"door-shutline-{suffix}", [(side*(width_at(z)+.003),y,z) for z,y in DOOR])
    # High on the door, tucked under the shoulder, rather than at mid-height
    # where a handle reads as something you are meant to open politely.
    box(f"door-handle-{suffix}",(side*(width_at(.30)+.012),1.030,.30),
        (.022,.040,.19),trim,bevel=.008)
    box(f"sill-insert-{suffix}",(side*1.112,.42,-.20),(.034,.065,1.45),trim,bevel=.012)
    # Door-mounted and rooted BELOW the beltline, so the inboard end is buried
    # in the door skin. Sitting it on top of the shoulder left it hovering in
    # mid-air in the first two passes, which is exactly how it read.
    mirror_points=[(side*x,y,z) for x,y,z in [(1.10,1.030,-.78),(1.30,1.036,-.75),
                    (1.305,1.140,-.75),(1.10,1.134,-.78),(1.10,1.032,-.62),
                    (1.315,1.040,-.59),(1.315,1.144,-.59),(1.10,1.138,-.62)]]
    mesh(f"mirror-{suffix}", mirror_points,
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
         [paint,glass],indices=[0,1,0,0,0,0],bevel=.008)

    # Lamps set high and wide on a big blank face: small eyes, heavy brow.
    box(f"headlight-recess-{suffix}",(side*.66,.880,-2.149),(.52,.20,.026),trim)
    box(f"headlight-{suffix}",(side*.66,.880,-2.166),(.455,.135,.020),headlamp,bevel=.004)
    box(f"front-indicator-{suffix}",(side*.975,.880,-2.138),(.030,.150,.024),amber,bevel=.003)
    box(f"rear-reflector-{suffix}",(side*.87,.560,2.256),(.115,.030,.016),tail,bevel=.002)

# A single full-width bar. Two separate lamps read as any car; a continuous line
# is a signature you can name from four car lengths back.
box("tail-recess",(0,.905,2.269),(1.96,.190,.028),trim)
box("tail-bar",(0,.905,2.286),(1.90,.115,.018),tail,bevel=.004)

# One wide slot under the brow. The bumper does the lower intake's job, so a
# second horizontal opening would only dilute the face.
box("front-grille",(0,.655,-2.154),(1.66,.190,.026),trim)
for i,x in enumerate([-.66,-.44,-.22,0,.22,.44,.66]):
    box(f"grille-bar-{i}",(x,.655,-2.170),(.038,.150,.016),brake,bevel=.002)
box("nose-badge",(0,.880,-2.166),(.100,.038,.014),alloy,bevel=.002)

# Corner mass rather than a ram bar: vehicle damage simulation is out of scope
# (GDD 21), so the car threatens with volume, not with bolted-on hardware.
# Depths are held clear of FRONT_WHEEL_REACH_Z (-1.88 m at full lock).
box("front-bumper",(0,.455,-2.120),(2.02,.200,.300),trim,bevel=.022)
box("rear-bumper",(0,.470,2.240),(1.98,.210,.280),trim,bevel=.022)
for side,suffix in [(-1,"left"),(1,"right")]:
    box(f"front-corner-{suffix}",(side*.985,.500,-2.100),(.130,.300,.240),trim,bevel=.024)
    box(f"rear-corner-{suffix}",(side*.975,.515,2.160),(.130,.300,.260),trim,bevel=.024)
box("rear-plate-recess",(0,.640,2.260),(.33,.135,.020),trim)
box("rear-plate",(0,.641,2.276),(.270,.090,.006),alloy,bevel=.002)


def lathe(name, profile, mat, parent, side=1, segments=32):
    vertices=[]
    for x,radius in profile:
        for i in range(segments):
            angle=math.tau*i/segments
            vertices.append((side*x,math.cos(angle)*radius,math.sin(angle)*radius))
    faces=[]
    for row in range(len(profile)):
        other=(row+1)%len(profile)
        for i in range(segments):
            j=(i+1)%segments
            faces.append((row*segments+i,row*segments+j,other*segments+j,other*segments+i))
    obj=mesh(name,vertices,faces,[mat],parent)
    # Circumferential smoothing; profile facets still make the sidewall readable.
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    return obj


for axle,z in [("front",-AXLE_Z),("rear",AXLE_Z)]:
    for side,suffix in [(-1,"left"),(1,"right")]:
        corner=f"{axle}-{suffix}"
        pivot=empty(f"wheel-{corner}",root,(side*HALF_TRACK,WHEEL_CENTRE_Y,z))
        rolling=empty(f"rolling-{corner}",pivot)
        # Tyre and rim sizes are fixed by CAR_GEOMETRY; only the face differs.
        lathe(f"tire-{corner}",[(-.125,.25),(-.125,.318),(-.108,.35),(-.075,.36),
                                (.075,.36),(.108,.35),(.125,.318),(.125,.25)],rubber,rolling)
        lathe(f"rim-lip-{corner}",[(.125,.244),(.123,.265),(.099,.265),(.095,.240)],alloy,rolling,side)
        lathe(f"rim-barrel-{corner}",[(-.103,.241),(.102,.241),(.102,.232),(-.103,.232)],wheel_finish,rolling,side)
        lathe(f"brake-disc-{corner}",[(.038,.203),(.056,.203),(.056,.055),(.038,.055)],brake,rolling,side)
        # Six fat spokes with narrow gaps. Nearly solid at speed, which is the
        # steel-wheel read: heavy, cheap, and not chosen to be looked at.
        sv,sf=[],[]
        for spoke in range(6):
            angle=spoke*math.tau/6
            start=len(sv)
            section=[(.070,.056,-.064),(.070,.246,-.040),(.108,.246,.040),(.108,.056,.064),
                     (.044,.056,-.064),(.044,.246,-.040),(.082,.246,.040),(.082,.056,.064)]
            for x,r,tangent in section:
                sv.append((side*x,math.cos(angle)*r-math.sin(angle)*tangent,
                            math.sin(angle)*r+math.cos(angle)*tangent))
            sf.extend(tuple(start+j for j in face) for face in
                      [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
        mesh(f"six-spoke-{corner}",sv,sf,[wheel_finish],rolling,bevel=.004)
        # Big flat cap over the middle, the way a working wheel hides its nuts.
        lathe(f"hub-{corner}",[(.112,.082),(.120,.070),(.120,0),(.098,0),(.098,.082)],wheel_finish,rolling,side,segments=16)

# Original geometry is the only export selection. Cutters remain in the source
# file, and the turntable, camera and lighting never enter the runtime asset.
for obj in bpy.context.scene.objects:
    obj.select_set(False)
for obj in model_collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=shell

# Studio preview: real PBR materials under broad lights, with no borrowed HDRI.
floor_mat=material("studio-floor","18202c",.64,.15)
floor=box("studio-ground",(0,-.065,0),(200,.10,200),floor_mat,parent=None,bevel=0)
relink(floor,studio_collection)


def area(name, location, energy, color, size, target=(0,.7,0)):
    data=bpy.data.lights.new(name,"AREA")
    data.energy=energy
    data.shape="DISK"
    data.size=size
    data.color=color
    obj=bpy.data.objects.new(name,data)
    studio_collection.objects.link(obj)
    obj.location=coord(location)
    obj.rotation_euler=(coord(target)-obj.location).to_track_quat("-Z","Y").to_euler()


area("studio-key",(1.5,6,-3),1500,(1,.85,.72),5)
area("studio-fill",(-4,2,-1),1050,(.45,.70,1),4)
area("studio-rim",(2.5,3.5,4),1900,(.65,.8,1),3)
def studio_camera(name, location, scale=7.1, target=(0,.75,0)):
    data=bpy.data.cameras.new(name)
    obj=bpy.data.objects.new(name,data)
    studio_collection.objects.link(obj)
    obj.location=coord(location)
    obj.rotation_euler=(coord(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    data.type="ORTHO"
    data.ortho_scale=scale
    return obj


camera=studio_camera("studio-camera",(6,3.2,-6.6))
# The tail bar is this car's signature and cannot be judged from the front
# three-quarter, so the source carries the angle that shows it.
camera_rear=studio_camera("studio-camera-rear",(-5.4,2.9,6.8))
scene=bpy.context.scene
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=1440
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.world.color=(.10,.10,.10)
scene.view_settings.view_transform="AgX"
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(RENDER)
scene.unit_settings.system="METRIC"
scene.unit_settings.scale_length=1

# Open into a useful shaded, car-framed viewport, not an empty origin.
for screen in bpy.data.screens:
    for area_ui in screen.areas:
        if area_ui.type=="VIEW_3D":
            space=area_ui.spaces.active
            space.clip_end=500
            space.shading.type="MATERIAL"
            space.overlay.show_extras=False
            space.region_3d.view_distance=7.3
            space.region_3d.view_location=coord((0,.8,0))
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()

# Do not accumulate source backups when this explicit generator is re-run.
for obj in bpy.context.scene.objects:
    obj.select_set(False)
shell.select_set(True)
bpy.context.view_layer.objects.active=shell
text=bpy.data.texts.get("START HERE.md") or bpy.data.texts.new("START HERE.md")
text.clear()
text.write((ROOT/"assets/cars/README.md").read_text(encoding="utf-8"))
first_child=min(body.children,key=lambda o:o.name)
if first_child.type!="MESH":
    raise RuntimeError(
        f"'{first_child.name}' sorts first under body-shell and is a {first_child.type}. "
        "Blender 5.3 alpha's glTF exporter needs a MESH first or it raises "
        "KeyError: 'material_identifiers'. Rename it to sort after 'coachwork'.")
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
exec(compile((ROOT/"scripts/export-bulwark.py").read_text(),"export-bulwark.py","exec"))
if "--render" in sys.argv:
    for cam, output in [(camera, RENDER), (camera_rear, RENDER_REAR)]:
        scene.camera = cam
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
    scene.camera = camera
    scene.render.filepath = str(RENDER)
print(f"Bulwark source: {SOURCE}")
