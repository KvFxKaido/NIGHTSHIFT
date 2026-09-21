import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts/garage-upgrade', { recursive: true });
const browser = await chromium.launch({ args: [`--use-angle=${process.env.GARAGE_TEST_ANGLE ?? 'd3d11'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value;
      window.drawGarage = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1);
      api.view.renderer.render = () => {};
    } });
  });
  const base = process.env.GARAGE_TEST_URL ?? 'http://localhost:5173/';
  await page.goto(`${base}?world=alder&scene=main&freeze=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['portrait', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => drawGarage(__ns.view.scene, __ns.view.camera));
    await page.screenshot({ path: `artifacts/garage-upgrade/menu-${name}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    __ns.go('track'); __ns.freeze(true);
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.visibility = 'hidden');
    const THREE = await import('/node_modules/three/build/three.module.js');
    const fill = new THREE.HemisphereLight(0xc0d9e8, 0x605343, 1.5);
    __ns.view.scene.add(fill);
    window.garageStudy = { fill };
  });
  for (const shot of [
    { name: 'front', eye: [-20, 13, 934], target: [24, 6, 910], fill: true },
    { name: 'rear', eye: [70, 12, 944], target: [34, 7, 915], fill: true },
    { name: 'street-night', eye: [-15, 5, 923], target: [24, 7, 910], fill: false },
  ]) {
    await page.evaluate(({ eye, target, fill }) => {
      const { view } = __ns;
      garageStudy.fill.visible = fill;
      view.moon.position.set(60, 180, 950); view.moon.target.position.set(24, 2, 910);
      const camera = view.camera.clone(); camera.position.set(...eye); camera.lookAt(...target);
      camera.fov = 55; camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position); drawGarage(view.scene, camera);
    }, shot);
    await page.screenshot({ path: `artifacts/garage-upgrade/${shot.name}.png` });
  }
  const budget = await page.evaluate(async () => {
    const { ALDER_EVERGREENS, ALDER_GROUNDS_ISSUES, ALDER_FRONTAGE_ISSUES } = await import('/src/sim/alder.ts');
    let meshes = 0, triangles = 0, lights = 0;
    for (const name of ['district-garage', 'garage-forecourt']) __ns.view.scene.getObjectByName(name).traverse(object => {
      if (object.isLight) lights++;
      if (!object.isMesh) return;
      meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    return { meshes, triangles, lights, evergreens: ALDER_EVERGREENS.length, groundsIssues: ALDER_GROUNDS_ISSUES, frontageIssues: ALDER_FRONTAGE_ISSUES };
  });
  assert.deepEqual(errors, []);
  assert.equal(budget.lights, 2, 'Only the two original menu lights');
  assert.deepEqual(budget.groundsIssues, []);
  assert.deepEqual(budget.frontageIssues, []);
  await writeFile('artifacts/garage-upgrade/check.json', JSON.stringify({ budget, errors }, null, 2));
  console.log(JSON.stringify({ budget, errors }, null, 2));
} finally { await browser.close(); }
