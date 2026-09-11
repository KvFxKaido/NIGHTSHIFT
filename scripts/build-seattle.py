"""Offline city slice. pip install --target artifacts/map-tools shapely==2.1.2"""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path('artifacts/map-tools').resolve()))
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely import constrained_delaunay_triangles

# Preserve the original slice's street IDs/vertices and generated plots. Existing
# authored rivals and editor plot IDs depend on these identities.
base = json.loads(Path('assets/maps/seattle/base-slice.json').read_text(encoding='utf-8'))
source = json.loads(Path('assets/maps/seattle/source-north-streets.json').read_text(encoding='utf-8'))
def project(p):
    return (round((p[0] + 122.334) * 111320 * math.cos(math.radians(47.6)) * .58),
            round(-(p[1] - 47.598) * 111320 * .50))
def key(point): return ','.join(str(round(n, 3)) for n in point)
from shapely.ops import substring
originals = []
def street(name, start, end, width):
    segments = [LineString(list(dict.fromkeys(project(p) for p in path)))
        for f in source['features'] if f['attributes']['ONSTREET'] == name
        for path in f['geometry']['paths']]
    merged = linemerge(unary_union(segments))
    candidates = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]
    line = min(candidates, key=lambda line: line.distance(Point(start))+line.distance(Point(end)))
    section = substring(line, line.project(Point(start)), line.project(Point(end)))
    coords = list(section.coords)
    coords[0], coords[-1] = start, end
    line = LineString(coords)
    source_id = next(f['attributes']['OBJECTID'] for f in source['features'] if f['attributes']['ONSTREET'] == name)
    originals.append((name, line, width, source_id))
def connector(name, points, width):
    originals.append((name, LineString(points), width, None))

street('1ST AVE', (-545,-856), (-934,-1147), 20)
street('2ND AVE', (-213,-628), (-820,-1146), 16)
street('4TH AVE', (-117,-680), (-650,-1145), 20)
street('ELLIOTT AVE', (-614,-778), (-1064,-1146), 24)
street('BATTERY ST', (-676,-825), (-489,-1010), 16)
street('WALL ST', (-717,-855), (-530,-1040), 16)
street('CEDAR ST', (-798,-917), (-593,-1145), 16)
street('BROAD ST', (-880,-979), (-592,-1275), 20)
street('DENNY WAY', (-991,-1147), (-593,-1145), 24)
street('QUEEN ANNE AVE N', (-991,-1147), (-989,-1480), 20)
street('MERCER ST', (-989,-1480), (-591,-1475), 24)
street('5TH AVE N', (-593,-1145), (-591,-1475), 20)
connector('1ST AVENUE LINK', [(-524.683,-775.007),(-545,-856)], 20)
connector('HARBOR NORTH LINK', [(-589.36,-708.02),(-614,-778)], 24)
connector('W DENNY WAY', [(-1064,-1146),(-991,-1147)], 24)

# Node only the addition: it meets the retained slice at existing junctions.
# Group by street name/width so collinear intersections retain shared vertices.
merged = unary_union([entry[1] for entry in originals])
north_lines = list(merged.geoms)
north_roads = []
for i,line in enumerate(north_lines):
    midpoint = line.interpolate(.5, normalized=True)
    name, _, width, source_name = min(originals, key=lambda entry: entry[1].distance(midpoint))
    north_roads.append({'id':f'sea-north-{i}', 'name':name.title(),
        'sourceId':source_name, 'width':width,
        'from':key(line.coords[0]),'to':key(line.coords[-1]),
        'points':[[round(x,3),round(z,3)] for x,z in line.coords]})
roads = base['roads'] + north_roads
# Use the serialized vertices for meshes too; physics never sees extra precision.
lines = [LineString(road['points']) for road in roads]

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
for face_index, face in enumerate(polygonize(unary_union(lines))):
    if face.centroid.y > -700: continue
    lot = face.difference(reserved)
    # Seattle Center stays an open campus with a landmark; no warehouse grid.
    campus = json.loads(Path('src/sim/seattle-landmarks.json').read_text(encoding='utf-8'))['campus']
    lot = lot.difference(box(campus['minX'],campus['minZ'],campus['maxX'],campus['maxZ']))
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
            if any(footprint.intersects(box(b['x']-b['width']/2-3,b['z']-b['depth']/2-3,
                    b['x']+b['width']/2+3,b['z']+b['depth']/2+3)) for b in buildings): continue
            if asphalt.distance(footprint) > 32: continue
            grounds = [height(px,pz) for px,pz in footprint.exterior.coords]
            if max(grounds)-min(grounds)>3.5: continue
            h = (9+seed%3*4) if industrial else (14+seed%5*4) if z>20 else (26+seed%7*8)
            if z < -700: h = 18 + seed%5*6
            buildings.append({'x':x,'z':z,'width':w,'depth':d,'height':h,'rotation':0,'base':round(min(grounds),3)})

result = {'version':'seattle-slice-v3', 'source':source['source'], 'retrieved':source['retrieved'],
          'bounds':list(land.bounds), 'shore':shore, 'roads':roads, 'buildings':buildings,
          'asphalt':triangles(asphalt), 'pavement':triangles(pavement),
          'ground':triangles(land.difference(asphalt.union(pavement)))}
Path('src/sim/seattle-data.json').write_text(json.dumps(result, separators=(',',':'))+'\n', encoding='utf-8')
print(json.dumps({'roads':len(roads),'buildings':len(buildings),'km':round(sum(l.length for l in lines)/1000,2),
                 'bounds':result['bounds'],'triangles':sum(len(result[k])//6 for k in ['asphalt','pavement','ground']),
                 'streets':sorted(set(r['name'] for r in roads))}))
