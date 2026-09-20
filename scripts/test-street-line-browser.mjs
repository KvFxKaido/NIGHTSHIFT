import assert from 'node:assert/strict';
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
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer;
      renderer.setPixelRatio(.5); renderer.shadowMap.enabled = false;
      const draw = renderer.render.bind(renderer);
      renderer.render = (...args) => { if (window.captureLine) { window.captureLine = false; draw(...args); } };
    }});
  });
  const report = [];
  for (const id of ['gen-7', 'street-uptown', 'street-uptown-clear']) {
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?scene=track&race=${id}&freeze=1`);
    await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
    const result = await page.evaluate(id => {
      __ns.freeze(true);
      const route = __ns.sim.rivalDefinition;
      if (!route) throw Error('Missing race rival');
      const conditional = !!route.line;
      if (conditional !== (id !== 'street-uptown-clear')) throw Error(`Wrong line mode for ${id}`);
      if (conditional) {
        for (let i = 0; i < 180 && (__ns.sim.state.rival.driver.lineBlend ?? 0) < .8; i++) __ns.tick(30);
        if ((__ns.sim.state.rival.driver.lineBlend ?? 0) < .8) throw Error('Rival never took a corner line');
      }
      __ns.shot();
      const { view } = __ns, rival = __ns.sim.state.rival;
      view.camera.position.set(rival.vehicle.x + 18, rival.vehicle.y + 15, rival.vehicle.z + 18);
      view.camera.lookAt(rival.vehicle.x, rival.vehicle.y, rival.vehicle.z);
      view.camera.updateMatrixWorld();
      window.captureLine = true;
      view.renderer.render(view.scene, view.camera);
      return { id, conditional, corners: route.line?.corners.length ?? 0, blend: rival.driver.lineBlend ?? 0,
        seconds: rival.race.ticks / 60, groundContact: rival.vehicle.groundContact };
    }, id);
    await page.screenshot({ path: `artifacts/street-line-${id}.png`, timeout: 60000 });
    report.push(result);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ report, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
