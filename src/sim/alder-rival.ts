import { ALDER_STREETS, ALDER_RACE, createAlderWorld, alderHeight } from "./alder.ts";
import type { RivalDefinition } from "./rival.ts";
import type { CoursePoint } from "./track.ts";

const points: CoursePoint[] = [];
function append(id: string, reverse = false) {
  const street = ALDER_STREETS.find(street => street.id === id);
  if (!street) throw Error(`Rival route street missing: ${id}`);
  const ordered = reverse ? [...street.points].reverse() : [...street.points];
  if (points.length && Math.hypot(points.at(-1)!.x-ordered[0]!.x,points.at(-1)!.z-ordered[0]!.z)>.1) {
    throw Error(`Rival route has a disconnected join at ${id}`);
  }
  for (const point of ordered) {
    if (!points.length || Math.hypot(points.at(-1)!.x-point.x,points.at(-1)!.z-point.z)>.01) points.push({...point});
  }
}
const grid = createAlderWorld(true).start;
const start = {...grid, x: grid.x - 4.5, z: grid.z - 7};
points.push({...ALDER_STREETS.find(s=>s.id==='sea-29')!.points[0]!, x:start.x,z:start.z});
points.push({...points[0]!,x:-9,z:896});
points.push({...points[0]!,x:-9,z:780});
// North on 1st Avenue, east through Jackson's gate, then around the block.
append('sea-27',true); append('sea-28',true); append('sea-35',true);
append('sea-34'); append('sea-45',true); append('sea-32',true);
append('sea-33'); append('sea-35'); append('sea-28'); append('sea-27');
// South to the harbor loop; continue north instead of turning around at its gate.
append('sea-0',true); append('sea-2'); append('sea-35',true); append('sea-33',true);
// Western Avenue and Madison, then 1st Avenue to the Pike Street finish.
append('sea-31',true); append('sea-16',true); append('sea-17');
append('sea-10'); append('sea-8'); append('sea-9'); append('sea-13');
const along = [0];
for(let i=1;i<points.length;i++) along.push(along.at(-1)!+Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.z-points[i-1]!.z));
let previous=0;
const gates=ALDER_RACE.checkpoints.map(gate=>{
  const index=points.findIndex((point,i)=>i>=previous&&Math.hypot(point.x-gate.x,point.z-gate.z)<.1);
  if(index<0)throw Error(`Rival route misses ${gate.name}`);
  previous=index; return along[index]!;
});
// Moth races Sound to Sky in her Kestrel, so the line is driven all-wheel,
// declared the way RIVET_DRAG_DRIVER declares rear-drive. Nothing derives this
// from CAR_DRIVETRAIN, so cars.test.ts holds the two together.
export const ALDER_RIVAL: RivalDefinition = {id:'sound-to-sky-driver-v2',drivetrain:'awd',start:{...start,y:alderHeight(start.x,start.z)},points,along,gates};
