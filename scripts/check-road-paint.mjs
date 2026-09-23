import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'before';
const out = `artifacts/road-paint/${label}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value; window.paintDraw = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.setPixelRatio(1); api.view.renderer.render = () => {};
    } });
  });
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1');
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.visibility = 'hidden');
    const { view } = __ns;
    const light = new THREE.HemisphereLight(0xc0d9e8, 0x605343, 2);
    window.paintStudy = { light, fog: view.scene.fog, moon: view.moon.position.clone(), moonTarget: view.moon.target.position.clone() };
    view.scene.add(light);
    view.scene.fog = null;
    window.paintCamera = view.camera.clone();
  });
  for (const shot of (process.argv.includes('--chase-only') ? [] : [
    { name: 'wharf-aerial', eye: [-160, 450, 1470], target: [-300, 3, 760] },
    { name: 'harbor-bend', eye: [-150, 190, 960], target: [-65, 2, 760] },
    { name: 'pike-grid', eye: [-180, 270, -250], target: [-130, 2, -560] },
    { name: 'sodo-grid', eye: [210, 380, 630], target: [170, 2, 200] },
    { name: 'harbor-join', eye: [-480, 185, 140], target: [-645, 2, 25] },
  ])) {
    await page.evaluate(({eye, target}) => {
      const { view } = __ns, camera = paintCamera;
      camera.position.set(...eye); camera.lookAt(...target); camera.near = 1; camera.far = 2800; camera.fov = 52; camera.updateProjectionMatrix();
      view.sky.position.copy(camera.position);
      view.moon.position.set(eye[0] + 40, eye[1] + 80, eye[2] + 40); view.moon.target.position.set(...target);
      paintDraw(view.scene, camera);
    }, shot);
    await page.screenshot({path: `${out}/${shot.name}.png`});
  }
  await page.evaluate(() => {
    document.getElementById('garage-shot-skip').click();
    const { sim, view } = __ns;
    paintStudy.light.visible = false; view.scene.fog = paintStudy.fog;
    view.moon.position.copy(paintStudy.moon); view.moon.target.position.copy(paintStudy.moonTarget);
    view.garageCutscene = undefined;
    sim.body.setTranslation({ x: -14.5, y: 2.5, z: 976 }, true);
    sim.body.setRotation({ x: 0, y: 1, z: 0, w: 0 }, true);
    __ns.tick(1); __ns.shot();
    document.querySelectorAll('body > :not(canvas):not(script)').forEach(el => el.style.removeProperty('visibility'));
    paintDraw(view.scene, view.camera);
  });
  await page.screenshot({path: `${out}/driver-bend.png`});
  await writeFile(`${out}/check.json`, JSON.stringify({errors}));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${out}`);
} finally { await browser.close(); }
