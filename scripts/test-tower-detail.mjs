import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/tower-detail',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'__ns',{get:()=>api,set(value){
    api=value;window.drawTower=api.view.renderer.render.bind(api.view.renderer);api.view.renderer.setPixelRatio(1);api.view.renderer.render=()=>{};
  }});});
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder');
  await page.waitForFunction(()=>window.__ns?.view);await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    __ns.freeze(true);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {ALDER_BLOCKS,alderHeight}=await import('/src/sim/alder.ts');
    const {view,sim}=__ns,block=ALDER_BLOCKS.find(b=>b.x===-248&&b.z===-395);
    const root=view.scene.getObjectByName('alder-tower-details');
    const target=root.children.find(l=>l.position.x===block.x&&l.position.z===block.z);
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,1.7);view.scene.add(fill);
    view.moon.position.set(block.x-90,block.base+140,block.z+80);view.moon.target.position.set(block.x,block.base,block.z);
    Object.assign(sim.state.vehicle,{x:block.x-30,z:block.z+35,y:alderHeight(block.x-30,block.z+35),heading:0});
    view.car.position.set(sim.state.vehicle.x,sim.state.vehicle.y,sim.state.vehicle.z);
    for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
    view.sky.position.set(block.x,block.base,block.z);
    window.towerStudy={block,root,target,fill};
  });
  for(const [name,x,y,z,lit] of [['near',-42,16,55,true],['night',-42,16,55,false],['roof',-42,90,55,true],['street',-32,3,44,false],['far',-220,35,240,false]]) {
    await page.evaluate(({x,y,z,lit})=>{const {block,fill}=towerStudy,{view}=__ns;fill.visible=lit;
      view.camera.position.set(block.x+x,block.base+y,block.z+z);view.camera.lookAt(block.x,block.base+block.height*.5,block.z);
      view.sky.position.copy(view.camera.position);
      view.camera.fov=65;view.camera.updateProjectionMatrix();drawTower(view.scene,view.camera);
    },{x,y,z,lit});
    await page.screenshot({path:`artifacts/tower-detail/${name}.png`});
  }
  const comparisons=await page.evaluate(()=>{
    const {block,root,target,fill}=towerStudy,{view}=__ns;fill.visible=true;
    root.children.forEach(l=>l.visible=l===target);
    const report=[];
    for(const distance of [80,160,215,270]) {
      view.camera.position.set(block.x-distance*.6,block.base+35,block.z+distance*.8);
      view.sky.position.copy(view.camera.position);
      view.camera.lookAt(block.x,block.base+block.height*.4,block.z);view.camera.updateProjectionMatrix();
      const samples=[];
      for(const enabled of [false,true]) {
        root.visible=enabled;drawTower(view.scene,view.camera);
        samples.push({image:view.renderer.domElement.toDataURL(),calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles});
      }
      report.push({distance,pixelsIdentical:samples[0].image===samples[1].image,
        detailCalls:samples[1].calls-samples[0].calls,detailTriangles:samples[1].triangles-samples[0].triangles});
    }
    root.visible=true;root.children.forEach(l=>l.visible=true);
    return report;
  });
  await writeFile('artifacts/tower-detail/check.json',JSON.stringify({comparisons,errors},null,2));console.log(JSON.stringify({comparisons,errors}));
  assert.equal(comparisons[0].pixelsIdentical,false,'near architecture must be visible');
  assert.equal(comparisons[2].pixelsIdentical,true,'completed fade must preserve every far pixel');
  assert.equal(comparisons[3].pixelsIdentical,true,'distant silhouette and windows must be identical');
  assert.equal(comparisons[3].detailCalls,0,'distant detail must not submit draws');
  assert.deepEqual(errors,[]);
  if(process.env.TOWER_MEASURE==='1') {
    const timings=await page.evaluate(()=>{
      const {block,root}=towerStudy,{view}=__ns,gl=view.renderer.getContext();
      view.camera.position.set(block.x-42,block.base+16,block.z+55);
      view.camera.lookAt(block.x,block.base+block.height*.5,block.z);view.sky.position.copy(view.camera.position);
      const samples=[[],[]],counts=[];
      for(let frame=0;frame<35;frame++) for(const enabled of frame%2?[true,false]:[false,true]) {
        root.visible=enabled;const start=performance.now();drawTower(view.scene,view.camera);gl.finish();
        if(frame>=5)samples[Number(enabled)].push(performance.now()-start);
        counts[Number(enabled)]={calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};
      }
      root.visible=true;
      return samples.map((times,i)=>{times.sort((a,b)=>a-b);return {detail:!!i,medianMs:times[15],p95Ms:times[28],...counts[i]};});
    });
    await writeFile('artifacts/tower-detail/timing.json',JSON.stringify(timings,null,2));console.log(JSON.stringify({timings}));
  }
}finally{await browser.close();}
