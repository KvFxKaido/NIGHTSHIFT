import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.setDefaultTimeout(90000);
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { configurable: true, get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer;
      renderer.setPixelRatio(1);
      window.drawFir = renderer.render.bind(renderer);
      renderer.render = () => {};
    } });
  });
  await page.goto(`${process.env.FIR_TEST_URL ?? 'http://localhost:5173/'}?world=alder&scene=track&freeze=1&car=cinder`);
  await page.waitForFunction(() => window.__ns?.view);
  await page.keyboard.press('Escape');
  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { addEvergreens } = await import('/src/render/evergreens.ts');
    const { ALDER_EVERGREENS, alderHeight } = await import('/src/sim/alder.ts');
    __ns.freeze(true);
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => { el.style.visibility = 'hidden'; });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x273641);
    scene.add(new THREE.HemisphereLight(0xc0d9e8, 0x4b4933, 2));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.5); sun.position.set(-15, 25, 18); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x39483a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const tree = { id: 'fir-study', grove: 'study', height: 19, radius: 4.3,
      trunk: { x: 0, z: 0, base: 0, height: 11.4, width: 1.25, depth: 1.25, rotation: 0 } };
    addEvergreens(scene, [tree], false);
    const car = __ns.view.car.clone(); car.position.set(-6, 0, 3); car.rotation.set(0, -.6, 0); scene.add(car);
    const camera = new THREE.PerspectiveCamera(42, 1.4, .1, 300);
    camera.position.set(18, 12, 30); camera.lookAt(-1, 9, 0);
    drawFir(scene, camera);
    window.firStudy = { THREE, ALDER_EVERGREENS, alderHeight, scene, camera };
    const meshes = scene.getObjectByName('alder-evergreens').children;
    return { trianglesPerTree: meshes.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3, 0) };
  });
  await page.screenshot({ path: 'artifacts/fir-study.png' });
  await page.evaluate(() => {
    const { scene, camera } = firStudy;
    camera.position.set(-20, 11, -29); camera.lookAt(0, 9, 0);
    drawFir(scene, camera);
  });
  await page.screenshot({ path: 'artifacts/fir-reverse.png' });
  await page.evaluate(async () => {
    const { scene, camera } = firStudy;
    const { addEvergreens } = await import('/src/render/evergreens.ts');
    const trees = [
      { x: -11, z: -8, height: 15, radius: 3.5 },
      { x: 9, z: -12, height: 23, radius: 5 },
      { x: -2, z: -18, height: 17, radius: 3.9 },
    ].map((t, i) => ({ id: `grove-study-${i}`, grove: 'study', height: t.height, radius: t.radius,
      trunk: { x: t.x, z: t.z, base: 0, height: t.height * .6, width: 1.25, depth: 1.25, rotation: 0 } }));
    addEvergreens(scene, trees, false);
    camera.position.set(29, 13, 43); camera.lookAt(0, 10, -4);
    drawFir(scene, camera);
  });
  await page.screenshot({ path: 'artifacts/fir-grove.png' });
  await page.evaluate(() => {
    const { scene, camera } = firStudy;
    camera.position.set(36, 7, 100); camera.lookAt(0, 10, -4);
    drawFir(scene, camera);
  });
  await page.screenshot({ path: 'artifacts/fir-distance.png' });
  await page.evaluate(() => {
    const { ALDER_EVERGREENS, alderHeight } = firStudy;
    const tree = ALDER_EVERGREENS.find(t => t.grove === 'freight-edge');
    const { view, sim } = __ns, t = tree.trunk;
    const car = sim.state.vehicle;
    Object.assign(car, { x: t.x + 9, z: t.z + 10, y: alderHeight(t.x + 9, t.z + 10) });
    view.car.position.set(car.x, car.y, car.z);
    for (let i = 0; i < 100; i++) view.grass.update(sim.state, 1 / 60);
    view.camera.position.set(t.x + 22, t.base + 10, t.z + 30);
    view.camera.lookAt(t.x, t.base + 8, t.z);
    view.camera.fov = 48; view.camera.updateProjectionMatrix();
    view.moon.position.set(t.x - 90, t.base + 140, t.z + 80); view.moon.target.position.set(t.x, t.base, t.z);
    view.sky.position.set(t.x, t.base, t.z);
    drawFir(view.scene, view.camera);
  });
  await page.screenshot({ path: 'artifacts/fir-city-night.png' });
  assert.deepEqual(errors, []);
  await writeFile('artifacts/fir-check.json', JSON.stringify({ ...report, errors }, null, 2));
  console.log(JSON.stringify({ ...report, errors }));
} finally { await browser.close(); }
