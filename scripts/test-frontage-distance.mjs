import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const before=process.argv.includes('--before');
await mkdir('artifacts/frontage-distance',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route('**/__frontage-distance',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5173/__frontage-distance');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {addBuildingFronts}=await import('/src/render/building-fronts.ts');
    const {addNightBuildings}=await import('/src/render/night.ts');
    const {buildingWallFrames,frontPoint}=await import('/src/sim/building-fronts.ts');
    const {ALDER_BUILDING_FRONTS}=await import('/src/sim/alder.ts');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,800);document.body.append(renderer.domElement);
    const camera=new THREE.PerspectiveCamera(62,1280/800,.1,650),scene=new THREE.Scene();
    scene.background=new THREE.Color(0x18222b);scene.add(new THREE.HemisphereLight(0xffffff,0x808080,2));
    const cases=[];
    for(const kind of ['shops','residential','office','warehouse']) {
      const original=ALDER_BUILDING_FRONTS.find(p=>p.recipe.kind===kind&&(kind!=='warehouse'||p.recipe.industrialStyle==='workshop'));
      const plan={...original,block:{...original.block,base:0}};
      const fronts=addBuildingFronts(scene,[plan],()=>0);
      const shell=new THREE.Group();scene.add(shell);
      addNightBuildings(shell,[{...plan.block,structuredFrontage:true,frontageHeight:plan.bandHeight,faceDistances:[5,5,5,5]}]);
      // Deliberately high-contrast hidden shell detects even single-pixel leaks.
      shell.traverse(o=>{if(o.isMesh&&o.name.startsWith('district-facades'))o.material=new THREE.MeshBasicMaterial({color:0xff00ff});});
      const wall=buildingWallFrames(plan.block).find(w=>w.side===(plan.recipe.side^1));
      const center=frontPoint(wall,0,0);
      const samples=[];
      // Every part of the ground storey is owned by the new opaque kit.
      const low=.4,high=plan.bandHeight-.3;
      for(const distance of [100,140,180,240,320,480])for(let tick=0;tick<12;tick++) {
        const pos=frontPoint(wall,tick*.017,distance+tick*.013);
        camera.position.set(pos.x,plan.bandHeight/2,pos.z);camera.lookAt(center.x,plan.bandHeight/2,center.z);camera.updateMatrixWorld(true);
        renderer.render(scene,camera);
        const a=frontPoint(wall,-wall.width*.4,0),b=frontPoint(wall,wall.width*.4,0);
        const project=(p,y)=>new THREE.Vector3(p.x,y,p.z).project(camera);
        const p=project(a,low),q=project(b,high);
        const x=Math.ceil((Math.min(p.x,q.x)+1)*640)+1,y=Math.ceil((Math.min(p.y,q.y)+1)*400)+1;
        const width=Math.max(0,Math.floor(Math.abs(q.x-p.x)*640)-2),height=Math.max(0,Math.floor(Math.abs(q.y-p.y)*400)-2);
        const pixels=new Uint8Array(width*height*4),gl=renderer.getContext();
        if(width&&height)gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let leaks=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>180&&pixels[i+2]>180&&pixels[i+1]<80)leaks++;
        samples.push({distance,tick,leaks,pixels:width*height});
      }
      cases.push({kind,leaks:samples.reduce((sum,s)=>sum+s.leaks,0),samples});
      scene.remove(shell,fronts);
    }
    return cases;
  });
  await writeFile(`artifacts/frontage-distance/${before?'before':'after'}.json`,JSON.stringify({result,errors},null,2));
  console.log(JSON.stringify(result.map(({kind,leaks,samples})=>({kind,leaks,sampledPixels:samples.reduce((n,s)=>n+s.pixels,0)}))));
  assert.deepEqual(errors,[]);
  if(!before)assert.ok(result.every(r=>r.leaks===0),'hidden generic walls must never show through cladding');
} finally {await browser.close();}
