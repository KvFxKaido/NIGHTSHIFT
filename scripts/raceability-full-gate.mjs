// Standard 83-race x six-seed gate, two fresh variants, retaining all rows for diagnosis.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const revision = process.env.NS_STOP_REVISION ?? 'v1';
if (!['v1', 'v2'].includes(revision)) throw new Error('Invalid stopping revision');
const root = revision === 'v1' ? 'artifacts/raceability-full-gate' : 'artifacts/raceability-full-gate-v2';
mkdirSync(root, { recursive: true });
const seeds = [0, 1000, 271828, 1, 42, 314159];
const files = [...execFileSync('git', ['ls-files', 'src', 'scripts'], { encoding: 'utf8' }).trim().split(/\r?\n/),
  'scripts/raceability-experiment-loader.mjs', 'scripts/raceability-footprint-stop.ts', 'scripts/raceability-footprint-stop-v1.ts', 'scripts/raceability-cooldown-audit.ts', 'scripts/raceability-full-gate.mjs'];
const hashes = () => Object.fromEntries([...new Set(files)].sort().map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const sourceHashes = hashes();
writeFileSync(`${root}/manifest.json`, JSON.stringify({ started: new Date().toISOString(), node: process.version, revision,
  method: 'Standard gate: street-uptown plus gen-1..82; six seeds; drawn rival cars, no car override; current versus swept-stop from tick zero; physics contact reads added to both.',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes }, null, 2));
const jobs = seeds.flatMap(seed => Array.from({ length: 4 }, (_, group) => ['current', 'swept'].map(mode => ({ seed, group, mode })))).flat();
if (jobs.length !== 48 || jobs.some(j => !Number.isInteger(j.seed) || !Number.isInteger(j.group) || !j.mode)) throw new Error('Invalid gate jobs');
let next = 0, finished = 0;
const active = new Set();
const progress = () => {
  const counts = { current: 0, swept: 0 };
  for (const j of jobs) {
    const file = `${root}/${j.mode}-${j.seed}-${j.group}.jsonl`;
    if (existsSync(file)) counts[j.mode] += readFileSync(file, 'utf8').split('\n').filter(line => line.endsWith('}')).length;
  }
  console.log(`current ${counts.current}/498; swept ${counts.swept}/498; batches ${finished}/48`);
};
const timer = setInterval(progress, 30000);
try {
  await Promise.all(Array.from({ length: 24 }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++], ids = [...(j.group === 0 ? ['street-uptown'] : []), ...Array.from({ length: 82 }, (_, i) => `gen-${i + 1}`).filter((_, i) => (i + 1) % 4 === j.group)];
      const env = { ...process.env, TRAFFIC_SEED: String(j.seed) };
      for (const key of ['NODE_OPTIONS', 'PLAN', 'REACH', 'BEND', 'BENDTANGENT', 'WORTH', 'SLIP', 'FOLLOW', 'FRAME', 'NS_STOP_EXPERIMENT', 'NS_STOP_FORK_TICK']) delete env[key];
      const args = ['--experimental-strip-types', '--no-warnings'];
      if (j.mode === 'swept') {
        env.NS_STOP_EXPERIMENT = '1'; env.NS_STOP_FORK_TICK = '0'; env.NS_STOP_REVISION = revision;
        args.push('--import', pathToFileURL(resolve('scripts/raceability-experiment-loader.mjs')).href);
      }
      args.push('scripts/street-line-batch.ts', ...ids, '--line', '--trace', '--census', '--physics-contacts', `--output=${root}/${j.mode}-${j.seed}-${j.group}.jsonl`);
      await new Promise((resolveJob, reject) => {
        const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
        active.add(child);
        let errors = '';
        child.stderr.on('data', chunk => { errors += chunk; });
        child.on('error', reject);
        child.on('exit', code => {
          active.delete(child);
          writeFileSync(`${root}/${j.mode}-${j.seed}-${j.group}.log`, errors);
          if (code) reject(new Error(`${j.mode} ${j.seed}/${j.group}: exit ${code}\n${errors}`));
          else resolveJob();
        });
      });
      finished++;
    }
  }));
  if (JSON.stringify(hashes()) !== JSON.stringify(sourceHashes)) throw new Error('Source changed during gate; do not compare these runs');
  progress();
  writeFileSync(`${root}/complete.json`, JSON.stringify({ finished: new Date().toISOString(), batches: finished }));
} finally {
  clearInterval(timer);
  for (const child of active) child.kill();
}
