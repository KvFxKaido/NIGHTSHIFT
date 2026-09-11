"""Offline city slice. pip install --target artifacts/map-tools shapely==2.1.2"""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path('artifacts/map-tools').resolve()))
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely import constrained_delaunay_triangles

# Freeze the released southwest roads and plots; the new addition is authored
# separately and meets it only at existing junctions.
base = json.loads(Path('assets/maps/seattle/belltown-slice.json').read_text(encoding='utf-8'))
extension = json.loads(Path('assets/maps/seattle/east-hills-layout.json').read_text(encoding='utf-8'))
terrain = json.loads(Path('src/sim/seattle-terrain.json').read_text(encoding='utf-8'))
campus = json.loads(Path('src/sim/seattle-landmarks.json').read_text(encoding='utf-8'))['campus']

def key(point): return ','.join(str(round(n, 3)) for n in point)
originals = [(r['name'], LineString(r['points']), r['width']) for r in extension['roads']]
# Intersections split only the new streets; old graph identities remain intact.
merged = unary_union([line for _,line,_ in originals])
new_roads = []
for i,line in enumerate(merged.geoms):
    midpoint = line.interpolate(.5, normalized=True)
    name, _, width = min(originals, key=lambda entry: entry[1].distance(midpoint))
    # Samples let lane following and grade-aware AI see the curved landform.
    points = [line.coords[0]]
    for a,b in zip(line.coords,list(line.coords)[1:]):
        count = max(1,math.ceil(math.dist(a,b)/30))
        points.extend([(a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count) for j in range(1,count+1)])
    new_roads.append({'id':f'sea-east-{i}', 'name':name, 'sourceId':None, 'width':width,
        'from':key(line.coords[0]), 'to':key(line.coords[-1]),
        'points':[[round(x,3),round(z,3)] for x,z in points]})
roads = base['roads'] + new_roads
# Use the serialized vertices for meshes too; physics never sees extra precision.
lines = [LineString(road['points']) for road in roads]

# One continuous, softened landform. Both asphalt and off-road terrain read it.
def height(x, z):
    t = max(0, min(1, (x + 50) / 640))
    north = max(0, min(1, (330 - z) / 500))
    y = 2 + 34 * (t*t*(3-2*t)) * (north*north*(3-2*north))
    for hill in terrain['hills']:
        r2 = ((x-hill['x'])/hill['rx'])**2 + ((z-hill['z'])/hill['rz'])**2
        if r2 < 1: y += hill['rise'] * (1-r2)**3
    return y
asphalt = unary_union([line.buffer(road['width']/2, quad_segs=4) for line, road in zip(lines, roads)])
pavement = asphalt.buffer(2.8, quad_segs=2).difference(asphalt)
bounds = asphalt.bounds
shore = math.floor(bounds[0] - 90)
land = box(shore, bounds[1]-180, bounds[2]+180, bounds[3]+180)

def triangles(geometry):
    result = []
    for triangle in constrained_delaunay_triangles(geometry).geoms:
        todo = [list(triangle.exterior.coords)[:3]]
        while todo:
            points = todo.pop()
            lengths = [math.dist(points[i], points[(i+1)%3]) for i in range(3)]
            edge = lengths.index(max(lengths))
            # Refine to measured height error, plus an 80m cap so a broad facet
            # cannot skip an entire hill. Constant/linear areas stay inexpensive.
            hs = [height(*p) for p in points]
            probes = [(1/3,1/3,1/3),(.5,.5,0),(0,.5,.5),(.5,0,.5)]
            error = max(abs(sum(h*w for h,w in zip(hs,weights))-height(
                sum(p[0]*w for p,w in zip(points,weights)),sum(p[1]*w for p,w in zip(points,weights)))) for weights in probes)
            if lengths[edge] > 80 or error > .007:
                a,b,c = points[edge],points[(edge+1)%3],points[(edge+2)%3]
                m = ((a[0]+b[0])/2,(a[1]+b[1])/2)
                todo += [[a,m,c],[m,b,c]]
            else:
                points = [(round(x,3),round(z,3)) for x,z in points]
                a,b,c = points
                # Clockwise in X/Z gives an upward normal in Three.js X/Y/Z.
                if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0: points.reverse()
                result.extend(round(v, 3) for p in points for v in p)
    return result

# Use the real blocks as parcels, reserving a through passage in each larger
# parcel. Buildings are fictional, fitted wholly within the paved street edges.
buildings = list(base['buildings'])
reserved = asphalt.buffer(4)
# Authored plots (editor.html, src/sim/seattle-layout.json) are placed by
# hand in world coordinates and never regenerated: filler keeps three metres
# clear of them, as it does of every plot already standing. Their corners use
# the sim's own rotation (building-footprint.ts, blockCorners).
layout_file = Path('src/sim/seattle-layout.json')
layout = json.loads(layout_file.read_text(encoding='utf-8')) if layout_file.exists() else {}
footprints = []
for b in layout.get('authored', []):
    c, s = math.cos(b['rotation']), math.sin(b['rotation'])
    half = [(-b['width']/2,-b['depth']/2),(b['width']/2,-b['depth']/2),(b['width']/2,b['depth']/2),(-b['width']/2,b['depth']/2)]
    footprints.append(Polygon([(b['x']+lx*c-lz*s, b['z']+lx*s+lz*c) for lx,lz in half]))
authored = [footprint.buffer(3) for footprint in footprints]
# A pinned plot an authored one stands on is dropped here too — the same
# overlap the sim displaces on load — so the data file never carries a plot
# that would only stand down. A pinned plot merely near one stays.
buildings = [b for b in buildings if not any(footprint.intersects(box(b['x']-b['width']/2,b['z']-b['depth']/2,
    b['x']+b['width']/2,b['z']+b['depth']/2)) for footprint in footprints)]
for face_index, face in enumerate(polygonize(unary_union(lines))):
    if face.boundary.intersection(merged).length < 1: continue
    lot = face.difference(reserved)
    # Seattle Center stays an open campus with a landmark; no warehouse grid.
    lot = lot.difference(box(campus['minX'],campus['minZ'],campus['maxX'],campus['maxZ']))
    for park in extension['parks']: lot = lot.difference(box(*park['bounds']))
    if lot.is_empty: continue
    minx,minz,maxx,maxz = lot.bounds
    for row,z in enumerate(range(math.ceil(minz)+12, math.floor(maxz)-8, 32)):
        for col,x in enumerate(range(math.ceil(minx)+12, math.floor(maxx)-8, 34)):
            seed = face_index*31 + row*13 + col*7
            if maxx-minx > 85 and abs(x-(minx+maxx)/2) < 16: continue
            industrial = z > 250 or (x < -270 and z > -700)
            if industrial and x < -270 and seed % 3: continue
            w,d = (27,24) if industrial else (18,18)
            footprint = box(x-w/2,z-d/2,x+w/2,z+d/2)
            if not lot.covers(footprint): continue
            if any(abs(x-b['x']) < (w+b['width'])/2+3 and abs(z-b['z']) < (d+b['depth'])/2+3 for b in buildings): continue
            if any(footprint.intersects(poly) for poly in authored): continue
            if asphalt.distance(footprint) > 32: continue
            grounds = [height(px,pz) for px,pz in footprint.exterior.coords]
            if max(grounds)-min(grounds)>3.5: continue
            h = (9+seed%3*4) if industrial else (14+seed%5*4) if z>20 else (26+seed%7*8)
            if z < -700: h = 18 + seed%5*6
            if x > 700: h = 10 + seed%4*5
            if z < -1700 and x < 200: h = 8 + seed%3*4
            buildings.append({'x':x,'z':z,'width':w,'depth':d,'height':h,'rotation':0,'base':round(min(grounds),3)})

parks = [{**park, 'surface':triangles(box(*park['bounds']).difference(asphalt.union(pavement)))} for park in extension['parks']]
trees = []
for park in extension['parks']:
    x0,z0,x1,z1 = park['bounds']
    for row,z in enumerate(range(z0+30,z1-20,85)):
        for col,x in enumerate(range(x0+30,x1-20,90)):
            if (row+col)%3 == 0 or asphalt.distance(Point(x,z)) < 20: continue
            trees.append({'x':x,'z':z,'width':1,'depth':1,'height':7+(row+col)%4,'rotation':0,'base':round(height(x,z),3)})

result = {'version':'seattle-slice-v4', 'source':base['source'], 'retrieved':base['retrieved'],
          'expansion':'Authored east-hills-layout.json, 2026-09-11',
          'parks':parks, 'trees':trees, 'neighborhoods':extension['neighborhoods'],
          'roadEnvelopeKm2':round(box(*asphalt.bounds).area/1e6,4),
          'roadHullKm2':round(unary_union(lines).convex_hull.area/1e6,4),
          'bounds':list(land.bounds), 'shore':shore, 'roads':roads, 'buildings':buildings,
          'asphalt':triangles(asphalt), 'pavement':triangles(pavement),
          'ground':triangles(land.difference(asphalt.union(pavement)))}
Path('src/sim/seattle-data.json').write_text(json.dumps(result, separators=(',',':'))+'\n', encoding='utf-8')
print(json.dumps({'roads':len(roads),'buildings':len(buildings),'km':round(sum(l.length for l in lines)/1000,2),
                 'bounds':result['bounds'],'roadEnvelopeKm2':result['roadEnvelopeKm2'],'roadHullKm2':result['roadHullKm2'],'triangles':sum(len(result[k])//6 for k in ['asphalt','pavement','ground']),
                 'streets':sorted(set(r['name'] for r in roads))}))
