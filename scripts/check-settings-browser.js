// Run with the playwright-cli skill in an isolated, in-memory browser session:
// playwright-cli -s=nightshift-settings run-code (Get-Content -Raw scripts/check-settings-browser.js)
async page => {
  const base = 'http://127.0.0.1:5173/';
  const key = 'nightshift.settings';
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const same = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const ready = async tab => tab.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready');
  const visit = async search => { await page.goto(base + search); await ready(page); };
  const saved = () => page.evaluate(key => localStorage.getItem(key), key);
  const state = () => page.evaluate(() => window.__ns.state());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await visit('?scene=pause');
  // This browser session is disposable and isolated from Shawn's browser.
  await page.evaluate(key => localStorage.removeItem(key), key);
  await page.reload(); await ready(page);
  check((await state()).drivetrain === 'fwd', 'Fresh boot must be FWD');
  check(await page.locator('[data-drivetrain="fwd"]').getAttribute('aria-pressed') === 'true', 'FWD menu selection');
  check(await saved() === null, 'Boot must not write preferences');

  await page.evaluate(() => {
    window.__ns.drivetrain('rwd');
    window.__ns.set({ paint: 'ice', wheels: 'white', stance: 'slammed' });
  });
  const selected = { paint: 'ice', wheels: 'white', stance: 'slammed' };
  await visit('?scene=garage');
  await page.reload(); await ready(page);
  check((await state()).drivetrain === 'rwd', 'Drivetrain must survive reload');
  same((await state()).customization, selected, 'Pressed garage choices must restore');
  const visual = await page.evaluate(() => ({
    paint: window.__ns.view.paintMaterial.color.getHexString(),
    wheels: window.__ns.view.wheelMaterial.color.getHexString(),
    stance: window.__ns.view.bodyShell.position.y,
  }));
  same(visual, { paint: 'd8dde2', wheels: 'd7d5ca', stance: -.075 }, 'Rendered customization must restore too');
  check(await page.locator('[data-menu-screen="garage"] [data-settings-status]').textContent() === 'Saved on this browser.', 'Saved status after reload');
  await page.screenshot({ path: 'artifacts/settings-restored.png' });

  const beforePreview = await saved();
  await visit('?scene=garage&drivetrain=awd&paint=signal&wheels=alloy&stance=low');
  check((await state()).drivetrain === 'awd', 'Preview drivetrain must apply');
  same((await state()).customization, { paint: 'signal', wheels: 'alloy', stance: 'low' }, 'Preview appearance must apply');
  check(await saved() === beforePreview, 'Opening a preview must not overwrite the save');
  await page.evaluate(() => window.__ns.set({ paint: 'blackglass' }));
  check(await page.evaluate(() => !new URL(location.href).searchParams.has('paint')), 'Choosing paint must clear its URL override');
  const edited = JSON.parse(await saved());
  same(edited, { version: 1, drivetrain: 'rwd', customization: { paint: 'blackglass', wheels: 'white', stance: 'slammed' } }, 'Only deliberate changes may persist');
  await page.reload(); await ready(page);
  check((await state()).customization.paint === 'blackglass', 'Old URL cannot undo a saved paint');
  // Saving an already-active preview is deliberate too, without resetting it.
  const tickBefore = (await state()).tick;
  await page.evaluate(() => window.__ns.drivetrain('awd'));
  check((await state()).tick === tickBefore, 'Already-active choice must not reset the run');
  check(await page.evaluate(() => !new URL(location.href).searchParams.has('drivetrain')), 'Choosing a drivetrain clears its URL override');
  check(JSON.parse(await saved()).drivetrain === 'awd', 'Already-active preview can be saved');
  await visit('?scene=garage');
  same((await state()).customization, { paint: 'blackglass', wheels: 'white', stance: 'slammed' }, 'Bare link restores saved setup, not preview');

  // Corrupt saves must not prevent play or be overwritten just by opening.
  await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
  await page.reload(); await ready(page);
  check((await state()).drivetrain === 'fwd', 'Corrupt data recovers to FWD');
  check((await state()).customization.paint === 'signal', 'Corrupt data recovers appearance');
  check(await saved() === '{broken', 'Boot leaves corrupt data recoverable');
  check((await page.locator('[data-menu-screen="garage"] [data-settings-status]').textContent()).includes('could not be restored'), 'Corrupt save warning must be visible');

  const blocked = await page.context().newPage();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('Storage blocked for test', 'SecurityError'); }, configurable: true,
  }));
  try {
    await blocked.goto(base + '?scene=garage'); await ready(blocked);
    await blocked.evaluate(() => { window.__ns.set({ paint: 'ice' }); window.__ns.drivetrain('rwd'); });
    const status = await blocked.locator('[data-menu-screen="garage"] [data-settings-status]').textContent();
    check(status.includes('session only'), 'Blocked storage must report session-only choices');
    check(await blocked.evaluate(() => window.__ns.state().drivetrain) === 'rwd', 'Blocked storage cannot prevent choosing a layout');
    check(await blocked.evaluate(() => window.__ns.view.paintMaterial.color.getHexString()) === 'd8dde2', 'Blocked storage cannot prevent customizing');
  } finally { await blocked.close(); }

  await page.evaluate(() => window.__ns.set({ paint: 'ice', wheels: 'alloy', stance: 'low' }));
  await visit('?scene=garage');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/settings-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await visit('?scene=pause');
  await page.screenshot({ path: 'artifacts/settings-pause.png' });
  await page.evaluate(() => { window.__ns.go('track'); window.__ns.freeze(); window.__ns.drive('W60'); });
  check((await state()).vehicle.speed > 0, 'Restored settings must leave the car driveable');
  check(errors.length === 0, `Unexpected page errors: ${errors.join('; ')}`);
  return { passed: true, checks: ['FWD boot', 'real menu callbacks save', 'reload restores UI and model',
    'preview isolation', 'URL override cleanup', 'already-active selection saves', 'corrupt save recovery',
    'blocked storage stays playable', 'desktop/mobile screenshots', 'driving after restore'] };
}
