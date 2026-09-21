import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.setDefaultTimeout(90000);
  // Software WebGL: render only the frames we inspect, not the entire city's idle loop.
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      window.updateTestGrass = api.view.grass.update.bind(api.view.grass);
      api.view.grass.update = () => {};
      api.view.celSmoke = undefined;
      const renderer = api.view.renderer, draw = renderer.render;
      renderer.setPixelRatio(1);
      renderer.render = function(scene, camera) {
        scene.updateMatrixWorld(); camera.updateMatrixWorld();
        if (!window.grassCapture) return;
        window.grassCapture = false;
        return draw.call(this, scene, camera);
      };
    } });
  });
  await page.goto(`${process.env.GRASS_TEST_URL ?? 'http://localhost:5173/'}?world=alder&scene=track&freeze=1&car=cinder&lighting=${process.env.GRASS_LIGHTING ?? 'blockout'}`);
  await page.waitForFunction(() => window.__ns?.view?.grass);
  await page.keyboard.press('Escape');
  const report = await page.evaluate(async () => {
    const { sim, view } = __ns;
    const { alderHeight } = await import('/src/sim/alder.ts');
    const { step } = await import('/src/sim/sim.ts');
    const { resetViewCamera } = await import('/src/render/scene.ts');
    __ns.freeze(true);
    const car = sim.state.vehicle;
    Object.assign(car, { x: 35, z: 850, y: alderHeight(35, 850), heading: 0, speed: 0, forwardSpeed: 0, lateralSpeed: 0 });
    sim.body.setTranslation({ x: car.x, y: .55, z: car.z }, true);
    sim.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    sim.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const before = JSON.stringify(sim.state);
    for (let i = 0; i < 45; i++) updateTestGrass(sim.state, 0);
    assertEqual(JSON.stringify(sim.state), before, 'grass mutated the sim');
    for (let i = 0; i < 60; i++) updateTestGrass(sim.state, 1 / 60);
    resetViewCamera(view);
    view.cameraPosition.set(car.x + 5, car.y + 3, car.z + 9);
    view.cameraTarget.set(car.x, car.y + .5, car.z - 2);
    window.grassCapture = true;
    __ns.tick(0);
    const count = () => view.scene.children.filter(o => o.name.startsWith('grass-'));
    const clean = count().reduce((n, tile) => n + tile.geometry.instanceCount, 0);
    window.grassTest = { step, alderHeight, count };
    return { initialTiles: count().length, tufts: clean };
    function assertEqual(a, b, label) { if (a !== b) throw new Error(label); }
  });
  await page.screenshot({ path: 'artifacts/grass-before.png' });
  const driving = await page.evaluate(() => {
    const { sim, view } = __ns;
    // Exercise actual wheel movement at fixed ticks; grass observes each tick.
    for (let i = 0; i < 150; i++) {
      grassTest.step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      updateTestGrass(sim.state, 1 / 60);
    }
    view.cameraPosition.set(sim.state.vehicle.x + 4, sim.state.vehicle.y + 3, sim.state.vehicle.z + 9);
    view.cameraTarget.set(sim.state.vehicle.x, sim.state.vehicle.y + .5, sim.state.vehicle.z - 2);
    window.grassCapture = true;
    __ns.tick(0);
    let pressed = 0;
    for (const tile of grassTest.count()) {
      const data = tile.geometry.getAttribute('grassPress');
      for (let i = 0; i < data.count; i++) if (data.getZ(i) > .1) pressed++;
    }
    return { pressed, position: { x: sim.state.vehicle.x, z: sim.state.vehicle.z }, ground: sim.state.vehicle.groundContact,
      drawCalls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
  });
  await page.screenshot({ path: 'artifacts/grass-driven.png' });
  assert.ok(report.tufts > 1000, 'missing grass');
  assert.ok(report.initialTiles <= 121, 'unbounded tiles');
  assert.ok(driving.pressed > 30, 'wheels left no trail');
  const detail = await page.evaluate(() => {
    const { sim, view } = __ns;
    const car = sim.state.vehicle;
    view.camera.position.set(car.x + 5, car.y + 2.4, car.z + 7);
    view.camera.lookAt(car.x, car.y + .1, car.z + 1);
    window.grassDetailCamera = { position: view.camera.position.toArray(), quaternion: view.camera.quaternion.toArray() };
    window.grassCapture = true;
    view.renderer.render(view.scene, view.camera);
    const withGrass = { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
    const visible = grassTest.count().map(tile => tile.visible);
    for (const tile of grassTest.count()) tile.visible = false;
    window.grassCapture = true;
    view.renderer.render(view.scene, view.camera);
    const cost = { calls: withGrass.calls - view.renderer.info.render.calls, triangles: withGrass.triangles - view.renderer.info.render.triangles };
    grassTest.count().forEach((tile, i) => { tile.visible = visible[i]; });
    window.grassCapture = true;
    view.renderer.render(view.scene, view.camera);
    return { camera: view.camera.position.toArray(), grassCost: cost };
  });
  await page.screenshot({ path: 'artifacts/grass-detail.png' });
  await page.evaluate(() => {
    // Keep the camera and car fixed while the trail behind recovers.
    for (let i = 0; i < 80; i++) updateTestGrass(__ns.sim.state, .1);
    __ns.view.camera.position.fromArray(grassDetailCamera.position);
    __ns.view.camera.quaternion.fromArray(grassDetailCamera.quaternion);
    window.grassCapture = true;
    __ns.view.renderer.render(__ns.view.scene, __ns.view.camera);
  });
  await page.screenshot({ path: 'artifacts/grass-recovered.png' });
  // Inspect the transition in motion, across tile boundaries at driving speed.
  for (let frame = 0; frame < 3; frame++) {
    await page.evaluate(() => {
      const { sim, view } = __ns;
      for (let tick = 0; tick < 90; tick++) {
        grassTest.step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
        updateTestGrass(sim.state, 1 / 60);
      }
      const car = sim.state.vehicle;
      view.cameraPosition.set(car.x + 4, car.y + 3, car.z + 9);
      view.cameraTarget.set(car.x, car.y + .5, car.z - 2);
      window.grassCapture = true;
      __ns.tick(0);
    });
    await page.screenshot({ path: `artifacts/grass-moving-${frame}.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile('artifacts/grass-check.json', JSON.stringify({ ...report, ...driving, ...detail, errors }, null, 2));
  console.log(JSON.stringify({ ...report, ...driving, ...detail, errors }));
} finally { await browser.close(); }
