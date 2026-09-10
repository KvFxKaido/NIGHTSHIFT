async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    window.garageTestPad = {connected:true,mapping:'standard',id:'garage-test-pad',axes:[0,0,0,0],
      buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.garageTestPad]});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5173/?scene=track&freeze=1');
  await page.waitForFunction(()=>window.__ns&&document.body.dataset.assetState==='ready',null,{timeout:30000});
  await page.evaluate(()=>__ns.tick(20));
  await page.waitForFunction(()=>!document.getElementById('garage-entry').hidden);
  const capture = async name => {
    await page.evaluate(async () => {
      const img=document.createElement('img');img.id='garage-capture';img.src=__ns.shot();
      img.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';
      document.body.append(img);
      await img.decode();
    });
    await page.screenshot({path:`artifacts/${name}.png`});
    await page.evaluate(()=>document.getElementById('garage-capture').remove());
  };
  await capture('garage-street');
  await page.evaluate(async () => {
    const {DISTRICT_GARAGE}=await import('/src/sim/district.ts');
    const b=DISTRICT_GARAGE.building,v=__ns.view;
    v.camera.position.set(b.x+Math.sin(b.rotation)*(b.depth/2+24),b.base+6,b.z-Math.cos(b.rotation)*(b.depth/2+24));
    v.camera.lookAt(b.x+Math.sin(b.rotation)*b.depth/2,b.base+4.5,b.z-Math.cos(b.rotation)*b.depth/2);
    v.renderer.render(v.scene,v.camera);
    const img=document.createElement('img');img.id='garage-sign-capture';img.src=v.renderer.domElement.toDataURL('image/png');
    img.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none';document.body.append(img);
  });
  await page.screenshot({path:'artifacts/garage-sign.png'});
  await page.evaluate(()=>document.getElementById('garage-sign-capture').remove());
  const before=await page.evaluate(()=>JSON.stringify(__ns.sim.state.vehicle));
  const tick=await page.evaluate(()=>__ns.sim.state.tick);
  await page.keyboard.press('e');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='garage');
  await page.evaluate(()=>{for(let i=0;i<10;i++)__ns.shot();});
  const camera=await page.evaluate(()=>__ns.view.camera.position.toArray());
  await capture('garage-platform-start');
  await page.evaluate(()=>{window.garageTestPad.axes[2]=1;window.garageTestPad.axes[3]=1;});
  await page.waitForFunction(()=>Math.abs(__ns.view.garageYaw)>1,null,{timeout:10000});
  await page.evaluate(()=>{window.garageTestPad.axes[2]=0;window.garageTestPad.axes[3]=0;});
  const turned=await page.evaluate(()=>({camera:__ns.view.camera.position.toArray(),yaw:__ns.view.garageYaw,
    parent:__ns.view.car.parent.name,platform:__ns.view.garageScene.getObjectByName('garage-turntable').rotation.y}));
  if(Math.max(...turned.camera.map((v,i)=>Math.abs(v-camera[i])))>1e-6)throw Error('Right stick moved garage camera');
  if(turned.parent!=='garage-turntable'||Math.abs(turned.yaw-turned.platform)>1e-8)throw Error('Car is not turning with platform');
  await capture('garage-platform-turned');
  await page.keyboard.press('c');
  await page.waitForFunction(()=>__ns.view.garageYaw===0);
  await page.setViewportSize({width:390,height:844});
  await capture('garage-platform-mobile');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  const after=await page.evaluate(()=>({tick:__ns.sim.state.tick,vehicle:JSON.stringify(__ns.sim.state.vehicle)}));
  if(after.tick!==tick||after.vehicle!==before)throw Error('Garage visit reset or changed the driving simulation');
  // Enter through the actual pad confirm path as well.
  await page.evaluate(()=>{window.garageTestPad.buttons[0]={pressed:true,value:1};});
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='garage');
  await page.evaluate(()=>{window.garageTestPad.buttons[0]={pressed:false,value:0};});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.body.dataset.gameScreen==='playing');
  await page.goto('http://127.0.0.1:5173/district.html');
  await page.waitForSelector('#garage-map-marker');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'artifacts/garage-map.png'});
  if(errors.length)throw Error(errors.join('\n'));
  return {passed:true,enteredByKeyboard:true,enteredByPad:true,preservedTick:tick,rotation:turned,errors};
}
