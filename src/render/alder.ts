import { addBroadcastTower } from "./broadcast-tower.ts";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ALDER_DATA as data, ALDER_STREETS, ALDER_BLOCKS, ALDER_GARAGE, ALDER_TREES, ALDER_EVERGREENS,
  ALDER_FORECOURT, ALDER_LAMP_POSES, ALDER_SEAWALL_LAMP_POSES, ALDER_BIN_POSES, alderHeight } from "../sim/alder.ts";
import { addEvergreens } from "./evergreens.ts";
import { addArena } from "./arena.ts";
import { ARENA_BOUNDS } from "../sim/arena.ts";
import { chunkAlderScenery } from "./city-chunks.ts";
import { addGarageExterior } from "./garage.ts";
import { roadMarkings } from "./road-markings.ts";
import { asphaltMaterial } from "./asphalt.ts";
import { addNightBuildings, glowTexture, type FrontageReach, type NightDressing } from "./night.ts";
import { buildingFrontage } from "../sim/frontage.ts";
import { alderNeighbourhoodAt, type AlderNeighbourhoodId } from "../sim/alder-neighbourhoods.ts";
import type { DistrictLighting } from "./scene.ts";
import { addNightSky, ALDER_SKY } from "./sky.ts";

/**
 * Masts over the freight yards the game opens on (design/LOOK.md, "The start").
 * Harbor Way runs north out of Wharf Garage past 200 m of open ground on its
 * east side, the nearest building 196 m off, so the first minute of a new game
 * was the dimmest in the city: six lamps and nothing between them. A working
 * yard has high masts over its hardstanding, and this is the port, so the light
 * is white and the head is the one the docks hang on their walls; only the mast
 * under it is new. They stand clear of the junctions at z 730-790.
 */
export const START_YARD_MASTS = [
  { x: 10, z: 884 }, { x: -28, z: 854 }, { x: 10, z: 824 },
  { x: -28, z: 716 }, { x: 10, z: 700 }, { x: 10, z: 650 },
];
const YARD_MAST_HEIGHT = 12;

/** The four piers, by their centre along the shore, and where each carries its edge lamps. */
const PIERS = [-320, 80, 470, 810];
const PIER_LAMP_XS = [-12, -32, -52, -72];
const PIER_LAMP_EDGE = 26.5;

/**
 * Glows that must read from far off: the waterfront's lamps, seen from roads a
 * hundred metres and more inland. Points in world size, fog-exempt like the
 * cranes' sprites, and one draw call for the lot. Deliberately not chunked:
 * a line of light on the horizon is the point, and a few hundred vertices cost
 * nothing from anywhere on the map.
 */
function farGlow(name: string, positions: number[], color: number, size: number, opacity: number): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ map: glowTexture(), color, size, sizeAttenuation: true,
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  // World-sized up close, but a light does not shrink to nothing with distance:
  // sized by the world alone, a lamp 500 m off was a grey speck of 3 pixels.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <fog_vertex>",
      `gl_PointSize = max(gl_PointSize, ${FAR_GLOW_MIN_PX.toFixed(1)});\n#include <fog_vertex>`);
  };
  const points = new THREE.Points(geometry, material);
  points.name = name;
  return points;
}
/** The fewest pixels a far glow is drawn across, however far off it is. */
const FAR_GLOW_MIN_PX = 6;

/** Asleep: a corner shop still open, no neon, a few warm rooms. */
const ASLEEP: NightDressing = { signs: 0, secondSign: 0, shopfronts: 0.15, coloured: 0, warm: 0.8, windows: "residential" };
/** Metres from which a building is a tower, and a tower is offices, lit in the cleaners' floors. */
const TOWER = 40;
/**
 * Each neighbourhood's lighting sentence (design/LOOK.md, Districts) as a density.
 * The strip is Capitol Hill, and it is the only place neon is dense.
 */
export const NEIGHBOURHOOD_DRESSING: Readonly<Record<AlderNeighbourhoodId, NightDressing>> = {
  // Freight after hours: strip-lit docks, almost no neon, dark walls.
  "sodo": { signs: 0.08, secondSign: 0, shopfronts: 0.3, coloured: 0, warm: 0.25, windows: "freight" },
  // Offices with the cleaners in: cool lobbies, very little colour, lit floors.
  "alder-center": { signs: 0.2, secondSign: 0.15, shopfronts: 0.65, coloured: 0.05, warm: 0.35, windows: "office" },
  // The corner bar, and flats above it still up.
  "belltown": { signs: 0.45, secondSign: 0.3, shopfronts: 0.75, coloured: 0.15, warm: 0.7, windows: "scattered" },
  // The strip that is still open.
  "capitol-hill": { signs: 0.95, secondSign: 0.75, shopfronts: 0.9, coloured: 0.35, warm: 0.6, windows: "scattered" },
  "queen-anne": ASLEEP,
  "central-district": ASLEEP,
  "madrona-ridge": ASLEEP,
};

/** Metres from a wall to the carriageway it faces. Port Alder's setbacks are
 *  deep (median 22 m), so these are measured to the kerb, not the centreline. */
export const ALDER_REACH: FrontageReach = { signs: 40, shopfronts: 30 };
/** The city's one lamp, never replaced: sodium, the portraits' key light (design/LOOK.md). */
const SODIUM_HEAD = 0xffa24a;
const SODIUM_POOL = 0xc8782f;
/** Chosen from the chase camera: at the old 0.28, or at 0.5, the pool is a
 *  brown smudge 30 m ahead; at 1 it reads as sodium without washing the lane. */
const SODIUM_POOL_OPACITY = 1;
/** Metres the pool's centre sits from the post toward the centreline. Centred
 *  on the post, 1.7 m past the kerb, its bright core lit the pavement and the
 *  road got the faint rim, so sodium could not be seen from the driving line. */
const SODIUM_POOL_INSET = 4;

export function addAlder(scene: THREE.Scene, lighting: DistrictLighting): void {
  const night = lighting === "night";
  addBroadcastTower(scene, night);
  if (night) addNightSky(scene, ALDER_SKY);
  if (night) scene.add(new THREE.HemisphereLight(0x9abbd0, 0x39444c, 1.0));
  function surface(name: string, points: number[], color: number, lift = 0): void {
    const positions = new Float32Array(points.length/2*3);
    for(let i=0;i<points.length;i+=2) {
      const x=points[i]!, z=points[i+1]!;
      positions.set([x,alderHeight(x,z)+lift,z],i/2*3);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.BufferAttribute(positions,3)); geometry.computeVertexNormals();
    if (name === "alder-asphalt") geometry.setAttribute("uv", new THREE.Float32BufferAttribute(points.map(v => v / 8), 2));
    const mesh=new THREE.Mesh(geometry,name === "alder-asphalt" ? asphaltMaterial(color) : new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.08,
      polygonOffset:lift>0,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    mesh.name=name; mesh.receiveShadow=true;scene.add(mesh);
  }
  surface("alder-asphalt",data.asphalt,night?0x46515b:0x62686b);
  surface("alder-pavement",data.pavement,night?0x4b515b:0x879090);
  surface("alder-ground",data.ground,night?0x182322:0x425148);
  for (const park of data.parks) surface(park.id,park.surface,night?0x263d31:0x54764c,.012);
  const trunks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x554239}),ALDER_TREES.length);
  const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(4,10,7),new THREE.MeshStandardMaterial({color:night?0x20382b:0x3d6846,roughness:1}),ALDER_TREES.length);
  const treePose=new THREE.Object3D();
  ALDER_TREES.forEach((tree,i)=>{
    treePose.position.set(tree.x,tree.base+tree.height/2,tree.z);treePose.scale.set(tree.width,tree.height,tree.depth);treePose.updateMatrix();trunks.setMatrixAt(i,treePose.matrix);
    treePose.position.y=tree.base+tree.height;treePose.scale.set(1,1,1);treePose.updateMatrix();crowns.setMatrixAt(i,treePose.matrix);
  });
  trunks.name="alder-park-trunks";crowns.name="alder-park-canopies";trunks.castShadow=crowns.castShadow=true;scene.add(trunks,crowns);
  addEvergreens(scene, ALDER_EVERGREENS, night);
  addArena(scene, night);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(2200,data.bounds[3]!-data.bounds[1]!+1000),new THREE.MeshStandardMaterial({color:0x123142,metalness:.55,roughness:.24}));
  water.rotation.x=-Math.PI/2;water.position.set(data.shore-1100,.1,(data.bounds[3]!+data.bounds[1]!)/2);water.name="elliott-bay";scene.add(water);
  // Continue the landform beyond the authored parcels so leaving the streets
  // does not put the car above a flat backdrop. Subdivide only curved bands.
  const grid=(low:number,high:number)=>Array.from({length:Math.ceil((high-low)/20)+1},(_,i)=>low+i*20);
  // Far enough east to carry Ridge Circuit and the open ground around it.
  const xs=[...new Set([data.shore,data.bounds[2]!,...grid(data.shore,Math.max(3300,data.bounds[2]!+300,ARENA_BOUNDS.maxX+300))])].sort((a,b)=>a-b);
  const zs=[...new Set([data.bounds[1]!,data.bounds[3]!,...grid(data.bounds[1]!-300,data.bounds[3]!+300)])].sort((a,b)=>a-b);
  const outskirts:number[]=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const ax=xs[i-1]!,bx=xs[i]!,az=zs[j-1]!,bz=zs[j]!;
    if(ax>=data.bounds[0]!&&bx<=data.bounds[2]!&&az>=data.bounds[1]!&&bz<=data.bounds[3]!)continue;
    outskirts.push(ax,az,ax,bz,bx,az,bx,az,ax,bz,bx,bz);
  }
  surface("alder-outskirts",outskirts,night?0x182322:0x425148);
  const buildings=ALDER_BLOCKS.filter(block=>block!==ALDER_GARAGE.building);
  addGarageExterior(scene,ALDER_GARAGE.building);
  const forecourt=new THREE.Mesh(new THREE.PlaneGeometry(ALDER_FORECOURT.width,ALDER_FORECOURT.depth),new THREE.MeshStandardMaterial({color:0x3c4851,roughness:.8}));
  forecourt.rotation.x=-Math.PI/2;forecourt.position.set(ALDER_FORECOURT.x,ALDER_FORECOURT.base+.012,ALDER_FORECOURT.z);forecourt.receiveShadow=true;forecourt.name="garage-forecourt";scene.add(forecourt);
  if(night){
    const frontage=buildingFrontage(buildings,ALDER_STREETS,ALDER_REACH.signs);
    addNightBuildings(scene,buildings.map((b,index)=>{
      const place=alderNeighbourhoodAt(b.x,b.z);
      const dressing=place?NEIGHBOURHOOD_DRESSING[place.id]:ASLEEP;
      // A tower is offices wherever it stands, except among SoDo's warehouses.
      const tower=b.height>=TOWER&&place?.id!=="sodo";
      return {...b,decorationIndex:index,faceDistances:frontage[index]!,dressing:tower?{...dressing,windows:"office" as const}:dressing};
    }),alderHeight,ALDER_REACH);
  }
  else {
    const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x778991}),buildings.length);
    const pose=new THREE.Object3D();
    buildings.forEach((b,i)=>{pose.position.set(b.x,b.base+b.height/2,b.z);pose.rotation.y=-b.rotation;pose.scale.set(b.width,b.height,b.depth);pose.updateMatrix();blocks.setMatrixAt(i,pose.matrix);});
    blocks.name="alder-buildings";blocks.castShadow=true;scene.add(blocks);
  }
  const paint: Record<"yellow" | "white", THREE.BufferGeometry[]>={yellow:[],white:[]};
  function strip(ax:number,az:number,bx:number,bz:number,width:number,color:"yellow" | "white"):void {
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;
    const points=[[ax+nx,az+nz],[bx+nx,bz+nz],[ax-nx,az-nz],[ax-nx,az-nz],[bx+nx,bz+nz],[bx-nx,bz-nz]];
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[x!,alderHeight(x!,z!)+.025,z!]),3));
    paint[color].push(geometry);
  }
  for (const mark of roadMarkings(ALDER_STREETS)) strip(mark.ax,mark.az,mark.bx,mark.bz,.13,mark.color);
  for (const color of ["yellow", "white"] as const) {
    const merged = paint[color].length ? mergeGeometries(paint[color]) : null;
    if (merged) {
      merged.computeVertexNormals();
      const mesh = new THREE.Mesh(merged,new THREE.MeshStandardMaterial({
        color:color === "yellow" ? 0xc9ad60 : 0xc9cbc5,roughness:.95,side:THREE.DoubleSide,
        polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      }));
      mesh.name=color === "yellow" ? "alder-lane-paint" : "alder-lane-paint-white";scene.add(mesh);
    }
    paint[color].forEach(g=>g.dispose());
  }
  const concrete=new THREE.MeshStandardMaterial({color:0x4e5d64,roughness:.9});
  const red=new THREE.MeshStandardMaterial({color:0xb34833,roughness:.6});
  function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material):void {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.name=name;scene.add(mesh);
  }
  box('alder-seawall',data.shore,2,(data.bounds[1]!+data.bounds[3]!)/2,1.2,2.6,data.bounds[3]!-data.bounds[1]!,concrete);
  // Port silhouettes sit beyond the seawall, out of the drivable street network.
  // After dark (design/LOOK.md, SoDo: lit cranes): a red aviation beacon over
  // the legs and at the boom's sea end, drawn through the haze because a beacon
  // is what a port is from 500 m away, and white work lights under the boom
  // lighting the pier deck.
  const beacon=new THREE.MeshBasicMaterial({color:0xff3a2a,fog:false});
  const beaconGlow=new THREE.SpriteMaterial({map:glowTexture(),color:0xff3a2a,blending:THREE.AdditiveBlending,
    depthWrite:false,transparent:true,fog:false});
  const workLight=new THREE.MeshBasicMaterial({color:0xf1f5ff});
  const workGlow=new THREE.SpriteMaterial({map:glowTexture(),color:0xdfe8ff,blending:THREE.AdditiveBlending,
    depthWrite:false,transparent:true,opacity:.75,fog:false});
  const deckPools:THREE.BufferGeometry[]=[];
  // Each pier's edges carry a row of short white pole lamps (the port is private,
  // so its light is white), their heads drawn through the haze like the cranes'.
  const pierPosts:THREE.BufferGeometry[]=[],pierHeads:THREE.BufferGeometry[]=[],pierGlow:number[]=[];
  for(const z of PIERS) {
    box('port-pier',data.shore-42,1,z,84,2,55,concrete);
    for(const side of [-1,1])for(const dx of PIER_LAMP_XS){
      const x=data.shore+dx,edge=z+side*PIER_LAMP_EDGE;
      pierPosts.push(new THREE.BoxGeometry(.18,5,.18).translate(x,4.5,edge));
      if(!night)continue;
      pierHeads.push(new THREE.BoxGeometry(.7,.18,.7).translate(x,7,edge));
      pierGlow.push(x,6.9,edge);
      deckPools.push(new THREE.PlaneGeometry(9,9).rotateX(-Math.PI/2).translate(x,2.06,edge-side*3.5));
    }
    for(const dz of [-13,13])box('port-crane-leg',data.shore-35,19,z+dz,3,36,3,red);
    box('port-crane-boom',data.shore-43,38,z,72,3,3,red);
    box('port-crane-crossbar',data.shore-35,35,z,4,3,32,red);
    if(!night)continue;
    for(const [bx,by] of [[data.shore-35,40.2],[data.shore-78,39.8]] as const){
      box('port-crane-beacon',bx,by,z,.9,.9,.9,beacon);
      // Sized to read from the waterfront road, 500 m off: at 7 m it was a pinprick.
      const glow=new THREE.Sprite(beaconGlow);glow.position.set(bx,by,z);glow.scale.set(16,16,1);glow.name='port-crane-beacon-glow';scene.add(glow);
    }
    for(const dx of [-62,-48,-34]){
      box('port-crane-lamp',data.shore+dx,36.2,z,1.6,.3,1.6,workLight);
      const glow=new THREE.Sprite(workGlow);glow.position.set(data.shore+dx,35.8,z);glow.scale.set(9,9,1);glow.name='port-crane-lamp-glow';scene.add(glow);
      deckPools.push(new THREE.PlaneGeometry(16,16).rotateX(-Math.PI/2).translate(data.shore+dx,2.06,z));
    }
  }
  for(const [name,parts,material] of [['port-pier-lamp-posts',pierPosts,concrete],['port-pier-lamp-heads',pierHeads,workLight]] as const){
    const geometry=parts.length?mergeGeometries([...parts]):null;parts.forEach(g=>g.dispose());
    if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.name=name;scene.add(mesh);}
  }
  if(pierGlow.length)scene.add(farGlow('port-pier-lamp-glow',pierGlow,0xdfe8ff,5,.8));
  if(night){
    const masts:THREE.BufferGeometry[]=[],heads:THREE.BufferGeometry[]=[],yardGlow:number[]=[];
    for(const mast of START_YARD_MASTS){
      const base=alderHeight(mast.x,mast.z);
      masts.push(new THREE.BoxGeometry(.34,YARD_MAST_HEIGHT,.34).translate(mast.x,base+YARD_MAST_HEIGHT/2,mast.z));
      // The dock's flood, on a mast instead of a wall, aimed over the yard.
      heads.push(new THREE.BoxGeometry(1.3,.4,.5).translate(mast.x,base+YARD_MAST_HEIGHT-.4,mast.z-.4));
      yardGlow.push(mast.x,base+YARD_MAST_HEIGHT-.5,mast.z-.5);
      const pool=new THREE.PlaneGeometry(20,20,4,4);pool.rotateX(-Math.PI/2);
      const position=pool.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const px=position.getX(i)+mast.x,pz=position.getZ(i)+mast.z-2;
        position.setXYZ(i,px,alderHeight(px,pz)+.05,pz);
      }
      deckPools.push(pool);
    }
    for(const [name,parts,material] of [['alder-yard-masts',masts,concrete],['alder-yard-heads',heads,workLight]] as const){
      const geometry=mergeGeometries([...parts]);parts.forEach(g=>g.dispose());
      if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.name=name;scene.add(mesh);}
    }
    scene.add(farGlow('alder-yard-glow',yardGlow,0xdfe8ff,6,.7));
  }
  if(deckPools.length){
    const geometry=mergeGeometries(deckPools);deckPools.forEach(g=>g.dispose());
    if(geometry){const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xdfe6f2,map:glowTexture(),transparent:true,
      blending:THREE.AdditiveBlending,depthWrite:false,opacity:.55,toneMapped:false}));mesh.name='port-deck-pools';scene.add(mesh);}
  }
  // Additive pools follow the same ground height as the road and car.
  const pools: THREE.BufferGeometry[]=[];
  const poolMaterial=new THREE.MeshBasicMaterial({color:SODIUM_POOL,map:glowTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,opacity:SODIUM_POOL_OPACITY,toneMapped:false});
  const lamps: THREE.BufferGeometry[]=[];
  const bulbs: THREE.BufferGeometry[]=[];
  // Where a kerb prop stands is the sim's decision now (sim/kerb-props.ts).
  // This turns each pose into geometry and nothing else; the poses are the same
  // ones this loop used to compute inline, which tests/kerb-props.test.ts pins.
  // The seawall's lamps are the street lamp itself (one municipal fixture), so
  // they join its meshes; only their glow is extra, and only because no road
  // is nearer the water than 116 m and the haze takes a bare lamp head by then.
  for(const pose of [...ALDER_LAMP_POSES,...ALDER_SEAWALL_LAMP_POSES]){
    const x=pose.x,z=pose.z,y=alderHeight(x,z);
    lamps.push(new THREE.BoxGeometry(.22,7,.22).translate(x,y+3.5,z));
    bulbs.push(new THREE.BoxGeometry(1.6,.2,.5).translate(x,y+7,z));
    if(night){
      const pool=new THREE.PlaneGeometry(25,32,5,6);pool.rotateX(-Math.PI/2);
      const position=pool.getAttribute('position');
      const cx=x-pose.outX*SODIUM_POOL_INSET,cz=z-pose.outZ*SODIUM_POOL_INSET;
      for(let j=0;j<position.count;j++){
        const px=position.getX(j)+cx,pz=position.getZ(j)+cz;
        position.setXYZ(j,px,alderHeight(px,pz)+.045,pz);
      }
      pools.push(pool);
    }
  }
  // Named like the district's lamps. Every mesh carries a kebab-case name --
  // __ns.pick reads them and so does the chunker -- and these three were the
  // only unnamed meshes in Port Alder, 106k triangles of them drawn city-wide.
  for(const [name,parts,material] of [['alder-lamp-posts',lamps,concrete],
    ['alder-lamp-heads',bulbs,new THREE.MeshBasicMaterial({color:SODIUM_HEAD})]] as const){
    const geometry=mergeGeometries([...parts]);
    if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.name=name;scene.add(mesh);}
    parts.forEach(g=>g.dispose());
  }
  if(pools.length){
    const geometry=mergeGeometries(pools);
    if(geometry){const mesh=new THREE.Mesh(geometry,poolMaterial);mesh.name='alder-lamp-pools';scene.add(mesh);}
    pools.forEach(g=>g.dispose());
  }
  if(night)scene.add(farGlow('alder-seawall-lamp-glow',
    ALDER_SEAWALL_LAMP_POSES.flatMap(pose=>[pose.x,alderHeight(pose.x,pose.z)+6.9,pose.z]),SODIUM_HEAD,6,.7));
  // The anchor's second consumer, and the whole point of extracting it: the
  // other kerb, from a spec rather than from another loop. placeCar's
  // convention is that rotation.y IS the heading, so a bin turns its back on
  // the carriageway.
  const bins: THREE.BufferGeometry[]=[];
  for(const pose of ALDER_BIN_POSES){
    const bin=new THREE.BoxGeometry(.62,.95,.44);
    bin.rotateY(pose.heading);
    bin.translate(pose.x,alderHeight(pose.x,pose.z)+.475,pose.z);
    bins.push(bin);
  }
  if(bins.length){
    const geometry=mergeGeometries(bins);
    if(geometry){
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x39434d,roughness:.85}));
      mesh.name='alder-kerb-bins';mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
    }
    bins.forEach(g=>g.dispose());
  }
  // Last, once every merged mesh exists: divide the city-wide ones so the far
  // side of the map stops being submitted from every position on it.
  chunkAlderScenery(scene);
}
