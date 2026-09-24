import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const server = process.env.GARAGE_TEST_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server?.listen();
  const base = process.env.GARAGE_TEST_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
  // SwiftShader, as the facade and Cinder checks do: a runner has no GPU, and
  // the facade check stalled there until it was told to use one (PR #11).
  browser = await chromium.launch({ args: [`--use-angle=${process.env.GARAGE_TEST_ANGLE ?? 'swiftshader'}`, '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(60000);
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer, draw = renderer.render;
      renderer.setPixelRatio(1);
      renderer.render = function(scene, camera) {
        scene.updateMatrixWorld(); camera.updateMatrixWorld();
        if (!window.shotCapture) return;
        window.shotCapture = false;
        return draw.call(this, scene, camera);
      };
    } });
    window.testPad = { connected: true, mapping: 'standard', id: 'test-pad', axes: [0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0})) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] });
  });
  const finished = () => page.waitForFunction(() => !__ns.view.garageCutscene);
  const ready = () => page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 120000 });
  const pose = () => page.evaluate(() => JSON.stringify(__ns.sim.state.vehicle));
  const capture = async name => {
    await page.evaluate(async () => {
      window.shotCapture = true;
      const img = new Image(); img.id = 'shot-test-image'; img.src = __ns.shot();
      img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
      await img.decode(); document.getElementById('view').after(img);
    });
    await page.screenshot({ path: `artifacts/garage-shot-${name}.png` });
    await page.evaluate(() => document.getElementById('shot-test-image').remove());
  };
  await page.goto(`${base}?world=alder&scene=main&freeze=1`);
  await ready();
  await page.evaluate(() => __ns.go('garage'));
  const before = await pose();
  assert.equal(await page.evaluate(() => __ns.view.garageCutscene.kind), 'enter');
  await page.waitForFunction(() => __ns.view.garageCutscene?.elapsed > .4);
  await capture('enter');
  await finished();
  assert.equal(await pose(), before);
  // Parts are rows in the Body section now (design/MENUS.md): step each row to its part.
  await page.locator('[data-section-tab="body"]').click();
  for (const [slot, id] of [['bodyKit', 'race'], ['wheelDesign', 'mesh']]) {
    const row = page.locator(`[data-row="${slot}"]`);
    for (let step = 0; step < 8 && await row.getAttribute('data-value') !== id; step++) await row.locator('[data-row-step="1"]').click();
    assert.equal(await row.getAttribute('data-value'), id, `${slot} never reached ${id}`);
  }
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  assert.equal(await page.evaluate(() => __ns.view.garageCutscene.kind), 'exit');
  const exitPose = await pose();
  const tick = await page.evaluate(() => __ns.sim.state.tick);
  await page.evaluate(() => __ns.freeze(false));
  await page.keyboard.down('w');
  await page.waitForFunction(() => __ns.view.garageCutscene?.elapsed > .7);
  assert.equal(await pose(), exitPose);
  assert.equal(await page.evaluate(() => __ns.sim.state.tick), tick);
  await page.evaluate(() => __ns.freeze(true));
  await capture('exit');
  await finished();
  await page.keyboard.up('w');
  assert.equal(await pose(), exitPose);
  assert.ok(await page.evaluate(() => __ns.view.bodyShell.getObjectByName('cinder-spoiler-wing').visible));
  assert.ok(await page.evaluate(() => __ns.view.car.position.distanceTo({x:__ns.sim.state.vehicle.x,y:__ns.sim.state.vehicle.y,z:__ns.sim.state.vehicle.z}) < .001));
  assert.ok(await page.evaluate(() => __ns.view.camera.position.x < 22));
  await capture('handoff');
  // Arrive at a different angle; every departure must use the street-facing pose.
  await page.keyboard.press('e');
  await page.waitForFunction(() => __ns.view.garageCutscene?.kind === 'enter');
  await page.keyboard.press('Escape');
  await finished();
  assert.equal(await page.evaluate(() => document.body.dataset.gameScreen), 'garage');
  await page.evaluate(() => {
    Object.assign(__ns.sim.state.vehicle, { x: 17, z: 911, heading: 0 });
    __ns.sim.body.setTranslation({ x: 17, y: 2.5, z: 911 }, true);
    __ns.sim.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  });
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.evaluate(() => { testPad.buttons[0] = { pressed: true, value: 1 }; });
  await finished();
  await page.evaluate(() => { testPad.buttons[0] = { pressed: false, value: 0 }; });
  assert.equal(await pose(), exitPose);
  assert.equal(await page.evaluate(() => document.body.dataset.gameScreen), 'playing');
  await page.keyboard.press('e');
  await page.locator('#garage-shot-skip').focus();
  await page.keyboard.press('Enter');
  await finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.body.dataset.gameScreen), 'garage');
  assert.equal(await page.locator('#livery-editor').isVisible(), false, 'Skip press activated the livery editor');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.locator('#garage-shot-skip').click();
  await finished();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('e');
  await page.locator('#garage-shot-skip').click();
  await finished();
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(() => __ns.view.garageCutscene?.elapsed > .5);
  await capture('mobile');
  await page.locator('#garage-shot-skip').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('e');
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'garage');
  assert.equal(await page.evaluate(() => Boolean(__ns.view.garageCutscene)), false);
  await page.evaluate(() => { Object.assign(__ns.sim.state.vehicle, { x: 17, z: 911, heading: 0 }); });
  await page.locator('[data-menu-screen="garage"] [data-menu-action="back"]').click();
  assert.equal(await pose(), exitPose);
  assert.equal(await page.evaluate(() => Boolean(__ns.view.garageCutscene)), false);
  assert.equal(await page.evaluate(() => document.getElementById('menu-root').inert), false);
  assert.deepEqual(errors, []);
  console.log('Garage shots passed: arrival, customized departure, frozen sim, handoff, keyboard/pad/touch skip, repeat visit, mobile and reduced motion.');
} finally { await browser?.close(); await server?.close(); }
