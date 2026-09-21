import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import landmarks from "../sim/alder-landmarks.json" with { type: "json" };

/** Street studio wraps the two Broad St approaches: +Z then +X. */
export const STATION_BOOTH = ["0:2", "0:3", "1:-3"] as const;
export const BROADCAST_STATION = "KALD 88.5";

const GLYPHS: Record<string, string[]> = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
};

/** Signal House: occupied skyscraper, open crown supports, faceted radio lantern.
 * Only the grounded shaft is a shared solid. Everything above it is unreachable
 * skyline detail. Repeated parts merge into eight draws, with no added lights.
 */
export function addBroadcastTower(scene: THREE.Scene, night: boolean): void {
  const site = landmarks.broadcastTower;
  const group = new THREE.Group();
  group.name = "alder-broadcast-tower";
  group.position.set(site.x, site.base, site.z);
  group.rotation.y = site.rotation;
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x626562, roughness: .95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x7c8886, metalness: .5, roughness: .6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x202b30, metalness: .4, roughness: .75 }),
    letters: new THREE.MeshBasicMaterial({ color: night ? 0xb5eddd : 0xe0e8d5, toneMapped: false }),
    windows: new THREE.MeshStandardMaterial({ color: night ? 0x1d2c35 : 0x526573,
      metalness: .35, roughness: .4, emissive: 0xe7b969, emissiveIntensity: night ? 0 : .1 }),
    booth: new THREE.MeshStandardMaterial({ color: 0x877c60, emissive: 0xffa94d, emissiveIntensity: night ? 1.15 : .1 }),
    beacon: new THREE.MeshBasicMaterial({ color: 0xff4434, toneMapped: false }),
  };
  type Surface = keyof typeof materials;
  const batches = new Map<Surface, THREE.BufferGeometry[]>();
  function add(surface: Surface, geometry: THREE.BufferGeometry) {
    const batch = batches.get(surface) ?? []; batch.push(geometry); batches.set(surface, batch);
  }
  function box(surface: Surface, w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z); g.rotateY(yaw); add(surface, g);
  }
  function tier(surface: Surface, bottom: number, top: number, lo: number, hi: number) {
    const g = new THREE.CylinderGeometry(top, bottom, hi - lo, 8);
    g.rotateY(Math.PI / 8); g.translate(0, (lo + hi) / 2, 0); add(surface, g);
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
    const g = new THREE.BoxGeometry(thickness, a.distanceTo(b), thickness);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(...a.clone().add(b).multiplyScalar(.5).toArray()); add("steel", g);
  }
  function lettering(text: string, pitch: number, y: number, z: number, yaw: number) {
    [...text].forEach((letter, index) => GLYPHS[letter]?.forEach((row, v) => [...row].forEach((bit, u) => {
      if (bit !== "1") return;
      // Flat opaque pixels, facing the reader on each side; no hidden box faces.
      const g = new THREE.PlaneGeometry(pitch * .88, pitch * .88);
      g.translate((index * 6 + u - (text.length * 6 - 2) / 2) * pitch, y - v * pitch, z);
      g.rotateY(yaw); add("letters", g);
    })));
  }
  const plaza = new THREE.CylinderGeometry(28, 28, .08, 32);
  plaza.translate(0, .015, 0); add("concrete", plaza);
  const base = new THREE.Mesh(new THREE.BoxGeometry(site.width, site.height, site.depth), materials.concrete);
  base.name = "broadcast-station-solid"; base.position.y = site.height / 2;
  base.castShadow = base.receiveShadow = true; group.add(base);

  for (let face = 0; face < 4; face++) {
    const yaw = face * Math.PI / 2;
    const edge = (face % 2 ? site.width : site.depth) / 2;
    const width = face % 2 ? site.depth : site.width;
    // A deep, continuous glass recess divided by heavy concrete piers. The
    // large shaft remains legible after its floor divisions become subpixel.
    box("windows", width - 5, site.height - 22, .10, 0, (site.height + 18) / 2, edge + .08, yaw);
    for (const x of [-7.8, 0, 7.8]) box("concrete", .65, site.height - 18, .48, x, (site.height + 18) / 2, edge + .15, yaw);
    for (let y = 22; y < site.height; y += 4) box("dark", width - 5, .22, .16, 0, y, edge + .19, yaw);
    // Mechanical belt and a recessed roof, below the open structural neck.
    box("dark", width, 4, .14, 0, site.height - 4, edge + .08, yaw);
    box("steel", width, .35, .30, 0, site.height - 1.4, edge + .20, yaw);
    box("dark", width - 3, 3, .16, 0, 7, edge + .10, yaw);
    for (let i = -3; i <= 3; i++) {
      const booth = (STATION_BOOTH as readonly string[]).includes(`${face}:${i}`);
      box(booth ? "booth" : "windows", 2.7, 2.1, .06, i * 3.35, 7, edge + .22, yaw);
      if (booth && night) box("dark", 2.7, .42, .05, i * 3.35, 6.22, edge + .27, yaw);
    }
    // Human-scale double doors and station marquee beneath the tower shaft.
    box("dark", 3.4, 3.5, .16, 0, 1.75, edge + .10, yaw);
    box("steel", .09, 3.3, .12, 0, 1.65, edge + .23, yaw);
    for (const x of [-.27, .27]) box("steel", .06, .6, .15, x, 1.3, edge + .25, yaw);
    box("steel", 5.5, .24, 1.7, 0, 3.8, edge + .5, yaw);
    box("dark", 24, 6.6, .22, 0, 13.2, edge + .18, yaw);
    lettering("PORT ALDER", .31, 15.2, edge + .31, yaw);
    lettering("RADIO 88.5 FM", .21, 12, edge + .31, yaw);
    box("letters", 20, .07, .08, 0, 9.6, edge + .26, yaw);
  }

  // Four raking pylons hold an octagonal studio crown away from the shaft.
  // The open gap, tapered underside and split antenna shoulders define the
  // silhouette, rather than relying on small surface decoration.
  tier("dark", 5.2, 5.2, site.height, 229);
  for (let side = 0; side < 4; side++) {
    const yaw = side * Math.PI / 2;
    const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    beam(point(0, site.height - 1, 10), point(0, 206, 23), 1.6);
    beam(point(0, 189, 13.6), point(0, 203, 5), .7);
  }
  tier("concrete", 12, 27, 198, 207);
  tier("steel", 27, 27, 207, 208);
  tier("windows", 25, 25, 208, 222);
  tier("dark", 26.5, 26.5, 218, 221.8);
  tier("steel", 27, 27, 222, 223);
  tier("concrete", 27, 18, 223, 229);
  // Warm occupied control room on the southeast crown facet only. All other
  // glass stays dark; the street booth is still the soundtrack DJ's home.
  const crownFace = 25 * Math.cos(Math.PI / 8);
  box("booth", 15.4, 4.4, .08, 0, 212.8, crownFace + .05, Math.PI / 4);
  for (let face = 0; face < 8; face++) {
    const yaw = face * Math.PI / 4;
    for (const x of [-8.7, -4.35, 0, 4.35, 8.7]) box("steel", .18, 14.2, .23, x, 215, crownFace + .11, yaw);
    if (face % 2 === 0) lettering(BROADCAST_STATION, .28, 220.8, 26.5 * Math.cos(Math.PI / 8) + .04, yaw);
    box("letters", 17.5, .10, .10, 0, 222.4, 27 * Math.cos(Math.PI / 8) + .06, yaw);
  }
  // Two unequal tuning-fork shoulders make the silhouette directional.
  box("concrete", 3, 24, 8, -7, 238, 0);
  box("concrete", 3, 16, 8, 7, 234, 0);
  tier("steel", 2.8, 1.4, 229, 251);
  tier("steel", .8, .22, 251, site.mastHeight);
  for (const y of [252, 258, 264]) {
    box("steel", 5, .3, .3, 0, y, 0);
    box("steel", .3, .3, 5, 0, y, 0);
  }
  for (const [x, y, z] of [[0, site.mastHeight, 0], [-7, 250, 0], [7, 242, 0], [-19, 224, 19], [19, 224, -19]]) {
    const lamp = new THREE.SphereGeometry(y === site.mastHeight ? .85 : .5, 8, 6);
    lamp.translate(x!, y!, z!); add("beacon", lamp);
  }
  for (const [surface, geometries] of batches) {
    const merged = mergeGeometries(geometries)!;
    geometries.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, materials[surface]); mesh.name = `broadcast-${surface}`;
    mesh.castShadow = surface !== "beacon" && surface !== "letters";
    mesh.receiveShadow = true; group.add(mesh);
  }
  scene.add(group);
}
