import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { chunkMesh } from "./city-chunks.ts";
import type { DressedJunction } from "../sim/intersection-dressing.ts";

function stopLetterTexture():THREE.DataTexture {
  const glyphs=[['01110','10001','10000','01110','00001','10001','01110'],
    ['11111','00100','00100','00100','00100','00100','00100'],
    ['01110','10001','10001','10001','10001','10001','01110'],
    ['11110','10001','10001','11110','10000','10000','10000']];
  const pixels=new Uint8Array(32*16*4);
  glyphs.forEach((glyph,g)=>glyph.forEach((row,y)=>[...row].forEach((v,x)=>{
    if(v==='1'){const i=((y+4)*32+4+g*6+x)*4;pixels.set([255,255,245,255],i);}
  })));
  const map=new THREE.DataTexture(pixels,32,16);
  map.magFilter=THREE.NearestFilter;map.needsUpdate=true;map.colorSpace=THREE.SRGBColorSpace;
  // DataTexture's first row is the bottom of the plane.
  map.flipY=true;
  return map;
}

export function addIntersectionDressing(scene:THREE.Scene,junctions:readonly DressedJunction[],
  height:(x:number,z:number)=>number,lift:(x:number,z:number)=>number,shoulder:number):void {
  const metal=new THREE.MeshStandardMaterial({color:0x697478,roughness:.65,metalness:.45});
  const housing=new THREE.MeshStandardMaterial({color:0x24292b,roughness:.8});
  const yellow=new THREE.MeshStandardMaterial({color:0xd3a530,roughness:.8});
  const unlit=new THREE.MeshStandardMaterial({color:0x3c4644,roughness:.45});
  const red=new THREE.MeshStandardMaterial({color:0xa32323,roughness:.9});
  const white=new THREE.MeshStandardMaterial({color:0xd9ddd5,roughness:.95});
  const letters=new THREE.MeshBasicMaterial({map:stopLetterTexture(),transparent:true,depthWrite:false});
  const amberLamp=new THREE.MeshBasicMaterial({color:0xffb321});
  const redLamp=new THREE.MeshBasicMaterial({color:0xff3023});
  scene.userData.intersectionFlashes=[amberLamp,redLamp];
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const put=(g:THREE.BufferGeometry,m:THREE.Material,matrix:THREE.Matrix4)=>{
    g.applyMatrix4(matrix);const list=batches.get(m)??[];list.push(g);batches.set(m,list);
  };
  for(const junction of junctions)for(const a of junction.approaches) {
    const base=height(a.poleX,a.poleZ)+lift(a.poleX,a.poleZ);
    const frame=new THREE.Matrix4().makeRotationY(Math.atan2(a.ux,a.uz));
    frame.setPosition(a.poleX,base,a.poleZ);
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material)=>
      put(new THREE.BoxGeometry(w,h,d).translate(x,y,z),m,frame);
    const disc=(x:number,y:number,z:number,r:number,m:THREE.Material,segments=16)=>
      put(new THREE.CircleGeometry(r,segments).rotateZ(segments===8?Math.PI/8:0).translate(x,y,z),m,frame);
    if(a.control==='signal') {
      const reach=a.width/4+shoulder+1.35;
      // A pole on the downhill sidewalk must not lower its head into trucks.
      const headGround=height(a.poleX-a.uz*reach,a.poleZ+a.ux*reach);
      const rise=Math.max(0,headGround+4.8-(base+4.525));
      box(0,(6.3+rise)/2,0,.18,6.3+rise,.18,metal);
      box(-reach/2,6.1+rise,0,reach,.16,.16,metal);
      box(-reach,5.35+rise,0,.66,1.65,.16,yellow);
      box(-reach,5.35+rise,.14,.47,1.4,.28,housing);
      for(const y of [5.78,5.35,4.92])disc(-reach,y+rise,.29,.155,unlit);
      disc(-reach,(a.flash==='red'?5.78:5.35)+rise,.30,.12,a.flash==='red'?redLamp:amberLamp);
    } else {
      box(0,1.25,0,.075,2.5,.075,metal);
      disc(0,2.35,.045,.52,white,8);
      disc(0,2.35,.05,.47,red,8);
      put(new THREE.PlaneGeometry(.9,.45).translate(0,2.35,.06),letters,frame);
      // The metal back remains visible from the opposite approach.
      put(new THREE.CircleGeometry(.52,8).rotateZ(Math.PI/8).rotateY(Math.PI).translate(0,2.35,.035),metal,frame);
    }
    const paintFrame=new THREE.Matrix4().makeRotationY(Math.atan2(a.ux,a.uz));
    paintFrame.setPosition(a.stopX,0,a.stopZ);
    const paint=(across:number,along:number,width:number,depth:number)=>{
      const g=new THREE.PlaneGeometry(width,depth,Math.max(1,Math.ceil(width/2)),1).rotateX(-Math.PI/2).translate(across,0,along);
      g.applyMatrix4(paintFrame);
      const p=g.getAttribute('position');
      for(let i=0;i<p.count;i++)p.setY(i,height(p.getX(i),p.getZ(i))+.035);
      g.computeVertexNormals();put(g,white,new THREE.Matrix4());
    };
    paint(a.width/4,0,a.width/2,.45);
    if(a.crosswalk) {
      const edge=a.width/2+shoulder-.3;
      for(let x=-edge+.4;x<edge;x+=1.4)paint(x,-3.5,.55,2.8);
    }
  }
  let index=0;
  for(const [material,parts] of batches) {
    const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());
    if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`alder-intersection-dressing-${index++}`;
    mesh.receiveShadow=true;scene.add(chunkMesh(mesh));
  }
}

export function updateIntersectionSignals(scene:THREE.Scene,seconds:number):void {
  const lights=scene.userData.intersectionFlashes as THREE.MeshBasicMaterial[]|undefined;
  if(!lights)return;
  const on=seconds%1<.55;
  lights[0]!.color.setHex(on?0xffb321:0x39220a);
  lights[1]!.color.setHex(on?0xff3023:0x310908);
}
