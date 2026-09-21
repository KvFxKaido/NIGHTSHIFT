import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts/site-grounds',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:950}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'__ns',{get:()=>api,set(value){
    api=value;window.drawGrounds=api.view.renderer.render.bind(api.view.renderer);api.view.renderer.setPixelRatio(1);api.view.renderer.render=()=>{};
  }});});
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ns?.view);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    __ns.freeze(true);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {ALDER_SITE_GROUNDS,alderHeight}=await import('/src/sim/alder.ts');
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,1.8);__ns.view.scene.add(fill);
    const {frontPoint}=await import("/src/sim/building-fronts.ts");
    window.groundsStudy={plans:ALDER_SITE_GROUNDS,frontPoint,alderHeight,fill};
  });
  const shots=[];
  const indices=process.argv.includes('--expanded')?await page.evaluate(()=>[
    'grounds-plot--520.000--715.000','grounds-plot--574.000--805.000',
    'grounds-plot--697.000--929.000','grounds-plot--909.000--1055.000',
    'grounds-plot--180.000-713.000','grounds-plot--112.000-41.000',
  ].map(id=>groundsStudy.plans.findIndex(p=>p.recipe.id===id))):[0,1,2];
  assert.ok(indices.every(i=>i>=0));
  for(const index of indices)for(const angle of ['overview','driver','night']) {
    const name=await page.evaluate(({index,angle})=>{
      const {view,sim}=__ns,{plans,frontPoint,alderHeight,fill}=groundsStudy,plan=plans[index];
      fill.visible=angle!=='night';view.car.visible=false;
      const distance=Math.max(...plan.edge.map(e=>e.depth)),eye=frontPoint(plan.front,angle==='overview'?22:3,distance+(angle==='overview'?10:5));
      Object.assign(sim.state.vehicle,{...eye,y:2,heading:0});
      for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
      const target=frontPoint(plan.front,0,angle==='overview'?10:2);
      view.moon.position.set(eye.x+40,180,eye.z+40);view.moon.target.position.set(target.x,2,target.z);
      const camera=view.camera.clone();camera.position.set(eye.x,angle==='overview'?32:4.5,eye.z);camera.lookAt(target.x,angle==='overview'?2:4,target.z);camera.fov=62;camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);drawGrounds(view.scene,camera);
      return `${plan.recipe.id}-${angle}`;
    },{index,angle});
    await page.screenshot({path:`artifacts/site-grounds/${name}.png`});shots.push(name);
  }
  const budget=await page.evaluate(()=>{
    let meshes=0,triangles=0,lights=0;__ns.view.scene.getObjectByName('alder-site-grounds').traverse(o=>{
      if(o.isLight)lights++;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}
    });return {meshes,triangles,lights};
  });
  await writeFile(`artifacts/site-grounds/${process.argv.includes('--expanded')?'expansion-check':'check'}.json`,JSON.stringify({shots,budget,errors},null,2));
  assert.deepEqual(errors,[]);assert.ok(budget.meshes<=180);assert.equal(budget.lights,0);assert.ok(budget.triangles<80000);
  console.log(JSON.stringify({shots,budget,errors}));
}finally{await browser.close();}
