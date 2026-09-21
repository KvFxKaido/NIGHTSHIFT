import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { frontPoint, type FrontPlan, type FrontModule } from "../sim/building-fronts.ts";
import { tint } from "./night.ts";

/** One atlas for the pilot's tenant identities; mipmaps naturally retain the
 * sign's colour/composition when its lettering becomes subpixel at distance. */
function signAtlas(signs: readonly FrontModule[]): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas=document.createElement("canvas");canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="#192227";ctx.fillRect(0,0,canvas.width,canvas.height);
  signs.forEach((sign,i)=>{
    const width=128*sign.width/sign.height;
    ctx.save();ctx.translate((i%2)*512,Math.floor(i/2)*64);ctx.scale(512/width,.5);ctx.fillStyle=sign.color??"#d4d2c8";
    // Simple house mark and an inset keyline leave a dark margin against bloom.
    ctx.fillRect(8,24,3,80);ctx.fillRect(8,101,width-16,3);
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.font="600 48px sans-serif";ctx.fillText(sign.text??"",width/2,49,width-36);
    ctx.font="500 20px sans-serif";ctx.fillStyle="#a9b3b3";ctx.fillText(sign.caption??"",width/2,85,width-30);
    ctx.restore();
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

/** Frames, ribs, signs and access all read the same facade plan. No extra lights,
 * no full model replacement, and repeated parts merge by material per building. */
export function addBuildingFronts(scene: THREE.Scene, plans: readonly FrontPlan[],
  heightAt: (x:number,z:number)=>number): THREE.Group {
  const root=new THREE.Group();root.name="alder-modular-fronts";
  const concrete=new THREE.MeshStandardMaterial({color:0x555c60,roughness:.93});
  const metal=new THREE.MeshStandardMaterial({color:0x313c42,roughness:.8});
  const glass=new THREE.MeshStandardMaterial({color:0x243741,emissive:0x152129,emissiveIntensity:.35,roughness:.38});
  const luminous=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const signs=plans.flatMap(p=>p.modules.filter(m=>m.kind==="sign"||m.kind==="blade"));
  const unique:FrontModule[]=[],indices=new Map<string,number>(),signIndices=new Map<FrontModule,number>();
  for(const sign of signs) {
    const key=JSON.stringify([sign.text,sign.caption,sign.color,sign.width/sign.height]);
    if(!indices.has(key)){indices.set(key,unique.length);unique.push(sign);}
    signIndices.set(sign,indices.get(key)!);
  }
  const lettering:THREE.MeshBasicMaterial[]=[];
  for(let i=0;i<unique.length;i+=32) {
    const atlas=signAtlas(unique.slice(i,i+32));
    const material=new THREE.MeshBasicMaterial({map:atlas,color:atlas?0xffffff:0xaebcaf,toneMapped:false});
    material.name="front-sign-atlas";lettering.push(material);
  }
  root.userData.signAtlases=lettering.length;
  const pavingMaterial=new THREE.MeshStandardMaterial({color:0x4f575b,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const fineMaterial=new THREE.MeshStandardMaterial({color:0x737e82,roughness:.8});
  fineMaterial.onBeforeCompile=shader=>{
    shader.vertexShader=`varying float vFrontDistance;\n${shader.vertexShader}`.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nvFrontDistance = distance(cameraPosition, modelMatrix[3].xyz);");
    shader.fragmentShader=`varying float vFrontDistance;\n${shader.fragmentShader}`.replace("#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
       float coverage = 1.0 - smoothstep(100.0, 160.0, vFrontDistance);
       float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
       if (coverage <= threshold) discard;`);
  };
  fineMaterial.customProgramCacheKey=()=>"frontage-fine-v1";
  for (const plan of plans) {
    const site=new THREE.Group();site.name=`front-${plan.recipe.id}`;site.userData.recipe=plan.recipe.id;
    site.position.set(plan.block.x,plan.block.base,plan.block.z);site.rotation.y=-plan.block.rotation;
    const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),fine:THREE.BufferGeometry[]=[];
    const record=(geometry:THREE.BufferGeometry,material:THREE.Material)=>{
      const parts=batches.get(material)??[];parts.push(geometry);batches.set(material,parts);
    };
    const place=(geometry:THREE.BufferGeometry,x:number,y:number,z:number)=>{
      geometry.translate(x,y,z);geometry.rotateY(plan.turn);geometry.translate(plan.wallX,0,plan.wallZ);return geometry;
    };
    function box(material:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,detail=false,color?:string) {
      const geometry=place(new THREE.BoxGeometry(w,h,d),x,y,z);
      if(color)tint(geometry,new THREE.Color(color));
      if(detail)fine.push(geometry);else record(geometry,material);
    }
    const frame=(x:number,y:number,w:number,h:number)=>{
      for(const edge of [-1,1])box(concrete,x+edge*(w/2+.07),y,.17,.14,h+.16,.2);
      box(concrete,x,y+h/2+.07,.17,w+.28,.14,.2);
    };
    // Opaque ground-storey cladding masks the generic window row underneath.
    box(concrete,0,plan.bandHeight/2,.025,plan.width-.06,plan.bandHeight,.045);
    box(metal,0,.15,.07,plan.width-.12,.3,.09);
    box(metal,0,plan.bandHeight-.06,.07,plan.width-.12,.12,.1);
    for(const module of plan.modules) {
      const {kind,x,y,width:w,height:h}=module;
      if(kind==="door") {
        frame(x,y,w,h);
        box(metal,x,y,.105,w,h,.08);
        box(glass,x,y+.12,.155,w-.2,h-.58,.035);
        box(metal,x,y-.87,.19,w,.13,.07);
        box(concrete,x,.035,.18,w+.18,.07,.36);
        const double=w>2;
        if(double)box(metal,x,y,.185,.09,h,.08);
        for(const side of double?[-1,1]:[1])box(fineMaterial,x+(double?side*.17:w*.31),1.25,.25,.04,.42,.08,true);
      } else if(kind==="glazing") {
        frame(x,y,w,h);box(glass,x,y,.11,w,h,.035);
        box(metal,x,y,.15,.09,h,.09);
        box(metal,x,y+h*.25,.16,w,.07,.1);
        // Dim interior bands and shelves give glazing depth without an interior mesh.
        box(luminous,x,y+h*.34,.135,w-.2,.14,.008,false,plan.recipe.kind==="office"?"#687777":"#9d9077");
        box(fineMaterial,x,y-h*.25,.18,w-.18,.04,.035,true);
      } else if(kind==="shutter") {
        frame(x,y,w,h);box(metal,x,y,.10,w,h,.08);
        box(concrete,x,y+h/2+.19,.23,w+.4,.28,.42);
        for(let rib=.2;rib<h;rib+=.23)box(fineMaterial,x,y-h/2+rib,.16,w-.12,.038,.025,true);
        box(fineMaterial,x,.55,.20,.55,.045,.07,true);
      } else if(kind==="sign"||kind==="blade") {
        const blade=kind==="blade",depth=blade?w/2+.4:.23;
        box(metal,x,y,depth,blade?.18:w+.16,h+.14,blade?w+.16:.24);
        for(const side of blade?[-1,1]:[0]) {
          const index=signIndices.get(module)!,tile=index%32;
          const face=new THREE.PlaneGeometry(w,h),uv=face.getAttribute("uv");
          for(let i=0;i<uv.count;i++)uv.setXY(i,(tile%2+uv.getX(i))/2,1-(Math.floor(tile/2)+1-uv.getY(i))/16);
          if(blade)face.rotateY(side*Math.PI/2);
          record(place(face,x+side*.1,y,blade?depth:.36),lettering[Math.floor(index/32)]!);
        }
        if(blade)for(const dy of [-1,1])box(fineMaterial,x,y+dy*h*.32,.22,.10,.08,.44,true);
        else for(const dx of [-1,1])box(fineMaterial,x+dx*w*.4,y,.10,.08,h+.3,.18,true);
      } else if(kind==="canopy") {
        // Shallow, cantilevered canopy stays above the car's clearance envelope.
        box(metal,x,y,.55,w,h,1.1);
        box(concrete,x,y+.05,1.08,w,.055,.08);
        for(const dx of [-1,1])box(fineMaterial,x+dx*w*.4,y-.18,.3,.07,.36,.55,true);
      } else {
        const canopy=plan.modules.some(m=>m.kind==="canopy"&&m.owner===module.owner);
        const depth=canopy?1.05:.3;
        box(metal,x,y,depth-.04,w+.13,h+.1,.1);
        box(luminous,x,y,depth+.02,w,h,.035,false,module.color??"#dfe7ef");
      }
    }
    for(const [material,parts] of batches) {
      const mesh=new THREE.Mesh(mergeGeometries(parts)!,material);parts.forEach(p=>p.dispose());
      mesh.name=material.name==="front-sign-atlas"?"front-tenant-signs":"front-architecture";site.add(mesh);
    }
    const lod=new THREE.LOD();lod.name="front-fine-lod";
    if(fine.length){const mesh=new THREE.Mesh(mergeGeometries(fine)!,fineMaterial);fine.forEach(p=>p.dispose());lod.addLevel(mesh,0);}
    lod.addLevel(new THREE.Group(),180,.08);site.add(lod);root.add(site);

    const vertices:number[]=[];
    for(const strip of plan.paving) {
      const steps=Math.ceil(Math.max(strip.leftDepth,strip.rightDepth));
      for(let j=0;j<steps;j++) {
        const points=[[strip.left,strip.leftDepth*j/steps],[strip.right,strip.rightDepth*j/steps],
          [strip.right,strip.rightDepth*(j+1)/steps],[strip.left,strip.leftDepth*(j+1)/steps]];
        for(const i of [0,2,1,0,3,2]) {
          const p=frontPoint(plan,points[i]![0]!,points[i]![1]!);vertices.push(p.x,heightAt(p.x,p.z)+.018,p.z);
        }
      }
    }
    // Orientation flips with a facade's local basis; normalize winding upward.
    const paving=new THREE.BufferGeometry();paving.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));paving.computeVertexNormals();
    if(paving.getAttribute("normal").getY(0)<0) {
      for(let i=0;i<vertices.length;i+=9)for(let axis=0;axis<3;axis++) {
        const v=vertices[i+3+axis]!;vertices[i+3+axis]=vertices[i+6+axis]!;vertices[i+6+axis]=v;
      }
      paving.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));paving.computeVertexNormals();
    }
    const apron=new THREE.Mesh(paving,pavingMaterial);apron.name=`front-paving-${plan.recipe.id}`;apron.receiveShadow=true;root.add(apron);
  }
  // Core architecture batches geographically; only tiny distance-faded details
  // keep their own building LOD. The three-site study can still inspect each kit.
  if(plans.length>3)batchFrontageCore(root);
  scene.add(root);return root;
}

function batchFrontageCore(root:THREE.Group):void {
  root.updateMatrixWorld(true);
  const batches=new Map<string,{material:THREE.Material;receiveShadow:boolean;parts:THREE.BufferGeometry[]}>();
  const meshes:THREE.Mesh[]=[];
  root.traverse(o=>{if(o instanceof THREE.Mesh&&!(o.parent instanceof THREE.LOD))meshes.push(o);});
  for(const mesh of meshes) {
    const material=mesh.material as THREE.Material,geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();const center=geometry.boundingBox!.getCenter(new THREE.Vector3());
    const key=`${Math.floor(center.x/256)},${Math.floor(center.z/256)}:${material.uuid}:${mesh.receiveShadow}`;
    const batch=batches.get(key)??{material,receiveShadow:mesh.receiveShadow,parts:[]};
    batch.parts.push(geometry);batches.set(key,batch);mesh.removeFromParent();mesh.geometry.dispose();
  }
  for(const [key,batch] of batches) {
    const mesh=new THREE.Mesh(mergeGeometries(batch.parts)!,batch.material);batch.parts.forEach(g=>g.dispose());
    mesh.name=`front-core-cell:${key}`;mesh.receiveShadow=batch.receiveShadow;root.add(mesh);
  }
}
