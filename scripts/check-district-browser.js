// playwright-cli -s=nightshift-district run-code (Get-Content -Raw scripts/check-district-browser.js)
// Uses an isolated browser. Pose staging is visual QA, not proof of driven routes;
// the collision-enabled inspection driver in tests/district.test.ts covers those.
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5173/district.html?route=market-loop');
  await page.waitForSelector('[data-route][aria-pressed="true"]');
  if (await page.locator('[data-route]').count() !== 4) throw new Error('Missing routes');
  await page.screenshot({ path: 'artifacts/district-map.png' });
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.activeElement?.dataset.route === 'freight-run');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-route="freight-run"]').getAttribute('aria-pressed') === 'true');
  if (!(await page.locator('#drive-route').getAttribute('href')).includes('freight-run')) throw new Error('Route selection not applied');

  // Synthetic standard pad tests mapping/navigation, not a claim of physical DS4 testing.
  await page.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', id: 'test-pad', axes: [0,0,0,0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] });
  });
  await page.evaluate(() => { window.testPad.buttons[13] = { pressed: true, value: 1 }; });
  await page.waitForFunction(() => document.activeElement?.dataset.route === 'avenue-loop');
  await page.evaluate(() => { window.testPad.buttons[13] = { pressed: false, value: 0 }; window.testPad.buttons[0] = { pressed: true, value: 1 }; });
  await page.waitForFunction(() => document.querySelector('[data-route="avenue-loop"]').getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => { window.testPad.buttons[0] = { pressed: false, value: 0 }; });
  await page.evaluate(() => { window.testPad.axes[1] = -0.8; });
  await page.waitForFunction(() => document.activeElement?.dataset.route === 'freight-run');
  await page.evaluate(() => { window.testPad.axes[1] = 0; });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/district-map-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile map overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });

  const routes = ['perimeter', 'market-loop', 'freight-run', 'avenue-loop'];
  const metrics = [];
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:5173/?world=district&route=${route}&scene=track&freeze=1`);
    await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
    const boot = await page.evaluate(() => {
      __ns.shot();
      return { state: __ns.state(), link: __ns.link(), calls: __ns.view.renderer.info.render.calls };
    });
    if (!boot.state.roadWorld.endsWith('/' + route) || !boot.link.includes('world=district') || !boot.link.includes('route=' + route)) {
      throw new Error('World/route identity lost');
    }
    await page.screenshot({ path: `artifacts/district-${route}.png` });
    const motion = await page.evaluate(() => {
      const before = __ns.state(); __ns.drive('W120'); const after = __ns.state();
      return { ticks: after.tick - before.tick, speed: after.vehicle.speed };
    });
    if (motion.ticks !== 120 || motion.speed < 2) throw new Error('Input did not reach physics');
    await page.evaluate(() => __ns.go('pause'));
    const tick = await page.evaluate(() => __ns.state().tick);
    await page.evaluate(() => __ns.freeze(false));
    // Wait for rendered frames to prove the pause gate, not a frozen debug sim.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (await page.evaluate(() => __ns.state().tick) !== tick) throw new Error('Pause advanced physics');
    await page.evaluate(() => { __ns.freeze(); __ns.go('garage'); __ns.shot(); });
    if (await page.evaluate(() => __ns.state().mode) !== 'garage') throw new Error('Garage broken');
    await page.evaluate(() => __ns.go('track'));
    if (await page.evaluate(() => __ns.state().roadWorld) !== boot.state.roadWorld) throw new Error('Reset lost district');
    metrics.push({ route, calls: boot.calls, motion });
  }

  // Look at the shared Market Square from a real connector approach.
  await page.goto('http://127.0.0.1:5173/?world=district&route=market-loop&scene=track&freeze=1');
  await page.waitForFunction(() => window.__ns);
  await page.evaluate(async () => {
    const { DISTRICT_STREETS } = await import('/src/sim/district.ts');
    const { step } = await import('/src/sim/sim.ts');
    const points = DISTRICT_STREETS.find(s => s.id === 'market-east').points;
    const p = points.at(-9), next = points.at(-8), heading = Math.atan2(p.x-next.x,p.z-next.z);
    __ns.sim.body.setTranslation({x:p.x,y:p.y+.5,z:p.z},true);
    __ns.sim.body.setRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)},true);
    step(__ns.sim,{throttle:0,brake:0,steer:0,handbrake:0});
    const v=__ns.sim.state.vehicle;
    __ns.view.cameraPosition.set(v.x+Math.sin(heading)*7.2,v.y+3.15,v.z+Math.cos(heading)*7.2);
    __ns.view.cameraTarget.set(v.x-Math.sin(heading)*2.6,v.y+.82,v.z-Math.cos(heading)*2.6);
    __ns.shot();
  });
  await page.screenshot({path:'artifacts/district-market-junction.png'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => __ns.shot());
  await page.screenshot({path:'artifacts/district-drive-mobile.png'});

  await page.goto('http://127.0.0.1:5173/?scene=track&freeze=1');
  await page.waitForFunction(() => window.__ns);
  if (await page.evaluate(() => __ns.state().roadWorld) !== 'blackglass-v1') throw new Error('Baseline replaced');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(() => __ns.shot());
  await page.screenshot({path:'artifacts/district-baseline-regression.png'});
  const bad = await page.context().newPage();
  try {
    await bad.goto('http://127.0.0.1:5173/?world=district&route=missing');
    await bad.waitForFunction(() => document.body.dataset.assetState === 'error');
    if (await bad.evaluate(() => !!window.__ns)) throw new Error('Bad route silently substituted');
  } finally { await bad.close(); }
  if (errors.length) throw new Error(errors.join('\n'));
  return { passed: true, metrics, keyboard: true, syntheticGamepad: true, mobile: 'viewport only', errors };
}
