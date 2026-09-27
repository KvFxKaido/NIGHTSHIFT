// Adoption QA: real editor persistence and in-game display/culling/viewport checks.
// Run after sim checks: this temporarily saves a plain window, then restores it.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const id = 'plot--567.000--1330.000', file = 'src/sim/alder-frontages.json';
const original = await readFile(file, 'utf8');
const entry = JSON.parse(original).entries.find(e => e.buildingId === id);
const index = entry.plan.modules.findIndex(m => m.display === 'laundry');
const output = 'artifacts/adoptions/fifth-ave-laundry';
await mkdir(output, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let testSaved = null;
const errors = [], result = { editor: {}, views: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${url}/editor.html`);
  const ready = async () => {
    await page.waitForFunction(() => document.body.dataset.editorReady === 'true');
    await page.waitForFunction(() => document.querySelector('#front-status')?.textContent.includes('Saved choices loaded'));
    await page.locator('#building').selectOption(id);
    await page.locator('#front-module').selectOption(String(index));
  };
  await ready();
  assert.equal(await page.locator('#front-display').inputValue(), 'laundry');
  await page.locator('#front-display').selectOption('plain');
  await page.locator('#front-apply').click();
  assert.equal(await readFile(file, 'utf8'), original, 'preview never saves implicitly');
  await page.locator('#front-undo').click();
  assert.equal(await page.locator('#front-display').inputValue(), 'laundry');
  await page.locator('#front-redo').click();
  assert.equal(await page.locator('#front-display').inputValue(), 'plain');
  await page.locator('#front-save').click();
  await page.waitForFunction(() => document.querySelector('#front-status').textContent.startsWith('Saved frontages to project'));
  testSaved = await readFile(file, 'utf8');
  assert.equal(JSON.parse(testSaved).entries.find(e => e.buildingId === id).plan.modules[index].display, undefined);
  await page.reload(); await ready();
  assert.equal(await page.locator('#front-display').inputValue(), 'plain');
  await page.locator('#front-display').selectOption('laundry');
  await page.locator('#front-apply').click();
  await page.locator('#front-save').click();
  await page.waitForFunction(() => document.querySelector('#front-status').textContent.startsWith('Saved frontages to project'));
  testSaved = await readFile(file, 'utf8');
  assert.deepEqual(JSON.parse(testSaved), JSON.parse(original), 'save restores every original choice');
  await page.reload(); await ready();
  assert.equal(await page.locator('#front-display').inputValue(), 'laundry');
  assert.equal(await page.locator('#front-locked').isChecked(), true);
  await page.locator('#front-view').click();
  await page.screenshot({ path: `${output}/editor.png` });
  await page.locator('#front-module').selectOption('0');
  assert.equal(await page.locator('#front-display').isDisabled(), true, 'doors cannot host the display');
  result.editor = { previewIsNonDestructive: true, undoRedo: true, saveReloadBothChoices: true, lockPreserved: true };
  await page.close();

  for (const [label, width, height, query] of [['desktop', 1440, 900, ''], ['portrait', 390, 844, ''], ['race', 1440, 900, '&race=gen-1']]) {
    const game = await browser.newPage({ viewport: { width, height } });
    game.on('pageerror', e => errors.push(e.message));
    await game.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { get: () => false });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    });
    await game.goto(`${url}/?scene=track&assist=1${query}`);
    await game.waitForFunction(() => window.__ns?.sim && document.body.dataset.assetState === 'ready', null, { timeout: 300000 });
    await game.evaluate(() => __ns.go('track'));
    if (await game.locator('#garage-shot-skip').isVisible()) await game.locator('#garage-shot-skip').click();
    await game.waitForFunction(() => document.querySelector('#garage-shot-skip').hidden);
    const measured = await game.evaluate(() => {
      __ns.view.renderer.setPixelRatio(1); __ns.freeze(true); __ns.tick(420);
      __ns.view.garageCutscene = undefined;
      const body = __ns.sim.body, heading = -Math.PI / 2;
      const put = () => {
        body.setTranslation({ x: -591, y: 2.6, z: -1334 }, true);
        body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      };
      put(); __ns.tick(2); put(); __ns.tick(1); put();
      for (let i = 0; i < 4; i++) __ns.shot();
      const root = __ns.view.scene.getObjectByName('front-displays-plot--567.000--1330.000');
      const rotor = root.getObjectByName('laundry-drum-0');
      const angle = rotor.rotation.z;
      __ns.tick(60); __ns.shot();
      const moves = angle !== rotor.rotation.z;
      const stopped = rotor.rotation.z; __ns.shot(); __ns.shot();
      const frozen = rotor.rotation.z === stopped;
      const withDisplay = { ...__ns.view.renderer.info.render };
      root.visible = false; __ns.shot(); const withoutDisplay = { ...__ns.view.renderer.info.render };
      root.visible = true;
      put(); __ns.tick(1); put(); for (let i = 0; i < 4; i++) __ns.shot();
      return { moves, frozen, withDisplay, withoutDisplay, world: __ns.state().roadWorld,
        hasRace: !!__ns.sim.state.race, viewportFits: document.documentElement.scrollWidth <= innerWidth,
        screen: document.body.dataset.gameScreen, transitionHidden: document.querySelector('#garage-shot-skip').hidden };
    });
    assert.equal(measured.moves, true); assert.equal(measured.frozen, true);
    assert.equal(measured.viewportFits, true);
    assert.equal(measured.screen, 'playing');
    assert.equal(measured.transitionHidden, true);
    if (label === 'race') assert.equal(measured.hasRace, true);
    await game.screenshot({ path: `${output}/${label}.png` });
    result.views.push({ label, ...measured }); await game.close();
    console.log(`${label}: animation, frozen clock and viewport passed`);
  }
  assert.deepEqual(errors, []); result.errors = errors;
  await writeFile(`${output}/qa.json`, JSON.stringify(result, null, 2) + '\n');
  console.log('Laundry editor save/reload and runtime QA passed.');
} finally {
  await browser.close(); await vite.close();
  const current = await readFile(file, 'utf8');
  if (current === testSaved) await writeFile(file, original);
  else if (current !== original) throw Error('Frontages changed elsewhere; refusing to overwrite them.');
}
