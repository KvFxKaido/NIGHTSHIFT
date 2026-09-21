import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/broadcast-tower', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('requestfailed', request => console.error(`Failed request: ${request.url()} ${request.failure()?.errorText}`));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value;
      window.drawBroadcast = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1);
      api.view.renderer.render = () => {};
    } });
  });
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=cinder', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ns?.view);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    __ns.freeze(true);
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(e => e.style.visibility = 'hidden');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { alderHeight } = await import('/src/sim/alder.ts');
    const root = __ns.view.scene.getObjectByName('alder-broadcast-tower');
    const fill = new THREE.HemisphereLight(0xc0d9e8, 0x605343, 1.8);
    __ns.view.scene.add(fill);
    window.broadcastStudy = { root, fill, alderHeight };
  });
  const shots = [];
  for (const [name, x, y, z, targetY, lit] of [
    ['study', 135, 55, 230, 138, true],
    ['night', 135, 55, 230, 138, false],
    ['skyline', 280, 4, 300, 120, false],
    ['street', 45, 2.4, 42, 14, false],
    ['crown', 70, 223, 110, 220, true],
    ['reverse', -135, 25, -230, 138, true],
  ]) {
    shots.push(await page.evaluate(({ name, x, y, z, targetY, lit }) => {
      const { view, sim } = __ns, { root, fill, alderHeight } = broadcastStudy;
      const origin = root.position;
      fill.visible = lit; view.car.visible = false;
      Object.assign(sim.state.vehicle, { x: origin.x + x, z: origin.z + z, y: alderHeight(origin.x + x, origin.z + z), heading: 0 });
      for (let i = 0; i < 100; i++) view.grass.update(sim.state, 1 / 60);
      view.moon.position.set(origin.x + 60, origin.y + 280, origin.z + 100);
      view.moon.target.position.copy(origin);
      const camera = view.camera.clone();
      camera.position.set(origin.x + x, origin.y + y, origin.z + z);
      camera.lookAt(origin.x, origin.y + targetY, origin.z);
      camera.fov = 62; camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);
      drawBroadcast(view.scene, camera);
      return { name, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
    }, { name, x, y, z, targetY, lit }));
    await page.screenshot({ path: `artifacts/broadcast-tower/${name}.png` });
  }
  const budget = await page.evaluate(() => {
    let meshes = 0, triangles = 0, lights = 0;
    broadcastStudy.root.traverse(o => {
      if (o.isLight) lights++;
      if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }
    });
    return { meshes, triangles, lights };
  });
  await writeFile('artifacts/broadcast-tower/check.json', JSON.stringify({ shots, budget, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(budget.meshes <= 8);
  assert.ok(budget.triangles < 30000);
  assert.equal(budget.lights, 0);
  console.log(JSON.stringify({ shots, budget, errors }));
} finally { await browser.close(); }
