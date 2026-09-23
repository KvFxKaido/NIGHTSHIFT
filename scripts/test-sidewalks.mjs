import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

await mkdir('artifacts', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value;
      const renderer = api.view.renderer;
      window.drawEdgeFrame = renderer.render.bind(renderer);
      renderer.setPixelRatio(1);
      renderer.render = () => {};
    } });
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const lighting of (process.argv.includes('--curb-only') ? ['blockout'] : ['blockout', 'night'])) {
    await page.goto(`${base}/?world=alder&scene=track&freeze=1&lighting=${lighting}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ns && document.body.dataset.assetState === 'ready', null, { timeout: 120000 });
    await page.waitForFunction(() => !__ns.view.garageCutscene);
    for (const framing of (process.argv.includes('--curb-only') ? ['curb'] : ['junction', 'market', 'chase', 'curb'])) {
      const png = await page.evaluate(async ({ framing }) => {
        const { alderHeight, ALDER_DATA } = await import('/src/sim/alder.ts');
        const { sim, view } = __ns;
        view.garageCutscene = undefined;
        const x = framing === 'market' ? 786 : -218, z = framing === 'market' ? -915 : -628, y = alderHeight(x, z);
        sim.body.setTranslation({ x, y: y + .5, z }, true);
        sim.body.setRotation({ x: 0, y: Math.sin(-1.34 / 2), z: 0, w: Math.cos(-1.34 / 2) }, true);
        __ns.tick(1); __ns.shot();
        if (framing === 'junction') {
          view.camera.position.set(-245, y + 24, -660);
          view.camera.lookAt(-216, y, -610);
          view.camera.fov = 48; view.camera.updateProjectionMatrix();
        }
        if (framing === 'market') {
          view.camera.position.set(830, y + 30, -907);
          view.camera.lookAt(792, y + 3, -951);
          view.camera.fov = 48; view.camera.updateProjectionMatrix();
        }
        if (framing === 'curb') {
          let best=Infinity, cx=0, cz=0;
          for(let i=0;i<ALDER_DATA.pavement.length;i+=6) {
            const lifts=ALDER_DATA.pavementLifts.slice(i/2,i/2+3);
            if(Math.min(...lifts)>.01 || Math.max(...lifts)<.14)continue;
            const px=(ALDER_DATA.pavement[i]+ALDER_DATA.pavement[i+2]+ALDER_DATA.pavement[i+4])/3;
            const pz=(ALDER_DATA.pavement[i+1]+ALDER_DATA.pavement[i+3]+ALDER_DATA.pavement[i+5])/3;
            const distance=Math.hypot(px+215,pz+610);
            if(distance<best){best=distance;cx=px;cz=pz;}
          }
          const cy=alderHeight(cx,cz);
          view.camera.position.set(cx+9,cy+3,cz+9);
          view.camera.lookAt(cx,cy+.1,cz);
          view.camera.fov=45;view.camera.updateProjectionMatrix();
        }
        window.drawEdgeFrame(view.scene, view.camera);
        return view.renderer.domElement.toDataURL('image/png');
      }, { framing });
      await writeFile(`artifacts/sidewalk-${lighting}-${framing}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForFunction(() => Math.abs(__ns.view.camera.aspect - 390 / 844) < .001);
    await page.evaluate(async () => {
      __ns.shot(); window.drawEdgeFrame(__ns.view.scene, __ns.view.camera);
      // WebGL clears its drawing buffer before Playwright captures the DOM.
      // Keep that frame as an image while still capturing the real HUD.
      const image = new Image(); image.id = 'edge-capture';
      image.src = __ns.view.renderer.domElement.toDataURL('image/png');
      image.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
      await image.decode(); document.getElementById('view').after(image);
    });
    await page.screenshot({ path: `artifacts/sidewalk-${lighting}-mobile.png` });
    await page.evaluate(() => document.getElementById('edge-capture').remove());
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  assert.deepEqual(errors, []);
  console.log(process.argv.includes('--curb-only')
    ? 'Curb close-up and mobile captures passed; no page errors.'
    : 'Pike / 2nd, Market, chase, curb and mobile captures passed; no page errors.');
} finally { await browser?.close(); await server.close(); }
