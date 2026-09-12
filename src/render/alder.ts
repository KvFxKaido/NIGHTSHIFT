import { addBroadcastTower } from "./broadcast-tower.ts";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ALDER_DATA as data, ALDER_STREETS, ALDER_BLOCKS, ALDER_GARAGE, ALDER_TREES, ALDER_EVERGREENS,
  ALDER_LAMP_POSES, ALDER_BIN_POSES, alderHeight } from "../sim/alder.ts";
import { addEvergreens } from "./evergreens.ts";
import { chunkAlderScenery } from "./city-chunks.ts";
import { addGarageExterior } from "./garage.ts";
import { laneMarkings, pathLength, pathSamples } from "../sim/lanes.ts";
import { addNightBuildings, glowTexture } from "./night.ts";
import type { DistrictLighting } from "./scene.ts";

export function addAlder(scene: THREE.Scene, lighting: DistrictLighting): void {
  const night = lighting === "night";
  addBroadcastTower(scene, night);
  if (night) scene.add(new THREE.HemisphereLight(0x9abbd0, 0x39444c, 1.0));
  function surface(name: string, points: number[], color: number, lift = 0): void {
    const positions = new Float32Array(points.length/2*3);
    for(let i=0;i<points.length;i+=2) {
      const x=points[i]!, z=points[i+1]!;
      positions.set([x,alderHeight(x,z)+lift,z],i/2*3);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.BufferAttribute(positions,3)); geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.08,
      polygonOffset:lift>0,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    mesh.name=name; mesh.receiveShadow=true;scene.add(mesh);
  }
  surface("alder-asphalt",data.asphalt,night?0x283440:0x424e54);
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
  const water=new THREE.Mesh(new THREE.PlaneGeometry(2200,data.bounds[3]!-data.bounds[1]!+1000),new THREE.MeshStandardMaterial({color:0x123142,metalness:.55,roughness:.24}));
  water.rotation.x=-Math.PI/2;water.position.set(data.shore-1100,.1,(data.bounds[3]!+data.bounds[1]!)/2);water.name="elliott-bay";scene.add(water);
  // Continue the landform beyond the authored parcels so leaving the streets
  // does not put the car above a flat backdrop. Subdivide only curved bands.
  const grid=(low:number,high:number)=>Array.from({length:Math.ceil((high-low)/20)+1},(_,i)=>low+i*20);
  const xs=[...new Set([data.shore,data.bounds[2]!,...grid(data.shore,Math.max(3300,data.bounds[2]!+300))])].sort((a,b)=>a-b);
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
  const forecourt=new THREE.Mesh(new THREE.PlaneGeometry(31,40),new THREE.MeshStandardMaterial({color:0x3c4851,roughness:.8}));
  forecourt.rotation.x=-Math.PI/2;forecourt.position.set(6.5,2.012,910);forecourt.receiveShadow=true;forecourt.name="garage-forecourt";scene.add(forecourt);
  if(night) addNightBuildings(scene,buildings.map((b,index)=>({...b,decorationIndex:index,faceDistances:[0,0,0,0] as const})),alderHeight);
  else {
    const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x778991}),buildings.length);
    const pose=new THREE.Object3D();
    buildings.forEach((b,i)=>{pose.position.set(b.x,b.base+b.height/2,b.z);pose.rotation.y=-b.rotation;pose.scale.set(b.width,b.height,b.depth);pose.updateMatrix();blocks.setMatrixAt(i,pose.matrix);});
    blocks.name="alder-buildings";blocks.castShadow=true;scene.add(blocks);
  }
  const paint: THREE.BufferGeometry[]=[];
  function strip(ax:number,az:number,bx:number,bz:number,width:number):void {
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;
    const points=[[ax+nx,az+nz],[bx+nx,bz+nz],[ax-nx,az-nz],[ax-nx,az-nz],[bx+nx,bz+nz],[bx-nx,bz-nz]];
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[x!,alderHeight(x!,z!)+.025,z!]),3));
    paint.push(geometry);
  }
  for(const street of ALDER_STREETS) {
    const length=pathLength(street.points);
    // Leave junction mouths open. No arrows impose a route on the player.
    for(const sample of pathSamples(street.points,10)) for(const mark of laneMarkings(sample.width,street.kind)) {
      if(sample.distance<12||sample.distance>length-20)continue;
      if(mark.kind==='edge')continue;
      const {x,z,dirX:ux,dirZ:uz}=sample,span=mark.kind==='centre'?8:4;
      strip(x-uz*mark.offset,z+ux*mark.offset,x+ux*span-uz*mark.offset,z+uz*span+ux*mark.offset,.14);
    }
  }
  const merged=mergeGeometries(paint);
  if(merged){const mesh=new THREE.Mesh(merged,new THREE.MeshBasicMaterial({color:0xe9c879,side:THREE.DoubleSide}));mesh.name='alder-lane-paint';scene.add(mesh);}
  paint.forEach(g=>g.dispose());
  const concrete=new THREE.MeshStandardMaterial({color:0x4e5d64,roughness:.9});
  const red=new THREE.MeshStandardMaterial({color:0xb34833,roughness:.6});
  function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material):void {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.name=name;scene.add(mesh);
  }
  box('alder-seawall',data.shore,2,(data.bounds[1]!+data.bounds[3]!)/2,1.2,2.6,data.bounds[3]!-data.bounds[1]!,concrete);
  // Port silhouettes sit beyond the seawall, out of the drivable street network.
  for(const z of [-320,80,470,810]) {
    box('port-pier',data.shore-42,1,z,84,2,55,concrete);
    for(const dz of [-13,13])box('port-crane-leg',data.shore-35,19,z+dz,3,36,3,red);
    box('port-crane-boom',data.shore-43,38,z,72,3,3,red);
    box('port-crane-crossbar',data.shore-35,35,z,4,3,32,red);
  }
  // Additive pools follow the same ground height as the road and car.
  const pools: THREE.BufferGeometry[]=[];
  const poolMaterial=new THREE.MeshBasicMaterial({color:0xc09b65,map:glowTexture(),transparent:true,
    blending:THREE.AdditiveBlending,depthWrite:false,opacity:.28,toneMapped:false});
  const lamps: THREE.BufferGeometry[]=[];
  const bulbs: THREE.BufferGeometry[]=[];
  // Where a kerb prop stands is the sim's decision now (sim/kerb-props.ts).
  // This turns each pose into geometry and nothing else; the poses are the same
  // ones this loop used to compute inline, which tests/kerb-props.test.ts pins.
  for(const pose of ALDER_LAMP_POSES){
    const x=pose.x,z=pose.z,y=alderHeight(x,z);
    lamps.push(new THREE.BoxGeometry(.22,7,.22).translate(x,y+3.5,z));
    bulbs.push(new THREE.BoxGeometry(1.6,.2,.5).translate(x,y+7,z));
    if(night){
      const pool=new THREE.PlaneGeometry(25,32,5,6);pool.rotateX(-Math.PI/2);
      const position=pool.getAttribute('position');
      for(let j=0;j<position.count;j++){
        const px=position.getX(j)+x,pz=position.getZ(j)+z;
        position.setXYZ(j,px,alderHeight(px,pz)+.045,pz);
      }
      pools.push(pool);
    }
  }
  // Named like the district's lamps. Every mesh carries a kebab-case name --
  // __ns.pick reads them and so does the chunker -- and these three were the
  // only unnamed meshes in Port Alder, 106k triangles of them drawn city-wide.
  for(const [name,parts,material] of [['alder-lamp-posts',lamps,concrete],
    ['alder-lamp-heads',bulbs,new THREE.MeshBasicMaterial({color:0xffd38a})]] as const){
    const geometry=mergeGeometries([...parts]);
    if(geometry){const mesh=new THREE.Mesh(geometry,material);mesh.name=name;scene.add(mesh);}
    parts.forEach(g=>g.dispose());
  }
  if(pools.length){
    const geometry=mergeGeometries(pools);
    if(geometry){const mesh=new THREE.Mesh(geometry,poolMaterial);mesh.name='alder-lamp-pools';scene.add(mesh);}
    pools.forEach(g=>g.dispose());
  }
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
