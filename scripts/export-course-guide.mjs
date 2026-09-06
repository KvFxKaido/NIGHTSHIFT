// Generated authoring references. This never changes the simulation or a .blend.
import { mkdir, writeFile } from 'node:fs/promises';
import { COURSE_POINTS, COURSE_SEGMENTS, COURSE_WALLS } from '../src/sim/track.ts';
import { courseFingerprint, COURSE_ASSET_VERSION } from '../src/render/course-asset-contract.ts';

const target = new URL('../assets/tracks/blackglass/route-guide.json', import.meta.url);
await mkdir(new URL('.', target), { recursive: true });
await writeFile(target, JSON.stringify({
  version: COURSE_ASSET_VERSION, fingerprint: courseFingerprint(),
  coordinates: 'metres; game X/Y/Z, Y up; Blender mapping (x, -z, y)',
  points: COURSE_POINTS, segments: COURSE_SEGMENTS, walls: COURSE_WALLS,
}, null, 2) + '\n');
console.log(`Exported Blackglass road/barrier guides: ${courseFingerprint()}`);
