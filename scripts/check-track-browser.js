// playwright-cli -s=nightshift-track run-code (Get-Content -Raw scripts/check-track-browser.js)
// Isolated test browser only. Pose edits below stage screenshots, not a driving test.
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:5173/?scene=track&freeze=1');
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const captures = [];
  const stage = (index,t) => page.evaluate(async ({index,t}) => {
      const {COURSE_POINTS,COURSE_SEGMENTS} = await import('/src/sim/track.ts');
      const {step} = await import('/src/sim/sim.ts');
      const seg = COURSE_SEGMENTS[index], point = COURSE_POINTS[index];
      const heading = Math.atan2(-seg.ux,-seg.uz);
      __ns.sim.body.setTranslation({x:point.x+seg.ux*seg.length*t,
        y:point.y+seg.rise*t+.5,z:point.z+seg.uz*seg.length*t},true);
      __ns.sim.body.setRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)},true);
      __ns.sim.body.setLinvel({x:0,y:0,z:0},true);
      __ns.sim.body.setAngvel({x:0,y:0,z:0},true);
      step(__ns.sim,{throttle:0,brake:0,steer:0,handbrake:0});
      // Snap the camera only for this staged capture; a 200 m teleport otherwise
      // leaves the normal chase interpolation several metres behind the car.
      const v=__ns.sim.state.vehicle, view=__ns.view;
      view.cameraPosition.set(v.x+Math.sin(v.heading)*7.2,v.y+3.15,v.z+Math.cos(v.heading)*7.2);
      view.cameraTarget.set(v.x-Math.sin(v.heading)*2.6,v.y+.82+Math.sin(v.pitch)*2.6,
        v.z-Math.cos(v.heading)*2.6);
      __ns.shot();
      return {state:__ns.state(), render:{...__ns.view.renderer.info.render},
        memory:{...__ns.view.renderer.info.memory}};
    },{index,t});
  for (const [name,index,t] of [['entry',18,.25],['tunnel',27,.5],['exit',34,.5],['bridge',39,.5]]) {
    const metrics = await stage(index,t);
    await page.screenshot({path:`artifacts/track-${name}.png`});
    captures.push({name,...metrics});
  }
  // Actual input through the existing log/replay bridge, from the staged bridge pose.
  const motion = await page.evaluate(() => {
    const before=__ns.state(); __ns.drive('W120'); const after=__ns.state();
    return {before:before.vehicle,after:after.vehicle,ticks:after.tick-before.tick};
  });
  if (motion.after.speed < 2 || motion.ticks !== 120) throw new Error('Driving input failed');
  await page.evaluate(() => __ns.go('pause'));
  if (await page.evaluate(() => __ns.state().screen) !== 'pause') throw new Error('Pause failed');
  await page.evaluate(() => __ns.go('garage'));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('hud')).opacity === '0');
  await page.screenshot({path:'artifacts/track-garage-regression.png'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => __ns.go('track'));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('hud')).opacity === '1');
  await page.screenshot({path:'artifacts/track-mobile.png'});
  // Explicit classic comparison must still boot; no new scenery is double-drawn.
  await page.goto('http://127.0.0.1:5173/?scene=track&environment=classic&freeze=1');
  await page.waitForFunction(() => window.__ns);
  if (await page.evaluate(() => __ns.state().environment) !== 'classic') throw new Error('Classic comparison failed');
  await page.setViewportSize({width:1440,height:900});
  const classic = await stage(39,.5);
  await page.screenshot({path:'artifacts/track-bridge-classic.png'});
  const missing = await page.context().newPage();
  try {
    await missing.route('**/assets/tracks/blackglass-rivergate.glb',route => route.abort());
    await missing.goto('http://127.0.0.1:5173/?scene=track');
    await missing.waitForFunction(() => document.body.dataset.assetState === 'error');
    const failure = await missing.evaluate(() => ({text:document.getElementById('asset-status').textContent,
      role:document.getElementById('asset-status').getAttribute('role'),booted:!!window.__ns}));
    if (failure.booted || failure.role !== 'alert' || !failure.text.includes('Asset loading failed')) {
      throw new Error('Missing track must fail visibly without substituting the classic course');
    }
  } finally { await missing.close(); }
  if (errors.length) throw new Error(errors.join('\n'));
  return {passed:true, captures:captures.map(c => ({name:c.name,environment:c.state.environment,
    calls:c.render.calls,triangles:c.render.triangles})),
    classicBridge:{calls:classic.render.calls,triangles:classic.render.triangles},
    driving:{ticks:motion.ticks,speed:motion.after.speed},missingAsset:'visible failure; no fallback',errors};
}
