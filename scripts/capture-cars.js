// Reference renders of every car from the game's own garage: one fixed
// camera, one turntable, one lighting rig, so the set is one set. Front
// three-quarter is the livery editor's "hood" view, rear three-quarter its
// "rear" view. Each body is swapped onto the turntable through the app's own
// modules and carries its authored colours: the player's paint is never
// applied, because these are the cars as rivals present them. The capture is
// clipped to the turntable, since the garage frames the car left of centre
// to leave room for its menu. Outputs design/reference/cars/<id>-<view>.png.
//
//   playwright-cli -s=cars open http://localhost:5173/
//   playwright-cli -s=cars run-code "$(cat scripts/capture-cars.js)"
//   playwright-cli -s=cars close
async page => {
  page.setDefaultTimeout(30000);
  const base = 'http://localhost:5173/';
  const cars = ['blender', 'bulwark', 'kestrel', 'hammer'];
  const views = { front: -Math.PI / 4, rear: Math.PI * 0.75 };
  const clip = { x: 40, y: 120, width: 660, height: 440 };
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto(`${base}?scene=garage&car=blender&freeze=1`);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  await page.waitForFunction(() => __ns.view.mode === 'garage');
  // The canvas is the reference; every overlay hides for the capture.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view { visibility: visible !important; }' });
  const written = [];
  for (const car of cars) {
    const swapped = await page.evaluate(async car => {
      const { loadBlenderCar, BLENDER_CARS } = await import('/src/render/blender-car.ts');
      const { setPlayerCar } = await import('/src/render/scene.ts');
      const parts = await loadBlenderCar(new URL(BLENDER_CARS[car].path, document.baseURI).href, car);
      setPlayerCar(__ns.view, parts);
      __ns.shot();
      return __ns.view.car.name;
    }, car);
    for (const [name, yaw] of Object.entries(views)) {
      await page.evaluate(yaw => { __ns.view.garageYaw = yaw; __ns.shot(); }, yaw);
      await page.waitForTimeout(250);
      await page.evaluate(() => __ns.shot());
      const path = `design/reference/cars/${car}-${name}.png`;
      await page.screenshot({ path, clip });
      written.push(`${path} (${swapped})`);
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  return { written };
}
