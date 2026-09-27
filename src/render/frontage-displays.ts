import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { FrontModule, FrontPlan } from "../sim/building-fronts.ts";
import { tint } from "./night.ts";
import { addPlaceActivity } from "./place-activity.ts";

/** Shallow window tableaux, like the open docks: all geometry stays between
 * glazing and mullions. They imply occupation without adding an enterable room,
 * obstacles, lights, or simulation state. Each window keeps local culling bounds. */
export const LAUNDRY_PERIOD = 8;

/** Two washers tumble at different speeds while two drums wait for a customer.
 * Read only the simulation clock: freezing or revisiting a time is exact. */
export function laundryDrumAngle(seconds: number, drum: number): number {
  const phase = ((seconds % LAUNDRY_PERIOD) + LAUNDRY_PERIOD) % LAUNDRY_PERIOD;
  return drum === 0 ? phase * Math.PI / 2 : drum === 3 ? -phase * Math.PI / 4 + .8 : .4 + drum;
}

export function createLaundryDisplay(module: FrontModule): { group: THREE.Group; update(seconds: number): void } {
  const group = new THREE.Group(); group.name = "front-laundry-display";
  group.position.set(module.x,module.y,.132);
  // Fit a 4.6 x 2.25 m drawing to the existing opening with a margin on every edge.
  const scale = Math.min((module.width-.16)/4.6,(module.height-.16)/2.25);
  group.scale.set(scale,scale,1);
  const material = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const staticParts: THREE.BufferGeometry[] = [];
  const put = (geometry: THREE.BufferGeometry,x:number,y:number,z:number,color:string,parts=staticParts) => {
    geometry.translate(x,y,z);parts.push(tint(geometry,new THREE.Color(color)));
  };
  const panel = (x:number,y:number,z:number,w:number,h:number,color:string,parts=staticParts) =>
    put(new THREE.PlaneGeometry(w,h),x,y,z,color,parts);
  const merge = (parts:THREE.BufferGeometry[],name:string) => {
    const mesh = new THREE.Mesh(mergeGeometries(parts)!,material);mesh.name=name;
    parts.forEach(p=>p.dispose());return mesh;
  };
  panel(0,0,0,4.6,2.25,"#787763");
  panel(0,.99,.001,4.4,.075,"#e0dbc5");
  panel(0,-.99,.001,4.4,.15,"#454c49");
  // Stacked machines leave the centre mullion clear; simple cream cabinets and
  // large dark circles remain recognizable when lettering is too small to read.
  const rotors:THREE.Mesh[]=[];
  for(let i=0;i<4;i++) {
    const x=i%2===0?-1.12:1.12,y=i<2?.43:-.43;
    panel(x,y,.002,1.76,.80,"#b4b5a8");
    panel(x,y+.32,.003,1.60,.075,"#4b5553");
    panel(x+.62,y+.32,.004,.08,.035,i===0||i===3?"#c9a76f":"#68706a");
    put(new THREE.CircleGeometry(.32,24),x,y-.04,.004,"#343e40");
    put(new THREE.RingGeometry(.32,.36,24),x,y-.04,.005,"#d2d2bf");
    const cloth:THREE.BufferGeometry[]=[];
    // Asymmetric cloth shapes make rotation visible without flashing light.
    put(new THREE.CircleGeometry(.13,6),.12,.05,0,"#aaa6c0",cloth);
    put(new THREE.CircleGeometry(.095,5),-.10,-.13,0,"#d5c5a0",cloth);
    panel(-.08,.13,0,.13,.08,"#71846f",cloth);
    const rotor=merge(cloth,`laundry-drum-${i}`);rotor.position.set(x,y-.04,.006);
    group.add(rotor);rotors.push(rotor);
  }
  group.add(merge(staticParts,"laundry-cabinets"));
  const update=(seconds:number)=>rotors.forEach((rotor,i)=>{rotor.rotation.z=laundryDrumAngle(seconds,i);});
  update(0);
  return {group,update};
}

export function addFrontageDisplays(scene:THREE.Scene,root:THREE.Group,plans:readonly FrontPlan[]):void {
  const updates:((seconds:number)=>void)[]=[];
  for(const plan of plans) {
    const modules=plan.modules.filter(m=>m.display==="laundry");
    if(!modules.length)continue;
    const site=new THREE.Group();site.name=`front-displays-${plan.recipe.id}`;
    site.position.set(plan.block.x,plan.block.base,plan.block.z);site.rotation.y=-plan.block.rotation;
    const wall=new THREE.Group();wall.position.set(plan.wallX,0,plan.wallZ);wall.rotation.y=plan.turn;
    for(const module of modules) {
      const display=createLaundryDisplay(module);wall.add(display.group);updates.push(display.update);
    }
    site.add(wall);root.add(site);
  }
  if(!updates.length)return;
  // Each frontage root owns its activity. Removing an editor preview releases
  // its callback without stopping other roots; reattaching resumes its activity.
  const key=`frontage-displays-${root.uuid}`;
  const activity=(seconds:number)=>{for(const update of updates)update(seconds);};
  root.addEventListener("added",()=>addPlaceActivity(scene,key,activity));
  root.addEventListener("removed",()=>{
    const places=scene.userData.placeActivity as Map<string,unknown>|undefined;
    places?.delete(key);
  });
}
