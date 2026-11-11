// Geometry-only shortlist; no simulation or changes to the generated courses.
import { mkdirSync, writeFileSync } from "node:fs";
import { drawAlderCourse } from "../src/sim/alder-course.ts";

const rows = Array.from({ length: 82 }, (_, i) => {
  const id = `gen-${i + 1}`, { rival } = drawAlderCourse(id, null);
  let turn = 0;
  for (let j = 1; j < rival.points.length - 1; j++) {
    const a = rival.points[j - 1]!, b = rival.points[j]!, c = rival.points[j + 1]!;
    const u = Math.atan2(b.z - a.z, b.x - a.x), v = Math.atan2(c.z - b.z, c.x - b.x);
    turn += Math.abs(Math.atan2(Math.sin(v - u), Math.cos(v - u)));
  }
  const metres = rival.along.at(-1)!;
  return { id, metres, turnsPerKm: turn / (Math.PI / 2) / (metres / 1000) };
}).sort((a, b) => a.turnsPerKm - b.turnsPerKm);
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/raceability-catalog.json", JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ flowing: rows.slice(0, 5), technical: rows.slice(-5) }, null, 2));
