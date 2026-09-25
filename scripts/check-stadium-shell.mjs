import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const before = process.argv.includes('--before');
const base = process.env.STADIUM_URL ?? 'http://localhost:5177';
const output = `artifacts/stadium-shell/${before ? 'before' : 'after'}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value;
      window.drawStadium = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1);
      api.view.renderer.render = () => {};
    } });
  });
  await page.goto(`${base}/?venue=stadium&scene=track&freeze=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { view } = __ns;
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.visibility = 'hidden');
    const light = new THREE.HemisphereLight(0xc0d9e8, 0x605343, 2);
    view.scene.add(light);
    window.stadiumStudy = { light, camera: view.camera.clone(), fog: view.scene.fog };
    let meshes = 0, triangles = 0;
    view.scene.getObjectByName('wharf-arena').traverse(o => {
      if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }
    });
    return { ...view.scene.userData.yardShell, meshes, triangles, seals: !!view.scene.getObjectByName('stadium-seals') };
  });
  for (const shot of [
    { name: 'overview', eye: [-160, 450, 1470], target: [-600, 3, 997] },
    { name: 'east-wall', eye: [-220, 80, 1070], target: [-102, 15, 940] },
    { name: 'north-wall', eye: [-650, 75, 990], target: [-560, 15, 850] },
  ]) {
    await page.evaluate(({ eye, target }) => {
      const { view } = __ns, { camera } = stadiumStudy;
      view.scene.fog = null;
      camera.position.set(...eye); camera.lookAt(...target);
      camera.near = 1; camera.far = 2500; camera.fov = 58; camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);
      view.moon.position.set(eye[0] + 40, 180, eye[2] + 40); view.moon.target.position.set(...target);
      drawStadium(view.scene, camera);
    }, shot);
    await page.screenshot({ path: `${output}/${shot.name}.png` });
  }
  await page.reload();
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  await page.evaluate(() => { __ns.shot(); drawStadium(__ns.view.scene, __ns.view.camera); });
  await page.screenshot({ path: `${output}/driver-night.png` });
  if (!before) { assert.equal(report.seals, false); assert.equal(report.enclosure, 'closed'); }
  const gates = [];
  if (!before) {
    const ready = () => page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
    const placeAtMarker = async (id, side) => page.evaluate(async ({ id, side }) => {
      const { STADIUM_GATES, STADIUM } = await import('/src/sim/stadium.ts');
      const { leaveGarage } = await import('/src/sim/sim.ts');
      const gate = STADIUM_GATES.find(g => g.id === id);
      const p = gate[side].marker;
      const arrive = side === 'venue' ? gate.venue.arrive : gate.city.leave;
      leaveGarage(__ns.sim, { ...p, y: STADIUM.base, heading: arrive.heading + Math.PI, pitch: 0 });
      __ns.shot(); drawStadium(__ns.view.scene, __ns.view.camera);
    }, { id, side });
    for (const id of ['east', 'north']) {
      await page.goto(`${base}/?venue=stadium&scene=track&gate=${id}&freeze=1`);
      await ready();
      await placeAtMarker(id, 'venue');
      assert.match(await page.locator('#garage-entry').innerText(), new RegExp(`Leave by the ${id} gate`));
      await page.screenshot({ path: `${output}/${id}-marker-night.png` });
      await page.locator('#garage-entry').click();
      await page.waitForURL(url => !url.searchParams.has('venue') && url.searchParams.get('gate') === id);
      await ready();
      const city = await page.evaluate(() => ({ enclosure: __ns.view.scene.userData.yardShell.enclosure,
        x: __ns.sim.state.vehicle.x, z: __ns.sim.state.vehicle.z }));
      assert.equal(city.enclosure, 'open');
      const expected = id === 'east' ? [-26, 910] : [-560, 815];
      assert.ok(Math.hypot(city.x - expected[0], city.z - expected[1]) < 1);
      await placeAtMarker(id, 'city');
      assert.match(await page.locator('#garage-entry').innerText(), /Enter Wharf Arena/);
      await page.locator('#garage-entry').click();
      await page.waitForURL(url => url.searchParams.get('venue') === 'stadium' && url.searchParams.get('gate') === id);
      await ready();
      const venue = await page.evaluate(() => ({ enclosure: __ns.view.scene.userData.yardShell.enclosure,
        x: __ns.sim.state.vehicle.x, z: __ns.sim.state.vehicle.z }));
      assert.equal(venue.enclosure, 'closed');
      const arrival = id === 'east' ? [-126, 974] : [-560, 895];
      assert.ok(Math.hypot(venue.x - arrival[0], venue.z - arrival[1]) < 1);
      gates.push({ id, city, venue });
    }
    // A missing closed GLB must fall back to the closed collision bake, never the city's open shell.
    await page.route('**/assets/wharf-arena/closed-shell.glb', route => route.abort());
    await page.reload(); await ready();
    const fallback = await page.evaluate(() => {
      const mesh = __ns.view.scene.getObjectByName('wharf-arena');
      return { enclosure: __ns.view.scene.userData.yardShell.enclosure, triangles: mesh.geometry.index.count / 3 };
    });
    assert.deepEqual(fallback, { enclosure: 'closed', triangles: 3675 });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/check.json`, JSON.stringify({ report, gates, errors }, null, 2));
  console.log(JSON.stringify({ report, gates, errors }));
} finally { await browser.close(); }
