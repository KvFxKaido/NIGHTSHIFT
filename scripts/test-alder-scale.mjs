import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts/alder-scale',{recursive:true});
const browser=await chromium.launch({args:['--use-angle=d3d11']});
try {
  const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'__ns',{get:()=>api,set(value){
    api=value;window.drawScale=api.view.renderer.render.bind(api.view.renderer);api.view.renderer.setPixelRatio(1);api.view.renderer.render=()=>{};
  }});});
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder');
  await page.waitForFunction(()=>window.__ns?.view);await page.keyboard.press('Escape');
  const setup=await page.evaluate(async()=>{
    __ns.freeze(true);document.querySelectorAll('body > :not(canvas):not(script)').forEach(e=>e.style.visibility='hidden');
    const THREE=await import('/node_modules/three/build/three.module.js');
    const alder=await import('/src/sim/alder.ts');
    const {projectOntoPath}=await import('/src/sim/street-path.ts');
    const {view,sim}=__ns;
    const candidates=alder.ALDER_EVERGREENS.filter(t=>t.oldGrowth&&t.grove==='union-commons'&&t.height>32).map(tree=>{
      const road=alder.ALDER_STREETS.map(s=>{
        const p=projectOntoPath(s.points,tree.trunk.x,tree.trunk.z),a=s.points[p.segmentIndex],b=s.points[p.segmentIndex+1];
        const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((tree.trunk.x-a.x)*dx+(tree.trunk.z-a.z)*dz)/(dx*dx+dz*dz)));
        return {...p,x:a.x+dx*t,z:a.z+dz*t};
      }).sort((a,b)=>a.distance-b.distance)[0];
      return {tree,road};
    }).sort((a,b)=>a.road.distance-b.road.distance);
    const selected=candidates[0];
    const fill=new THREE.HemisphereLight(0xc0d9e8,0x605343,1.6);view.scene.add(fill);
    const placements=[];
    for(const mesh of view.scene.getObjectByName('alder-evergreens').children) {
      const key=mesh.name.split(':')[1];
      const batch=alder.ALDER_EVERGREENS.filter(t=>`${Math.floor(t.trunk.x/256)},${Math.floor(t.trunk.z/256)}`===key);
      batch.forEach((tree,i)=>{
        if(!tree.oldGrowth)return;
        const grown=new THREE.Matrix4();mesh.getMatrixAt(i,grown);
        const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();grown.decompose(position,rotation,scale);
        scale.multiplyScalar(1/1.5);
        if(mesh.name.startsWith('evergreen-trunks:'))position.y=tree.trunk.base+tree.trunk.height/3;
        const ordinary=new THREE.Matrix4().compose(position,rotation,scale);
        placements.push({mesh,i,grown,ordinary});
      });
    }
    window.scaleStudy={alder,selected,fill,placements};
    const {tree,road}=selected,{trunk:t}=tree;
    // Approach from the nearest road, slightly along it, keeping the selected fir in view.
    const x=road.x-road.ux*22,z=road.z-road.uz*22,y=alder.alderHeight(x,z);
    Object.assign(sim.state.vehicle,{x,y,z,heading:Math.atan2(-road.ux,-road.uz)});
    view.car.position.set(x,y,z);view.car.rotation.set(0,sim.state.vehicle.heading,0);
    for(let i=0;i<100;i++)view.grass.update(sim.state,1/60);
    view.camera.position.set(x,y+3,z);view.camera.lookAt(t.x,t.base+tree.height*.43,t.z);
    view.camera.fov=66;view.camera.updateProjectionMatrix();
    view.moon.position.set(t.x-90,t.base+140,t.z+80);view.moon.target.position.set(t.x,t.base,t.z);view.sky.position.copy(view.camera.position);
    scaleStudy.camera=view.camera.clone();
    return {oldGrowth:alder.ALDER_EVERGREENS.filter(t=>t.oldGrowth).length,treeCount:alder.ALDER_EVERGREENS.length,
      selected:{id:tree.id,x:t.x,z:t.z,height:tree.height,radius:tree.radius},tallestTower:Math.max(...alder.ALDER_BLOCKS.map(b=>b.height))};
  });
  const timings=[];
  for(const enlarged of [false,true]) {
    const sample=await page.evaluate(enlarged=>{
      const {placements,camera,selected}=scaleStudy,{view}=__ns,{trunk:t}=selected.tree;
      view.sky.position.copy(camera.position);
      view.moon.position.set(t.x-90,t.base+140,t.z+80);view.moon.target.position.set(t.x,t.base,t.z);
      for(const p of placements){p.mesh.setMatrixAt(p.i,enlarged?p.grown:p.ordinary);p.mesh.instanceMatrix.needsUpdate=true;}
      const gl=view.renderer.getContext(),times=[];
      for(let frame=0;frame<35;frame++) {
        const start=performance.now();drawScale(view.scene,camera);gl.finish();if(frame>=5)times.push(performance.now()-start);
      }
      times.sort((a,b)=>a-b);
      return {enlarged,medianMs:times[15],p95Ms:times[28],calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles};
    },enlarged);
    timings.push(sample);await page.screenshot({path:`artifacts/alder-scale/trees-${enlarged?'grown':'original'}.png`});
  }
  await page.evaluate(()=>{scaleStudy.fill.visible=false;__ns.view.sky.position.copy(scaleStudy.camera.position);drawScale(__ns.view.scene,scaleStudy.camera);});
  await page.screenshot({path:'artifacts/alder-scale/trees-night.png'});
  await page.evaluate(()=>{
    const {view}=__ns;view.camera.position.set(-430,32,-70);view.camera.lookAt(30,44,-450);
    view.camera.fov=64;view.camera.updateProjectionMatrix();view.sky.position.copy(view.camera.position);
    view.moon.position.set(-180,145,-130);view.moon.target.position.set(-90,2,-210);drawScale(view.scene,view.camera);
  });
  await page.screenshot({path:'artifacts/alder-scale/skyline.png'});
  await writeFile('artifacts/alder-scale/check.json',JSON.stringify({setup,timings,errors},null,2));console.log(JSON.stringify({setup,timings,errors}));
  assert.equal(setup.treeCount,4439);assert.equal(setup.tallestTower,111);
  assert.equal(timings[0].calls,timings[1].calls);assert.equal(timings[0].triangles,timings[1].triangles);
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
