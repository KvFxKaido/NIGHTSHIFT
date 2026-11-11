import { readFile, writeFile } from 'node:fs/promises';
import { ALDER_BLOCKS } from '../../../src/sim/alder.ts';
import { blockCorners } from '../../../src/sim/building-footprint.ts';
const data = JSON.parse(await readFile(new URL('../../../src/sim/alder-data.json', import.meta.url)));
const esc = s => s.replaceAll('&','&amp;');
const poly = points => points.map(p => p.join(',')).join(' ');
const route = [[-9,910],[-9,896],[-9,780],[-9,662],[-9,544],[-9,428],[-8,312],[-8,141],[-8,85],[-8,-16],[-8,-67],[49,-67],[105,-67],[162,-67],[188,-67],[219,-67],[276,-67],[333,-66],[333,-113],[570,-40],[600,-39],[850,-30]];
const buildings = ALDER_BLOCKS.map(b => `<polygon points="${poly(blockCorners(b).map(p=>[p.x,p.z]))}" fill="${b.height>30?'#66717b':'#3b4853'}" stroke="#172530" stroke-width="1"/>`).join('');
const roads = data.roads.map(r=>`<polyline points="${poly(r.points)}" fill="none" stroke="#86929a" stroke-width="${r.width}" stroke-linejoin="round"/>`).join('');
const corridor = `<polyline points="${poly(route)}" fill="none" stroke="#ffbb65" stroke-width="9" stroke-linejoin="round"/>`;
const circles = [[-4,720,'01'],[30,-63,'02'],[600,-34,'03']].map(([x,z,n])=>`<circle cx="${x}" cy="${z}" r="29" fill="#ffbb65" stroke="#101b25" stroke-width="5"/><text x="${x}" y="${z+9}" text-anchor="middle" font-size="26" font-weight="bold" fill="#101b25">${n}</text>`).join('');
const label=(x,z,s)=>`<text x="${x}" y="${z}" font-size="23" fill="#f0e9da" paint-order="stroke" stroke="#101b25" stroke-width="7">${esc(s)}</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1150" viewBox="0 0 1500 1150" font-family="Arial,sans-serif">
<rect width="1500" height="1150" fill="#101b25"/>
<text x="55" y="65" fill="#ffbb65" font-size="18" letter-spacing="4">NIGHTSHIFT / COMPOSITION STUDY 01</text>
<text x="55" y="115" fill="#f0e9da" font-size="38">Give the city depth</text>
<text x="55" y="150" fill="#a9b7c2" font-size="19">Existing roads + resolved building footprints. Amber = proposed study drive.</text>
<svg x="45" y="180" width="1040" height="875" viewBox="-760 -460 1950 1640">
${roads}${buildings}${corridor}
<g fill="none" stroke="#e3aa64" stroke-width="3" stroke-dasharray="10 9"><rect x="-155" y="580" width="310" height="220" rx="25"/><rect x="-55" y="-170" width="390" height="220" rx="25"/><rect x="470" y="-180" width="460" height="300" rx="25"/></g>
${circles}${label(50,900,'Wharf Garage')}${label(-550,700,'FREIGHT / OPEN YARDS')}${label(0,-260,'JACKSON / STREET WALL')}${label(540,185,'YESLER / TERRACED EDGE')}${label(-480,420,'First Avenue north')}
<path d="M-620 -300v-90l-15 25m15-25 15 25" stroke="#f0e9da" stroke-width="4" fill="none"/>${label(-630,-410,'N')}
<path d="M-620 1050h200m-200-8v16m200-16v16" stroke="#f0e9da" stroke-width="4"/>${label(-620,1090,'200 m')}
</svg>
<g fill="#f0e9da" font-size="19">
<text x="1110" y="235" fill="#ffbb65" font-size="25">01 / WORKING EDGE</text>
<text x="1110" y="270">Canopy → roof plant</text><text x="1110" y="298">→ distant port silhouette.</text>
<text x="1110" y="370" fill="#ffbb65" font-size="25">02 / ENCLOSURE</text>
<text x="1110" y="405">Recessed fronts → cornice</text><text x="1110" y="433">→ taller background.</text>
<text x="1110" y="505" fill="#ffbb65" font-size="25">03 / GROUNDING</text>
<text x="1110" y="540">Wall → terrace → housing.</text><text x="1110" y="568">Make the slope legible.</text>
</g>
<svg x="1110" y="640" width="325" height="310" viewBox="-1300 -3200 4100 4500">${roads}${buildings}<polyline points="${poly(route)}" fill="none" stroke="#ffbb65" stroke-width="65"/></svg>
<text x="1110" y="985" fill="#a9b7c2" font-size="17">Location in the existing city</text>
<text x="55" y="1100" fill="#a9b7c2" font-size="18">Dashed areas are study envelopes, not approved construction. Footprints omit frontage detail and ground surfaces.</text>
</svg>`;
await writeFile(new URL('overhead.svg',import.meta.url),svg);
console.log(`Wrote overhead.svg: ${data.roads.length} roads; ${ALDER_BLOCKS.length} resolved building footprints.`);
