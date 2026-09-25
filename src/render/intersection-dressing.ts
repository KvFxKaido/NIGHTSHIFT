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

/** The same four letters for the road: no margin, so they fill the legend, and every stroke two pixels wide, so a
 *  3 m legend has strokes of about a quarter metre, as painted road letters do. The sign's 1-pixel strokes, stretched
 *  across a lane, came out 10 cm wide and all but vanished at night. */
function roadLetterTexture():THREE.DataTexture {
  const glyphs=['01110100011000001110000011000101110','11111001000010000100001000010000100',
    '01110100011000110001100011000101110','11110100011000111110100001000010000'];
  // A letter is 5 columns, 6 once its strokes are doubled, and a column of road between letters.
  const width=27,height=7,pixels=new Uint8Array(width*height*4);
  glyphs.forEach((glyph,g)=>[...glyph].forEach((v,i)=>{
    if(v!=='1')return;
    const x=i%5,y=Math.floor(i/5);
    for(const dx of [0,1])pixels.set([255,255,255,255],(y*width+g*7+x+dx)*4);
  }));
  const map=new THREE.DataTexture(pixels,width,height);
  map.magFilter=THREE.NearestFilter;map.needsUpdate=true;map.colorSpace=THREE.SRGBColorSpace;
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
  // The same letters as road paint: lit like the bar (white, rough), not glowing like the sign's face.
  const roadLetters=new THREE.MeshStandardMaterial({color:0xd9ddd5,roughness:.95,map:roadLetterTexture(),alphaTest:.5});
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
    if(!a.pole) {
      // No room for a pole (sim/intersection-dressing.ts, the second pass): the paint only.
    } else if(a.control==='signal') {
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
    // A stop with no sign or head to say so says it on the road, read by the car coming up to the bar: traffic stops
    // there (traffic-v10), and the paint is the promise. The sign's own letters, stretched along the lane as road
    // legends are, in the same white as the bar.
    if(!a.pole&&(a.control==='stop'||a.flash==='red')) {
      // 2.4 m of letter along the lane, from 2 m to 4.4 m behind the bar: clear of it, and inside the 4.5 m of asphalt
      // the second pass checked on that side of it.
      const legend=new THREE.PlaneGeometry(Math.min(3.2,a.width/2-.6),2.4,1,1).rotateX(-Math.PI/2).translate(a.width/4,0,3.2);
      legend.applyMatrix4(paintFrame);
      const p=legend.getAttribute('position');
      for(let i=0;i<p.count;i++)p.setY(i,height(p.getX(i),p.getZ(i))+.04);
      legend.computeVertexNormals();put(legend,roadLetters,new THREE.Matrix4());
    }
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
