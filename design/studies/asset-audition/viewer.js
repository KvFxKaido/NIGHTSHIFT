import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {setLook} from '../../../src/render/cel.ts';
import {drawnBuilding} from '../../../src/render/drawn-buildings.ts';
import {BUILDING_PALETTES} from '../../../src/render/building-palette.ts';
setLook('cel-city');
const inventory=await fetch('/inspiration/buildings-streets-pack/audition/inventory.json').then(r=>r.json());
const rigs=[...document.querySelectorAll('canvas')].map((canvas,i)=>{
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 const scene=new THREE.Scene();scene.background=new THREE.Color(i===2?0x090f18:0x263440);
 const camera=new THREE.PerspectiveCamera(38,1,.01,1000);
 const hemi=new THREE.HemisphereLight(i===2?0x466488:0xdce8ff,i===2?0x160e12:0x34302a,i===2?.46:2);scene.add(hemi);
 const key=new THREE.DirectionalLight(i===2?0xa9d2ff:0xffffff,i===2?.62:3);key.position.set(-10,15,12);scene.add(key);
 if(i===2){scene.add(new THREE.HemisphereLight(0x9abbd0,0x39444c,1));renderer.toneMappingExposure=1.05;}
 else {const fill=new THREE.DirectionalLight(0x7698ce,.7);fill.position.set(10,7,-10);scene.add(fill);}
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x20282c,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.015;scene.add(ground);
 return {renderer,scene,camera,model:null};
});
const controls=new OrbitControls(rigs[0].camera,rigs[0].renderer.domElement);controls.enableDamping=false;
let flatNormals=false;
const normalButton=document.createElement('button');normalButton.textContent='Try flat face normals';normalButton.setAttribute('aria-pressed','false');document.querySelector('#choices').append(normalButton);
normalButton.onclick=()=>{flatNormals=!flatNormals;normalButton.setAttribute('aria-pressed',String(flatNormals));for(const rig of rigs)rig.model?.traverse(m=>{if(m.isMesh){m.material.flatShading=flatNormals;m.material.needsUpdate=true;}});draw();};
let framing;let current;
const findings={shop_front14:'Shopfront: door, display window and recesses survive; much of its depth is the room behind. Sign lettering, tile and color identity disappear. Source normals produce diagonal cel bands; try flat face normals.',warehouse_front:'Warehouse: a very shallow relief panel. Door divisions survive, but brick, corrugation and painted-metal identity depend on texture. This is not a warehouse shell.',apartment_block8:'Apartment: repeated window frames, recesses and balcony forms survive. This is a facade section, not a complete apartment building; the brick surface is photographic.'};
function reset(){rigs[0].camera.position.copy(framing.position);controls.target.copy(framing.target);controls.update();}
async function select(id){
 window.auditionReady=false;
 const gltf=await new GLTFLoader().loadAsync(`/inspiration/buildings-streets-pack/audition/${id}.glb`);
 const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
 const target=bounds.getCenter(new THREE.Vector3());
 const span=Math.max(size.x,size.y*1.15);const distance=span*1.65+size.z*.7;
 framing={target,position:target.clone().add(new THREE.Vector3(distance*.28,distance*.12,distance))};
 for(const [i,rig] of rigs.entries()){
  if(rig.model)rig.scene.remove(rig.model);
  const model=gltf.scene.clone(true);
  model.traverse(mesh=>{if(!mesh.isMesh)return;
   if(i>0){const original=mesh.material;const glass=/glass/i.test(original.name);const palette=BUILDING_PALETTES[1];mesh.material=drawnBuilding(new THREE.MeshStandardMaterial({name:`audition-${glass?'glass':'wall'}`,color:glass?0x15242f:palette.wall,roughness:glass?.35:.82,metalness:0,side:THREE.DoubleSide}));}
   mesh.material.flatShading=flatNormals;
  });rig.scene.add(model);rig.model=model;
 }
 current=id;reset();document.querySelectorAll('[data-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
 const record=inventory.find(r=>r.name===id);
 document.querySelector('#stats').textContent=`${id} · ${record.triangles.toLocaleString()} triangles · ${size.x.toFixed(2)} wide × ${size.y.toFixed(2)} tall × ${size.z.toFixed(2)} deep (source scale)`;
 document.querySelector('#finding').textContent=findings[id];
 await Promise.all(rigs.map(r=>r.renderer.compileAsync(r.scene,r.camera)));
 draw();window.auditionReady=true;
}
function draw(){for(const rig of rigs){const canvas=rig.renderer.domElement,w=canvas.clientWidth,h=w/1.15;if(canvas.width!==Math.round(w)||canvas.height!==Math.round(h))rig.renderer.setSize(w,h,false);if(rig!==rigs[0]){rig.camera.position.copy(rigs[0].camera.position);rig.camera.quaternion.copy(rigs[0].camera.quaternion);}rig.camera.aspect=w/h;rig.camera.updateProjectionMatrix();rig.renderer.render(rig.scene,rig.camera);}}
controls.addEventListener('change',draw);window.addEventListener('resize',draw);
document.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>select(b.dataset.id));document.querySelector('#reset').onclick=reset;
window.audition={select,reset,stats:()=>rigs.map(r=>({calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles})),current:()=>current};
await select('shop_front14');
