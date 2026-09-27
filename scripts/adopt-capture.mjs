// Captures the evidence for an adopted place (design/CITY_ADOPTION.md, "Capturing evidence"): staged poses before and
// after, driven passes at street speed with the live chase camera, and moments of a place's activity, from a shot list
// kept beside the place's evidence. It serves each tree with that tree's own Vite inside this process, so which code a
// frame shows is known and the servers end with it, even killed. Raw frames go to the git-ignored
// artifacts/adoptions/<place>/; the composites and a summary (capture.json: each tree's commit, each pass's lane
// keeping, anything that disturbed it) go beside the shot list.
//
//   pnpm adopt:capture design/adoptions/<place>/shots.json [--before=<tree>] [--after=<tree>] [--only=poses,passes,moments]
//     --after   the tree with the change (default: this one); --before  a tree without it, for before/after pairs
//     --angle   Chromium's ANGLE backend: d3d11 on Windows (the GPU), swiftshader elsewhere (as CI's browser checks,
//               no GPU needed, and far slower: the whole city drawn in software, minutes a pose)
//
// Shot list: { place, query?, viewport?: [w, h], poses: [{ id, label, at: [x, z], toward: [ux, uz] }],
//   passes: [{ id, label, from: [x, z], toward: [ux, uz], length, every? }],
//   strips?: [{ id, frames: [[passId, metresAlong, label?, crop?], ...] }],  (crop [fx, fy, fw, fh], default the top 80%)
//   moments?: [{ id, pose, period, seconds: [...], labels?: [...], crop: [fx, fy, fw, fh] }] }
// A pose is a stopped car, the camera settled: for before/after at one place, never for judging what reads at speed.
// A pass starts at rest and drives full throttle (assist 1) holding its lane by the keyboard's left and right; it is
// scripted, not a hand on a pad, and the summary says so. A pass knocked more than a metre off its lane, or slowing
// under full throttle, is marked disturbed: start it past whatever it met rather than use its frames.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
  const [key, ...value] = a.slice(2).split('=');
  return [key, value.join('=') || 'true'];
}));
const listPath = process.argv.slice(2).find(a => !a.startsWith('--'));
if (!listPath) {
  console.error('usage: pnpm adopt:capture design/adoptions/<place>/shots.json [--before=<tree>] [--after=<tree>]');
  process.exit(2);
}
const shots = JSON.parse(await readFile(listPath, 'utf8'));
const only = new Set((args.only ?? 'poses,passes,moments').split(','));
const outDir = resolve(args.out ?? dirname(listPath));
const slug = basename(dirname(resolve(listPath)));
const rawDir = resolve('artifacts', 'adoptions', slug);
const [width, height] = shots.viewport ?? [1440, 900];
await mkdir(rawDir, { recursive: true });

const servers = [];
const stopServers = () => Promise.all(servers.map(s => s.vite.close()));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stopServers().finally(() => process.exit(130)));
const git = (tree, ...command) => execFileSync('git', ['-C', tree, ...command], { encoding: 'utf8' }).trim();

// Each tree's own Vite and config, in this process: a server in a child outlives this script if it is killed
// (Windows does not take a child down with its parent), and a stranded dev server serves the wrong tree to the next run.
async function serve(tree, role) {
  const entry = join(tree, 'node_modules', 'vite', 'dist', 'node', 'index.js');
  if (!existsSync(entry)) throw Error(`${tree} has no node_modules: run pnpm install there first`);
  const { createServer } = await import(pathToFileURL(entry).href);
  const vite = await createServer({ root: tree, configFile: join(tree, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await vite.listen();
  const server = { role, tree, vite, url: `http://127.0.0.1:${vite.httpServer.address().port}/`,
    commit: git(tree, 'rev-parse', '--short', 'HEAD'), branch: git(tree, 'rev-parse', '--abbrev-ref', 'HEAD'),
    uncommitted: git(tree, 'status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).length };
  servers.push(server);
  return server;
}

const angle = args.angle ?? (process.platform === 'win32' ? 'd3d11' : 'swiftshader');
const browser = await chromium.launch({ args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });

// The street, ready to be driven: the game pauses on blur, and a frozen loop never finishes the garage-exit shot,
// which holds the camera 5.8 m off to one side of the car.
async function street(server) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  await page.goto(`${server.url}?scene=track&assist=1${shots.query ? `&${shots.query}` : ''}`);
  await page.waitForFunction(() => window.__ns?.sim && document.body.dataset.assetState === 'ready', null, { timeout: 300000 });
  server.world = await page.evaluate(() => {
    __ns.view.renderer.setPixelRatio(1);
    __ns.go('track'); __ns.freeze(true); __ns.tick(420);
    __ns.view.garageCutscene = undefined;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    window.__adopt = {
      place(x, z, ux, uz) {
        const body = __ns.sim.body, world = __ns.sim.roadWorld, heading = Math.atan2(-ux, -uz);
        const y = (world.surface ?? world.project)(x, z).height + .6;
        const put = () => {
          body.setTranslation({ x, y, z }, true);
          body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        };
        put(); __ns.tick(2); put(); __ns.tick(1); put();
        __ns.view.garageCutscene = undefined;
      },
      // shot() settles the camera for 24 frames, not enough after the car has been turned: the chase camera closes
      // 11% of its gap a frame, so four of them (96 frames) leave 0.01% of a turn.
      settled() { let url; for (let i = 0; i < 4; i++) url = __ns.shot(); return url; },
      // One tick of a pass, the live frame read in the same task as its draw.
      drive(x0, z0, ux, uz, frame) {
        const v = __ns.sim.state.vehicle, right = (v.x - x0) * -uz + (v.z - z0) * ux;
        const turned = wrap(v.heading - Math.atan2(-ux, -uz)), left = right * .25 - turned * 4;
        __ns.drive(left > .4 ? 'WA1' : left < -.4 ? 'WD1' : 'W1');
        const now = __ns.sim.state.vehicle;
        return { along: (now.x - x0) * ux + (now.z - z0) * uz, right: (now.x - x0) * -uz + (now.z - z0) * ux,
          mph: now.speed * 2.237, x: now.x, z: now.z, tick: __ns.sim.state.tick,
          frame: frame ? __ns.view.renderer.domElement.toDataURL('image/jpeg', .92) : null };
      },
    };
    return __ns.state().roadWorld;
  });
  return { page, errors };
}

const save = (name, dataUrl) => writeFile(join(rawDir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

async function poses(page, role) {
  const out = {};
  for (const pose of shots.poses ?? []) {
    await page.evaluate(([x, z, ux, uz]) => __adopt.place(x, z, ux, uz), [...pose.at, ...pose.toward]);
    out[pose.id] = await page.evaluate(() => __adopt.settled());
    await save(`${role}-${pose.id}.png`, out[pose.id]);
  }
  return out;
}

async function passes(page) {
  const out = {};
  for (const pass of shots.passes ?? []) {
    const [x0, z0] = pass.from, [ux, uz] = pass.toward, every = pass.every ?? 4, frames = [];
    await page.evaluate(([x, z, dx, dz]) => __adopt.place(x, z, dx, dz), [x0, z0, ux, uz]);
    await page.evaluate(() => __adopt.settled());
    let worst = 0, disturbed = null, last = null;
    for (let i = 0; i < 3000; i++) {
      const step = await page.evaluate(a => __adopt.drive(...a), [x0, z0, ux, uz, i % every === 0]);
      worst = Math.max(worst, Math.abs(step.right));
      if (!disturbed && (Math.abs(step.right) > 1 || (last && step.mph < last.mph - 3)))
        disturbed = { along: Math.round(step.along), right: +step.right.toFixed(2), mph: Math.round(step.mph) };
      last = step;
      if (step.frame) {
        const name = `pass-${pass.id}-${String(Math.round(step.along)).padStart(3, '0')}m-t${step.tick}.jpg`;
        await save(name, step.frame);
        frames.push({ name, along: +step.along.toFixed(1), mph: Math.round(step.mph), right: +step.right.toFixed(2), data: step.frame });
      }
      // A disturbed pass's frames are not evidence of anything but what it met: stop there, not against it.
      if (disturbed || step.along >= pass.length) break;
    }
    out[pass.id] = { frames, worstOffLane: +worst.toFixed(2), disturbed, topMph: Math.round(last.mph) };
    console.log(`pass ${pass.id}: ${frames.length} frames to ${Math.round(last.along)} m, ${out[pass.id].topMph} mph, `
      + `${disturbed ? `DISTURBED at ${disturbed.along} m (${disturbed.right} m off, ${disturbed.mph} mph)` : `held within ${worst.toFixed(2)} m`}`);
  }
  return out;
}

async function moments(page) {
  const out = {};
  for (const moment of shots.moments ?? []) {
    const pose = shots.poses.find(p => p.id === moment.pose);
    await page.evaluate(([x, z, ux, uz]) => __adopt.place(x, z, ux, uz), [...pose.at, ...pose.toward]);
    await page.evaluate(() => __adopt.settled());
    out[moment.id] = [];
    for (const [i, seconds] of moment.seconds.entries()) {
      // Run the clock on to that moment of the place's period, the car put back where it was.
      out[moment.id].push(await page.evaluate(([s, period, at]) => {
        const cycle = Math.round(period * 60), target = Math.round(s * 60), now = __ns.sim.state.tick;
        let ahead = ((target - now % cycle) + cycle) % cycle; if (ahead < 4) ahead += cycle;
        __ns.tick(ahead - 3); __adopt.place(...at);
        let url; for (let k = 0; k < 4; k++) url = __ns.shot();
        return url;
      }, [seconds, moment.period, [...pose.at, ...pose.toward]]));
      await save(`${moment.id}-${i + 1}.png`, out[moment.id].at(-1));
    }
  }
  return out;
}

// Composites are drawn on a canvas in a blank page: no image library, and the fonts are the browser's.
const board = await browser.newPage();
const compose = (cells, cellWidth, file) => board.evaluate(async ([cells, cellWidth]) => {
  const images = await Promise.all(cells.map(c => new Promise((ok, fail) => {
    const image = new Image(); image.onload = () => ok(image); image.onerror = fail; image.src = c.src;
  })));
  const heights = cells.map((c, i) => cellWidth * (c.crop[3] * images[i].height) / (c.crop[2] * images[i].width));
  const canvas = document.createElement('canvas'), gap = 8;
  canvas.width = cells.length * cellWidth + (cells.length - 1) * gap; canvas.height = Math.round(Math.max(...heights));
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#0b0e16'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((c, i) => {
    const image = images[i], [fx, fy, fw, fh] = c.crop, x = i * (cellWidth + gap);
    ctx.drawImage(image, fx * image.width, fy * image.height, fw * image.width, fh * image.height, x, 0, cellWidth, heights[i]);
    if (!c.label) return;
    ctx.font = '600 17px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(x + 8, 8, ctx.measureText(c.label).width + 12, 25);
    ctx.fillStyle = c.warn ? '#ff8f6b' : '#e8e3d3'; ctx.fillText(c.label, x + 14, 26);
  });
  return canvas.toDataURL('image/jpeg', .88);
}, [cells, cellWidth]).then(url => writeFile(join(outDir, file), Buffer.from(url.split(',')[1], 'base64'))).then(() => file);

const summary = { place: shots.place, captured: new Date().toISOString(), viewport: [width, height], angle,
  note: 'Poses are a stopped car with the camera settled. Passes are scripted (full throttle, assist 1, a lane-keeping steer), not driven by hand.',
  trees: {}, poses: {}, passes: {}, outputs: [] };
try {
  const after = await serve(resolve(args.after ?? '.'), 'after');
  const before = args.before ? await serve(resolve(args.before), 'before') : null;
  const views = {};
  for (const server of [before, after].filter(Boolean)) {
    const { page, errors } = await street(server);
    views[server.role] = {
      poses: only.has('poses') ? await poses(page, server.role) : {},
      passes: only.has('passes') && server.role === 'after' ? await passes(page) : {},
      moments: only.has('moments') && server.role === 'after' ? await moments(page) : {},
    };
    summary.trees[server.role] = { tree: server.tree, branch: server.branch, commit: server.commit,
      uncommittedFiles: server.uncommitted, world: server.world, pageErrors: errors };
    console.log(`${server.role}: ${server.tree} at ${server.commit}${server.uncommitted ? ` with ${server.uncommitted} uncommitted files` : ''}`);
    await page.close();
  }
  const whole = [0, 0, 1, 1];
  for (const pose of only.has('poses') ? shots.poses ?? [] : []) {
    const cells = [before && { src: views.before.poses[pose.id], crop: whole, label: `before: ${pose.label}` },
      { src: views.after.poses[pose.id], crop: whole, label: `${before ? 'after' : pose.id}: ${pose.label}` }].filter(Boolean);
    summary.outputs.push(await compose(cells, 680, `${pose.id}${before ? '-before-after' : ''}.jpg`));
  }
  const passResults = views.after.passes;
  for (const [id, result] of Object.entries(passResults)) {
    const { frames, ...rest } = result;
    summary.passes[id] = { ...rest, frames: frames.map(({ data, ...f }) => f) };
  }
  const nearest = (id, along) => passResults[id].frames.reduce((a, b) => Math.abs(b.along - along) < Math.abs(a.along - along) ? b : a, passResults[id].frames[0]);
  const strips = shots.strips ?? Object.keys(passResults).map(id => ({ id: `pass-${id}`,
    frames: [.25, .5, .75, 1].map(f => [id, f * shots.passes.find(p => p.id === id).length]) }));
  for (const strip of only.has('passes') ? strips : []) {
    const cells = strip.frames.flatMap(([id, along, label, crop]) => {
      const f = nearest(id, along), pass = shots.passes.find(p => p.id === id), hit = passResults[id].disturbed;
      return f ? [{ src: f.data, crop: crop ?? [0, 0, 1, .8], warn: !!hit,
        label: `${label ?? pass.label}, ${f.mph} mph, ${Math.round(f.along)} m${hit ? ', DISTURBED' : ''}` }] : [];
    });
    if (cells.length) summary.outputs.push(await compose(cells, 660, `${strip.id}.jpg`));
  }
  for (const moment of only.has('moments') ? shots.moments ?? [] : []) {
    const cells = views.after.moments[moment.id].map((src, i) => ({ src, crop: moment.crop,
      label: moment.labels?.[i] ?? `${moment.seconds[i]} s` }));
    summary.outputs.push(await compose(cells, 360, `${moment.id}.jpg`));
  }
  summary.poses = Object.fromEntries((shots.poses ?? []).map(p => [p.id, { label: p.label, at: p.at, toward: p.toward }]));
  await writeFile(join(outDir, 'capture.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`wrote ${[...summary.outputs, 'capture.json'].join(', ')} to ${outDir}; raw frames in ${rawDir}`);
  const hits = Object.entries(summary.passes).filter(([, p]) => p.disturbed);
  if (hits.length) { console.log(`disturbed: ${hits.map(([id]) => id).join(', ')}: start those passes past what they met`); process.exitCode = 1; }
} finally {
  await browser.close();
  await stopServers();
}
