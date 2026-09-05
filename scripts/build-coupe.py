"""Create NIGHTSHIFT's original NS-01 coupe in Blender.

Run with Blender --background --python scripts/build-coupe.py [-- --render].
This REBUILDS the source .blend; use export-coupe.py to ship hand edits instead.
All design coordinates below are metres, X right, Y up, nose toward -Z.
Blender gets X right, Z up, nose toward +Y; glTF converts back without a shim.
No downloaded car, image, font, or texture is used.
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/cars/ns-coupe-01.blend"
RAW = ROOT / "artifacts/ns-coupe-01.raw.glb"
RENDER = ROOT / "artifacts/ns-coupe-01-studio.png"
for path in (SOURCE, RAW, RENDER):
    path.parent.mkdir(parents=True, exist_ok=True)


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
model_collection.name = "NS-01 / export"
cutters_collection = bpy.data.collections.new("Wheel clearance / keep cutters")
bpy.context.scene.collection.children.link(cutters_collection)
studio_collection = bpy.data.collections.new("Studio / not exported")
bpy.context.scene.collection.children.link(studio_collection)

paint = material("car-paint", "a80d2f", .23, .72)
trim = material("rubber-trim", "131820", .55, .15)
glass = material("smoked-glass", "142638", .17, .58)
rubber = material("tire-rubber", "15171b", .86)
wheel_finish = material("wheel-finish", "252a31", .30, .88)
alloy = material("machined-alloy", "aeb9c5", .23, .90)
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


root = empty("ns-coupe-01")
root["asset_version"] = 1
root["authoring"] = "Original NIGHTSHIFT design; no third-party car geometry"
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


# Cross-sections define continuous shoulders, doors and hood. The arches are
# actual subtractive openings, not little blocks placed around a wheel.
# (Z, half width, deck height, sill height)
STATIONS = [(-2.26,.88,.77,.31), (-2.08,.98,.87,.28),
            (-1.48,1.025,.965,.27), (-.78,.99,.98,.27),
            (.60,.99,.985,.27), (1.48,1.03,.985,.27),
            (2.08,.98,.945,.29), (2.24,.90,.90,.34)]
verts = []
for z, width, top, bottom in STATIONS:
    half = [(0,bottom), (width*.80,bottom), (width*.95,bottom+.08),
            (width,bottom+.20), (width,top-.145), (width-.095,top-.012), (0,top)]
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

for axle, z, inner in [("front",-1.48,.575), ("rear",1.48,.725)]:
    for side, suffix in [(-1,"left"),(1,"right")]:
        # Radius includes the deepest stance and manual steering envelope.
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.50,
            depth=1.5-inner, location=coord((side*(inner+1.5)/2,.4,z)),
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
bevel = shell.modifiers.new("Highlight bevel / 12 mm", "BEVEL")
bevel.width = .012
bevel.segments = 2
bevel.limit_method = "ANGLE"
bevel.angle_limit = .50


# One closed greenhouse. Window faces and their surrounding metal share edges;
# changing a pillar cannot leave a hole between a separate box and the glass.
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


fl=(-.80,.975,-.80); fr=(.80,.975,-.80)
tl=(-.665,1.42,-.12); tr=(.665,1.42,-.12)
rl=(-.68,1.405,.72); rr=(.68,1.405,.72)
bl=(-.86,.965,1.48); br=(.86,.965,1.48)
window([fl,fr,tr,tl], .08)
window([rl,rr,br,bl], .105)
face([tl,tr,rr,rl], 0)
face([fl,bl,br,fr], 0)
for f,t,r,b in [(fl,tl,rl,bl),(fr,tr,rr,br)]:
    # A narrow B-pillar divides a big door light and a smaller quarter light.
    upper = mix(t,r,.72)
    lower = mix(f,b,.70)
    window([f,t,upper,lower], .085)
    window([lower,upper,r,b], .19)
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


for side,suffix in [(-1,"left"),(1,"right")]:
    # Flush incised door outline and a small handle, not another door-shaped box.
    door_path=[(-.77,.817),(-.77,.51),(-.66,.43),(.70,.43),(.81,.53),(.81,.825)]
    line(f"door-shutline-{suffix}", [(side*(width_at(z)+.003),y,z) for z,y in door_path])
    box(f"door-handle-{suffix}",(side*1.002,.78,.60),(.016,.034,.16),trim,bevel=.007)
    box(f"sill-insert-{suffix}",(side*.959,.38,0),(.030,.055,1.67),trim,bevel=.01)
    # Low wedge mirror grows out of the A-pillar foot.
    mirror_points=[(side*x,y,z) for x,y,z in [(.76,1.018,-.61),(1.07,1.025,-.57),
                    (1.075,1.092,-.57),(.76,1.082,-.61),(.76,1.020,-.44),
                    (1.09,1.028,-.42),(1.09,1.096,-.42),(.76,1.084,-.44)]]
    mesh(f"mirror-{suffix}", mirror_points,
         [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],
         [paint,glass],indices=[0,1,0,0,0,0],bevel=.007)

    box(f"headlight-recess-{suffix}",(side*.57,.658,-2.266),(.50,.15,.022),trim)
    for i,y in enumerate([.635,.690]):
        box(f"headlight-{suffix}-{i}",(side*.568,y,-2.282),(.437,.033,.018),headlamp,bevel=.003)
    box(f"front-indicator-{suffix}",(side*.808,.660,-2.285),(.025,.10,.020),amber,bevel=.002)
    box(f"tail-recess-{suffix}",(side*.545,.735,2.248),(.65,.17,.023),trim)
    for i,y in enumerate([.708,.765]):
        box(f"taillight-{suffix}-{i}",(side*.545,y,2.264),(.59,.028,.015),tail,bevel=.002)
    box(f"rear-reflector-{suffix}",(side*.75,.418,2.25),(.10,.022,.015),tail,bevel=.002)

box("front-grille",(0,.645,-2.269),(.47,.09,.022),trim)
box("lower-intake",(0,.414,-2.271),(1.39,.098,.024),trim)
for i,x in enumerate([-.46,-.23,0,.23,.46]):
    box(f"intake-vane-{i}",(x,.414,-2.288),(.019,.072,.014),brake,bevel=.001)
box("nose-badge",(0,.744,-2.276),(.070,.026,.012),alloy,bevel=.001)
box("front-splitter",(0,.284,-2.16),(1.87,.044,.23),trim,bevel=.016)
box("rear-valance",(0,.385,2.212),(1.64,.10,.13),trim,bevel=.015)
box("rear-plate-recess",(0,.515,2.25),(.31,.125,.018),trim)
box("rear-plate",(0,.516,2.265),(.254,.084,.006),alloy,bevel=.002)
box("rear-badge",(0,.754,2.253),(.096,.035,.013),alloy,bevel=.002)

# A shallow ducktail follows the rear deck instead of towering over it.
mesh("ducktail", [(-.88,.928,1.97),(.88,.928,1.97),(-.91,1.018,2.21),(.91,1.018,2.21),
                  (-.90,.950,2.24),(.90,.950,2.24)],
     [(0,1,3,2),(2,3,5,4),(0,4,5,1),(0,2,4),(1,5,3)], [paint],bevel=.009)


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


for axle,z in [("front",-1.48),("rear",1.48)]:
    for side,suffix in [(-1,"left"),(1,"right")]:
        corner=f"{axle}-{suffix}"
        pivot=empty(f"wheel-{corner}",root,(side*.92,.4,z))
        rolling=empty(f"rolling-{corner}",pivot)
        lathe(f"tire-{corner}",[(-.125,.25),(-.125,.318),(-.108,.35),(-.075,.36),
                                (.075,.36),(.108,.35),(.125,.318),(.125,.25)],rubber,rolling)
        lathe(f"rim-lip-{corner}",[(.125,.244),(.123,.265),(.099,.265),(.095,.240)],alloy,rolling,side)
        lathe(f"rim-barrel-{corner}",[(-.103,.241),(.102,.241),(.102,.232),(-.103,.232)],wheel_finish,rolling,side)
        lathe(f"brake-disc-{corner}",[(.038,.203),(.056,.203),(.056,.055),(.038,.055)],brake,rolling,side)
        # One mesh for all five spokes, with true negative space between them.
        sv,sf=[],[]
        for spoke in range(5):
            angle=spoke*math.tau/5
            start=len(sv)
            section=[(.066,.058,-.039),(.066,.244,-.025),(.105,.244,.025),(.105,.058,.039),
                     (.046,.058,-.039),(.046,.244,-.025),(.079,.244,.025),(.079,.058,.039)]
            for x,r,tangent in section:
                sv.append((side*x,math.cos(angle)*r-math.sin(angle)*tangent,
                            math.sin(angle)*r+math.cos(angle)*tangent))
            sf.extend(tuple(start+j for j in face) for face in
                      [(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)])
        mesh(f"five-spoke-{corner}",sv,sf,[wheel_finish],rolling,bevel=.004)
        lathe(f"hub-{corner}",[(.108,.061),(.115,.053),(.115,0),(.095,0),(.095,.061)],wheel_finish,rolling,side,segments=16)

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


def area(name, location, energy, color, size, target=(0,.6,0)):
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
camera_data=bpy.data.cameras.new("studio-camera")
camera=bpy.data.objects.new("studio-camera",camera_data)
studio_collection.objects.link(camera)
camera.location=coord((6,3.2,-6.6))
camera.rotation_euler=(coord((0,.65,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera_data.type="ORTHO"
camera_data.ortho_scale=6.6
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
            space.region_3d.view_distance=6.8
            space.region_3d.view_location=coord((0,.7,0))
            space.region_3d.view_rotation=camera.rotation_euler.to_quaternion()

# Do not accumulate source backups when this explicit generator is re-run.
for obj in bpy.context.scene.objects:
    obj.select_set(False)
shell.select_set(True)
bpy.context.view_layer.objects.active=shell
for name, source in [("Export to NIGHTSHIFT.py", ROOT/"scripts/blender-export-button.py"),
                     ("START HERE.md", ROOT/"assets/cars/README.md")]:
    text=bpy.data.texts.get(name) or bpy.data.texts.new(name)
    text.clear()
    text.write(source.read_text(encoding="utf-8"))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
exec(compile((ROOT/"scripts/export-coupe.py").read_text(),"export-coupe.py","exec"))
if "--render" in sys.argv:
    bpy.ops.render.render(write_still=True)
print(f"NS-01 source: {SOURCE}")
