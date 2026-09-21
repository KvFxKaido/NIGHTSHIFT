import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/brick-corner', { recursive: true });
const browser = await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page = await browser.newPage({viewport:{width:1400,height:900}});
  page.setDefaultTimeout(90000);
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let api;
    Object.defineProperty(window,'__ns',{get:()=>api,set(value){
      api=value; window.drawBrick=api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1); api.view.renderer.render=()=>{};
    }});
  });
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder');
  await page.waitForFunction(()=>window.__ns?.view); await page.keyboard.press('Escape');
  const report=await page.evaluate(async()=>{
    __ns.freeze(true);
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {ALDER_BLOCKS,alderHeight,ALDER_STREETS}=await import('/src/sim/alder.ts');
    const {isBrickCorner}=await import('/src/render/brick-corner.ts');
    const block=ALDER_BLOCKS.find(b=>isBrickCorner(b)&&b.height===10),{view,sim}=__ns;
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,2.2); view.scene.add(fill);
    Object.assign(sim.state.vehicle,{x:block.x+17,z:block.z+18,y:alderHeight(block.x+17,block.z+18),heading:0});
    view.car.position.set(sim.state.vehicle.x,sim.state.vehicle.y,sim.state.vehicle.z);
    for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
    view.moon.position.set(block.x-90,block.base+140,block.z+80);view.moon.target.position.set(block.x,block.base,block.z);
    view.sky.position.set(block.x,block.base,block.z);
    window.brickStudy={block,fill,alderHeight,street:ALDER_STREETS.find(s=>s.id==='sea-east-98')};
    const group=view.scene.children.find(g=>g.name==='alder-brick-corner'&&g.position.z===block.z);
    return {block,meshes:group.children.length,triangles:group.children.reduce((n,m)=>n+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0)};
  });
  for(const [name,x,y,z,lit] of [['study',29,14,30,true],['night',29,11,30,false],['approach',34,3,47,false],['service',-26,9,-29,true],['block',65,64,85,true],['alley',-13,3,42,true]]) {
    await page.evaluate(({name,x,y,z,lit})=>{
      const {block,fill}=brickStudy,{view}=__ns;
      fill.visible=lit;
      view.camera.position.set(block.x+x,block.base+y,block.z+z);view.camera.lookAt(name==='alley'?block.x-13:block.x,block.base+4.4,block.z);
      view.camera.fov=48;view.camera.updateProjectionMatrix();drawBrick(view.scene,view.camera);
    },{name,x,y,z,lit});
    await page.screenshot({path:`artifacts/brick-corner/${name}.png`});
  }
  const performance=await page.evaluate(measure=>{
    const {block,fill,street,alderHeight}=brickStudy,{view,sim}=__ns;
    fill.visible=false;
    const a=street.points[0],b=street.points[1],length=Math.hypot(b.x-a.x,b.z-a.z);
    const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
    const x=a.x-uz*3,z=a.z+ux*3,y=alderHeight(x,z);
    Object.assign(sim.state.vehicle,{x,y,z,heading:Math.atan2(-ux,-uz)});
    view.car.position.set(x,y,z);view.car.rotation.set(0,sim.state.vehicle.heading,0);
    view.camera.position.set(x-ux*6,y+2.6,z-uz*6);
    view.camera.lookAt(x+ux*34,y+2.2,z+uz*34);view.camera.fov=58;view.camera.updateProjectionMatrix();
    const groups=view.scene.children.filter(g=>g.name==='alder-brick-corner'||g.name==='alder-market-block'),gl=view.renderer.getContext();
    const result=[];
    for(const visible of [true,false]) {
      groups.forEach(group=>group.visible=visible);
      const times=[];
      for(let i=0;i<(measure?35:1);i++){const t=performance.now();drawBrick(view.scene,view.camera);gl.finish();if(i>=5)times.push(performance.now()-t);}
      times.sort((a,b)=>a-b);
      result.push({visible,medianMs:times[15]??null,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles});
    }
    groups.forEach(group=>group.visible=true);drawBrick(view.scene,view.camera);
    return result;
  },process.env.BRICK_MEASURE==='1');
  await page.screenshot({path:'artifacts/brick-corner/driving.png'});
  assert.equal(report.meshes,9);assert.ok(report.triangles<15000);assert.deepEqual(errors,[]);
  await writeFile('artifacts/brick-corner/check.json',JSON.stringify({...report,performance,errors},null,2));console.log(JSON.stringify({...report,performance,errors}));
}finally{await browser.close();}
