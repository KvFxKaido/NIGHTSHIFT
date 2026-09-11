// Run against the isolated expansion worktree server.
async page => {
  page.setDefaultTimeout(30000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base='http://localhost:5174/';
  await page.setViewportSize({width:1500,height:950});
  await page.goto(base+'seattle.html');
  await page.waitForFunction(()=>document.getElementById('map-stats').textContent.includes('18.6'));
  if(!await page.locator('#district-map').textContent().then(text=>text.includes('Space Needle')))throw Error('Landmark missing from map');
  await page.screenshot({path:'artifacts/north-map.png'});
  await page.goto(base+'?scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.roadWorld.id==='seattle-slice-v3');
  const north=await page.evaluate(()=>{
    const ns=__ns;
    if(!ns.view.scene.getObjectByName('space-needle'))throw Error('Missing landmark mesh');
    if(!ns.sim.state.encounter)throw Error('Waiting encounter was lost');
    ns.sim.body.setTranslation({x:-798,y:2.5,z:-1046},true);
    const heading=-Math.PI/4;
    ns.sim.body.setRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)},true);
    ns.tick(1);ns.shot();
    return {world:ns.sim.roadWorld.id,landmark:ns.view.scene.getObjectByName('space-needle').position.toArray()};
  });
  // Settle the follow camera at the new pose.
  await page.evaluate(()=>{for(let i=0;i<150;i++)__ns.shot();});
  await page.screenshot({path:'artifacts/north-needle-night.png'});
  const drive=await page.evaluate(()=>{
    const ns=__ns;
    ns.sim.body.setTranslation({x:-587,y:2.5,z:-1170},true);
    ns.sim.body.setRotation({x:0,y:0,z:0,w:1},true);
    ns.sim.body.setLinvel({x:0,y:0,z:0},true);
    ns.tick(1);const before=ns.sim.state.vehicle.z;
    ns.drive('W240');
    if(ns.sim.state.vehicle.z>before-40)throw Error('5th Avenue N drive is blocked');
    return {distance:before-ns.sim.state.vehicle.z,speed:ns.sim.state.vehicle.speed};
  });
  await page.goto(base+'?scene=track&race=gen-42&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.state.rival&&document.body.dataset.assetState==='ready');
  const race=await page.evaluate(()=>{
    __ns.tick(18000);
    const r=__ns.sim.state.rival;
    if(!r.race.finished)throw Error('Expanded generated race did not finish');
    return {name:__ns.sim.race.name,seconds:r.race.ticks/60,resets:r.driver.resets};
  });
  await page.goto(base+'editor.html');
  await page.waitForFunction(()=>document.querySelector('#building')?.options.length>190);
  if(errors.length)throw Error(errors.join('\n'));
  return {north,drive,race,editor:'expanded plots loaded',errors};
}
