"""Offline city slice. pip install --target artifacts/map-tools shapely==2.1.2"""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path('artifacts/map-tools').resolve()))
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely import constrained_delaunay_triangles

source = json.loads(Path('assets/maps/seattle/source-streets.json').read_text())
names = {'1ST AVE', '1ST AVE S', '2ND AVE', '2ND AVE S', '4TH AVE', '4TH AVE S',
         '6TH AVE', '6TH AVE S', 'ALASKAN WAY', 'ALASKAN WAY S', 'WESTERN AVE',
         'OCCIDENTAL AVE S', 'S LANDER ST', 'S HOLGATE ST', 'S ROYAL BROUGHAM WAY',
         'S JACKSON ST', 'S MAIN ST', 'YESLER WAY', 'E YESLER WAY', 'JAMES ST',
         'MADISON ST', 'E MADISON ST', 'PIKE ST', 'UNION ST', 'S DEARBORN ST'}
def project(p):
    return (round((p[0] + 122.334) * 111320 * math.cos(math.radians(47.6)) * .58),
            round(-(p[1] - 47.598) * 111320 * .50))
originals = []
for feature in source['features']:
    name = feature['attributes']['ONSTREET']
    if name not in names: continue
    for path in feature['geometry']['paths']:
        coords = list(dict.fromkeys(project(p) for p in path))
        if len(coords) >= 2:
            line = LineString(coords).simplify(1.2)
            if line.length > 5: originals.append((name, line, feature['attributes']['OBJECTID']))

# A fictional waterfront express street connects three real approaches. Its
# generous bends and access points are gameplay liberties, not GIS observations.
west = min(line.bounds[0] for _,line,_ in originals) - 35
harbor_z = [-610, 30, 730]
originals.append(('HARBOR WAY', LineString([(west,z) for z in harbor_z]), None))
for z in harbor_z:
    points = [p for name,line,_ in originals if name in {'1ST AVE','1ST AVE S'} for p in line.coords]
    point = min(points, key=lambda p: math.dist(p,(west+70,z)))
    originals.append(('HARBOR ACCESS',LineString([(west,z),point]),None))

# Node all actual at-grade crossings, prune cut-off dead ends, and keep the
# largest connected component. Highway ramps/grade-separated roads were excluded.
lines = list(linemerge(unary_union([line for _, line, _ in originals])).geoms)
def key(point): return ','.join(str(round(n, 3)) for n in point)
while True:
    degree = {}
    for line in lines:
        for p in [line.coords[0], line.coords[-1]]: degree[key(p)] = degree.get(key(p), 0) + 1
    kept = [line for line in lines if degree[key(line.coords[0])] > 1 and degree[key(line.coords[-1])] > 1]
    if len(kept) == len(lines): break
    lines = kept
adj = {}
for i, line in enumerate(lines):
    for p in [line.coords[0], line.coords[-1]]: adj.setdefault(key(p), []).append(i)
components, unseen = [], set(range(len(lines)))
while unseen:
    todo, group = [min(unseen)], set()
    while todo:
        i = todo.pop()
        if i in group: continue
        group.add(i); unseen.discard(i)
        for p in [lines[i].coords[0], lines[i].coords[-1]]: todo += [j for j in adj[key(p)] if j not in group]
    components.append(group)
lines = [lines[i] for i in sorted(max(components, key=len))]
merged = linemerge(unary_union(lines))
lines = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]

roads = []
for i, line in enumerate(lines):
    midpoint = line.interpolate(.5, normalized=True)
    name, _, source_id = min(originals, key=lambda entry: entry[1].distance(midpoint))
    width = 24 if name.startswith(('ALASKAN','HARBOR WAY')) else 20 if name.startswith(('1ST', '4TH', 'S LANDER')) else 16
    roads.append({'id': f'sea-{i}', 'name': name.title(), 'sourceId': source_id, 'width': width,
                  'from': key(line.coords[0]), 'to': key(line.coords[-1]),
                  'points': [[round(x, 3), round(z, 3)] for x, z in line.coords]})

# One continuous, softened landform. Both asphalt and off-road terrain read it.
def height(x, z):
    t = max(0, min(1, (x + 50) / 640))
    north = max(0, min(1, (330 - z) / 500))
    return 2 + 34 * (t*t*(3-2*t)) * (north*north*(3-2*north))
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
            flat = all(p[0] <= -50 for p in points) or all(p[1] >= 330 for p in points)
            if lengths[edge] > 10 and not flat:
                a,b,c = points[edge],points[(edge+1)%3],points[(edge+2)%3]
                m = ((a[0]+b[0])/2,(a[1]+b[1])/2)
                todo += [[a,m,c],[m,b,c]]
            else:
                a,b,c = points
                # Clockwise in X/Z gives an upward normal in Three.js X/Y/Z.
                if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]) > 0: points.reverse()
                result.extend(round(v, 3) for p in points for v in p)
    return result

# Use the real blocks as parcels, reserving a through passage in each larger
# parcel. Buildings are fictional, fitted wholly within the paved street edges.
buildings = []
reserved = asphalt.buffer(4)
for face_index, face in enumerate(polygonize(unary_union(lines))):
    lot = face.difference(reserved)
    if lot.is_empty: continue
    minx,minz,maxx,maxz = lot.bounds
    for row,z in enumerate(range(math.ceil(minz)+12, math.floor(maxz)-8, 32)):
        for col,x in enumerate(range(math.ceil(minx)+12, math.floor(maxx)-8, 34)):
            seed = face_index*31 + row*13 + col*7
            if maxx-minx > 85 and abs(x-(minx+maxx)/2) < 16: continue
            industrial = z > 250 or x < -270
            if x < -270 and seed % 3: continue
            w,d = (27,24) if industrial else (24,23)
            footprint = box(x-w/2,z-d/2,x+w/2,z+d/2)
            if not lot.covers(footprint): continue
            if asphalt.distance(footprint) > 32: continue
            grounds = [height(px,pz) for px,pz in footprint.exterior.coords]
            if max(grounds)-min(grounds)>3.5: continue
            h = (9+seed%3*4) if industrial else (14+seed%5*4) if z>20 else (26+seed%7*8)
            buildings.append({'x':x,'z':z,'width':w,'depth':d,'height':h,'rotation':0,'base':round(min(grounds),3)})

result = {'version':'seattle-slice-v1', 'source':source['source'], 'retrieved':source['retrieved'],
          'bounds':list(land.bounds), 'shore':shore, 'roads':roads, 'buildings':buildings,
          'asphalt':triangles(asphalt), 'pavement':triangles(pavement),
          'ground':triangles(land.difference(asphalt.union(pavement)))}
Path('src/sim/seattle-data.json').write_text(json.dumps(result, separators=(',',':'))+'\n')
print(json.dumps({'roads':len(roads),'buildings':len(buildings),'km':round(sum(l.length for l in lines)/1000,2),
                 'bounds':result['bounds'],'triangles':sum(len(result[k])//6 for k in ['asphalt','pavement','ground']),
                 'streets':sorted(set(r['name'] for r in roads))}))
