import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import { garageSite } from "../sim/garage-site.ts";
import { asphaltMaterial } from "./asphalt.ts";
import { glowTexture } from "./night.ts";

/** A dockside workshop around the original collision envelope. Repeated detail
 * shares material batches; the menu can mute the whole identity layer. */
export function addGarageExterior(scene:THREE.Scene,building:BuildingBlock):void {
  const group=new THREE.Group();group.name="district-garage";
  group.position.set(building.x,building.base,building.z);group.rotation.y=-building.rotation;
  const concrete=new THREE.MeshStandardMaterial({color:0x3d4243,roughness:.94});
  const trim=new THREE.MeshStandardMaterial({color:0x646866,roughness:.9});
  const steel=new THREE.MeshStandardMaterial({color:0x20292c,roughness:.65,metalness:.35});
  const dark=new THREE.MeshStandardMaterial({color:0x10191d,roughness:.72});
  const glass=new THREE.MeshStandardMaterial({color:0x233740,roughness:.28,metalness:.4});
  const cyan=new THREE.MeshBasicMaterial({color:0x75dfff,toneMapped:false});
  const warm=new THREE.MeshBasicMaterial({color:0xc6b389,toneMapped:false});
  const body=new THREE.Mesh(new THREE.BoxGeometry(building.width,building.height,building.depth),concrete);
  body.name="district-garage-building";body.position.y=building.height/2;body.castShadow=body.receiveShadow=true;group.add(body);
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const add=(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);
    const parts=batches.get(material)??[];parts.push(g);batches.set(material,parts);
  };
  const front=-building.depth/2,half=building.width/2;
  group.userData.facadeFront=front;
  // Continuous foundation, roof coping and cladding band wrap all four walls.
  for(const z of [front-.025,-front+.025]) {
    add(steel,0,.35,z,building.width+.1,.7,.1);
    add(trim,0,9.85,z,building.width+.25,.3,.3);
    add(steel,0,8,z,building.width,3.4,.08);
    for(let x=-half+.25;x<half;x+=.55)add(dark,x,8,z, .055,3.2,.13);
  }
  for(const side of [-1,1]) {
    const x=side*(half+.035);
    add(steel,x,.35,0,.1,.7,building.depth);
    add(trim,x,9.85,0,.3,.3,building.depth+.25);
    add(steel,x,8,0,.08,3.4,building.depth);
    for(let z=front+.3;z<-front;z+=.55)add(dark,x,8,z,.13,3.2,.055);
    // Side office glazing and service wall windows: frames, sills and mullions.
    for(const z of [-7,-1,5]) {
      add(dark,x,3.5,z,.16,2,4.5);add(glass,x+side*.1,3.5,z,.06,1.65,4.15);
      add(trim,x+side*.15,2.48,z,.32,.14,4.7);
      for(const dz of [-1.35,0,1.35])add(steel,x+side*.15,3.5,z+dz,.08,1.8,.07);
    }
    // Downpipes and corner piers carry the trim around the building.
    for(const z of [front+.2,-front-.2])add(trim,side*(half-.16),3.15,z,.36,6.3,.4);
    add(dark,side*(half+.12),4.4,8.9,.18,8.8,.18);
  }
  for(const [index,x] of [-9,0,9].entries()) {
    add(dark,x,2.8,front-.065,7.3,5.6,.12);
    add(steel,x,2.7,front-.14,6.8,5.2,.08);
    for(let row=1;row<18;row++)add(concrete,x,.25+row*.285,front-.2,6.7,.04,.035);
    for(const dx of [-3.58,3.58])add(trim,x+dx,2.9,front-.21,.2,5.8,.32);
    add(trim,x,5.75,front-.22,7.35,.25,.35);
    add(dark,x,5.45,front-.22,6.5,.15,.08);
    for(const dx of [-1.3,1.3])add(dark,x+dx,.9,front-.23,.45,.07,.06);
    add(dark,x,5.89,front-.9,2,.18,.65);
    add(warm,x,5.79,front-.9,1.65,.045,.36);
    // Deliberate cue on the actual entry bay, not neon on every edge.
    if(index===1) {
      for(const dx of [-3.72,3.72])add(cyan,x+dx,2.9,front-.4,.055,5.4,.045);
      add(cyan,x,5.94,front-.4,7.5,.055,.045);
    }
  }
  // Narrow personnel entrance beside the end shutter.
  add(dark,14.5,1.55,front-.16,1.65,3.1,.2);
  add(steel,14.5,1.55,front-.29,1.35,2.85,.07);
  add(glass,14.5,2.02,front-.34,.9,1.15,.03);
  add(trim,14.95,1.25,front-.36,.065,.4,.06);
  // A shallow canopy caps the bays without posts in the departure route.
  add(dark,0,6.1,front-.65,28.5,.22,1.6);
  add(trim,0,6.13,front-1.47,28.65,.22,.1);
  for(const x of [-13,-4.5,4.5,13])add(steel,x,5.87,front-.5,.13,.35,1.15);
  // Rear service elevation, roof machinery and parapet retain a modest silhouette.
  add(dark,-8,1.7,-front+.09,2.1,3.4,.16);
  for(const x of [-2,5,11]) {
    add(dark,x,3.8,-front+.08,3.8,1.65,.14);
    for(let y=3.1;y<4.6;y+=.18)add(steel,x,y,-front+.17,3.6,.065,.05);
  }
  for(const x of [-9,9]) {
    add(steel,x,10.35,3,3.4,.7,2.3);
    for(let dz=-.8;dz<=.8;dz+=.32)add(dark,x,10.72,3+dz,3.1,.07,.12);
  }
  for(const [material,parts] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(parts)!,material);parts.forEach(p=>p.dispose());
    mesh.name="district-garage-architecture";mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  // One atlas supplies the permanent sign, bay numbers and small service copy.
  const identity=new THREE.Group();identity.name="district-garage-sign";
  let texture:THREE.CanvasTexture|null=null;
  if(typeof document!=="undefined") {
    const canvas=document.createElement("canvas");canvas.width=2048;canvas.height=512;
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle="#101b20";ctx.fillRect(0,0,2048,512);
    ctx.strokeStyle="#729a9b";ctx.lineWidth=5;ctx.strokeRect(12,12,2024,300);
    ctx.fillStyle="#d1dfd8";ctx.font="900 160px Impact, sans-serif";ctx.textAlign="center";ctx.fillText("WHARF GARAGE",1024,198);
    ctx.fillStyle="#75dfff";ctx.font="30px monospace";ctx.fillText("PORT ALDER  /  CUSTOMS & PERFORMANCE  /  EST. 1987",1024,271);
    ctx.fillStyle="#d1dfd8";ctx.font="bold 55px monospace";
    for(const [i,label] of ["01 / SERVICE","02 / CUSTOMS","03 / SETUP"].entries())ctx.fillText(label,341+i*683,430);
    texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  }
  const signMaterial=new THREE.MeshBasicMaterial({map:texture,color:texture?0xffffff:0x75dfff,toneMapped:false});
  const panel=(name:string,x:number,y:number,w:number,h:number,uv:[number,number,number,number],depth=.24)=>{
    const g=new THREE.PlaneGeometry(w,h),u=g.getAttribute("uv");
    for(let i=0;i<u.count;i++)u.setXY(i,uv[0]+u.getX(i)*uv[2],uv[1]+u.getY(i)*uv[3]);
    const mesh=new THREE.Mesh(g,signMaterial);mesh.name=name;mesh.rotation.y=Math.PI;mesh.position.set(x,y,front-depth);identity.add(mesh);
  };
  panel("district-garage-wordmark",0,8.12,20.5,3.1,[0,.375,1,.625]);
  [-9,0,9].forEach((x,i)=>panel(`district-garage-bay-${i}`,x,5.3,3.7,.65,[i/3,.09375,1/3,.21875],.44));
  group.add(identity);scene.add(group);
}

/** Existing forecourt bounds and the shared planter poses; no parked car in the exit. */
export function addGarageForecourt(scene:THREE.Scene,building:BuildingBlock,apron:BuildingBlock):void {
  const group=new THREE.Group();group.name="garage-forecourt";
  const asphalt=asphaltMaterial(0x3c4548),concrete=new THREE.MeshStandardMaterial({color:0x727873,roughness:1});
  const paint=new THREE.MeshBasicMaterial({color:0xb7b9a9}),soil=new THREE.MeshStandardMaterial({color:0x292b25,roughness:1});
  const foliage=new THREE.MeshStandardMaterial({color:0x385441,roughness:1,flatShading:true});
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const add=(m:THREE.Material,g:THREE.BufferGeometry)=>{const a=batches.get(m)??[];a.push(g);batches.set(m,a);};
  const floor=(m:THREE.Material,x:number,z:number,w:number,d:number,lift:number)=>{
    const g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);g.translate(x,building.base+lift,z);add(m,g);
  };
  floor(asphalt,apron.x,apron.z,apron.width,apron.depth,.022);
  // World-space UVs match the eight-metre road tile rather than stretching it.
  for(const g of batches.get(asphalt)!) {const p=g.getAttribute("position"),uv=g.getAttribute("uv");for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/8,p.getZ(i)/8);}
  const local=(x:number,z:number)=>{const c=Math.cos(building.rotation),s=Math.sin(building.rotation);return {x:building.x+x*c-z*s,z:building.z+x*s+z*c};};
  function localFloor(m:THREE.Material,x:number,z:number,w:number,d:number,lift:number) {
    const p=local(x,z),g=new THREE.PlaneGeometry(w,d);g.rotateX(-Math.PI/2);g.rotateY(-building.rotation);g.translate(p.x,building.base+lift,p.z);add(m,g);
  }
  const front=-building.depth/2;
  localFloor(concrete,0,front-1,building.width,2,.038);
  for(const bay of [-9,0,9]) {
    for(const side of [-1,1])localFloor(paint,bay+side*3.55,front-5.7,.1,7.2,.05);
    // Broken outer edge reads as a service apron, leaving the middle bay open.
    if(bay!==0)for(let x=-3;x<3.2;x+=.85)localFloor(paint,bay+x,front-9.3,.4,.12,.05);
  }
  for(const b of garageSite(building).planters) {
    const g=new THREE.BoxGeometry(b.width,b.height,b.depth);g.rotateY(-b.rotation);g.translate(b.x,b.base+b.height/2,b.z);add(concrete,g);
    const bed=new THREE.BoxGeometry(b.width-.28,.055,b.depth-.28);bed.rotateY(-b.rotation);bed.translate(b.x,b.base+b.height+.025,b.z);add(soil,bed);
    for(let z=-b.depth/2+.7;z<=b.depth/2-.7;z+=.8)for(const x of [-.5,.5]) {
      const c=Math.cos(b.rotation),s=Math.sin(b.rotation),g=new THREE.IcosahedronGeometry(.7,0);
      g.scale(1,.75,1);g.translate(b.x+x*c-z*s,b.base+.98,b.z+x*s+z*c);add(foliage,g);
    }
  }
  for(const [material,parts] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(parts)!,material);parts.forEach(g=>g.dispose());
    mesh.name=material===concrete?"garage-court-concrete":"garage-court-surface";mesh.receiveShadow=true;group.add(mesh);
  }
  // Warm pools are painted light; no additional live light or shadow map.
  const poolMaterial=new THREE.MeshBasicMaterial({color:0xc7a56b,map:glowTexture(),transparent:true,opacity:.18,
    depthWrite:false,blending:THREE.AdditiveBlending});
  for(const x of [-9,0,9]) {
    const point=local(x,front-4),mesh=new THREE.Mesh(new THREE.PlaneGeometry(8,9),poolMaterial);
    mesh.name="garage-worklight-pool";mesh.rotation.x=-Math.PI/2;mesh.rotation.z=-building.rotation;mesh.position.set(point.x,building.base+.06,point.z);group.add(mesh);
  }
  scene.add(group);
}
