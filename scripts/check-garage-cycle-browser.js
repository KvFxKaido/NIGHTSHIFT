async page => {
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:5173/?scene=garage&car=cinder&freeze=1');
  await page.waitForFunction(() => window.__ns && document.body.dataset.gameScreen === "garage", null, {timeout:120000});
  const baseline = await page.evaluate(() => ({sim:JSON.stringify(__ns.sim.state), saved:localStorage.getItem('nightshift.settings')}));
  const cycle = async direction => {
    await page.locator(`[data-car-cycle="${direction}"]`).click();
    await page.waitForFunction(() => !document.querySelector('[data-car-status]').textContent.includes('Loading'));
  };
  await cycle(1);
  if (await page.locator('[data-car-name]').textContent() !== 'Bulwark') throw Error('Next failed');
  await cycle(1);
  if (await page.evaluate(() => __ns.view.car.userData.model !== 'ns-kestrel')) throw Error('Locked preview missing');
  if (!await page.locator('[data-equip-car]').isDisabled()) throw Error('Locked car equip enabled');
  if (await page.evaluate(before => JSON.stringify(__ns.sim.state) !== before.sim || localStorage.getItem('nightshift.settings') !== before.saved, baseline)) throw Error('Browsing changed drive/save');
  await page.screenshot({path:'artifacts/garage-cycle-desktop.png'});
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  if (await page.evaluate(() => __ns.view.car.userData.model !== 'ns-cinder')) throw Error('Preview escaped garage');
  await page.goto('http://localhost:5173/?scene=garage&car=cinder&freeze=1');
  await page.waitForFunction(() => window.__ns && document.body.dataset.gameScreen === "garage", null, {timeout:120000});
  await cycle(-1);
  if (await page.locator('[data-car-name]').textContent() !== 'Vesper') throw Error('Wrap failed');
  await page.locator('[data-car-cycle="1"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[data-car-name]').textContent === 'Cinder');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => new Promise(resolve => {
    let frames = 60;
    const settle = () => --frames ? requestAnimationFrame(settle) : resolve();
    requestAnimationFrame(settle);
  }));
  await page.screenshot({path:'artifacts/garage-cycle-mobile.png'});
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Mobile overflow');
  if (errors.length) throw Error(errors.join('\n'));
  return {checks:'Locked live preview; no simulation/save changes; exit restores equipped body; wrap; keyboard cycling; mobile layout',errors};
}
