import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SEATTLE_DATA as data, SEATTLE_STREETS, SEATTLE_BLOCKS, SEATTLE_GARAGE, seattleHeight } from "../sim/seattle.ts";
import { addGarageExterior } from "./garage.ts";
import { laneMarkings } from "../sim/lanes.ts";
import { addNightBuildings, glowTexture } from "./night.ts";
import type { DistrictLighting } from "./scene.ts";

export function addSeattle(scene: THREE.Scene, lighting: DistrictLighting): void {
  const night = lighting === "night";
  if (night) scene.add(new THREE.HemisphereLight(0x9abbd0, 0x39444c, 1.0));
  function surface(name: string, points: number[], color: number): void {
    const positions = new Float32Array(points.length/2*3);
    for(let i=0;i<points.length;i+=2) {
      const x=points[i]!, z=points[i+1]!;
      positions.set([x,seattleHeight(x,z),z],i/2*3);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute("position",new THREE.BufferAttribute(positions,3)); geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.08}));
    mesh.name=name; mesh.receiveShadow=true;scene.add(mesh);
  }
  surface("seattle-asphalt",data.asphalt,night?0x283440:0x424e54);
  surface("seattle-pavement",data.pavement,night?0x4b515b:0x879090);
  surface("seattle-ground",data.ground,night?0x182322:0x425148);
  const water=new THREE.Mesh(new THREE.PlaneGeometry(2200,4800),new THREE.MeshStandardMaterial({color:0x123142,metalness:.55,roughness:.24}));
  water.rotation.x=-Math.PI/2;water.position.set(data.shore-1100,.1,0);water.name="elliott-bay";scene.add(water);
  // Continue the landform beyond the authored parcels so leaving the streets
  // does not put the car above a flat backdrop. Subdivide only curved bands.
  const xs=[...new Set([data.shore,data.bounds[2]!,3000,...Array.from({length:65},(_,i)=>-50+i*10)])].sort((a,b)=>a-b);
  const zs=[...new Set([-3500,data.bounds[1]!,data.bounds[3]!,3500,...Array.from({length:51},(_,i)=>-170+i*10)])].sort((a,b)=>a-b);
  const outskirts:number[]=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const ax=xs[i-1]!,bx=xs[i]!,az=zs[j-1]!,bz=zs[j]!;
    if(ax>=data.bounds[0]!&&bx<=data.bounds[2]!&&az>=data.bounds[1]!&&bz<=data.bounds[3]!)continue;
    outskirts.push(ax,az,ax,bz,bx,az,bx,az,ax,bz,bx,bz);
  }
  surface("seattle-outskirts",outskirts,night?0x182322:0x425148);
  const buildings=SEATTLE_BLOCKS.filter(block=>block!==SEATTLE_GARAGE.building);
  addGarageExterior(scene,SEATTLE_GARAGE.building);
  const forecourt=new THREE.Mesh(new THREE.PlaneGeometry(31,40),new THREE.MeshStandardMaterial({color:0x3c4851,roughness:.8}));
  forecourt.rotation.x=-Math.PI/2;forecourt.position.set(6.5,2.012,910);forecourt.receiveShadow=true;forecourt.name="garage-forecourt";scene.add(forecourt);
  if(night) addNightBuildings(scene,buildings.map((b,index)=>({...b,decorationIndex:index,faceDistances:[0,0,0,0] as const})),seattleHeight);
  else {
    const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x778991}),buildings.length);
    const pose=new THREE.Object3D();
    buildings.forEach((b,i)=>{pose.position.set(b.x,b.base+b.height/2,b.z);pose.rotation.y=-b.rotation;pose.scale.set(b.width,b.height,b.depth);pose.updateMatrix();blocks.setMatrixAt(i,pose.matrix);});
    blocks.name="seattle-buildings";blocks.castShadow=true;scene.add(blocks);
  }
  const paint: THREE.BufferGeometry[]=[];
  function strip(ax:number,az:number,bx:number,bz:number,width:number):void {
    const dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),nx=-dz/length*width/2,nz=dx/length*width/2;
    const points=[[ax+nx,az+nz],[bx+nx,bz+nz],[ax-nx,az-nz],[ax-nx,az-nz],[bx+nx,bz+nz],[bx-nx,bz-nz]];
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[x!,seattleHeight(x!,z!)+.025,z!]),3));
    paint.push(geometry);
  }
  for(const street of SEATTLE_STREETS) for(let i=1;i<street.points.length;i++) {
    const a=street.points[i-1]!,b=street.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
    // Leave junction mouths open. No arrows impose a route on the player.
    for(let d=12;d<length-12;d+=10) for(const mark of laneMarkings(a.width,street.kind)) {
      if(mark.kind==='edge')continue;
      const end=Math.min(length-12,d+(mark.kind==='centre'?8:4));
      strip(a.x+ux*d-uz*mark.offset,a.z+uz*d+ux*mark.offset,a.x+ux*end-uz*mark.offset,a.z+uz*end+ux*mark.offset,.14);
    }
  }
  const merged=mergeGeometries(paint);
  if(merged){const mesh=new THREE.Mesh(merged,new THREE.MeshBasicMaterial({color:0xe9c879,side:THREE.DoubleSide}));mesh.name='seattle-lane-paint';scene.add(mesh);}
  paint.forEach(g=>g.dispose());
  const concrete=new THREE.MeshStandardMaterial({color:0x4e5d64,roughness:.9});
  const red=new THREE.MeshStandardMaterial({color:0xb34833,roughness:.6});
  function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material):void {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.name=name;scene.add(mesh);
  }
  box('seattle-seawall',data.shore,2,(data.bounds[1]!+data.bounds[3]!)/2,1.2,2.6,data.bounds[3]!-data.bounds[1]!,concrete);
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
  for(const street of SEATTLE_STREETS) for(let i=1;i<street.points.length;i++) {
    const a=street.points[i-1]!,b=street.points[i]!,len=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=20;d<len-15;d+=55){
      const x=a.x+(b.x-a.x)*d/len-(b.z-a.z)/len*(a.width/2+1.7),z=a.z+(b.z-a.z)*d/len+(b.x-a.x)/len*(a.width/2+1.7),y=seattleHeight(x,z);
      lamps.push(new THREE.BoxGeometry(.22,7,.22).translate(x,y+3.5,z));
      bulbs.push(new THREE.BoxGeometry(1.6,.2,.5).translate(x,y+7,z));
      if(night){
        const pool=new THREE.PlaneGeometry(25,32,5,6);pool.rotateX(-Math.PI/2);
        const position=pool.getAttribute('position');
        for(let j=0;j<position.count;j++){
          const px=position.getX(j)+x,pz=position.getZ(j)+z;
          position.setXYZ(j,px,seattleHeight(px,pz)+.045,pz);
        }
        pools.push(pool);
      }
    }
  }
  for(const [parts,material] of [[lamps,concrete],[bulbs,new THREE.MeshBasicMaterial({color:0xffd38a})]] as const){
    const geometry=mergeGeometries([...parts]);if(geometry)scene.add(new THREE.Mesh(geometry,material));parts.forEach(g=>g.dispose());
  }
  if(pools.length){const geometry=mergeGeometries(pools);if(geometry)scene.add(new THREE.Mesh(geometry,poolMaterial));pools.forEach(g=>g.dispose());}
}
