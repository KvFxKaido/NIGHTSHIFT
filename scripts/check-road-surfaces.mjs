import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
await mkdir('artifacts', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer;
      renderer.setPixelRatio(.5);
      renderer.shadowMap.enabled = false;
      const render = renderer.render.bind(renderer);
      renderer.render = (...args) => { if (window.captureRoad) { window.captureRoad = false; render(...args); } };
    }});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?freeze=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 180000 });
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  for (const [name, position, target] of [
    ['garage', [-30, 45, 956], [8, 2, 907]],
    ['junction', [-9, 75, 825], [-9, 2, 775]],
    ['street', [-14, 4, 885], [-13, 2, 810]],
  ]) {
    await page.evaluate(({ position, target }) => {
      __ns.freeze(true);
      const { view } = __ns;
      view.camera.position.set(...position);
      view.camera.lookAt(...target);
      view.camera.updateMatrixWorld();
      window.captureRoad = true;
      view.renderer.render(view.scene, view.camera);
    }, { position, target });
    await page.screenshot({ path: `artifacts/roads-${name}.png`, timeout: 60000 });
  }
  console.log(JSON.stringify({ errors, captures: ['garage', 'junction', 'street'] }));
  if (errors.length) throw Error(errors.join('\n'));
} finally { await browser?.close(); await server.close(); }
