import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Requires Vite's dev server for direct source imports and the legacy study shortcut.
const base = process.env.STADIUM_URL ?? 'http://localhost:5177';
await mkdir('artifacts/yard-shell', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value; window.drawShell = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1); api.view.renderer.render = () => {};
    } });
  });
  console.log('Loading arena');
  await page.goto(`${base}/?world=alder&scene=track&freeze=1&yardShell=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready' && __ns.view.scene.userData.yardShell?.state === 'ready');
  console.log('Capturing arena');
  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { view } = __ns;
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.visibility = 'hidden');
    const light = new THREE.HemisphereLight(0xc0d9e8, 0x605343, 2);
    view.scene.add(light);
    const camera = view.camera.clone(); window.shellStudy = { light, camera, fog: view.scene.fog };
    let meshes = 0, triangles = 0;
    view.scene.getObjectByName('wharf-arena').traverse(o => {
      if (!o.isMesh) return; meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    });
    return { ...view.scene.userData.yardShell, meshes, triangles, player: { x: __ns.sim.state.vehicle.x, z: __ns.sim.state.vehicle.z } };
  });
  for (const shot of [
    { name: 'overview', eye: [-160, 450, 1470], target: [-600, 3, 997] },
    { name: 'inside', eye: [-730, 6, 1040], target: [-1100, 12, 990] },
    { name: 'plan', eye: [-600, 1050, 998], target: [-600, 0, 997] },
  ]) {
    await page.evaluate(({ eye, target }) => {
      const { view } = __ns, { camera } = shellStudy;
      view.scene.fog = null;
      camera.position.set(...eye); camera.lookAt(...target); camera.near = 1; camera.far = 2500; camera.fov = 58; camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);
      view.moon.position.set(eye[0] + 40, 180, eye[2] + 40); view.moon.target.position.set(...target);
      drawShell(view.scene, camera);
    }, shot);
    await page.screenshot({ path: `artifacts/yard-shell/${shot.name}.png` });
  }
  await page.evaluate(() => {
    shellStudy.light.visible = false;
    __ns.view.scene.fog = shellStudy.fog;
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.removeProperty('visibility'));
    __ns.shot();
    drawShell(__ns.view.scene, __ns.view.camera);
  });
  await page.screenshot({ path: 'artifacts/yard-shell/driver-night.png' });
  assert.equal(new URL(page.url()).searchParams.get('venue'), 'stadium');
  assert.equal(new URL(page.url()).searchParams.has('yardShell'), false);
  assert.ok(Math.abs(report.player.x + 126) < 1 && Math.abs(report.player.z - 974) < 1);
  const driving = await page.evaluate(async () => {
    __ns.drive('W120');
    return { x: __ns.sim.state.vehicle.x, speed: __ns.sim.state.vehicle.speed };
  });
  assert.ok(driving.x < report.player.x - 3 && driving.speed > 1);
  assert.equal(report.collision, true); assert.ok(report.triangles < 5000); assert.deepEqual(errors, []);
  await page.goto(`${base}/?world=alder&scene=track&freeze=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const normal = await page.evaluate(() => ({ arena: !!__ns.view.scene.getObjectByName('wharf-arena'),
    x: __ns.sim.state.vehicle.x, z: __ns.sim.state.vehicle.z }));
  assert.equal(normal.arena, true); assert.ok(Math.abs(normal.x - 13) < 1 && Math.abs(normal.z - 910) < 1);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/yard-shell/check.json', JSON.stringify({ report, driving, normal, errors }, null, 2));
  console.log(JSON.stringify({ report, driving, normal, errors }));
} finally { await browser.close(); }
