// Run in an isolated Playwright session against pnpm dev (port 5194).
// playwright-cli -s=facade run-code (Get-Content -Raw scripts/check-facade-menu-browser.js)
async (page, base = 'http://127.0.0.1:5194/') => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const settle = () => page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const frame = () => ++frames === 25 ? resolve() : requestAnimationFrame(frame);
    requestAnimationFrame(frame);
  }));
  const screen = name => page.waitForFunction(name => document.body.dataset.gameScreen === name, name);
  const main = action => page.locator(`[data-menu-screen="main"] [data-menu-action="${action}"]`);
  const back = name => page.locator(`[data-menu-screen="${name}"] [data-menu-action="back"]`).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 120000 });
  assert(await page.locator('#menu-root').evaluate(el => el.inert), 'Menu can activate behind intro');
  await page.locator('#enter-menu').click();
  await screen('main');
  await settle();
  const before = await page.evaluate(() => ({ tick: __ns.state().tick, vehicle: __ns.state().vehicle }));
  assert(await page.evaluate(() => __ns.view.mode === 'main'), 'Main camera not active');
  await page.screenshot({ path: 'artifacts/facade-desktop.png' });

  // The invisible DOM hit targets must coincide with real 3D lettering, not
  // merely have plausible screen coordinates. Check every enabled row.
  const hits = await page.evaluate(() => [...document.querySelectorAll('[data-menu-screen="main"] button')]
    .filter(button => !button.hidden && !button.disabled).map(button => {
      const r = button.getBoundingClientRect();
      const hit = __ns.pick(r.x + r.width / 2, r.y + r.height / 2);
      return { label: button.textContent, hit: hit?.name };
    }));
  assert(hits.every(hit => hit.hit === 'wharf-menu-projection'), `Pointer targets miss lettering: ${JSON.stringify(hits)}`);
  await page.keyboard.press('ArrowDown');
  await settle();
  assert(await page.evaluate(() => document.activeElement.dataset.menuAction === 'garage'), 'Keyboard focus did not reach garage');
  await page.keyboard.press('Enter');
  await screen('garage');
  assert(await page.evaluate(() => __ns.view.car.parent.name === 'garage-turntable'), 'Car did not move into garage');
  await back('garage');
  await screen('main');
  for (const action of ['races', 'blacklist', 'options']) {
    await main(action).click();
    await screen(action);
    await back(action);
    await screen('main');
  }
  const after = await page.evaluate(() => ({ tick: __ns.state().tick, vehicle: __ns.state().vehicle }));
  assert(JSON.stringify(before) === JSON.stringify(after), 'Menu navigation changed simulation state');

  // Exercise the actual pad polling path using a standard virtual controller.
  await page.evaluate(() => {
    window.__facadePad = { id: 'Xbox 360 Controller', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__facadePad] });
  });
  await settle();
  await page.evaluate(() => { __facadePad.buttons[13] = { pressed: true, value: 1 }; });
  await page.waitForFunction(() => document.activeElement.dataset.menuAction === 'garage');
  await page.evaluate(() => { __facadePad.buttons[13] = { pressed: false, value: 0 }; });
  await settle();
  await page.evaluate(() => { __facadePad.buttons[0] = { pressed: true, value: 1 }; });
  await screen('garage');
  await page.evaluate(() => { __facadePad.buttons[0] = { pressed: false, value: 0 }; });
  await settle();
  await back('garage');
  await page.evaluate(() => { delete navigator.getGamepads; delete window.__facadePad; });

  await main('new-drive').click();
  await screen('playing');
  await settle();
  assert(await page.evaluate(() => !__ns.view.scene.getObjectByName('wharf-menu-projection').visible), 'Facade menu leaked into driving');
  assert(await page.evaluate(() => __ns.view.scene.getObjectByName('district-garage-sign').visible), 'Garage sign not restored');
  await page.keyboard.down('w');
  await page.waitForFunction(() => __ns.state().vehicle.speed > 1);
  await page.keyboard.up('w');
  await page.screenshot({ path: 'artifacts/facade-drive.png' });
  await page.keyboard.press('Escape');
  await screen('pause');

  // Seven rows (Continue added) must still fit the wall and a phone viewport.
  await page.locator('[data-menu-screen="pause"] [data-menu-action="saves"]').click();
  await page.locator('[data-save-slots] button').first().click();
  await page.locator('#save-name').fill('Facade playtest');
  await page.locator('[data-write-save]').click();
  await back('saves');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="main-menu"]').click();
  await screen('main');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const mobile = await page.evaluate(() => [...document.querySelectorAll('[data-menu-screen="main"] button')]
    .filter(button => !button.hidden).map(button => {
      const r = button.getBoundingClientRect();
      return { label: button.textContent, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom < innerHeight - 85,
        hit: __ns.pick(r.x + r.width / 2, r.y + r.height / 2)?.name };
    }));
  assert(mobile.length === 7 && mobile.every(row => row.fits && row.hit === 'wharf-menu-projection'), JSON.stringify(mobile));
  await page.screenshot({ path: 'artifacts/facade-mobile.png' });
  const pose = await page.evaluate(() => __ns.view.camera.position.toArray());
  await main('garage').focus();
  await settle();
  assert(JSON.stringify(pose) === JSON.stringify(await page.evaluate(() => __ns.view.camera.position.toArray())), 'Reduced motion still moves selection camera');
  await main('options').click();
  await screen('options');
  await back('options');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflows');
  assert(errors.length === 0, errors.join('\n'));
  return { checks: '3D pointer alignment, keyboard, standard gamepad, garage, submenus, frozen simulation, drive, pause, seven-row mobile, reduced motion', hits, mobile, errors };
}
