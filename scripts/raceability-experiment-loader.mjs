// Opt-in process-local source injection. Never writes game source or enters the Vite bundle.
import { registerHooks } from 'node:module';
const experiment = process.env.NS_STOP_EXPERIMENT === '1';
const revision = process.env.NS_STOP_REVISION ?? 'v2';
if (!['v1', 'v2'].includes(revision)) throw new Error('Invalid stopping revision');
const forkTick = Number(process.env.NS_STOP_FORK_TICK ?? 3600);
if (!Number.isSafeInteger(forkTick) || forkTick < 0) throw new Error('Invalid fork tick');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/src/sim/sim.ts') && !(experiment && url.endsWith('/src/sim/rival.ts'))) return result;
  let source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  if (url.endsWith('/src/sim/sim.ts')) {
    const needle = 'readStreetLine(sim.rivalDefinition,';
    if (!source.includes(needle)) throw new Error('Street-line audit insertion point moved');
    source = 'import { auditStreetLine } from "../../scripts/raceability-cooldown-audit.ts";\n' + source.replace(needle, 'auditStreetLine(sim.rivalDefinition,');
  } else {
    const needle = 'if (inPath && ahead>0) slowFor(along,ahead,length,crossing ? "crossing" : "oncoming",obstacle.id);';
    if (!source.includes(needle)) throw new Error('Stopping experiment insertion point moved');
    const helper = revision === 'v1' ? 'raceability-footprint-stop-v1.ts' : 'raceability-footprint-stop.ts';
    const check = `
      if (inPath && ahead > 0 && trafficContext && trafficContext.tick >= ${forkTick}) {
        const swept = footprintStopSpeed(route, driver, car, obstacle.id, trafficContext, sampleDrivingPath);
        if (swept !== null) cap(swept, "swept-stop", obstacle.id);
      }`;
    source = `import { footprintStopSpeed } from "../../scripts/${helper}";\n` + source.replace(needle, needle + check);
  }
  return { ...result, source };
} });
