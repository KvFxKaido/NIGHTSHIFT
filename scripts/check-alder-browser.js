async page => {
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.setDefaultTimeout(30000);
  await page.addInitScript(()=>{navigator.getGamepads=()=>[];});
  await page.setViewportSize({width:1500,height:950});
  await page.goto('http://127.0.0.1:5173/?scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.roadWorld.id==='alder-slice-v4');
  await page.locator('#garage-entry').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='garage');
  const garage=await page.evaluate(async()=>{
    const {render}=await import('/src/render/scene.ts');
    const camera=__ns.view.camera.position.clone();
    const before=__ns.view.garageYaw;
    for(let i=0;i<60;i++)render(__ns.view,__ns.sim.state,1/60,{x:1,y:0});
    if(Math.abs(__ns.view.garageYaw-before)<.3)throw Error('Garage turntable did not rotate');
    return {turntable:__ns.view.garageYaw,model:__ns.view.car.userData.model};
  });
  await page.screenshot({path:'artifacts/alder-garage-interior.png'});
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  await page.evaluate(()=>{__ns.freeze();__ns.shot();});
  await page.screenshot({path:'artifacts/alder-garage-exterior.png'});
  const driving=await page.evaluate(()=>{
    __ns.freeze();__ns.shot();
    const initial={...__ns.sim.state.vehicle};
    if(__ns.view.camera.position.distanceTo(__ns.view.car.position)>20)throw Error('Startup camera lost the car');
    __ns.drive('W240');__ns.shot();
    const car=__ns.sim.state.vehicle;
    if(car.z>=initial.z-40||car.speed<15)throw Error('Port Alder spawn is blocked');
    if(!__ns.link().includes('world=alder'))throw Error('Share link lost Port Alder');
    if(!__ns.view.scene.getObjectByName('alder-asphalt'))throw Error('Wrong world renderer');
    return {travelled:Math.hypot(car.x-initial.x,car.z-initial.z),speed:car.speed,traffic:__ns.sim.state.traffic.vehicles.length};
  });
  await page.screenshot({path:'artifacts/alder-driving.png'});
  await page.evaluate(()=>__ns.go('pause'));
  await page.locator('[data-menu-screen="pause"] [data-district-map]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='map');
  await page.waitForFunction(()=>document.querySelectorAll('#city-map polyline').length>50);
  await page.screenshot({path:'artifacts/alder-map.png'});
  await page.goto('http://127.0.0.1:5173/?world=alder&race=sound-to-sky&scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.state.race!==null&&window.__ns?.sim.roadWorld.id==='alder-slice-v4');
  const race=await page.evaluate(()=>{
    __ns.freeze();__ns.tick(180);__ns.shot();
    if(__ns.sim.state.race.countdown!==0||!__ns.sim.state.race.next)throw Error('Race failed to start');
    return {race:__ns.sim.state.race,link:__ns.link()};
  });
  await page.screenshot({path:'artifacts/alder-race.png'});
  await page.goto('http://127.0.0.1:5173/?world=district&race=crane-to-crest&scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.roadWorld.id==='alder-slice-v4');
  if(await page.evaluate(()=>new URL(location.href).searchParams.has('race')))throw Error('Legacy bookmark retained incompatible race');
  const retired=await page.evaluate(()=>{
    if(document.querySelector('[data-world-switch]'))throw Error('Retired map remains in menu');
    const resources=performance.getEntriesByType('resource').map(entry=>entry.name);
    const old=resources.filter(name=>/\/src\/(sim\/district|render\/(district|course|blender-course))\.ts|blackglass-rivergate/.test(name));
    if(old.length)throw Error('Retired map still loaded: '+old.join(','));
    return {world:__ns.sim.roadWorld.id,retiredResources:old};
  });
  await page.goto('http://127.0.0.1:5173/?world=alder&scene=track&lighting=blockout&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.roadWorld.id==='alder-slice-v4');
  const terrain=await page.evaluate(async()=>{
    // Inspect a downtown hill location; this is a renderer/height probe, not
    // evidence of driving a route there.
    const {ALDER_STREETS,projectOntoAlder}=await import('/src/sim/alder.ts');
    const {resetViewCamera}=await import('/src/render/scene.ts');
    const points=ALDER_STREETS.flatMap(s=>s.points);
    const p=points.reduce((best,p)=>p.y>best.y?p:best,points[0]);
    const surface=projectOntoAlder(p.x,p.z);
    Object.assign(__ns.sim.state.vehicle,{x:p.x,y:surface.height,z:p.z,heading:Math.atan2(surface.ux,surface.uz),pitch:surface.pitch});
    resetViewCamera(__ns.view);for(let i=0;i<5;i++)__ns.shot();
    return {x:p.x,z:p.z,height:surface.height};
  });
  await page.screenshot({path:'artifacts/alder-hill-blockout.png'});
  if(errors.length)throw Error(errors.join('\n'));
  return {garage,driving,race,retired,terrain,pageErrors:errors};
}
