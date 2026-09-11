async page => {
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.reviewPad = { id: 'Map binding test', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.reviewPad] });
  });
  await page.goto('http://localhost:5174/?scene=track');
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const previousSave = await page.evaluate(() => localStorage.getItem('nightshift.controls'));
  const frames = () => page.evaluate(async () => {
    for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame);
  });
  const button = async (index, pressed) => {
    await page.evaluate(({ index, pressed }) => {
      window.reviewPad.buttons[index] = { value: pressed ? 1 : 0, pressed };
    }, { index, pressed });
    await frames();
  };
  try {
    await page.evaluate(async () => {
      const { copyBindings } = await import('/src/input/bindings.ts');
      const legacy = { version: 1, ...copyBindings() };
      delete legacy.gamepad.map;
      legacy.gamepad.camera = 8;
      localStorage.setItem('nightshift.controls', JSON.stringify(legacy));
    });
    await page.reload();
    await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
    await page.keyboard.press('Escape');
    await page.locator('[data-menu-screen="pause"] [data-menu-action="controls"]').click();
    const mapBinding = page.locator('[data-binding="map"][data-binding-device="gamepad"]');
    if (await mapBinding.textContent() !== 'RB / R1') throw Error('Legacy migration did not choose free RB');
    // Free A as well, so neither menu-button rejection can be masked by a duplicate.
    await page.locator('[data-binding="handbrake"][data-binding-device="gamepad"]').click();
    await frames(); await button(10, true); await button(10, false);
    for (const reserved of [0, 1]) {
      await mapBinding.click(); await frames();
      await button(reserved, true); await button(reserved, false);
      if (!(await page.locator('[data-controls-status]').textContent()).includes('Menu buttons')) {
        throw Error(`Map remap to ${reserved} was not rejected with an explanation`);
      }
      if (await mapBinding.textContent() !== 'RB / R1') throw Error('Rejected binding changed the map control');
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.body.dataset.gameScreen === 'playing');
    await button(5, true);
    if (await page.evaluate(() => document.body.dataset.gameScreen) !== 'map') throw Error('Migrated RB did not keep map open');
    await frames();
    if (await page.evaluate(() => document.body.dataset.gameScreen) !== 'map') throw Error('Held RB retriggered');
    await button(5, false); await button(5, true); await button(5, false);
    if (await page.evaluate(() => document.body.dataset.gameScreen) !== 'playing') throw Error('RB did not close map');
    if (errors.length) throw Error(errors.join('\n'));
    return { checks: 'Legacy Select conflict migrates to RB; A/B map remaps rejected in UI; migrated map toggles once per press', errors };
  } finally {
    await page.evaluate(saved => {
      if (saved === null) localStorage.removeItem('nightshift.controls');
      else localStorage.setItem('nightshift.controls', saved);
    }, previousSave);
  }
}
