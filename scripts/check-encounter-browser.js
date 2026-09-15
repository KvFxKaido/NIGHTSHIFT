// Run in an isolated Playwright CLI session; optionally supply a worktree URL.
async (page, base = 'http://127.0.0.1:5173/') => {
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const ready=()=>page.waitForFunction(()=>window.__ns&&document.body.dataset.assetState==='ready');
  const approach=()=>page.evaluate(()=>{
    const rival=__ns.sim.state.encounter;
    __ns.sim.body.setTranslation({x:rival.x,y:rival.y+.5,z:rival.z+18},true);
    __ns.sim.body.setLinvel({x:0,y:0,z:0},true);
    __ns.tick(1);__ns.shot();
  });
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base+'?scene=track&car=blender&freeze=1');await ready();
  await page.evaluate(()=>{
    localStorage.removeItem('nightshift.controls');
    localStorage.removeItem('nightshift.settings');
    // Keep Moth active and explicitly own the car used by the garage-swap check.
    localStorage.setItem('nightshift.progress', JSON.stringify({
      version:3,mothWins:0,mothRaces:[],cash:0,bulwarkOwned:true,
    }));
  });
  await page.reload();await ready();
  const initial=await page.evaluate(()=>{
    const state=__ns.state();
    // The cruiser is Moth's Kestrel whatever the player drives. It stopped
    // mirroring the player's body when she was given her own car.
    if(state.encounter?.model!=='ns-kestrel'||__ns.sim.state.race)throw Error('Missing free-roam Kestrel');
    return state.encounter;
  });
  await page.keyboard.press('f');
  await page.waitForFunction(()=>{
    let bright=false;__ns.view.car.traverse(o=>{if(o.isSpotLight&&o.intensity>100)bright=true;});return bright;
  });
  await page.waitForFunction(()=>{
    let bright=false;__ns.view.car.traverse(o=>{if(o.isSpotLight&&o.intensity>100)bright=true;});return !bright;
  });
  if(page.url().includes('race='))throw Error('Distant flash started race');
  // The first dark interval is between pulses, not the end of the flash.
  await page.waitForTimeout(900);
  await approach();await page.locator('#rival-challenge').waitFor({state:'visible'});
  await page.screenshot({path:'artifacts/rival-encounter.png'});
  await page.evaluate(()=>__ns.go('pause'));
  // Controls live under Options now; the remap returns the same way.
  await page.locator('[data-menu-screen="pause"] [data-menu-action="options"]').click();
  await page.locator('[data-menu-screen="options"] [data-menu-action="controls"]').click();
  await page.locator('[data-binding="flash"][data-binding-device="keyboard"]').click();
  await page.keyboard.press('g');
  await page.locator('[data-menu-screen="controls"] [data-menu-action="back"]').click();
  await page.locator('[data-menu-screen="options"] [data-menu-action="back"]').click();
  await page.keyboard.press('g');
  if(page.url().includes('race='))throw Error('Paused flash started race');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="resume"]').click();
  await page.waitForFunction(()=>document.querySelector('#rival-challenge [data-card-action]').textContent.startsWith('G'));
  const flashedAt = await page.evaluate(()=>({x:__ns.sim.state.vehicle.x,z:__ns.sim.state.vehicle.z}));
  await page.keyboard.press('g');
  await page.waitForURL('**/*race=gen-*',{timeout:15000});await ready();
  // The race starts where the flash was: the URL carries the snapped pose and
  // the loaded world starts there, not on the grid.
  if(!/[?&]start=-?\d/.test(page.url()))throw Error('Race did not carry the flash start');
  const started = await page.evaluate(()=>({x:__ns.sim.roadWorld.start.x,z:__ns.sim.roadWorld.start.z,car:{x:__ns.sim.state.vehicle.x,z:__ns.sim.state.vehicle.z}}));
  if(Math.hypot(started.x-flashedAt.x,started.z-flashedAt.z)>25)throw Error('Race started '+Math.hypot(started.x-flashedAt.x,started.z-flashedAt.z).toFixed(0)+' m from the flash');
  if(Math.hypot(started.car.x-started.x,started.car.z-started.z)>3)throw Error('Player not placed at the race start');
  await page.evaluate(()=>{
    __ns.freeze();
    if(!__ns.sim.state.rival||__ns.sim.state.encounter)throw Error('Race did not replace encounter');
    if(__ns.state().rival.model!=='ns-kestrel')throw Error('Race opponent changed');
  });
  await page.evaluate(()=>__ns.go('pause'));
  await page.locator('[data-menu-screen="pause"] [data-free-roam]').click();
  await page.waitForURL(url=>!url.searchParams.has('race'));await ready();
  await page.evaluate(()=>__ns.freeze());
  if(await page.evaluate(()=>!__ns.sim.state.encounter||!!__ns.sim.state.rival))throw Error('Return to roam failed');
  await page.evaluate(()=>__ns.go('garage'));
  await page.locator('[data-car="bulwark"]').click();
  // The garage choice moves the player's own car and nothing else now, so that
  // is what proves it landed. Waiting on the cruiser to change hung here for
  // the full timeout: it is the Kestrel before and after.
  await page.waitForFunction(()=>__ns.state().carModel==='ns-bulwark'&&__ns.state().encounter?.model==='ns-kestrel');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await approach();
  await page.evaluate(()=>{
    window.testPad={id:'Encounter test pad',connected:true,mapping:'standard',axes:[0,0,0,0],
      buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.testPad]});
  });
  // A pad only becomes the active device once it has been used, so injecting
  // one is not enough now that the prompts read activeGamepadName. Nudge the
  // camera stick: it is over the .35 activation threshold and moves nothing in
  // the world. The label for button 2 is 'X' on a standard pad; 'X / Square' is
  // the whole table entry, which only a PlayStation pad reduces to 'Square'.
  await page.evaluate(()=>{window.testPad.axes=[0,0,0,.9];});
  await page.waitForFunction(()=>{
    const action=document.querySelector('#rival-challenge [data-card-action]').textContent;
    return action.startsWith('X ')&&action.includes('Flash headlights');
  });
  await page.evaluate(()=>{window.testPad.axes=[0,0,0,0];});
  await page.evaluate(()=>{window.testPad.buttons[2]={pressed:true,touched:true,value:1};});
  await page.waitForURL('**/*race=gen-*',{timeout:15000});await ready();
  await page.evaluate(()=>{
    __ns.freeze();
    if(__ns.state().rival.model!=='ns-kestrel'||__ns.state().carModel!=='ns-bulwark')throw Error('Pad challenge lost garage selection');
  });
  if(errors.length)throw Error(errors.join('\n'));
  return {initial,checks:'Visible encounter; distant flash; nearby contact card; remapping; pause; keyboard challenge; race transition; return to roam; garage swap keeps the Kestrel; controller challenge',errors};
}
