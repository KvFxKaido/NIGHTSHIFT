"""Build Cinder, an original IS300-inspired hero sedan.
Blender --background --python scripts/build-cinder.py [-- --render].
Rebuilds source; export-cinder.py preserves hand edits.
Metres: X right, Y up, nose -Z. Shared runtime wheel rig.
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SLUG = "ns-cinder-01"
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / f"assets/cars/{SLUG}.blend"
RAW = ROOT / f"artifacts/{SLUG}.raw.glb"
RENDER = ROOT / f"artifacts/{SLUG}-studio.png"
RENDER_REAR = ROOT / f"artifacts/{SLUG}-studio-rear.png"
for path in (SOURCE, RAW, RENDER, RENDER_REAR):
    path.parent.mkdir(parents=True, exist_ok=True)

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
model_collection.name = "Cinder / export"
cutters_collection = bpy.data.collections.new("Wheel clearance / keep cutters")
bpy.context.scene.collection.children.link(cutters_collection)
studio_collection = bpy.data.collections.new("Studio / not exported")
bpy.context.scene.collection.children.link(studio_collection)

paint = material("car-paint", "a9b5bd", .23, .72)
trim = material("rubber-trim", "101418", .62, .12)
glass = material("smoked-glass", "111d2c", .16, .60)
rubber = material("tire-rubber", "15171b", .86)
wheel_finish = material("wheel-finish", "b7c0c8", .24, .85)
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
root["archetype"] = "hero-sedan"
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


STATIONS = [(-2.24,.91,.94,.32), (-2.08,.995,1.01,.30),
            (-1.48,1.045,1.065,.30), (-.72,1.015,1.09,.30),
            (.25,1.015,1.105,.30), (1.05,1.035,1.12,.30),
            (1.48,1.045,1.115,.30), (2.04,1.00,1.095,.32),
            (2.20,.94,1.055,.36)]
verts = []
for z, width, top, bottom in STATIONS:
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
bevel = shell.modifiers.new("Highlight bevel / 10 mm", "BEVEL")
bevel.width = .010
bevel.segments = 2
bevel.limit_method = "ANGLE"
bevel.angle_limit = .50


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


fl=(-.91,1.08,-.79); fr=(.91,1.08,-.79)
tl=(-.76,1.49,-.23); tr=(.76,1.49,-.23)
rl=(-.75,1.48,.77); rr=(.75,1.48,.77)
bl=(-.91,1.11,1.36); br=(.91,1.11,1.36)
window([fl,fr,tr,tl], .075)
window([rl,rr,br,bl], .09)
face([tl,tr,rr,rl], 0)
face([fl,bl,br,fr], 0)
for f,t,r,b in [(fl,tl,rl,bl),(fr,tr,rr,br)]:
    lower=mix(f,b,.52); upper=mix(t,r,.50)
    window([f,t,upper,lower], .075)
    window([lower,upper,r,b], .085)
greenhouse = mesh("greenhouse", gv, gf, [paint,glass,trim], indices=gm)
bm=bmesh.new(); bm.from_mesh(greenhouse.data)
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.to_mesh(greenhouse.data); bm.free()

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


line("hood-shutline", [(x,deck_at(z)+.002,z) for x,z in
     [(-.76,-.80),(-.76,-1.48),(-.70,-2.12),(.70,-2.12),(.76,-1.48),(.76,-.80)]])
line("trunk-shutline", [(x,deck_at(z)+.003,z) for x,z in
     [(-.78,1.39),(-.78,2.04),(.78,2.04),(.78,1.39)]])
for side,suffix in [(-1,"left"),(1,"right")]:
    for label,points in [("front",[(-.77,1.04),(-.77,.51),(-.66,.44),(.31,.44),(.33,1.07)]),
                         ("rear",[(.33,1.07),(.31,.44),(.92,.44),(1.10,.72),(1.23,1.075)])]:
        line(f"door-{label}-{suffix}",[(side*(width_at(z)+.002),y,z) for z,y in points])
    for label,z in [("front",.17),("rear",.97)]:
        box(f"handle-{label}-{suffix}",(side*(width_at(z)+.009),.985,z),(.024,.033,.15),alloy)
    box(f"sill-{suffix}",(side*1.01,.345,0),(.07,.09,1.80),paint)
    box(f"mirror-stalk-{suffix}",(side*.975,1.12,-.62),(.20,.045,.075),trim)
    box(f"mirror-{suffix}",(side*1.105,1.155,-.60),(.19,.115,.24),paint,bevel=.025)
    box(f"mirror-glass-{suffix}",(side*1.105,1.16,-.473),(.15,.073,.012),glass)

def lens(name,x,y,z,radius,mat):
    vertices=[(x,y,z)] + [(x+math.cos(i*math.tau/24)*radius,
                y+math.sin(i*math.tau/24)*radius,z) for i in range(24)]
    return mesh(name,vertices,[(0,(i+1)%24+1,i+1) if z < 0 else (0,i+1,(i+1)%24+1) for i in range(24)],[mat])

for side,suffix in [(-1,"left"),(1,"right")]:
    box(f"headlight-housing-{suffix}",(side*.654,.83,-2.25),(.48,.205,.035),alloy,bevel=.025)
    for n,(x,r) in enumerate([(.55,.073),(.75,.060)]):
        lens(f"headlight-ring-{suffix}-{n}",side*x,.84,-2.273,r+.012,trim)
        lens(f"headlight-{suffix}-{n}",side*x,.84,-2.275,r,headlamp)
    box(f"front-marker-{suffix}",(side*.865,.83,-2.27),(.030,.115,.013),amber)
    box(f"tail-housing-{suffix}",(side*.705,.895,2.204),(.40,.25,.034),alloy,bevel=.018)
    lens(f"tail-ring-{suffix}",side*.73,.917,2.224,.103,trim)
    lens(f"tail-lamp-{suffix}",side*.73,.917,2.227,.082,tail)
    lens(f"reverse-lamp-{suffix}",side*.595,.84,2.227,.036,headlamp)
    lens(f"fog-light-{suffix}",side*.73,.48,-2.267,.052,headlamp)
box("front-bumper-face",(0,.645,-2.247),(1.83,.135,.04),paint,bevel=.015)
box("front-grille",(0,.843,-2.255),(.67,.17,.025),trim)
for i in range(3):
    box(f"grille-slat-{i}",(0,.797+i*.043,-2.272),(.61,.012,.012),alloy,bevel=.002)
box("nose-badge",(0,.852,-2.283),(.045,.055,.012),alloy)
box("lower-intake",(0,.49,-2.246),(1.09,.16,.04),trim)
box("front-lip",(0,.33,-2.13),(1.91,.09,.32),paint,bevel=.017)
box("rear-bumper-face",(0,.55,2.191),(1.83,.14,.045),paint,bevel=.018)
box("rear-valance",(0,.355,2.065),(1.90,.095,.29),trim)
box("trunk-lip",(0,1.107,2.03),(1.77,.055,.16),paint,bevel=.012)
box("rear-plate-recess",(0,.79,2.21),(.43,.15,.018),trim)
box("rear-plate",(0,.79,2.223),(.33,.10,.008),alloy)
box("rear-badge",(0,1.00,2.219),(.12,.025,.012),alloy)
box("exhaust-tip",(.70,.32,2.20),(.15,.12,.21),alloy,bevel=.035)
box("exhaust-bore",(.70,.32,2.31),(.108,.075,.008),trim,bevel=.024)


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
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    return obj


for axle,z in [("front",-AXLE_Z),("rear",AXLE_Z)]:
    for side,suffix in [(-1,"left"),(1,"right")]:
        corner=f"{axle}-{suffix}"
        pivot=empty(f"wheel-{corner}",root,(side*HALF_TRACK,WHEEL_CENTRE_Y,z))
        rolling=empty(f"rolling-{corner}",pivot)
        lathe(f"tire-{corner}",[(-.125,.25),(-.125,.318),(-.108,.35),(-.075,.36),
                                (.075,.36),(.108,.35),(.125,.318),(.125,.25)],rubber,rolling)
        lathe(f"rim-lip-{corner}",[(.125,.244),(.123,.265),(.099,.265),(.095,.240)],alloy,rolling,side)
        lathe(f"rim-barrel-{corner}",[(-.103,.241),(.102,.241),(.102,.232),(-.103,.232)],wheel_finish,rolling,side)
        lathe(f"brake-disc-{corner}",[(.038,.203),(.056,.203),(.056,.055),(.038,.055)],brake,rolling,side)
        sv,sf=[],[]
        for spoke in range(5):
            angle=spoke*math.tau/5
            start=len(sv)
            section=[(.070,.056,-.026),(.070,.246,-.022),(.108,.246,.022),(.108,.056,.026),
                     (.044,.056,-.026),(.044,.246,-.022),(.082,.246,.022),(.082,.056,.026)]
            for x,r,tangent in section:
                sv.append((side*x,math.cos(angle)*r-math.sin(angle)*tangent,
                            math.sin(angle)*r+math.cos(angle)*tangent))
            sf.extend(tuple(start+j for j in face) for face in
                      [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
        mesh(f"five-spoke-{corner}",sv,sf,[wheel_finish],rolling,bevel=.004)
        lathe(f"hub-{corner}",[(.112,.082),(.120,.070),(.120,0),(.098,0),(.098,.082)],wheel_finish,rolling,side,segments=16)

for obj in bpy.context.scene.objects:
    obj.select_set(False)
for obj in model_collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=shell

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
import runpy
runpy.run_path(str(ROOT / 'scripts/build-cinder-parts.py'))['install_parts']()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
exec(compile((ROOT/"scripts/export-cinder.py").read_text(),"export-cinder.py","exec"))
if "--render" in sys.argv:
    for cam, output in [(camera, RENDER), (camera_rear, RENDER_REAR)]:
        scene.camera = cam
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
    scene.camera = camera
    scene.render.filepath = str(RENDER)
print(f"Cinder source: {SOURCE}")
