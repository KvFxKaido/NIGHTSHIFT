async page=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true}));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://localhost:5174/?scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns&&document.body.dataset.assetState==='ready',null,{timeout:60000});
  await page.evaluate(()=>{const n=__ns;n.sim.body.setTranslation({x:702,y:36.5,z:-1530},true);n.sim.body.setRotation({x:0,y:0,z:0,w:1},true);n.tick(1);for(let i=0;i<25;i++)n.shot();});
  const comparison=await page.evaluate(async()=>{
    const frames=[];let last=performance.now();
    for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const now=performance.now();if(i>4)frames.push(now-last);last=now;}
    frames.sort((a,b)=>a-b);return {render:{...__ns.view.renderer.info.render},medianFrameMs:frames[Math.floor(frames.length/2)],pixelRatio:__ns.view.renderer.getPixelRatio()};
  });
  await page.goto('http://localhost:5174/?scene=track&visit=market-row&freeze=1');
  await page.waitForFunction(()=>window.__ns&&document.body.dataset.assetState==='ready',null,{timeout:60000});
  await page.evaluate(()=>{__ns.tick(1);for(let i=0;i<25;i++)__ns.shot();});
  await page.screenshot({path:'artifacts/market-row-drive.png'});
  const drive=await page.evaluate(()=>{
    const before={...__ns.sim.state.vehicle};__ns.drive('W180');const after=__ns.sim.state.vehicle;
    if(after.z-before.z<25)throw Error('Market preview start is blocked');
    const lod=__ns.view.scene.getObjectByName('market-row-detail-distance');
    if(lod.getCurrentLevel()!==0)throw Error('Nearby storefront detail hidden');
    return {metres:after.z-before.z,speed:after.speed};
  });
  await page.evaluate(()=>{for(let i=0;i<20;i++)__ns.shot();});
  await page.screenshot({path:'artifacts/market-row-shops.png'});
  if(errors.length)throw Error(errors.join('\n'));
  return {comparison,drive,errors};
}
