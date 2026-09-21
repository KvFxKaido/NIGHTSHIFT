import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('artifacts/corners', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value; api.view.renderer.setPixelRatio(1);
      window.drawCorner = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.render = () => {};
    } });
  });
  await page.goto(`${process.env.CORNER_TEST_URL ?? 'http://localhost:5173/'}?world=alder&scene=track&freeze=1&car=cinder`);
  await page.waitForFunction(() => window.__ns?.view);
  await page.keyboard.press('Escape');
  const sites = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { CORNER_SITES } = await import('/src/sim/corner-dressing.ts');
    const alder = await import('/src/sim/alder.ts');
    const { cornerRoute } = await import('/tests/helpers/corner-route.ts');
    __ns.freeze(true);
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => { el.style.visibility = 'hidden'; });
    const fill = new THREE.HemisphereLight(0xc0d9e8, 0x66614a, 2.5); __ns.view.scene.add(fill);
    window.cornerStudy = { THREE, sites: CORNER_SITES, ...alder, fill, cornerRoute };
    return CORNER_SITES.map(site => ({ id: site.id, name: site.name, kind: site.kind }));
  });
  const report = [];
  for (const site of sites) {
    const result = await page.evaluate(id => {
      const { sites, alderHeight, fill } = cornerStudy, site = sites.find(s => s.id === id);
      const { view, sim } = __ns, c = Math.cos(site.rotation), s = Math.sin(site.rotation);
      const x = site.x + c * 12 - s * 11, z = site.z + s * 12 + c * 11;
      Object.assign(sim.state.vehicle, { x, z, y: alderHeight(x, z), heading: Math.atan2(c, s) });
      view.car.position.set(x, sim.state.vehicle.y, z); view.car.rotation.y = sim.state.vehicle.heading;
      for (let frame = 0; frame < 100; frame++) view.grass.update(sim.state, 1 / 60);
      const base = alderHeight(site.x, site.z);
      view.camera.position.set(site.x + c * 20 - s * 30, base + 15, site.z + s * 20 + c * 30);
      view.camera.lookAt(site.x, base + .5, site.z); view.camera.fov = 48; view.camera.updateProjectionMatrix();
      view.moon.position.set(site.x - 90, base + 140, site.z + 80); view.moon.target.position.set(site.x, base, site.z);
      view.sky.position.set(site.x, base, site.z);
      window.cornerCamera = view.camera.clone();
      fill.visible = true; drawCorner(view.scene, view.camera);
      const group = view.scene.getObjectByName(`corner-dressing:${id}`);
      return { id, groups: group.children.length, solids: group.children.filter(m => m.isInstancedMesh).reduce((n, m) => n + m.count, 0) };
    }, site.id);
    assert.equal(result.solids, site.kind === 'freight' ? 6 : 5);
    await page.screenshot({ path: `artifacts/corners/${site.id}-study.png` });
    if (['harbor-yard', 'pike-planters', 'highland-terrace'].includes(site.id)) {
      await page.evaluate(() => {
        cornerStudy.fill.visible = false; __ns.view.camera.copy(cornerCamera);
        drawCorner(__ns.view.scene, __ns.view.camera);
      });
      await page.screenshot({ path: `artifacts/corners/${site.id}-night.png` });
      await page.evaluate(id => {
        const { sites, alderHeight, cornerRoute } = cornerStudy, site = sites.find(s => s.id === id);
        const route = cornerRoute(site), { x, z, heading } = route.start;
        const { view, sim } = __ns;
        Object.assign(sim.state.vehicle, route.start);
        view.car.position.set(x, alderHeight(x, z), z); view.car.rotation.y = heading;
        for (let frame = 0; frame < 100; frame++) view.grass.update(sim.state, 1 / 60);
        view.camera.position.set(x + Math.sin(heading) * 6, alderHeight(x, z) + 2.5, z + Math.cos(heading) * 6);
        view.camera.lookAt(site.x, alderHeight(site.x, site.z) + .7, site.z);
        view.camera.fov = 58; view.camera.updateProjectionMatrix();
        drawCorner(view.scene, view.camera);
      }, site.id);
      await page.screenshot({ path: `artifacts/corners/${site.id}-approach.png` });
    }
    report.push(result);
  }
  assert.deepEqual(errors, []);
  await writeFile('artifacts/corners/browser-check.json', JSON.stringify({ sites: report, errors }, null, 2));
  console.log(JSON.stringify({ sites: report.length, solids: report.reduce((n, site) => n + site.solids, 0), errors }));
} finally { await browser.close(); }
