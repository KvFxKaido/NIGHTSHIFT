import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';

await mkdir('artifacts', { recursive: true });
const server = process.env.CINDER_TEST_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server?.listen();
  const base = process.env.CINDER_TEST_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
  console.log(`Checking Cinder at ${base}`);
  // SwiftShader, as scripts/test-facade-menu.mjs does: a runner has no GPU, and
  // the facade check stalled there until it was told to use one (PR #11).
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  console.log('Browser launched');
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer, draw = renderer.render;
      renderer.setPixelRatio(1);
      renderer.render = function(scene, camera) {
        scene.updateMatrixWorld(); camera.updateMatrixWorld();
        if (!window.captureParts) return;
        window.captureParts = false;
        return draw.call(this, scene, camera);
      };
    } });
  });
  const ready = () => page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready' && !__ns.view.garageCutscene, null, { timeout: 120000 });
  const capture = async name => {
    await page.evaluate(async () => {
      const img = new Image();
      img.id = 'parts-capture';
      // Settle the camera first, then draw at the final pose for the capture.
      __ns.shot();
      window.captureParts = true;
      img.src = __ns.shot();
      img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
      await img.decode();
      document.getElementById('view').after(img);
    });
    await page.screenshot({ path: `artifacts/cinder-${name}.png` });
    await page.evaluate(() => document.getElementById('parts-capture').remove());
    console.log(`Captured ${name}`);
  };
  // The garage is rows in sections (design/MENUS.md): a part is chosen the way a
  // player does, by opening its row's section and stepping the row until it reads
  // the part, not by clicking a tile that no longer exists.
  const row = slot => page.locator(`[data-row="${slot}"]`);
  const value = slot => row(slot).getAttribute('data-value');
  const openSection = name => page.locator(`[data-section-tab="${name}"]`).click();
  const choose = async (slot, id) => {
    await openSection(await row(slot).evaluate(element => element.closest('[data-section]').dataset.section));
    for (let step = 0; step < 8 && await value(slot) !== id; step++) await row(slot).locator('[data-row-step="1"]').click();
    assert.equal(await value(slot), id, `${slot} never reached ${id}`);
  };
  const equipped = () => page.evaluate(() => {
    const variants = [];
    __ns.view.carVisual.traverse(object => {
      if (object.userData.customizationSlot && object.visible) variants.push(object.name);
    });
    return variants;
  });
  await page.goto(`${base}?world=alder&scene=garage&freeze=1`);
  await ready();
  assert.equal(await page.evaluate(() => __ns.view.car.userData.model), 'ns-cinder');
  await capture('stock');
  await choose('bodyKit', 'street');
  await choose('wheelDesign', 'six');
  await choose('wheels', 'alloy');
  await capture('street');
  assert.deepEqual((await equipped()).sort(), [...['front','skirts','rear','spoiler'].map(s => `cinder-${s}-street`), ...['front-left','front-right','rear-left','rear-right'].map(c => `cinder-wheel-six-${c}`)].sort());
  await choose('bodyKit', 'race');
  await choose('wheelDesign', 'mesh');
  await choose('tint', 'dark');
  await choose('paint', 'ice');
  await capture('race');
  assert.ok((await equipped()).includes('cinder-spoiler-wing'));
  await page.evaluate(() => { __ns.view.garageYaw = Math.PI; });
  await capture('race-rear');
  await choose('front', 'street');
  await choose('spoiler', 'none');
  assert.ok((await equipped()).includes('cinder-front-street'));
  assert.ok((await equipped()).includes('cinder-rear-race'));
  assert.ok((await equipped()).includes('cinder-spoiler-none'));
  assert.equal(await value('bodyKit'), 'mixed', 'a kit mixed from parts reads as its own state');
  await page.reload();
  await ready();
  assert.equal(await value('front'), 'street');
  assert.equal(await value('spoiler'), 'none');
  assert.equal(await value('tint'), 'dark');
  assert.ok((await equipped()).includes('cinder-rear-race'));
  await capture('mixed');
  await choose('bodyKit', 'race');
  assert.equal(await value('front'), 'race');
  assert.equal(await value('spoiler'), 'wing');
  await page.evaluate(() => { __ns.view.garageYaw = Math.PI; });
  await capture('race-restored');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'playing' && !__ns.view.garageCutscene);
  await page.evaluate(() => { __ns.drive('W120'); });
  assert.ok((await equipped()).includes('cinder-spoiler-wing'));
  await capture('race-drive');
  await page.evaluate(() => __ns.go('garage'));
  await page.setViewportSize({ width: 390, height: 844 });
  await choose('bodyKit', 'stock');
  await choose('wheelDesign', 'stock');
  await page.waitForFunction(() => document.querySelector('[data-row="wheelDesign"]').dataset.value === 'stock');
  assert.ok((await equipped()).includes('cinder-front-stock'));
  assert.ok((await equipped()).includes('cinder-rear-stock'));
  assert.ok(!(await equipped()).includes('cinder-spoiler-wing'));
  await capture('mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Unowned URL overrides intentionally fall back to Cinder. Browse a real
  // garage preview to check that Cinder-only slots disappear on other bodies.
  await openSection('car');
  await page.locator('[data-car-cycle="1"]').click();
  await page.waitForFunction(() => __ns.view.car.userData.model !== 'ns-cinder');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('[data-cinder-parts]')].every(element => element.hidden)), 'a Cinder-only row showed on another body');
  // ?unlock=1 drives a car the career has not won, for pad testing a tune. It is
  // a preview and must stay one: the car loads and drives, and the garage still
  // reads Locked because ownership is `ownsCar` and nothing wrote it.
  const sable = () => page.evaluate(() => (JSON.parse(localStorage.getItem('nightshift.progress') || '{}').names?.sable?.wins ?? []).length);
  const winsBefore = await sable();
  await page.goto(`${base}?scene=garage&car=ns01`);
  await ready();
  assert.equal(await page.evaluate(() => __ns.view.car.userData.model), 'ns-cinder', 'an unowned car without ?unlock must fall back to the Cinder');
  await page.goto(`${base}?scene=garage&car=ns01&unlock=1`);
  await ready();
  assert.equal(await page.evaluate(() => __ns.view.car.userData.model), 'ns-01', '?unlock=1 did not load the unowned car');
  assert.equal(await page.evaluate(() => __ns.sim.state.handling.car), 'ns01', '?unlock=1 drew the car without its tune');
  assert.match(await page.locator('[data-car-ownership]').textContent(), /Win the pink slip/, 'the garage claimed an unlocked car was owned');
  assert.equal(await sable(), winsBefore, '?unlock=1 wrote career progress');
  assert.deepEqual(errors, []);
  console.log('Cinder catalog: kits, mixed parts, spoilers, wheels, tint, persistence, driving, mobile, stock restore, car isolation and the ?unlock preview passed.');
} finally {
  await browser?.close();
  await server?.close();
}
