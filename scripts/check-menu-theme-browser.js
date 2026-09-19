// First: node scripts/create-menu-theme-test-audio.mjs
// Then: playwright-cli -s=theme run-code (Get-Content -Raw scripts/check-menu-theme-browser.js)
async (page, base = 'http://127.0.0.1:5186/') => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  // An original quiet tone exercises real media decoding without a personal song.
  const wav = 'artifacts/menu-theme-test.wav';
  await page.route('**/assets/menu-theme/theme.local.json', route => route.fulfill({ json: { file: 'test.wav', title: 'Test theme', start: 0, volume: .8 } }));
  await page.route('**/assets/menu-theme/test.wav', route => route.fulfill({ contentType: 'audio/wav', path: wav }));
  await page.route('**/assets/music/manifest.json', route => route.fulfill({ json: { version: 1, tracks: [{ file: 'radio.wav', title: 'Test radio' }] } }));
  await page.route('**/assets/music/radio.wav', route => route.fulfill({ contentType: 'audio/wav', path: wav }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 90000 });
  assert(await page.locator('#start-screen').isVisible(), 'Start screen missing');
  assert(await page.locator('#menu-root').evaluate(el => el.inert), 'Menu can receive input under the start screen');
  await page.screenshot({ path: 'artifacts/menu-theme-start.png' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __ns.audio().menuTheme?.playing && __ns.audio().menuTheme.time > 1);
  assert(await page.locator('body').getAttribute('data-game-screen') === 'main', 'Enter also activated a menu item');
  const opening = await page.evaluate(() => __ns.audio());
  assert(opening.menuTheme.time < 20, 'Opening skipped ahead');
  await page.locator('[data-menu-screen="main"] [data-menu-action="options"]').click();
  await page.locator('[data-menu-screen="options"] [data-menu-action="back"]').click();
  await page.locator('[data-menu-screen="main"] [data-menu-action="garage"]').click();
  const garage = await page.evaluate(() => __ns.audio());
  assert(garage.menuTheme.playing && garage.menuTheme.time >= opening.menuTheme.time, 'Menu navigation restarted or stopped the theme');
  await page.locator('[data-menu-screen="garage"] [data-menu-action="back"]').click();
  await page.screenshot({ path: 'artifacts/menu-theme-main.png' });
  // The garage's Drive button follows the existing current-build path.
  await page.locator('[data-menu-screen="main"] [data-menu-action="garage"]').click();
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  await page.waitForFunction(() => !__ns.audio().frontEndMusic && !__ns.audio().menuTheme.playing && __ns.audio().radioGain > .99);
  assert((await page.evaluate(() => __ns.audio())).nowPlaying === 'Test radio', 'Radio did not start on driving');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.body.dataset.gameScreen === 'pause');
  assert(!(await page.evaluate(() => __ns.audio())).menuTheme.playing, 'Pause restarted the theme');
  await page.locator('[data-menu-screen="pause"] [data-menu-action="options"]').click();
  await page.locator('[data-menu-screen="options"] [data-soundtrack="toggle"]').click();
  await page.locator('[data-menu-screen="options"] [data-menu-action="back"]').click();
  await page.locator('[data-menu-screen="pause"] [data-menu-action="main-menu"]').click();
  await page.waitForFunction(() => __ns.audio().menuTheme?.playing && __ns.audio().radioGain < .01);
  await page.locator('[data-menu-screen="main"] [data-menu-action="garage"]').click();
  await page.locator('[data-menu-screen="garage"] [data-menu-action="start"]').click();
  assert((await page.evaluate(() => __ns.audio())).nowPlaying === null, 'Returning to driving ignored manual radio pause');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base);
  await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 90000 });
  await page.screenshot({ path: 'artifacts/menu-theme-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Start screen overflows mobile');
  await page.locator('#enter-menu').click();
  await page.waitForFunction(() => __ns.audio().menuTheme?.playing);
  assert(await page.locator('#menu-root').evaluate(el => getComputedStyle(el).animationName) === 'none', 'Reduced motion ignored');

  // Missing media must never trap the player at entry.
  await page.route('**/assets/menu-theme/test.wav', route => route.fulfill({ status: 404, body: '' }));
  await page.goto(base);
  await page.waitForFunction(() => window.__ns, null, { timeout: 90000 });
  await page.locator('#enter-menu').click();
  await page.waitForFunction(() => __ns.audio().menuTheme?.failed);
  assert(await page.locator('[data-menu-screen="main"]').isVisible(), 'Missing theme blocked menu');
  assert(errors.length === 0, errors.join('\n'));
  return { opening, garage, checks: 'Intro, continuity, radio handoff, pause, manual radio preference, mobile, reduced motion, missing file', errors };
}
