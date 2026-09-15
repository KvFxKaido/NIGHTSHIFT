// Run in an isolated Playwright CLI session; this uses that session's localStorage.
// An optional base URL lets worktrees run against their own preview server.
async (page, base = 'http://127.0.0.1:5173/') => {
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const choose = async id => {
    await page.locator(`[data-car="${id}"]`).click();
    await page.waitForFunction(id => document.querySelector(`[data-car="${id}"]`).getAttribute('aria-pressed') === 'true'
      && !document.querySelector(`[data-car="${id}"]`).disabled, id);
  };
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base + '?scene=garage&freeze=1'); await ready();
  await page.evaluate(() => {
    localStorage.removeItem('nightshift.settings');
    // This harness tests owned-car selection/loading, not the purchase flow.
    localStorage.setItem('nightshift.progress', JSON.stringify({
      version: 3, mothWins: 0, mothRaces: [], cash: 0, bulwarkOwned: true,
    }));
  });
  await page.reload(); await ready();
  const initial = await page.evaluate(() => {
    if (__ns.state().carModel !== 'ns-cinder') throw Error('Default Cinder missing');
    if (performance.getEntriesByType('resource').some(e => e.name.includes('ns-bulwark-01.glb'))) throw Error('Unused Bulwark loaded at startup');
    if ('rival' in __ns || 'rival' in __ns.view) throw Error('Ghost runtime still exposed');
    __ns.set({paint:'ice',wheels:'alloy',stance:'low'});
    return {vehicle:JSON.stringify(__ns.sim.state), camera:__ns.view.camera.position.toArray()};
  });
  await page.route('**/ns-bulwark-01.glb', route => route.abort());
  await page.locator('[data-car="bulwark"]').click();
  await page.waitForFunction(() => document.querySelector('[data-car-status]').textContent.includes('Could not load'));
  if (await page.evaluate(() => __ns.state().carModel !== 'ns-cinder')) throw Error('Failure removed current car');
  await page.unroute('**/ns-bulwark-01.glb');
  await choose('bulwark');
  const bulwark = await page.evaluate(initial => {
    const view = __ns.view;
    if (__ns.state().carModel !== 'ns-bulwark') throw Error('Bulwark not selected');
    if (__ns.state().drivetrain !== 'awd') throw Error('Bulwark did not bring its own AWD');
    if (__ns.sim.state.tick !== 0) throw Error('Changing car must start a fresh run');
    if (JSON.stringify(__ns.sim.state) === initial.vehicle) throw Error('Changing drivetrain must reset the run');
    if (view.car.parent.name !== 'garage-turntable' || view.car.parent.children.filter(c => c.userData.model).length !== 1) throw Error('Garage has missing or duplicate cars');
    if (__ns.state().customization.paint !== 'ice') throw Error('Appearance selection lost');
    if (JSON.parse(localStorage.getItem('nightshift.settings')).car !== 'bulwark') throw Error('Car selection not saved');
    __ns.shot();
    return {model:__ns.state().carModel,paint:view.paintMaterial.color.getHexString(),wheels:view.wheelMaterial.color.getHexString()};
  }, initial);
  await page.screenshot({path:'artifacts/garage-bulwark.png'});
  await choose('cinder');
  await choose('bulwark');
  await page.reload(); await ready();
  if (await page.evaluate(() => __ns.state().carModel !== 'ns-bulwark')) throw Error('Selected car lost on refresh');
  // An explicit preview overrides the saved body without writing the save.
  await page.goto(base + '?scene=garage&car=cinder&freeze=1'); await ready();
  if (await page.evaluate(() => __ns.state().carModel !== 'ns-cinder' || JSON.parse(localStorage.getItem('nightshift.settings')).car !== 'bulwark')) throw Error('Preview corrupted saved car');
  await choose('bulwark');
  if (await page.evaluate(() => new URL(location.href).searchParams.has('car'))) throw Error('Saved selection retained preview override');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'playing');
  const driving = await page.evaluate(() => {
    if (__ns.view.car.parent !== __ns.view.scene) throw Error('Selected car did not leave garage');
    __ns.drive('W240');
    const distance = Math.abs(__ns.sim.state.vehicle.z - 910);
    if (distance < 40 || __ns.sim.state.vehicle.speed < 15) throw Error('Bulwark cannot drive out');
    return {distance,speed:__ns.sim.state.vehicle.speed};
  });
  const beforeP = await page.evaluate(() => JSON.stringify(__ns.sim.state));
  await page.keyboard.press('p');
  if (await page.evaluate(before => JSON.stringify(__ns.sim.state) !== before, beforeP)) throw Error('P still changes driving state');
  await page.keyboard.press('r');
  await page.waitForFunction(() => __ns.sim.state.tick === 0);
  if (await page.evaluate(() => __ns.state().carModel !== 'ns-bulwark' || /REPLAY|RIVAL/.test(document.querySelector('#mode').textContent))) throw Error('Reset lost car or restored ghost');
  await page.locator('#garage-entry').click();
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'garage');
  await choose('cinder');
  await page.setViewportSize({width:960,height:600});
  await page.locator('[data-car="bulwark"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __ns.state().carModel === 'ns-bulwark');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/garage-cars-small.png'});
  if (errors.length) throw Error(errors.join('\n'));
  return {bulwark,driving,errors,checks:'Both cars; load failure/retry; shared customization; saved selection/reload; preview; drive/reset; no replay; keyboard selection'};
}
