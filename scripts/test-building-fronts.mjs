import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts/building-fronts',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'__ns',{get:()=>api,set(value){
    api=value;window.drawFront=api.view.renderer.render.bind(api.view.renderer);api.view.renderer.setPixelRatio(1);api.view.renderer.render=()=>{};
  }});});
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder');
  await page.waitForFunction(()=>window.__ns?.view);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    __ns.freeze(true);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const alder=await import('/src/sim/alder.ts'),{frontPoint}=await import('/src/sim/building-fronts.ts');
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,1.6);__ns.view.scene.add(fill);
    window.frontStudy={alder,frontPoint,fill};
  });
  const shots=[];
  for(const id of ['harbor-supply','bell-row','meridian-house']) {
    for(const mode of ['study','night','driver']) {
      const stats=await page.evaluate(({id,mode})=>{
        const {alder,frontPoint,fill}=frontStudy,{view,sim}=__ns;
        const plan=alder.ALDER_BUILDING_FRONTS.find(p=>p.recipe.id===id);if(!plan)throw Error(`Missing pilot ${id}`);
        fill.visible=mode==='study';
        const distance=mode==='driver'?Math.max(...plan.paving.map(p=>p.leftDepth))+10:25;
        const pos=frontPoint(plan,mode==='driver'?3:5,distance),target=frontPoint(plan,0,0);
        const y=alder.alderHeight(pos.x,pos.z);
        Object.assign(sim.state.vehicle,{x:pos.x,y,z:pos.z,heading:0});view.car.visible=false;
        for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
        const camera=view.camera.clone();camera.position.set(pos.x,y+(mode==='driver'?2.2:5.5),pos.z);
        camera.lookAt(target.x,plan.block.base+3.4,target.z);camera.fov=58;camera.updateProjectionMatrix();
        view.moon.position.set(pos.x+30,y+100,pos.z);view.moon.target.position.set(target.x,plan.block.base,target.z);
        view.sky.position.copy(camera.position);drawFront(view.scene,camera);
        return {id,mode,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};
      },{id,mode});
      shots.push(stats);await page.screenshot({path:`artifacts/building-fronts/${id}-${mode}.png`});
    }
  }
  const budget=await page.evaluate(()=>{
    const {view}=__ns,root=view.scene.getObjectByName('alder-modular-fronts');
    const camera=view.camera.clone();camera.position.set(-44,7,635);camera.lookAt(-44,5,585);camera.updateMatrixWorld();
    const materials=new Set();let triangles=0,meshes=0,lights=0;
    root.traverse(o=>{if(o.isLight)lights++;if(o.isMesh){meshes++;materials.add(o.material);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
    const lods=[];root.traverse(o=>{if(o.isLOD)lods.push(o);});
    const fine=lods.map(lod=>{
      const position=lod.getWorldPosition(camera.position.clone());camera.position.copy(position).addScalar(300);camera.updateMatrixWorld();lod.update(camera);
      return {farFineVisible:lod.levels[0].object.visible};
    });
    return {meshes,materials:materials.size,triangles,lights,fine};
  });
  await writeFile('artifacts/building-fronts/check.json',JSON.stringify({shots,budget,errors},null,2));
  assert.deepEqual(errors,[]);assert.equal(shots.length,9);assert.equal(budget.lights,0);assert.ok(budget.meshes<=21);
  assert.ok(budget.fine.every(l=>!l.farFineVisible));console.log(JSON.stringify({shots,budget,errors}));
} finally { await browser.close(); }
