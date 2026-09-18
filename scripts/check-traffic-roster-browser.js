// Run in an isolated Playwright CLI session against the worktree preview.
async (page, base = 'http://127.0.0.1:5174/') => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(base + '?scene=track&freeze=1');
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 90000 });
  const fleet = await page.evaluate(() => {
    __ns.tick(120); __ns.shot();
    return [...new Set(__ns.sim.state.traffic.vehicles.map(v => v.kind))];
  });
  if (!fleet.includes('suv') || fleet.length !== 5) throw Error('Live traffic roster incomplete');
  await page.screenshot({ path: 'artifacts/traffic-street.png' });
  const budget = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { addTraffic, updateTraffic } = await import('/src/render/traffic.ts');
    const kinds = ['sedan', 'taxi', 'suv', 'van', 'box-truck'];
    const traffic = structuredClone(__ns.sim.state.traffic);
    traffic.vehicles = kinds.map((kind, i) => ({ ...traffic.vehicles.find(v => v.kind === kind), x: (i - 2) * 4.5, y: 0, z: 0, heading: 0, braking: false }));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x222932);
    scene.add(new THREE.HemisphereLight(0xc6dcf0, 0x55504a, 2));
    const key = new THREE.DirectionalLight(0xffe0b5, 3); key.position.set(-10, 15, -10); scene.add(key);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x343b42, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.01; scene.add(ground);
    const view = addTraffic(scene, traffic); updateTraffic(view, traffic);
    const camera = new THREE.PerspectiveCamera(38, 1600 / 900, .1, 150);
    camera.position.set(12, 12, -28); camera.lookAt(0, 0.7, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1600, 900); renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222932';
    overlay.append(renderer.domElement);
    const label = document.createElement('div'); label.textContent = 'PORT ALDER / TRAFFIC   •   SEDAN / TAXI / SUV / PANEL VAN / BOX TRUCK';
    label.style.cssText = 'position:absolute;left:40px;top:32px;color:#e6e2d5;font:18px monospace;letter-spacing:2px';
    overlay.append(label); document.body.append(overlay);
    renderer.render(scene, camera);
    window.trafficReview = { renderer, scene, camera, traffic, view, updateTraffic };
    return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  });
  await page.screenshot({ path: 'artifacts/traffic-roster-front.png' });
  await page.evaluate(() => {
    const { renderer, scene, camera, traffic, view, updateTraffic } = window.trafficReview;
    traffic.vehicles.forEach(v => v.braking = true);
    updateTraffic(view, traffic);
    camera.position.set(-12, 10, 28); camera.lookAt(0, .7, 0); renderer.render(scene, camera);
  });
  await page.screenshot({ path: 'artifacts/traffic-roster-rear.png' });
  if (errors.length) throw Error(errors.join('\n'));
  return { fleet, budget, errors };
}
