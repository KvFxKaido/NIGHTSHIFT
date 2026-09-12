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
  // The drivetrain is a property of the body now, so a fresh boot is whatever
  // the starter car drives -- RWD via the Cinder -- and there is no toggle.
  check((await state()).drivetrain === 'rwd', 'Fresh boot must take the starter car drivetrain');
  check(await page.locator('[data-drivetrain]').count() === 0, 'The garage drivetrain toggle must be gone');
  check(await saved() === null, 'Boot must not write preferences');

  await page.evaluate(() => window.__ns.set({ paint: 'ice', wheels: 'white', stance: 'slammed' }));
  const selected = { paint: 'ice', wheels: 'white', stance: 'slammed' };
  await visit('?scene=garage');
  await page.reload(); await ready(page);
  same((await state()).customization, selected, 'Pressed garage choices must restore');
  const visual = await page.evaluate(() => ({
    paint: window.__ns.view.paintMaterial.color.getHexString(),
    wheels: window.__ns.view.wheelMaterial.color.getHexString(),
    stance: window.__ns.view.bodyShell.position.y,
  }));
  same(visual, { paint: 'd8dde2', wheels: 'd7d5ca', stance: -.075 }, 'Rendered customization must restore too');
  check(await page.locator('[data-menu-screen="garage"] [data-settings-status]').textContent() === 'Saved on this browser.', 'Saved status after reload');
  await page.screenshot({ path: 'artifacts/settings-restored.png' });

  // Choosing a body is the deliberate choice that also changes how it drives.
  await page.locator('[data-car="bulwark"]').click();
  await page.waitForFunction(() => window.__ns.state().carModel === 'ns-bulwark');
  check((await state()).drivetrain === 'awd', 'The chosen body must bring its own drivetrain');
  await page.reload(); await ready(page);
  check((await state()).carModel === 'ns-bulwark', 'Car must survive reload');
  check((await state()).drivetrain === 'awd', 'A reloaded car must still drive as itself');
  same((await state()).customization, selected, 'Changing car must keep paint, wheels and stance');

  const beforePreview = await saved();
  await visit('?scene=garage&drivetrain=fwd&paint=signal&wheels=alloy&stance=low');
  check((await state()).drivetrain === 'fwd', 'Preview drivetrain must still apply as a developer override');
  same((await state()).customization, { paint: 'signal', wheels: 'alloy', stance: 'low' }, 'Preview appearance must apply');
  check(await saved() === beforePreview, 'Opening a preview must not overwrite the save');
  await page.evaluate(() => window.__ns.set({ paint: 'blackglass' }));
  check(await page.evaluate(() => !new URL(location.href).searchParams.has('paint')), 'Choosing paint must clear its URL override');
  // The inversion this change introduced: ?drivetrain= is a developer override,
  // not a preference, so saving a garage choice must leave it alone -- and it
  // must never come back as a stored field.
  check(await page.evaluate(() => new URL(location.href).searchParams.get('drivetrain') === 'fwd'),
    'Saving a garage choice must not clear a handling override');
  const edited = JSON.parse(await saved());
  check(!('drivetrain' in edited), `A drivetrain must never be persisted: ${await saved()}`);
  check(edited.version === 3 && edited.car === 'bulwark', `Saved build must name the chosen car: ${await saved()}`);
  same(edited.customization, { paint: 'blackglass', wheels: 'white', stance: 'slammed' }, 'Only deliberate changes may persist');
  await page.reload(); await ready(page);
  check((await state()).customization.paint === 'blackglass', 'Old URL cannot undo a saved paint');
  // Saving an already-active preview is deliberate too, without resetting it.
  await visit('?scene=garage&wheels=alloy');
  const tickBefore = (await state()).tick;
  await page.evaluate(() => window.__ns.set({ wheels: 'alloy' }));
  check((await state()).tick === tickBefore, 'Already-active choice must not reset the run');
  check(await page.evaluate(() => !new URL(location.href).searchParams.has('wheels')), 'Choosing wheels clears its URL override');
  check(JSON.parse(await saved()).customization.wheels === 'alloy', 'Already-active preview can be saved');
  await visit('?scene=garage');
  same((await state()).customization, { paint: 'blackglass', wheels: 'alloy', stance: 'slammed' }, 'Bare link restores saved setup, not preview');

  // Corrupt saves must not prevent play or be overwritten just by opening.
  await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
  await page.reload(); await ready(page);
  check((await state()).drivetrain === 'rwd', 'Corrupt data recovers to the starter car and its drivetrain');
  check((await state()).carModel === 'ns-cinder', 'Corrupt data recovers to the starter car');
  check((await state()).customization.paint === 'signal', 'Corrupt data recovers appearance');
  check(await saved() === '{broken', 'Boot leaves corrupt data recoverable');
  check((await page.locator('[data-menu-screen="garage"] [data-settings-status]').textContent()).includes('could not be restored'), 'Corrupt save warning must be visible');

  // A save written before the drivetrain moved onto the body must still load.
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 3, car: 'bulwark',
    drivetrain: 'fwd', customization: { paint: 'ice', wheels: 'alloy', stance: 'low' },
    audio: { master: .7, engine: .8, music: .5 } })), key);
  await page.reload(); await ready(page);
  check((await state()).carModel === 'ns-bulwark', 'A legacy save must still restore its car');
  check((await state()).drivetrain === 'awd', 'A stored drivetrain must be ignored, not honoured');
  check((await page.locator('[data-menu-screen="garage"] [data-settings-status]').textContent()) === 'Saved on this browser.',
    'Dropping a retired field must not report the save as damaged');

  const blocked = await page.context().newPage();
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    get() { throw new DOMException('Storage blocked for test', 'SecurityError'); }, configurable: true,
  }));
  try {
    await blocked.goto(base + '?scene=garage'); await ready(blocked);
    await blocked.evaluate(() => window.__ns.set({ paint: 'ice' }));
    await blocked.locator('[data-car="bulwark"]').click();
    await blocked.waitForFunction(() => window.__ns.state().carModel === 'ns-bulwark');
    const status = await blocked.locator('[data-menu-screen="garage"] [data-settings-status]').textContent();
    check(status.includes('session only'), 'Blocked storage must report session-only choices');
    check(await blocked.evaluate(() => window.__ns.state().drivetrain) === 'awd', 'Blocked storage cannot prevent choosing a body');
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
  return { passed: true, checks: ['starter car boots RWD with no toggle', 'real menu callbacks save',
    'reload restores UI and model', 'chosen body brings its drivetrain', 'preview isolation',
    'URL override cleanup keeps the drivetrain override', 'no drivetrain is ever persisted',
    'already-active selection saves', 'corrupt save recovery', 'legacy stored drivetrain ignored not honoured',
    'blocked storage stays playable', 'desktop/mobile screenshots', 'driving after restore'] };
}
