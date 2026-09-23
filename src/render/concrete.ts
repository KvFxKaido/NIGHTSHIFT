import * as THREE from "three";

/** Two metres of poured concrete: fine aggregate, pores and soft weathering.
 * World-space UVs keep the grain continuous around rounded curb corners. */
export function concreteMaterial(color: number): THREE.MeshStandardMaterial {
  const size=512, pixels=new Uint8Array(size*size*4);
  let seed=30491;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const lattice=Array.from({length:64},random);
  const noise=(x:number,y:number)=>{
    const gx=x/64,gy=y/64,ix=Math.floor(gx),iy=Math.floor(gy);
    const ease=(v:number)=>v*v*(3-2*v),u=ease(gx-ix),v=ease(gy-iy);
    const at=(dx:number,dy:number)=>lattice[((iy+dy)%8)*8+(ix+dx)%8]!;
    return (at(0,0)*(1-u)+at(1,0)*u)*(1-v)+(at(0,1)*(1-u)+at(1,1)*u)*v;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const pore=random()<.015?18+random()*16:0;
    const grain=(random()-.5)*24;
    const value=220+(noise(x,y)-.5)*7+grain-pore;
    const i=(y*size+x)*4;
    pixels[i]=value;pixels[i+1]=value;pixels[i+2]=value-3;pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,size,size);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.generateMipmaps=true;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.magFilter=THREE.LinearFilter;
  map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=8;map.needsUpdate=true;
  return new THREE.MeshStandardMaterial({color,map,bumpMap:map,bumpScale:.003,roughness:.94,metalness:0});
}
