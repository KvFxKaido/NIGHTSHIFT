async page => {
  page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true}));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://localhost:5174/?scene=track&race=gen-42');
  await page.waitForFunction(()=>window.__ns?.sim.state.rival&&document.body.dataset.assetState==='ready');
  await page.evaluate(()=>{window.originalSim=__ns.sim;window.originalWorld=__ns.sim.world;window.originalPage=performance.timeOrigin;});
  await page.keyboard.press('m');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='map');
  const paused=await page.evaluate(()=>({state:JSON.stringify(__ns.sim.state),url:location.href}));
  await page.evaluate(async()=>{for(let i=0;i<15;i++)await new Promise(requestAnimationFrame);});
  await page.evaluate(before=>{
    if(JSON.stringify(__ns.sim.state)!==before.state)throw Error('Simulation advanced with map open');
    if(location.href!==before.url||__ns.sim.world!==window.originalWorld)throw Error('Map unloaded the drive');
    const svg=document.querySelector('#city-map');
    if(svg.querySelectorAll('[data-map-gate]').length!==__ns.sim.race.checkpoints.length)throw Error('Map shows wrong race gates');
    if(!svg.querySelector('[data-map-player]')||!svg.querySelector('[data-map-rival]'))throw Error('Missing live markers');
  },paused);
  await page.screenshot({path:'artifacts/map-overlay-desktop.png'});
  const whole=await page.locator('#city-map').getAttribute('viewBox');
  await page.locator('[data-map-view="player"]').click();
  if(await page.locator('#city-map').getAttribute('viewBox')===whole)throw Error('Find car failed');
  await page.locator('[data-map-view="all"]').click();
  await page.keyboard.press('m');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  await page.waitForFunction(before=>__ns.sim.state.tick>JSON.parse(before.state).tick,paused);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='pause');
  const pauseState=await page.evaluate(()=>JSON.stringify(__ns.sim.state));
  await page.locator('[data-menu-screen="pause"] [data-district-map]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='map');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='pause');
  if(await page.evaluate(before=>JSON.stringify(__ns.sim.state)!==before,pauseState))throw Error('Pause-menu map changed state');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="resume"]').click();
  await page.evaluate(()=>{
    window.mapPad={id:'Map test pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.mapPad]});
  });
  await page.waitForFunction(()=>__ns.input().gamepad==='Map test pad');
  await page.evaluate(()=>{window.mapPad.buttons[8]={value:1,pressed:true};});
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='map');
  await page.evaluate(async()=>{for(let i=0;i<10;i++)await new Promise(requestAnimationFrame);});
  if(await page.evaluate(()=>document.body.dataset.gameScreen!=='map'))throw Error('Held Select retriggered');
  await page.setViewportSize({width:640,height:800});
  await page.screenshot({path:'artifacts/map-overlay-small.png'});
  await page.evaluate(()=>{window.mapPad.buttons[8]={value:0,pressed:false};});
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  await page.evaluate(()=>{window.mapPad.buttons[8]={value:1,pressed:true};});
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  await page.evaluate(()=>{
    if(__ns.sim!==window.originalSim||__ns.sim.world!==window.originalWorld||performance.timeOrigin!==window.originalPage)throw Error('World or page replaced');
  });
  if(errors.length)throw Error(errors.join('\n'));
  return {checks:'Keyboard and View/Share toggle; pause origin; frozen player/rival/traffic/race; live gates; zoom; same world and page',errors};
}
