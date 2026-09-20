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
  const option = (slot, id) => page.locator(`[data-customization="${slot}"][data-option="${id}"]`);
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
  await option('bodyKit', 'street').click();
  await option('wheelDesign', 'six').click();
  await option('wheels', 'alloy').click();
  await capture('street');
  assert.deepEqual((await equipped()).sort(), [...['front','skirts','rear','spoiler'].map(s => `cinder-${s}-street`), ...['front-left','front-right','rear-left','rear-right'].map(c => `cinder-wheel-six-${c}`)].sort());
  await option('bodyKit', 'race').click();
  await option('wheelDesign', 'mesh').click();
  await option('tint', 'dark').click();
  await option('paint', 'ice').click();
  await capture('race');
  assert.ok((await equipped()).includes('cinder-spoiler-wing'));
  await page.evaluate(() => { __ns.view.garageYaw = Math.PI; });
  await capture('race-rear');
  await option('front', 'street').click();
  await option('spoiler', 'none').click();
  assert.ok((await equipped()).includes('cinder-front-street'));
  assert.ok((await equipped()).includes('cinder-rear-race'));
  assert.ok((await equipped()).includes('cinder-spoiler-none'));
  assert.equal(await page.locator('[data-customization="bodyKit"][aria-pressed="true"]').count(), 0);
  await page.reload();
  await ready();
  assert.equal(await option('front', 'street').getAttribute('aria-pressed'), 'true');
  assert.equal(await option('spoiler', 'none').getAttribute('aria-pressed'), 'true');
  assert.equal(await option('tint', 'dark').getAttribute('aria-pressed'), 'true');
  assert.ok((await equipped()).includes('cinder-rear-race'));
  await capture('mixed');
  await option('bodyKit', 'race').click();
  assert.equal(await option('front', 'race').getAttribute('aria-pressed'), 'true');
  assert.equal(await option('spoiler', 'wing').getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => { __ns.view.garageYaw = Math.PI; });
  await capture('race-restored');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'playing' && !__ns.view.garageCutscene);
  await page.evaluate(() => { __ns.drive('W120'); });
  assert.ok((await equipped()).includes('cinder-spoiler-wing'));
  await capture('race-drive');
  await page.evaluate(() => __ns.go('garage'));
  await page.setViewportSize({ width: 390, height: 844 });
  await option('bodyKit', 'stock').click();
  await option('wheelDesign', 'stock').click();
  await page.waitForFunction(() => document.querySelector('[data-customization="wheelDesign"][data-option="stock"]').getAttribute('aria-pressed') === 'true');
  assert.ok((await equipped()).includes('cinder-front-stock'));
  assert.ok((await equipped()).includes('cinder-rear-stock'));
  assert.ok(!(await equipped()).includes('cinder-spoiler-wing'));
  await capture('mobile');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Unowned URL overrides intentionally fall back to Cinder. Browse a real
  // garage preview to check that Cinder-only slots disappear on other bodies.
  await page.locator('[data-car-cycle="1"]').click();
  await page.waitForFunction(() => __ns.view.car.userData.model !== 'ns-cinder');
  assert.equal(await page.locator('[data-cinder-parts]').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('Cinder catalog: kits, mixed parts, spoilers, wheels, tint, persistence, driving, mobile, stock restore and car isolation passed.');
} finally {
  await browser?.close();
  await server?.close();
}
