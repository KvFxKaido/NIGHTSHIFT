// Profiles NIGHTSHIFT's load: a cold first launch and a warm in-tab reload (what every race start, gate crossing and
// restart does through loadDrive's location.href), per scenario and CPU throttle. Serves a built dist/ with Vite's
// preview in-process. Records: the city chunk's download, time to __ns ready, time to the first two frames after it,
// the JS heap, and (--profile) a CPU profile of the load, attributed by function.
//   pnpm build && pnpm profile:load [--dist=dist] [--throttle=1,4] [--profile] [--scenarios=free,race,gen,stadium]
// --profile wants readable names: build a copy with `npx vite build --minify false --outDir artifacts/profile-dist`
// and pass --dist=artifacts/profile-dist. Results and profiles go to artifacts/profile/ (design/TRANSITIONS.md).
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || 'true']; }));
const dist = args.dist ?? 'dist', throttles = (args.throttle ?? '1,4').split(',').map(Number);
const SCENARIOS = {
  free: '?scene=track',
  race: '?race=sprint-jackson-mercer',
  gen: '?race=gen-stray-5',
  stadium: '?venue=stadium',
};
const scenarios = (args.scenarios ?? 'free,race,gen,stadium').split(',');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, build: { outDir: dist }, logLevel: 'error' });
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });

async function load(page, cdp, url) {
  await page.evaluate(() => performance.clearResourceTimings()).catch(() => {});
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.body?.dataset.assetState === 'ready' && window.__ns, null, { timeout: 600000, polling: 20 });
  const ready = Date.now() - t0;
  const frames = await page.evaluate(() => new Promise(done => {
    const start = performance.now();
    requestAnimationFrame(() => { const one = performance.now() - start; requestAnimationFrame(() => done([one, performance.now() - start])); });
  }));
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const chunk = performance.getEntriesByType('resource').filter(r => /\/assets\/alder-.*\.js$/.test(r.name)).sort((a, b) => b.decodedBodySize - a.decodedBodySize)[0];
    return { domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      chunkMB: chunk ? +(chunk.decodedBodySize / 1048576).toFixed(1) : null,
      chunkFetch: chunk ? Math.round(chunk.responseEnd - chunk.startTime) : null,
      chunkFromCache: chunk ? chunk.transferSize === 0 : null };
  });
  await page.evaluate(() => window.gc?.());
  const heap = await cdp.send('Runtime.getHeapUsage');
  return { ready, firstFrame: Math.round(frames[0]), secondFrame: Math.round(frames[1]), ...timing,
    heapMB: Math.round(heap.usedSize / 1048576) };
}

const out = 'artifacts/profile';
mkdirSync(out, { recursive: true });
const results = [];
for (const throttle of throttles) for (const name of scenarios) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  const url = base + SCENARIOS[name];
  const cold = await load(page, cdp, url);
  let profile = null;
  if (args.profile && throttle === 1) {
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  const warm = await load(page, cdp, url);
  if (args.profile && throttle === 1) profile = (await cdp.send('Profiler.stop')).profile;
  results.push({ scenario: name, throttle, cold, warm });
  console.log(`${name.padEnd(8)} x${throttle}  cold ready ${String(cold.ready).padStart(6)} ms (+${cold.firstFrame}/${cold.secondFrame} ms frames)  `
    + `warm ready ${String(warm.ready).padStart(6)} ms (+${warm.firstFrame}/${warm.secondFrame})  chunk ${cold.chunkMB} MB fetched ${cold.chunkFetch} ms cold, ${warm.chunkFromCache ? 'cached' : warm.chunkFetch + ' ms'} warm  heap ${warm.heapMB} MB`);
  if (profile) {
    // Self time per sample, then inclusive time per function (a function counted once per stack).
    const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
    const self = new Map(), total = new Map();
    const key = n => `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
    profile.samples.forEach((id, i) => {
      const dt = (profile.timeDeltas[i] ?? 0) / 1000;
      const node = byId.get(id); self.set(key(node), (self.get(key(node)) ?? 0) + dt);
      const seen = new Set();
      for (let at = id; at !== undefined; at = parent.get(at)) { const k = key(byId.get(at)); if (!seen.has(k)) { seen.add(k); total.set(k, (total.get(k) ?? 0) + dt); } }
    });
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${String(Math.round(v)).padStart(6)} ms  ${k}`);
    // Who spends the time in the hot leaves: self time of each named function, split by its immediate caller.
    const callers = new Map();
    profile.samples.forEach((id, i) => {
      const node = byId.get(id), fn = node.callFrame.functionName;
      if (!['alderHeight', 'sweptBoxesOverlap', 'pointFootprintDistance', 'projectOntoPath'].includes(fn)) return;
      const up = byId.get(parent.get(id)), k = `${fn} <- ${key(up)}`;
      callers.set(k, (callers.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    });
    const text = `${name} warm reload, profile\n-- self\n${top(self, 30).join('\n')}\n-- inclusive\n${top(total, 60).join('\n')}\n-- hot leaves by caller\n${top(callers, 20).join('\n')}\n`;
    writeFileSync(`${out}/profile-${name}.txt`, text);
    console.log(`  profile written to ${out}/profile-${name}.txt`);
  }
  await context.close();
}
writeFileSync(`${out}/profile-load.json`, JSON.stringify({ base, dist, results }, null, 1));
await browser.close(); await server.close();
