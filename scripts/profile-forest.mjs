import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated render/CPU probes, not an FPS claim for the player's browser.
const label = process.argv[2] ?? 'current';
await mkdir('artifacts/forest', { recursive: true });
const browser = await chromium.launch({ args: [`--use-angle=${process.env.FOREST_ANGLE ?? 'd3d11'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1560 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, '__ns', { get: () => api, set(value) {
      api = value;
      window.drawForest = api.view.renderer.render.bind(api.view.renderer);
      api.view.renderer.render = () => {};
    } });
  });
  await page.goto('http://localhost:5173/?world=alder&scene=track&freeze=1&car=bulwark');
  await page.waitForFunction(() => window.__ns?.view);
  await page.keyboard.press('Escape');
  const setup = await page.evaluate(async () => {
    const alder = await import('/src/sim/alder.ts');
    __ns.freeze(true);
    const { view } = __ns;
    const gl = view.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    window.forestProbe = { alder };
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      trees: alder.ALDER_EVERGREENS.length,
      buffer: [view.renderer.domElement.width, view.renderer.domElement.height] };
  });
  console.log(JSON.stringify(setup));
  const results = [];
  for (const [name, x, z] of [['ridge', 2300, -900], ['woods', 2100, -1700], ['garage', -4.5, 890]]) {
    if (process.env.FOREST_SITE && name !== process.env.FOREST_SITE) continue;
    const result = await page.evaluate(async ({ name, x, z }) => {
      const { alder } = forestProbe, { view, sim } = __ns;
      const { scene, renderer, camera } = view;
      const road = alder.ALDER_STREETS.filter(s => name !== 'ridge' || /Ridge Scenic/.test(s.name))
        .flatMap(s => s.points).sort((a,b) => Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
      x = road.x + 4.5; z = road.z + 55;
      const y = alder.alderHeight(x,z);
      Object.assign(sim.state.vehicle, { x, z, y, heading: 0 });
      view.car.position.set(x,y,z); view.car.rotation.set(0,0,0);
      for (let i=0;i<100;i++) view.grass.update(sim.state,1/60);
      camera.position.set(x,y+3,z+7); camera.lookAt(x,y+3,z-100); camera.fov=60; camera.updateProjectionMatrix();
      view.moon.position.set(x-90,y+140,z+80); view.moon.target.position.set(x,y,z); view.sky.position.set(x,y,z);
      const fixedCamera = camera.clone();
      const trees = scene.getObjectByName('alder-evergreens');
      const grass = scene.children.filter(o => o.name.startsWith('grass-') && o.visible);
      const gl = renderer.getContext();
      const sample = (fn, count=30) => {
        const times=[]; for(let i=0;i<count+5;i++) { const t=performance.now(); fn(); if(i>=5)times.push(performance.now()-t); }
        times.sort((a,b)=>a-b); return { median:times[Math.floor(times.length/2)], p95:times[Math.ceil(times.length*.95)-1] };
      };
      const variants = [];
      for (const variant of ['all', 'no-trees', 'no-tree-shadows', 'no-grass']) {
        trees.visible=variant!=='no-trees'; trees.traverse(o=>{if(o.isMesh)o.castShadow=variant!=='no-tree-shadows';});
        grass.forEach(o=>o.visible=variant!=='no-grass');
        const timing = sample(()=>{ drawForest(scene,fixedCamera); gl.finish(); });
        variants.push({variant,...timing,...renderer.info.render});
      }
      trees.visible=true; trees.traverse(o=>{if(o.isMesh)o.castShadow=true;}); grass.forEach(o=>o.visible=true);
      const grassCPU=sample(()=>view.grass.update(sim.state,1/60),120);
      sim.body.setTranslation({x,y:y+.8,z},true);
      sim.body.setLinvel({x:0,y:0,z:0},true);
      const { step } = await import('/src/sim/sim.ts');
      const simCPU=sample(()=>step(sim,{throttle:0,brake:0,steer:0,handbrake:1}),120);
      drawForest(scene,fixedCamera); gl.finish();
      const streaming=[];
      for(let i=0;i<180;i++) {
        Object.assign(sim.state.vehicle,{x,z:z-i*1.5,y:alder.alderHeight(x,z-i*1.5)});
        const start=performance.now(); view.grass.update(sim.state,1/60); streaming.push(performance.now()-start);
      }
      streaming.sort((a,b)=>a-b);
      const grassMovingCPU={median:streaming[90],p95:streaming[170],max:streaming.at(-1),over16ms:streaming.filter(t=>t>16).length};
      return {name,x,z,variants,grassCPU,simCPU,grassMovingCPU};
    }, {name,x,z});
    results.push(result); console.log(JSON.stringify(result));
    await page.screenshot({path:`artifacts/forest/${label}-${name}.png`});
  }
  await writeFile(`artifacts/forest/${label}.json`,JSON.stringify({setup,results,errors},null,2));
  console.log(JSON.stringify({errors}));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
