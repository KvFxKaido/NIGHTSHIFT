import { checkFacadeRegressions } from './check-facade-regressions.js';

// pnpm test:facade creates an isolated browser context and its own Vite server.
export default async function checkFacadeMenu(page, base) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (value, message) => { if (!value) throw Error(message); };
  const settle = () => page.evaluate(() => new Promise(resolve => {
    let frames = 0;
    const frame = () => ++frames === 6 ? resolve() : requestAnimationFrame(frame);
    requestAnimationFrame(frame);
  }));
  const screen = name => page.waitForFunction(name => document.body.dataset.gameScreen === name, name);
  const main = action => page.locator(`[data-menu-screen="main"] [data-menu-action="${action}"]`);
  const back = name => page.locator(`[data-menu-screen="${name}"] [data-menu-action="back"]`).click();
  const capture = async path => {
    await page.evaluate(() => {
      window.__facadeRenderNow = true;
      const view = __ns.view;
      view.renderer.render(view.mode === 'garage' ? view.garageScene : view.scene, view.camera);
    });
    await page.screenshot({ path });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    // Publication precedes applyDeepLink(), which can draw synchronously.
    // Observe that first draw rather than waiting until an animation frame.
    let api;
    Object.defineProperty(window, '__ns', {
      configurable: true,
      get: () => api,
      set(value) {
        api = value;
        const view = api.view, draw = view.renderer.render;
        // Keep the real viewport/projection, with cheaper software-GPU raster.
        view.renderer.setPixelRatio(.5);
        view.renderer.shadowMap.enabled = false;
        let lastDraw = '';
        view.renderer.render = function (scene, camera) {
          // CI checks interaction and scene state, not sustained frame rate.
          // Keep world matrices current for ray picks but avoid flooding the
          // software GPU with unchanged menu frames. Screenshots force a draw.
          scene.updateMatrixWorld();
          camera.updateMatrixWorld();
          const textureVersion = view.scene.getObjectByName('wharf-menu-projection')?.material.map.version;
          const key = [view.mode, document.body.dataset.gameScreen, document.body.dataset.intro,
            innerWidth, innerHeight, textureVersion].join('/');
          if (key === lastDraw && !window.__facadeRenderNow) return;
          lastDraw = key;
          window.__facadeRenderNow = false;
          if (view.mode === 'track' && !window.__facadeFirstDraw) {
            window.__facadeFirstDraw = { position: view.car.position.toArray(), model: view.car.userData.model };
          }
          return draw.call(this, scene, camera);
        };
      },
    });
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 120000 });
  console.log('[facade] World loaded');
  assert(await page.locator('#menu-root').evaluate(el => el.inert), 'Menu can activate behind intro');
  await page.locator('#enter-menu').click();
  await screen('main');
  await settle();
  const before = await page.evaluate(() => ({ tick: __ns.state().tick, vehicle: __ns.state().vehicle }));
  assert(await page.evaluate(() => __ns.view.mode === 'main'), 'Main camera not active');
  await capture('artifacts/facade-desktop.png');
  await checkFacadeRegressions(page);
  console.log('[facade] Activation, repaint, first-frame pose and unordered beacons passed');

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
  console.log('[facade] Pointer, keyboard, controller and submenu checks passed');

  await main('new-drive').click();
  await screen('playing');
  await settle();
  assert(await page.evaluate(() => !__ns.view.scene.getObjectByName('wharf-menu-projection').visible), 'Facade menu leaked into driving');
  assert(await page.evaluate(() => __ns.view.scene.getObjectByName('district-garage-sign').visible), 'Garage sign not restored');
  await page.keyboard.down('w');
  await page.waitForFunction(() => __ns.state().vehicle.speed > 1);
  await page.keyboard.up('w');
  await capture('artifacts/facade-drive.png');
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
  await capture('artifacts/facade-mobile.png');
  const pose = await page.evaluate(() => __ns.view.camera.position.toArray());
  await main('garage').focus();
  await settle();
  assert(JSON.stringify(pose) === JSON.stringify(await page.evaluate(() => __ns.view.camera.position.toArray())), 'Reduced motion still moves selection camera');
  await main('options').click();
  await screen('options');
  await back('options');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflows');
  console.log('[facade] Driving, seven-row mobile and reduced motion passed');

  // Capture the first draw after a real Continue navigation, before waiting
  // could conceal a one-frame pose regression. This runs only in the test page.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nightshift.saves')).slots[0]);
  await page.locator('[data-continue]').click();
  await page.waitForFunction(() => window.__facadeFirstDraw, null, { timeout: 120000 });
  const firstDraw = await page.evaluate(() => window.__facadeFirstDraw);
  assert(Math.hypot(firstDraw.position[0] - saved.position.x, firstDraw.position[2] - saved.position.z) < .1,
    `Continue drew the wrong first pose: ${JSON.stringify({ saved: saved.position, firstDraw })}`);
  assert(errors.length === 0, errors.join('\n'));
  return { checks: '3D pointer alignment, activation gating, first-frame pose, unordered beacons, keyboard, standard gamepad, garage, submenus, frozen simulation, drive, pause, seven-row mobile, reduced motion, Continue first draw', hits, mobile, firstDraw, errors };
}
