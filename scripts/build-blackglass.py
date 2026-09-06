"""Original Blackglass tunnel / Rivergate bridge authoring scene.

REBUILDS the source .blend. Normal hand edits use track:export instead.
Run track:guide first. Design coordinates are game metres (Y up), converted
once to Blender (Z up). No imported models, textures, fonts or HDRIs.
"""
import bisect
import json
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets/tracks/blackglass/blackglass-rivergate.blend"
guide = json.loads((SOURCE.parent / "route-guide.json").read_text())
points = guide["points"]
segments = guide["segments"]
distances = [0.0]
for seg in segments:
    distances.append(distances[-1] + seg["length"])


def coord(p):
    return Vector((p[0], -p[2], p[1]))


def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def material(name, color, roughness=.7, metal=0, emission=0):
    rgb = tuple(linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    # All shipped pieces are closed solids. Single-sided exports also let the
    # renderer use back faces for shadow casting, avoiding front-face acne.
    mat.use_backface_culling = True
    mat.diffuse_color = (*rgb, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if emission:
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
art = bpy.data.collections.new("01 / Editable environment")
references = bpy.data.collections.new("02 / Road and collision guides - NOT EXPORTED")
for collection in (art, references):
    bpy.context.scene.collection.children.link(collection)


def empty(name, parent=None, position=None, collection=art):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    if position is not None:
        obj.location = coord(position)
    obj.empty_display_size = .7
    return obj


root = empty("blackglass-rivergate")
root["routeFingerprint"] = guide["fingerprint"]
root["assetVersion"] = guide["version"]
root["authoring"] = "Original NIGHTSHIFT geometry; visual only; sim owns the road"
concrete = material("limestone", "8b9597", .86)
recess = material("recess", "2d373c", .8)
cladding = material("ceramic", "b2b7ae", .56, .08)
steel = material("bridge-steel", "597b80", .54, .22, .025)
edge = material("edge-metal", "92a3a8", .5, .3)
amber = material("safety-ochre", "d0a54a", .63, .05, .08)
cool = material("lamp-cool", "dbf1ff", .38, .08, 3)
warm = material("lamp-warm", "ffd09a", .4, .05, 2.4)
green = material("exit-green", "73c9a3", .5, .05, 1)
ink = material("sign-ink", "13252c", .7)
letter = material("sign-letter", "e0e7d8", .6, 0, .22)
roadmat = material("guide-asphalt", "252a32", .65)
facade = material("skyline-stone", "4b5660", .78, .08, .025)
window_warm = material("window-warm", "e6bd80", .65, 0, .75)
window_cool = material("window-cool", "86bfd4", .6, 0, .65)


def mesh(name, vertices, faces, mat, parent, bevel=0, collection=art):
    data = bpy.data.meshes.new(name)
    data.from_pydata([coord(p) for p in vertices], [], faces)
    data.materials.append(mat)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("Highlight chamfer", "BEVEL")
        mod.width = bevel
        mod.segments = 1
    return obj


def frame(distance):
    i = min(len(segments)-1, max(0, bisect.bisect_right(distances, distance)-1))
    t = min(1, max(0, (distance-distances[i])/segments[i]["length"]))
    start, end = points[i], points[(i+1) % len(points)]
    center = Vector(tuple(start[k] + (end[k]-start[k])*t for k in ("x", "y", "z")))
    # Average road tangents so adjoining swept sections meet at the same ring.
    def normal(j):
        prev, nxt = segments[(j-1) % len(segments)], segments[j % len(segments)]
        n = Vector((-prev["uz"]-nxt["uz"], 0, prev["ux"]+nxt["ux"]))
        return n.normalized()
    lateral = normal(i).lerp(normal(i+1), t).normalized()
    forward = Vector((lateral.z, 0, -lateral.x))
    width = start["width"] + (end["width"]-start["width"])*t
    return center, lateral, forward, width/2


def at(distance, lateral=0, height=0):
    center, side, _, _ = frame(distance)
    return center + side*lateral + Vector((0, height, 0))


def box(name, distance, lateral, height, size, mat, parent, bevel=0):
    # Local dimensions: along road, vertical, across road. Upright objects.
    center, side, forward, _ = frame(distance)
    center += side*lateral + Vector((0, height, 0))
    vertices = [center + forward*(a*size[0]/2) + Vector((0,b*size[1]/2,0)) + side*(c*size[2]/2)
                for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),
                              (1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    return mesh(name, vertices, [(0,4,5,1),(2,3,7,6),(0,2,6,4),
                                (1,5,7,3),(0,1,3,2),(4,6,7,5)], mat, parent, bevel)


def beam(name, a, b, width, depth, mat, parent):
    a, b = Vector(a), Vector(b)
    forward = (b-a).normalized()
    up = Vector((0,1,0))
    if abs(forward.dot(up)) > .98:
        up = Vector((1,0,0))
    side = forward.cross(up).normalized()
    up = side.cross(forward).normalized()
    vertices = [p + side*s*width/2 + up*u*depth/2
                for p in (a,b) for s,u in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    return mesh(name, vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                                (1,2,6,5),(2,3,7,6),(3,0,4,7)], mat, parent)


def sweep(name, start, end, profile, mat, parent):
    samples = [start] + [s for s in distances if start+.001 < s < end-.001] + [end]
    vertices = []
    count = len(profile(frame(start)[3]))
    for s in samples:
        vertices.extend(at(s, x, y) for x,y in profile(frame(s)[3]))
    faces = []
    for row in range(len(samples)-1):
        for col in range(count):
            n = (col+1) % count
            faces.append((row*count+col, row*count+n, (row+1)*count+n, (row+1)*count+col))
    faces.extend([tuple(reversed(range(count))), tuple(range((len(samples)-1)*count, len(samples)*count))])
    return mesh(name, vertices, faces, mat, parent)


def shell_profile(h, thickness=.6):
    inner = [(-h-1.9,-.2),(-h-1.9,4.8),(-h+.15,7.4),
             (h-.15,7.4),(h+1.9,4.8),(h+1.9,-.2)]
    outer = [(-h-1.9-thickness,-.2),(-h-1.9-thickness,5.1),(-h,7.4+thickness),
             (h,7.4+thickness),(h+1.9+thickness,5.1),(h+1.9+thickness,-.2)]
    return inner + list(reversed(outer))


def marker(name, distance, height, parent, kind, lateral=0):
    obj = empty(name, parent, at(distance,lateral,height))
    obj["lightKind"] = kind
    return obj


# Original grid lettering, converted to geometry; no image/font dependency.
glyphs = {
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'B': ['11110','10001','10001','11110','10001','10001','11110'],
    'C': ['01111','10000','10000','10000','10000','10000','01111'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'G': ['01111','10000','10000','10111','10001','10001','01111'],
    'I': ['11111','00100','00100','00100','00100','00100','11111'],
    'K': ['10001','10010','10100','11000','10100','10010','10001'],
    'L': ['10000','10000','10000','10000','10000','10000','11111'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'S': ['01111','10000','10000','01110','00001','00001','11110'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    'V': ['10001','10001','10001','10001','10001','01010','00100'],
}


def lettering(text, distance, y, cell, parent, prefix):
    # Positive lateral is screen-right when facing the approaching driver.
    length = (len(text)*6-1)*cell
    for g,char in enumerate(text):
        for row,bits in enumerate(glyphs[char]):
            for col,on in enumerate(bits):
                if on == '1':
                    box(f"{prefix}-letter-{g}-{row}-{col}", distance,
                        -length/2 + (g*6+col+.5)*cell, y+(3-row)*cell,
                        (.055,cell*.88,cell*.88), letter,parent)


tunnel_indices = [s["index"] for s in segments if s["zone"] == "tunnel"]
bridge_indices = [s["index"] for s in segments if s["zone"] == "bridge"]
t0, t1 = distances[tunnel_indices[0]], distances[tunnel_indices[-1]+1]
b0, b1 = distances[bridge_indices[0]], distances[bridge_indices[-1]+1]

for chunk, first in enumerate(range(tunnel_indices[0], tunnel_indices[-1]+1, 3)):
    start, end = distances[first], distances[min(first+3,tunnel_indices[-1]+1)]
    group = empty(f"tunnel-bay-{chunk:02}",root)
    sweep(f"vault-{chunk}",start,end,shell_profile,concrete,group)
    for side in (-1,1):
        # Service ledges and cladding stay outside the existing collision wall.
        sweep(f"ledge-{chunk}-{side}",start,end,
              lambda h,s=side:[(s*(h+.95),-.05),(s*(h+.95),.2),(s*(h+1.88),.2),(s*(h+1.88),-.05)],recess,group)
        sweep(f"wainscot-{chunk}-{side}",start,end,
              lambda h,s=side:[(s*(h+1.78),.95),(s*(h+1.78),3.8),(s*(h+1.92),3.8),(s*(h+1.92),.95)],cladding,group)
        sweep(f"ochre-band-{chunk}-{side}",start,end,
              lambda h,s=side:[(s*(h+1.71),1.28),(s*(h+1.71),1.58),(s*(h+1.79),1.58),(s*(h+1.79),1.28)],amber,group)
    for j in range(math.ceil(start/10),math.ceil(end/10)):
        s = j*10
        h = frame(s)[3]
        # Dark construction joints emphasize the faceted roof's perspective.
        sweep(f"vault-joint-{j}",s-.075,s+.075,
              lambda w:shell_profile(w-.018,.035),recess,group)
        for side in (-1,1):
            box(f"lamp-recess-{j}-{side}",s,side*h*.68,7.22,(3.3,.18,.65),recess,group)
            box(f"lamp-lens-{j}-{side}",s,side*h*.68,7.10,(2.9,.06,.23),cool,group)
            box(f"panel-joint-{j}-{side}",s,side*(h+1.69),2.4,(.045,2.7,.03),recess,group)
        if j%2 == 0:
            marker(f"light-tunnel-{j}",s,5.9,group,"tunnel")
        if j%5 == 0:
            # Steel service door and exit marker, on the wall, beyond the barrier.
            side = -1 if j%10 == 0 else 1
            box(f"door-frame-{j}",s,side*(h+1.65),1.8,(1.65,2.9,.14),edge,group)
            box(f"service-door-{j}",s,side*(h+1.54),1.78,(1.40,2.64,.08),ink,group)
            box(f"door-handle-{j}",s+.4,side*(h+1.46),1.55,(.12,.40,.06),edge,group)
            box(f"exit-marker-{j}",s,side*(h+1.5),3.55,(1.1,.38,.10),green,group)
            for slat in range(5):
                box(f"vent-{j}-{slat}",s+3.1,side*(h+1.60),3.15+slat*.19,(1.65,.08,.21),recess,group)

for name,s,away in [("portal-entry",t0,-1),("portal-exit",t1,1)]:
    group = empty(name,root)
    sweep(name+"-ring",s-.8,s+.8,lambda h:shell_profile(h,1.65),concrete,group)
    box(name+"-sign",s+away*.89,0,8.3,(.2,1.18,15.4),ink,group,.08)
    if name == "portal-entry":
        lettering("BLACKGLASS",s-.999,8.3,.145,group,"blackglass")
    else:
        # Exit carries visible structural identification from the bridge side.
        for x in (-5.8,5.8):
            box(name+f"-beacon-{x}",s+.96,x,8.3,(.08,.15,1.3),warm,group)
    for side in (-1,1):
        h = frame(s)[3]
        beam(name+f"-wing-{side}",at(s,side*(h+2.7),3.4),
             at(s+away*16,side*(frame(s+away*16)[3]+4.8),2.3),1.15,5.8,concrete,group)
        box(name+f"-safety-{side}",s+away*.92,side*(h+2.4),1.8,(.10,2.8,.55),amber,group)
    anchor = empty("anchor-tunnel-start" if name == "portal-entry" else "anchor-tunnel-exit",
                   group,at(s))

for chunk, first in enumerate(range(bridge_indices[0],bridge_indices[-1]+1,3)):
    group = empty(f"bridge-span-{chunk:02}",root)
    last = min(first+3,bridge_indices[-1]+1)
    for i in range(first,last):
        a,b = distances[i],distances[i+1]
        ha,hb = frame(a)[3],frame(b)[3]
        for side in (-1,1):
            # A readable through-truss: deep chords, alternated diagonals,
            # verticals and splice plates; no structure in the driving envelope.
            xa,xb = side*(ha+2.55),side*(hb+2.55)
            for y,depth in [(1.05,.7),(8.55,.65)]:
                beam(f"chord-web-{i}-{side}-{y}",at(a,xa,y),at(b,xb,y),.28,depth,steel,group)
                for flange in (-1,1):
                    beam(f"chord-flange-{i}-{side}-{y}-{flange}",at(a,xa,y+flange*depth/2),
                         at(b,xb,y+flange*depth/2),.65,.10,edge,group)
            beam(f"diagonal-{i}-{side}",at(a,xa,1.45 if i%2 else 8.15),
                 at(b,xb,8.15 if i%2 else 1.45),.43,.5,steel,group)
            beam(f"bridge-upright-{i}-{side}",at(a,xa,.3),at(a,xa,8.9),.65,.64,steel,group)
            for y in (1.2,8.45):
                box(f"splice-{i}-{side}-{y}",a,xa,y,(.9,.9,.10),edge,group)
            for y in (1.20,1.75):
                beam(f"service-rail-{i}-{side}-{y}",at(a,side*(ha+1.25),y),
                     at(b,side*(hb+1.25),y),.10,.1,edge,group)
            # Outer deck girder supports the road without replacing its surface.
            beam(f"deck-girder-{i}-{side}",at(a,side*(ha+1),-.95),
                 at(b,side*(hb+1),-.95),1.5,1.5,steel,group)
        beam(f"overhead-web-{i}",at(a,-ha-2.6,8.55),at(a,ha+2.6,8.55),.5,.7,steel,group)
        for y in (8.2,8.9):
            beam(f"overhead-flange-{i}-{y}",at(a,-ha-2.9,y),at(a,ha+2.9,y),.82,.10,edge,group)
        if i%2 == 0:
            beam(f"roof-brace-{i}",at(a,-ha-2.4,8.6),at(b,hb+2.4,8.6),.22,.22,steel,group)
        box(f"bridge-lamp-case-{i}",a,0,8.02,(.8,.15,1.4),ink,group)
        box(f"bridge-lamp-{i}",a,0,7.91,(.55,.06,1.16),warm,group)
        if i%2 == 0:
            marker(f"light-bridge-{i}",a,6.9,group,"bridge")
        if i%3 == 0:
            for side in (-1,1):
                y = frame(a)[0].y
                box(f"pier-{i}-{side}",a,side*(ha*.7),-y/2-1,(2.9,y-1,3.3),concrete,group,.12)
            beam(f"pier-cap-{i}",at(a,-ha-2,-2),at(a,ha+2,-2),3,1.5,concrete,group)
    if chunk == 0:
        s = b0+8
        box("rivergate-sign",s,0,7.52,(.2,1.1,13.9),ink,group,.06)
        lettering("RIVERGATE",s-.13,7.52,.125,group,"rivergate")
    if last == bridge_indices[-1]+1:
        empty("anchor-bridge-end",group,at(b1))

# A small, composed backdrop beyond the bridge, not another drivable district.
# Stepped crowns and recessed facade strips stay legible between the trusses.
backdrop = empty("rivergate-backdrop",root)


def world_box(name,center,size,mat):
    x,y,z = center
    w,h,d = (n/2 for n in size)
    return mesh(name,[(x+a*w,y+b*h,z+c*d) for a,b,c in
                [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]],
                [(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3),(0,1,3,2),(4,6,7,5)],mat,backdrop)


for tower,(x,z,w,d,h) in enumerate([(-225,270,34,32,76),(-290,235,30,36,104),(-332,293,46,31,59)]):
    world_box(f"river-tower-{tower}",(x,h/2,z),(w,h,d),facade)
    world_box(f"tower-crown-{tower}",(x,h+3,z),(w*.78,6,d*.8),edge)
    world_box(f"tower-roof-{tower}",(x,h+6.1,z),(w*.84,.22,d*.88),warm)
    world_box(f"tower-base-{tower}",(x,3,z),(w+6,6,d+6),recess)
    for face in (-1,1):
        for column in range(4):
            cx = x-w/2+(column+.5)*w/4
            world_box(f"facade-recess-{tower}-{face}-{column}",(cx,h/2,z+face*(d/2+.04)),(w/6,h-.5,.1),ink)
            for row in range(1,int(h/4.6)):
                if (row*3+column*7+tower)%5 == 0:
                    continue
                mat = window_cool if (column+row+tower)%4 == 0 else window_warm
                world_box(f"tower-window-{tower}-{face}-{column}-{row}",
                          (cx,row*4.6,z+face*(d/2+.12)),(w/6-.7,1.35,.12),mat)
        for column in range(4):
            cz = z-d/2+(column+.5)*d/4
            for row in range(1,int(h/4.6)):
                if (row+column*2+tower)%4 == 0:
                    continue
                world_box(f"tower-side-window-{tower}-{face}-{column}-{row}",
                          (x+face*(w/2+.1),row*4.6,cz),(.12,1.2,d/6),window_warm)

# Visible, locked guide meshes; these never enter the GLB or become physics.
reference_root = empty("road-reference-do-not-export",collection=references)
for i,seg in enumerate(segments):
    a,b = distances[i],distances[i+1]
    start,end = points[i],points[(i+1)%len(points)]
    # A thin ribbon with the sampled width/elevation, useful in solid viewport.
    obj = mesh(f"guide-road-{i:03}", [at(a,-start["width"]/2,-.025),at(a,start["width"]/2,-.025),
               at(b,end["width"]/2,-.025),at(b,-end["width"]/2,-.025)],[(0,1,2,3)],roadmat,
               reference_root,collection=references)
    obj.hide_select = True
for i,wall in enumerate(guide["walls"]):
    # Exact Rapier barrier transform in sim.ts: yaw(Y), pitch(local Z),
    # world-Y centre offset .65, and a 1.3 m collider height (visual wall is .82).
    yaw,pitch = wall["rotation"],wall["pitch"]
    vx = Vector((math.cos(yaw)*math.cos(pitch),math.sin(pitch),-math.sin(yaw)*math.cos(pitch)))
    vy = Vector((-math.cos(yaw)*math.sin(pitch),math.cos(pitch),math.sin(yaw)*math.sin(pitch)))
    vz = Vector((math.sin(yaw),0,math.cos(yaw)))
    center = Vector((wall["x"],wall["y"]+.65,wall["z"]))
    verts = [center+vx*a*wall["width"]/2+vy*b*.65+vz*c*wall["depth"]/2
             for a,b,c in [(-1,-1,-1),(-1,-1,1),(-1,1,-1),(-1,1,1),(1,-1,-1),(1,-1,1),(1,1,-1),(1,1,1)]]
    obj = mesh(f"guide-collision-{i:03}",verts,[(0,4,5,1),(2,3,7,6),(0,2,6,4),
              (1,5,7,3),(0,1,3,2),(4,6,7,5)],amber,reference_root,collection=references)
    obj.hide_select = True
    obj.display_type = 'WIRE'

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
scene.world.color = (.18,.18,.18)
focus = at(t1)
look_from = at(t1+34,30,22)
rotation = (coord(focus)-coord(look_from)).to_track_quat('-Z','Y')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.clip_end = 1800
            space.shading.type = 'SOLID'
            space.shading.color_type = 'MATERIAL'
            space.overlay.show_extras = False
            space.region_3d.view_distance = 75
            space.region_3d.view_location = coord(focus)
            space.region_3d.view_rotation = rotation
for name,path in [("Export track to NIGHTSHIFT.py",ROOT/"scripts/blender-track-export-button.py"),
                  ("START HERE.md",SOURCE.parent/"README.md")]:
    text = bpy.data.texts.new(name)
    text.write(path.read_text(encoding="utf-8"))
bpy.ops.object.select_all(action="DESELECT")
selected = bpy.data.objects["portal-exit-ring"]
selected.select_set(True)
bpy.context.view_layer.objects.active = selected
SOURCE.parent.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
exporter = ROOT/"scripts/export-blackglass.py"
exec(compile(exporter.read_text(),str(exporter),"exec"),{"__file__":str(exporter)})
print(f"Editable track: {SOURCE}; tunnel {t1-t0:.1f}m, bridge {b1-b0:.1f}m")
