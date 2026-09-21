import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/parking-lot',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:950}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'__ns',{get:()=>api,set(value){
    api=value;window.drawParking=api.view.renderer.render.bind(api.view.renderer);api.view.renderer.setPixelRatio(1);api.view.renderer.render=()=>{};
  }});});
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ns?.view);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    __ns.freeze(true);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {ALDER_PARKING,alderHeight}=await import('/src/sim/alder.ts');
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,1.8);__ns.view.scene.add(fill);
    window.parkingStudy={lot:ALDER_PARKING[0],alderHeight,fill};
  });
  const shots=[];
  for(const [name,x,y,z,tx,ty,tz,lit] of [
    ['overview',-730,40,-1140,-769,2,-1200,true],
    ['night',-730,15,-1150,-770,3,-1198,false],
    ['entrance',-742,4,-1150,-755,3,-1200,false],
    ['aisle',-790,4,-1200,-742,3,-1200,false],
    ['campus',-885,60,-1120,-720,55,-1230,true],
  ]) {
    shots.push(await page.evaluate(({name,x,y,z,tx,ty,tz,lit})=>{
      const {view,sim}=__ns,{alderHeight,fill}=parkingStudy;fill.visible=lit;view.car.visible=false;
      Object.assign(sim.state.vehicle,{x,y:alderHeight(x,z),z,heading:0});
      for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
      view.moon.position.set(-700,180,-1150);view.moon.target.position.set(-776,2,-1200);
      const camera=view.camera.clone();camera.position.set(x,y,z);camera.lookAt(tx,ty,tz);camera.fov=62;camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);drawParking(view.scene,camera);
      return {name,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};
    },{name,x,y,z,tx,ty,tz,lit}));
    await page.screenshot({path:`artifacts/parking-lot/${name}.png`});
  }
  const budget=await page.evaluate(()=>{
    let meshes=0,triangles=0,lights=0;__ns.view.scene.getObjectByName('alder-parking').traverse(o=>{
      if(o.isLight)lights++;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
    });return {meshes,triangles,lights};
  });
  await writeFile('artifacts/parking-lot/check.json',JSON.stringify({shots,budget,errors},null,2));
  assert.deepEqual(errors,[]);assert.ok(budget.meshes<=16);assert.equal(budget.lights,0);assert.ok(budget.triangles<25000);
  console.log(JSON.stringify({shots,budget,errors}));
}finally{await browser.close();}
