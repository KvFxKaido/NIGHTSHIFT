// Run against the isolated worktree server with playwright-cli run-code.
async page => {
  page.setDefaultTimeout(60000);
  await page.addInitScript(()=>Object.defineProperty(navigator,'getGamepads',{value:()=>[],configurable:true}));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base='http://localhost:5174/';
  await page.setViewportSize({width:1500,height:950});
  await page.goto(base+'seattle.html');
  await page.waitForFunction(()=>document.getElementById('map-stats').textContent.includes('83.5'));
  await page.screenshot({path:'artifacts/east-map.png'});
  await page.goto(base+'?scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.roadWorld.id==='seattle-slice-v4'&&document.body.dataset.assetState==='ready',null,{timeout:60000});
  const views=[];
  for(const [name,x,z,heading] of [['queen-anne',-1040,-1665,.15],['capitol-hill',940,-2210,0],['madrona',2000,-1320,0]]) {
    views.push(await page.evaluate(async({name,x,z,heading})=>{
      const ns=__ns,{seattleHeight}=await import('/src/sim/seattle.ts');
      ns.sim.body.setTranslation({x,y:seattleHeight(x,z)+.5,z},true);
      ns.sim.body.setRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)},true);
      ns.sim.body.setLinvel({x:0,y:0,z:0},true);ns.sim.body.setAngvel({x:0,y:0,z:0},true);
      ns.tick(1);for(let i=0;i<45;i++)ns.shot();
      if(!ns.view.scene.getObjectByName('seattle-park-canopies'))throw Error('Park trees missing');
      return {name,height:seattleHeight(x,z),calls:ns.view.renderer.info.render.calls,triangles:ns.view.renderer.info.render.triangles};
    },{name,x,z,heading}));
    await page.screenshot({path:`artifacts/east-${name}.png`});
  }
  await page.goto(base+'?scene=track&race=gen-42&freeze=1');
  await page.waitForFunction(()=>window.__ns?.sim.state.rival&&document.body.dataset.assetState==='ready',null,{timeout:60000});
  const race=await page.evaluate(()=>{
    __ns.tick(18000);const r=__ns.sim.state.rival;
    if(!r.race.finished)throw Error('Expanded generated race did not finish');
    return {name:__ns.sim.race.name,seconds:r.race.ticks/60,resets:r.driver.resets};
  });
  await page.goto(base+'editor.html');
  await page.waitForFunction(()=>document.body.dataset.editorReady==='true',null,{timeout:60000});
  const plots=await page.locator('#building option').count();
  if(plots<1700)throw Error('Expanded plots missing');
  await page.locator('#overview').click();
  await page.screenshot({path:'artifacts/east-editor.png'});
  await page.locator('summary').filter({hasText:'Files & Three.js editor'}).click();
  const download=page.waitForEvent('download');
  await page.locator('#export-scene').click();
  await (await download).saveAs('artifacts/east-editor-scene.json');
  await page.locator('#import-file').setInputFiles('artifacts/east-editor-scene.json');
  await page.waitForFunction(()=>document.getElementById('save-status').textContent.startsWith('Imported as a draft'));
  if(!(await page.locator('#validation').textContent()).includes('Placement checks pass'))throw Error('Scene round trip changed valid placements');
  if(errors.length)throw Error(errors.join('\n'));
  return {views,race,plots,errors};
}
