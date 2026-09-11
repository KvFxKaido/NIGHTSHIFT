import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import type { Street } from "../sim/street-path.ts";
import { glowTexture, tint } from "./night.ts";

export const MARKET_ROW = { x: 700, z: -1480, minX: 570, maxX: 770, minZ: -1550, maxZ: -1385 };
export const isMarketBuilding = (b: BuildingBlock): boolean => b.x >= MARKET_ROW.minX && b.x <= MARKET_ROW.maxX
  && b.z >= MARKET_ROW.minZ && b.z <= MARKET_ROW.maxZ;

// Small reusable painted atlases, not one texture/material per storefront.
// Shadowed reveals and shop interiors are drawn into the art; no extra lights.
function canvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const element = document.createElement("canvas"); element.width = width; element.height = height;
  return element.getContext("2d");
}
function texture(context: CanvasRenderingContext2D | null, repeat = false): THREE.Texture | null {
  if (!context) return null;
  const result = new THREE.CanvasTexture(context.canvas); result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  if (repeat) result.wrapS = result.wrapT = THREE.RepeatWrapping;
  return result;
}
interface MarketTextures { brick: THREE.Texture | null; windows: THREE.Texture | null;
  shops: THREE.Texture | null; shopLight: THREE.Texture | null; pavement: THREE.Texture | null }
let cache: MarketTextures | undefined;
function textures(): MarketTextures {
  if (cache) return cache;
  const brick = canvas(512,512), windows = canvas(512,512);
  if (brick && windows) {
    brick.fillStyle="#493b35"; brick.fillRect(0,0,512,512);
    windows.fillStyle="#000"; windows.fillRect(0,0,512,512);
    for(let row=0;row<32;row++)for(let col=-1;col<9;col++) {
      const shade=(row*17+col*29+300)%4;
      brick.fillStyle=["#795449","#895b4e","#6c4c44","#976453"][shade]!;
      brick.fillRect(col*64+(row%2)*32+2,row*16+2,60,12);
    }
    for(let row=0;row<2;row++)for(let col=0;col<2;col++) {
      const x=col*256+66,y=row*256+40,lit=(row+col)%3!==0;
      brick.fillStyle="#362d2c";brick.fillRect(x-9,y-7,137,170);
      brick.fillStyle=lit?"#b59e78":"#283536";brick.fillRect(x,y,116,147);
      if(lit){windows.fillStyle="#95734a";windows.fillRect(x,y,116,147);}
      for(const context of [brick,windows]) {
        context.fillStyle=context===brick?"#252d2c":"#080908";
        context.fillRect(x+54,y,7,147);context.fillRect(x,y+70,116,7);
        context.fillRect(x+8,y+105,31,42); // a curtain/silhouette, not an empty light box
      }
      brick.fillStyle="#b4a18b";brick.fillRect(x-13,y+150,144,9);
      const shadow=brick.createLinearGradient(0,y+159,0,y+181);
      shadow.addColorStop(0,"#302724");shadow.addColorStop(1,"rgba(48,39,36,0)");
      brick.fillStyle=shadow;brick.fillRect(x-13,y+159,144,23);
    }
  }
  const shops=canvas(1024,768), light=canvas(1024,768);
  const names=["NEEDLE & GROOVE","AFTER HOURS","RAIN CITY BOOKS","ARCADE SUPPLY",
    "NORTHLINE CYCLES","MERCER COFFEE","SOUND & VISION","LATE PLATE"];
  const colors=["#203e39","#713e35","#263f50","#645036"];
  if(shops&&light) {
    light.fillStyle="#000";light.fillRect(0,0,1024,768);
    names.forEach((name,i)=>{
      const x=i%2*512,y=Math.floor(i/2)*192;
      shops.fillStyle=colors[i%4]!;shops.fillRect(x,y,512,192);
      shops.fillStyle="#d2be91";shops.fillRect(x+5,y+7,502,3);
      shops.fillStyle="#1c292c";shops.fillRect(x+12,y+61,488,122);
      for(const context of [shops,light]) {
        context.font="bold 26px sans-serif";context.textAlign="center";
        context.fillStyle=context===shops?"#f0dab0":"#aa8750";context.fillText(name,x+256,y+40,478);
        context.fillStyle=context===shops?"#ac9370":"#49361f";
        for(const left of [24,195,370])context.fillRect(x+left,y+72,135,98);
        context.fillStyle=context===shops?"#363c33":"#080b09";
        for(const left of [24,195]) {
          for(let shelf=0;shelf<3;shelf++) {
            context.fillRect(x+left,y+96+shelf*29,135,5);
            for(let item=0;item<10;item++)context.fillRect(x+left+item*13+3,y+82+shelf*29,7,14);
          }
        }
        context.fillRect(x+370,y+144,135,26);context.fillRect(x+380,y+119,5,16);
      }
      shops.font="10px monospace";shops.textAlign="center";shops.fillStyle="#e7d4a9";
      shops.fillText(i%2?"COFFEE • KITCHEN • OPEN LATE":"INDEPENDENT • CAPITOL HILL",x+256,y+56);
      // Local posters and a recessed threshold share the same atlas tile.
      shops.fillStyle="#c88d67";shops.fillRect(x+336,y+76,20,39);
      shops.fillStyle="#343434";shops.fillRect(x+2,y+182,508,10);
    });
  }
  const pavement=canvas(256,256);
  if(pavement) {
    pavement.fillStyle="#323b40";pavement.fillRect(0,0,256,256);
    for(let i=0;i<900;i++) {
      pavement.fillStyle=i%2?"#41484a":"#283135";
      pavement.fillRect((i*73)%256,(i*113)%256,2,2);
    }
    pavement.strokeStyle="#1c2529";pavement.lineWidth=4;pavement.beginPath();
    pavement.moveTo(12,0);pavement.lineTo(65,76);pavement.lineTo(49,152);pavement.lineTo(97,256);pavement.stroke();
    pavement.strokeStyle="#596065";pavement.lineWidth=2;pavement.strokeRect(6,6,244,244);
  }
  cache={brick:texture(brick,true),windows:texture(windows,true),shops:texture(shops),shopLight:texture(light),pavement:texture(pavement)};
  return cache;
}

/** A facade kit follows the live solid dimensions, including workshop edits.
 * It changes materials and shallow trim, never the building or road footprint. */
export function addCapitolMarket(scene: THREE.Scene, buildings: readonly BuildingBlock[],
  ground: (x:number,z:number)=>number, streets: readonly Street[]): void {
  const art=textures(), walls:THREE.BufferGeometry[]=[], roofs:THREE.BufferGeometry[]=[], fronts:THREE.BufferGeometry[]=[],
    trim:THREE.BufferGeometry[]=[], pools:THREE.BufferGeometry[]=[], patches:THREE.BufferGeometry[]=[], paint:THREE.BufferGeometry[]=[];
  const details=new THREE.Group();details.name="market-row-details";
  const merge=(name:string,parts:THREE.BufferGeometry[],material:THREE.Material,parent:THREE.Object3D=scene)=>{
    if(!parts.length)return;
    const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
    if(!geometry)return;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const groundPanel=(x:number,z:number,width:number,depth:number)=>{
    const geometry=new THREE.PlaneGeometry(width,depth,4,4);geometry.rotateX(-Math.PI/2);
    const p=geometry.getAttribute("position");
    for(let i=0;i<p.count;i++){const px=x+p.getX(i),pz=z+p.getZ(i);p.setXYZ(i,px,ground(px,pz)+.035,pz);}
    geometry.computeVertexNormals();return geometry;
  };
  buildings.forEach((b,i)=>{
    const yaw=-b.rotation, base=b.base;
    const finish=(g:THREE.BufferGeometry)=>{g.rotateY(yaw);g.translate(b.x,0,b.z);return g;};
    const faces=[{x:0,z:b.depth/2,yaw:0,width:b.width},{x:0,z:-b.depth/2,yaw:Math.PI,width:b.width},
      {x:b.width/2,z:0,yaw:Math.PI/2,width:b.depth},{x:-b.width/2,z:0,yaw:-Math.PI/2,width:b.depth}];
    let nearest={x:MARKET_ROW.x,z:b.z},distance=Infinity;
    for(const street of streets)for(let j=1;j<street.points.length;j++) {
      const a=street.points[j-1]!,c=street.points[j]!,dx=c.x-a.x,dz=c.z-a.z;
      const t=Math.max(0,Math.min(1,((b.x-a.x)*dx+(b.z-a.z)*dz)/(dx*dx+dz*dz)));
      const x=a.x+t*dx,z=a.z+t*dz,d=(x-b.x)**2+(z-b.z)**2;
      if(d<distance){distance=d;nearest={x,z};}
    }
    const toward=Math.atan2(nearest.x-b.x,nearest.z-b.z)-yaw;
    const front=faces.reduce((best,f)=>Math.cos(f.yaw-toward)>Math.cos(best.yaw-toward)?f:best);
    for(const f of faces) {
      const panel=new THREE.PlaneGeometry(f.width,b.height),uv=panel.getAttribute("uv");
      for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*f.width/8,uv.getY(j)*b.height/8);
      panel.rotateY(f.yaw);panel.translate(f.x,base+b.height/2,f.z);
      walls.push(tint(finish(panel),new THREE.Color(i%3===0?"#c3bab0":"#ffffff")));
    }
    const roof=new THREE.PlaneGeometry(b.width,b.depth);roof.rotateX(-Math.PI/2);roof.translate(0,base+b.height,0);roofs.push(finish(roof));
    const nx=Math.sin(front.yaw),nz=Math.cos(front.yaw),h=Math.min(5.4,b.height*.65);
    const panel=new THREE.PlaneGeometry(front.width-.3,h),uv=panel.getAttribute("uv"),tile=i%8;
    for(let j=0;j<uv.count;j++)uv.setXY(j,(tile%2+uv.getX(j)*.992+.004)/2,
      (3-Math.floor(tile/2)+uv.getY(j)*.984+.008)/4);
    panel.rotateY(front.yaw);panel.translate(front.x+nx*.035,base+h/2,front.z+nz*.035);fronts.push(finish(panel));
    // Cornices are shallow facade trim, not a new awning the car could hit.
    const cap=new THREE.BoxGeometry(front.width,.18,.12);cap.rotateY(front.yaw);
    cap.translate(front.x,base+h+.1,front.z);trim.push(finish(cap));
    const localX=front.x+nx*3,localZ=front.z+nz*3;
    const wx=b.x+localX*Math.cos(yaw)+localZ*Math.sin(yaw),wz=b.z-localX*Math.sin(yaw)+localZ*Math.cos(yaw);
    if(Math.abs(ground(wx,wz)-base)<1.5)pools.push(groundPanel(wx,wz,9,9));
  });
  const wall=merge("market-row-brick",walls,new THREE.MeshStandardMaterial({map:art.brick,emissiveMap:art.windows,
    color:art.brick?0xffffff:0x80584b,vertexColors:true,emissive:0xffffff,emissiveIntensity:.75,roughness:.92}));
  if(wall)wall.castShadow=true;
  merge("market-row-roofs",roofs,new THREE.MeshStandardMaterial({color:0x343b3c,roughness:1}));
  merge("market-row-storefronts",fronts,new THREE.MeshStandardMaterial({map:art.shops,emissiveMap:art.shopLight,
    color:art.shops?0xffffff:0x63735d,emissive:0xffffff,emissiveIntensity:1.2,roughness:.7}),details);
  merge("market-row-cornices",trim,new THREE.MeshStandardMaterial({color:0xb5a38a,roughness:.85}),details);
  merge("market-row-shop-light",pools,new THREE.MeshBasicMaterial({color:0xf1b574,map:glowTexture(),
    transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),details);
  for(const [x,z,w,d] of [[702,-1510,3.8,8],[698,-1473,3.5,6],[702,-1436,3.8,9]])patches.push(groundPanel(x!,z!,w!,d!));
  merge("market-row-road-repairs",patches,new THREE.MeshStandardMaterial({map:art.pavement,roughness:.94,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),details);
  for(let i=0;i<6;i++)paint.push(groundPanel(695.5+i*1.8,-1394,1.1,3));
  merge("market-row-crosswalk",paint,new THREE.MeshStandardMaterial({color:0xbeb9a5,roughness:1,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),details);
  const lod=new THREE.LOD();lod.name="market-row-detail-distance";lod.position.set(MARKET_ROW.x,36,MARKET_ROW.z);
  details.position.copy(lod.position).multiplyScalar(-1);lod.addLevel(details,0);lod.addLevel(new THREE.Group(),320,.1);scene.add(lod);
}
