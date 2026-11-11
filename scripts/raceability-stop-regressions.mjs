// Focused v2 acceptance: both stopping regressions, original Cinder fix, and v1 follow-ups.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'artifacts/raceability-stop-v2-local';
mkdirSync(root, { recursive: true });
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const prior = JSON.parse(readFileSync('design/measurements/raceability-full-gate.json', 'utf8'));
// Saved controls are reusable only while their production sim and batch setup are identical.
for (const [file, value] of Object.entries(prior.manifest.sourceHashes)) {
  if (file.startsWith('src/') || ['scripts/batch-race.ts', 'scripts/street-line-batch.ts'].includes(file)) assert.equal(hash(file), value, file);
}
assert.equal(hash('scripts/raceability-footprint-stop-v1.ts'), prior.manifest.sourceHashes['scripts/raceability-footprint-stop.ts']);
const sources = ['scripts/raceability-footprint-stop.ts', 'scripts/raceability-footprint-stop-v1.ts',
  'scripts/raceability-experiment-loader.mjs', 'scripts/raceability-stop-regressions.mjs', 'scripts/raceability-cooldown-audit.ts'];
const hashes = Object.fromEntries(sources.map(file => [file, hash(file)]));
writeFileSync(`${root}/manifest.json`, JSON.stringify({ started: new Date().toISOString(), revision:'v2', hashes,
  controls:'design/measurements/raceability-full-gate.json; artifacts/raceability-experiment/*-current.json',
  productionHashes: Object.fromEntries(Object.entries(prior.manifest.sourceHashes).filter(([p]) => p.startsWith('src/'))) }, null, 2));
const seeds = [0,1000,271828,1,42,314159];
const jobs = seeds.map(seed => ({ seed, ids:['gen-22','gen-53','gen-70'], name:`standard-${seed}` }));
jobs.push({seed:1, ids:['street-uptown'], name:'uptown-1'}, {seed:314159, ids:['street-uptown'], name:'uptown-314159'},
  {seed:0, ids:['gen-40'], name:'gen40-0'}, {seed:271828, ids:['gen-66'], name:'gen66-271828'});
let next = 0, finished = 0;
const children = new Set();
try {
  await Promise.all(Array.from({length:6}, async () => {
    while (next < jobs.length) {
      const job = jobs[next++], env = {...process.env, TRAFFIC_SEED:String(job.seed), NS_STOP_EXPERIMENT:'1', NS_STOP_REVISION:'v2', NS_STOP_FORK_TICK:'0'};
      for (const key of ['NODE_OPTIONS','PLAN','REACH','BEND','BENDTANGENT','WORTH','SLIP','FOLLOW','FRAME']) delete env[key];
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--import','./scripts/raceability-experiment-loader.mjs','--experimental-strip-types','--no-warnings',
          'scripts/street-line-batch.ts',...job.ids,'--line','--trace','--physics-contacts',`--output=${root}/${job.name}.jsonl`],
        {env,windowsHide:true,stdio:['ignore','ignore','pipe']});
        children.add(child); let errors='';
        child.stderr.on('data', c => errors+=c);
        child.on('error', reject);
        child.on('exit', code => {children.delete(child); writeFileSync(`${root}/${job.name}.log`,errors); code ? reject(new Error(errors)) : resolve();});
      });
      console.log(`Completed ${++finished}/${jobs.length}: ${job.name}`);
    }
  }));
  for (const [file,value] of Object.entries(hashes)) assert.equal(hash(file),value,file);
  const pairs = jobs.flatMap(job => readFileSync(`${root}/${job.name}.jsonl`,'utf8').trim().split('\n').map(line => {
    const now=JSON.parse(line), original=prior.comparisons.find(r=>r.id===now.id&&r.seed===job.seed);
    return {id:now.id,seed:job.seed,was:original.was,v1:original.now,now};
  }));
  assert.equal(pairs.length,22);
  writeFileSync(`${root}/comparison.json`,JSON.stringify({completed:new Date().toISOString(),pairs},null,2));
  console.log('Saved 22 standard-car comparisons');
} finally {for(const child of children) child.kill();}
