// Run in an isolated playwright-cli session.
async page => {
  page.setDefaultTimeout(30000);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:5173/';
  const ready=()=>page.waitForFunction(()=>window.__ns&&document.body.dataset.assetState==='ready');
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base+'?scene=track&race=sound-to-sky&car=blender&freeze=1');await ready();
  const grid=await page.evaluate(()=>{
    const ns=__ns, r=ns.sim.state.rival;
    if(!r||!ns.sim.rivalBody)throw Error('No rival on the grid');
    if(ns.view.car.userData.model!=='ns-01'||ns.view.rivalCar.car.userData.model!=='ns-bulwark')throw Error('Wrong opponent for coupe');
    ns.shot();
    if(ns.view.rivalCar.car.parent!==ns.view.scene)throw Error('Opponent missing from road scene');
    const before=[r.vehicle.x,r.vehicle.y,r.vehicle.z,r.vehicle.heading];ns.tick(180);
    if(JSON.stringify([r.vehicle.x,r.vehicle.y,r.vehicle.z,r.vehicle.heading])!==JSON.stringify(before))throw Error('Rival moved under countdown');
    return {player:ns.state().carModel,opponent:ns.state().rival.model};
  });
  await page.screenshot({path:'artifacts/rival-grid.png'});
  await page.evaluate(()=>{__ns.drive('W180');__ns.shot();});
  await page.screenshot({path:'artifacts/rival-racing.png'});
  if(!/P[12]\/2/.test(await page.locator('#race-time').textContent()))throw Error('No race position');
  await page.evaluate(()=>__ns.go('pause'));
  const paused=await page.evaluate(()=>JSON.stringify(__ns.sim.state.rival));
  await page.evaluate(async()=>{for(let i=0;i<10;i++)await new Promise(requestAnimationFrame);});
  if(await page.evaluate(before=>JSON.stringify(__ns.sim.state.rival)!==before,paused))throw Error('Paused opponent kept driving');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="restart"]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing'&&__ns.sim.state.tick===0);
  const finish=await page.evaluate(()=>{
    __ns.tick(15000);
    const r=__ns.sim.state.rival;
    if(!r.race.finished||r.race.splits.length!==4)throw Error('Browser rival failed to finish');
    return {seconds:r.race.ticks/60,splits:r.race.splits,recoveries:r.driver.recoveries};
  });
  if(!/RIVAL FIN/.test(await page.locator('#race-time').textContent()))throw Error('Rival finish not shown');
  await page.goto(base+'?scene=track&race=sound-to-sky&car=blender&freeze=1');await ready();
  const recovery=await page.evaluate(async()=>{
    const {RIVAL_RESET_TICKS}=await import('/src/sim/sim.ts');
    const r=__ns.sim.state.rival, before={...r.vehicle};
    r.race.countdown=0;__ns.sim.state.race.countdown=0;
    r.driver.progressMark=10000;r.driver.noProgressTicks=RIVAL_RESET_TICKS;
    __ns.tick(1);__ns.shot();
    const mesh=__ns.view.rivalCar.car.position;
    if(r.driver.resets!==1||r.vehicle.speed!==0)throw Error('Rival fallback failed to reset at rest');
    if(r.race.checkpoint!==0||r.race.ticks!==1)throw Error('Fallback changed race progress');
    if(Math.hypot(r.vehicle.x-before.x,r.vehicle.z-before.z)>35)throw Error('Fallback was not local');
    if(mesh.x!==r.vehicle.x||mesh.z!==r.vehicle.z)throw Error('Rival mesh did not follow reset');
    const resetZ=r.vehicle.z;__ns.tick(180);
    if(r.vehicle.z>=resetZ-5)throw Error('Rival did not resume after fallback');
    return {resets:r.driver.resets,resumed:true};
  });
  await page.goto(base+'?scene=garage&race=sound-to-sky&car=bulwark&freeze=1');await ready();
  if(await page.evaluate(()=>__ns.state().rival.model!=='ns-01'))throw Error('Wrong opponent for Bulwark');
  await page.locator('[data-car="blender"]').click();
  await page.waitForFunction(()=>__ns.state().carModel==='ns-01'&&__ns.state().rival.model==='ns-bulwark');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  await page.evaluate(()=>{
    __ns.shot();
    if(__ns.view.car===__ns.view.rivalCar.car)throw Error('Both racers share one mesh');
    if(__ns.view.scene.children.filter(c=>c.userData.model).length!==2)throw Error('Missing or duplicated cars after garage choice');
    if(!__ns.link().includes('car=blender'))throw Error('Share link lost explicit player model');
  });
  await page.goto(base+'?scene=track&car=bulwark&freeze=1');await ready();
  if(await page.evaluate(()=>__ns.sim.state.rival!==null||!__ns.sim.state.encounter||!__ns.view.rivalCar))throw Error('Free roam must show the waiting encounter, without race AI');
  if(errors.length)throw Error(errors.join('\n'));
  return {grid,finish,recovery,checks:'Both model pairings; garage selection; countdown; movement; pause/restart; full race; position/finish HUD; fallback reset presentation and resumption; free roam',errors};
}
