async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const checks = [];
  for (const lighting of ['blockout', 'night']) {
    await page.goto(`http://127.0.0.1:5173/?scene=track&freeze=1&lighting=${lighting}`);
    await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 30000 });
    for (const [name, x, z] of [['hill-south', -420, 9], ['ring-hotel', -247, -186]]) {
      const state = await page.evaluate(async ({x, z}) => {
        const { districtSurfaceAt } = await import('/src/sim/district.ts');
        const { step } = await import('/src/sim/sim.ts');
        const y = districtSurfaceAt(x, z);
        __ns.sim.body.setTranslation({x, y: y + 0.5, z}, true);
        __ns.sim.body.setLinvel({x:0, y:0, z:0}, true);
        step(__ns.sim, {throttle:0, brake:0, steer:0, handbrake:0});
        __ns.shot();
        const v = __ns.view;
        v.camera.position.set(x + 2, y + 65, z + 5);
        v.camera.lookAt(x, y, z);
        v.renderer.render(v.scene, v.camera);
        // Capture in the same task as rendering: WebGL clears the drawing
        // buffer before an asynchronous screenshot. Show that captured frame.
        document.getElementById('apron-capture')?.remove();
        const capture = document.createElement('img');
        capture.id = 'apron-capture';
        capture.src = v.renderer.domElement.toDataURL('image/png');
        capture.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:5;pointer-events:none';
        document.body.append(capture);
        return { world: __ns.state().roadWorld, aprons: __ns.find('district-apron-').length,
          calls: v.renderer.info.render.calls, triangles: v.renderer.info.render.triangles };
      }, {x,z});
      if (state.aprons !== 35) throw new Error(`Expected 35 aprons, found ${state.aprons}`);
      await page.screenshot({ path: `artifacts/apron-${name}-${lighting}.png` });
      checks.push({name, lighting, ...state});
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { checks, errors, note: 'Staged visual inspection; driven routes are covered by simulation tests.' };
}

