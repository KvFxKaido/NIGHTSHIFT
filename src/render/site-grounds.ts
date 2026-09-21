import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { frontPoint } from "../sim/building-fronts.ts";
import { groundsRect, type SiteGrounds, type GroundsPatch } from "../sim/site-grounds.ts";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import { asphaltMaterial } from "./asphalt.ts";
import type { ParkedCar } from "../sim/parking-lot.ts";
import { addParkedCars } from "./parking-lot.ts";

/** Small, spatially culled batches; all hard props use the simulation's poses. */
export function addSiteGrounds(scene:THREE.Scene, plans:readonly SiteGrounds[], heightAt:(x:number,z:number)=>number):THREE.Group {
  const root=new THREE.Group();root.name="alder-site-grounds";
  const materials={
    asphalt:asphaltMaterial(0x41494d),
    walk:new THREE.MeshStandardMaterial({color:0x858983,roughness:1}),
    concrete:new THREE.MeshStandardMaterial({color:0x727970,roughness:1}),
    soil:new THREE.MeshStandardMaterial({color:0x292820,roughness:1}),
    foliage:new THREE.MeshStandardMaterial({color:0x425d43,roughness:1,flatShading:true}),
    metal:new THREE.MeshStandardMaterial({color:0x303d43,roughness:.7}),
    wood:new THREE.MeshStandardMaterial({color:0x837763,roughness:.9}),
    paint:new THREE.MeshBasicMaterial({color:0xbfc1b3}),
    yellow:new THREE.MeshBasicMaterial({color:0xb9a065}),
  };
  type Surface=keyof typeof materials;
  const cells=new Map<string,{group:THREE.Group;batches:Map<Surface,THREE.BufferGeometry[]>;cars:ParkedCar[]}>();
  for(const plan of plans) {
    // Preserve standalone studies; a district groups nearby sites by material.
    const key=plans.length<=3?plan.recipe.id:`cell-${Math.floor(plan.front.block.x/256)}-${Math.floor(plan.front.block.z/256)}`;
    let cell=cells.get(key);
    if(!cell){const group=new THREE.Group();group.name=`grounds-${key}`;root.add(group);cell={group,batches:new Map(),cars:[]};cells.set(key,cell);}
    const {batches}=cell;cell.cars.push(...plan.cars);
    const add=(surface:Surface,g:THREE.BufferGeometry)=>{const parts=batches.get(surface)??[];parts.push(g);batches.set(surface,parts);};
    function patch(surface:Surface,p:GroundsPatch,lift:number) {
      const vertices:number[]=[],uvs:number[]=[];
      const nx=Math.max(1,Math.ceil((p.right-p.left)/2)),nz=Math.max(1,Math.ceil((Math.max(p.leftDepth,p.rightDepth)-p.start)/2));
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++) {
        const points=[[i/nx,j/nz],[(i+1)/nx,j/nz],[(i+1)/nx,(j+1)/nz],[i/nx,(j+1)/nz]].map(([u,v])=>
          frontPoint(plan.front,p.left+(p.right-p.left)*u!,p.start+(p.leftDepth+(p.rightDepth-p.leftDepth)*u!-p.start)*v!));
        for(const k of [0,2,1,0,3,2]){const q=points[k]!;vertices.push(q.x,heightAt(q.x,q.z)+lift,q.z);uvs.push(q.x/8,q.z/8);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
      g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();add(surface,g);
    }
    function stripe(surface:Surface,across:number,outward:number,width:number,depth:number) {
      patch(surface,{kind:"walk",left:across-width/2,right:across+width/2,start:outward-depth/2,leftDepth:outward+depth/2,rightDepth:outward+depth/2},.065);
    }
    function box(surface:Surface,b:BuildingBlock) {
      const g=new THREE.BoxGeometry(b.width,b.height,b.depth);g.rotateY(-b.rotation);g.translate(b.x,b.base+b.height/2,b.z);add(surface,g);
    }
    for(const p of plan.patches)patch(p.kind,p,p.kind==="walk"?.04:.022);
    for(const b of plan.wheelStops)box("concrete",b);
    for(const b of plan.planters) {
      box("concrete",b);box("soil",{...b,width:b.width-.3,depth:b.depth-.3,height:.06,base:b.base+b.height});
      // Faceted shrubs break up the rim; no alpha cards or extra light sources.
      const r=plan.recipe.planters[plan.planters.indexOf(b)]!;
      for(let u=-r.width/2+.6;u<r.width/2-.2;u+=.85)for(let v=-r.depth/2+.55;v<r.depth/2-.1;v+=.85) {
        const point=frontPoint(plan.front,r.across+u,r.outward+v);
        const g=new THREE.IcosahedronGeometry(.72,0);g.scale(1,.8,1);g.translate(point.x,b.base+.95,point.z);add("foliage",g);
      }
    }
    for(let i=0;i<plan.benches.length;i++) {
      const b=plan.benches[i]!,r=plan.recipe.benches[i]!;
      box("wood",{...b,height:.13,base:b.base+.42});
      box("wood",{...groundsRect(plan.front,r.across,r.outward-r.depth/2+.09,r.width,.16,.36),base:b.base+.49});
      for(const u of [-r.width*.35,r.width*.35])box("metal",groundsRect(plan.front,r.across+u,r.outward,.12,r.depth,.42));
    }
    const {parking,walkAcross,walkWidth,driveStart,loadingDepth}=plan.recipe;
    for(const across of parking.across) {
      for(const side of [-1,1])stripe("paint",across+side*parking.width/2,parking.outward,.1,parking.depth);
      stripe("paint",across,parking.outward-parking.depth/2,parking.width,.1);
    }
    // Crossing bars keep the pedestrian route legible through the driveway.
    const walkPatch=plan.patches.at(-1)!;
    if(!plan.recipe.surface)for(let v=driveStart+.5;v<Math.min(walkPatch.leftDepth,walkPatch.rightDepth)-.5;v+=1.25)
      stripe("paint",walkAcross,v,walkWidth-.4,.4);
    for(const shutter of plan.front.modules.filter(m=>m.kind==="shutter")) {
      if(!loadingDepth)continue;
      for(const side of [-1,1])stripe("yellow",shutter.x+side*(shutter.width+.8)/2,(loadingDepth+3)/2,.12,loadingDepth-3);
      for(let u=shutter.x-shutter.width/2;u<shutter.x+shutter.width/2;u+=.8)stripe("yellow",u,loadingDepth,.4,.12);
    }
  }
  for(const {group,batches,cars} of cells.values()) {
    for(const [surface,parts] of batches) {
      const g=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());
      const mesh=new THREE.Mesh(g,materials[surface]);mesh.name=`${group.name}-${surface}`;
      mesh.receiveShadow=true;mesh.castShadow=["concrete","wood","metal","foliage"].includes(surface);group.add(mesh);
    }
    addParkedCars(group,cars);
  }
  scene.add(root);return root;
}
