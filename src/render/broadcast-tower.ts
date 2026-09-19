import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import landmarks from "../sim/alder-landmarks.json" with { type: "json" };

/**
 * The station's booth, as face:window in the base's window band: faces run +Z,
 * +X, -Z, -X, windows -3 to 3 along each. Only +Z and +X look onto a street
 * (Broad St, 37 m off), so the booth wraps the corner between them and reads
 * from both approaches.
 */
export const STATION_BOOTH = ["0:2", "0:3", "1:-3"] as const;

/** One shared solid station base; the lattice above is skyline detail. */
export function addBroadcastTower(scene: THREE.Scene, night: boolean): void {
  const site = landmarks.broadcastTower;
  const group = new THREE.Group();
  group.name = "alder-broadcast-tower";
  group.position.set(site.x, site.base, site.z);
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x606b68, roughness: .95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x768b88, metalness: .65, roughness: .6,
      emissive: 0x29404a, emissiveIntensity: night ? .4 : 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17282f, metalness: .4, roughness: .75 }),
    letters: new THREE.MeshBasicMaterial({ color: night ? 0xb5eddd : 0xe0e8d5, toneMapped: false }),
    // After dark the station is lit where somebody is working (design/LOOK.md):
    // the overnight booth, where the DJ is, and nowhere else.
    windows: new THREE.MeshStandardMaterial({ color: night ? 0x1d262c : 0x877c60, emissive: 0xe7b969, emissiveIntensity: night ? 0 : .1 }),
    // Lamp-warm, not office-white: at 1.6 the glass saturated to cream.
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
  function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number) {
    const g = new THREE.BoxGeometry(thickness, a.distanceTo(b), thickness);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(rotation); g.translate(...a.clone().add(b).multiplyScalar(.5).toArray()); add("steel", g);
  }
  const plaza = new THREE.CylinderGeometry(28, 28, .08, 32);
  plaza.translate(0, .015, 0); add("concrete", plaza);
  // The visible station shell exactly matches the Rapier footprint and height.
  const base = new THREE.Mesh(new THREE.BoxGeometry(site.width, site.height, site.depth), materials.concrete);
  base.name = "broadcast-station-solid"; base.position.y = site.height / 2;
  base.castShadow = base.receiveShadow = true; group.add(base);
  for (let face = 0; face < 4; face++) {
    const yaw = face * Math.PI / 2;
    box("dark", 18, 2.6, .12, 0, 10, 10.06, yaw);
    for (let i = -3; i <= 3; i++) {
      const booth = (STATION_BOOTH as readonly string[]).includes(`${face}:${i}`);
      box(booth ? "booth" : "windows", 1.6, 1.5, .06, i * 2.35, 10, 10.14, yaw);
      // The desk and its console across the bottom of the lit glass: somebody at work.
      if (booth && night) box("dark", 1.6, .42, .05, i * 2.35, 9.46, 10.19, yaw);
    }
    box("dark", 4.2, 5, .12, 0, 2.5, 10.06, yaw);
    box("steel", 20, .5, .18, 0, 16.8, 10, yaw);
  }
  const halfWidth = (y: number) => 6 - (y - site.height) / (100 - site.height) * 4;
  const levels = Array.from({ length: 9 }, (_, i) => site.height + (100 - site.height) * i / 8);
  for (let i = 1; i < levels.length; i++) {
    const lo = levels[i - 1]!, hi = levels[i]!;
    for (let side = 0; side < 4; side++) {
      const yaw = side * Math.PI / 2;
      const point = (sign: number, y: number) => new THREE.Vector3(sign * halfWidth(y), y, halfWidth(y)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      beam(point(-1, lo), point(-1, hi), .65);
      beam(point(-1, lo), point(1, lo), .35);
      beam(point(-1, lo), point(1, hi), .25);
      beam(point(1, lo), point(-1, hi), .25);
    }
  }
  box("steel", 6, .8, 6, 0, 100, 0);
  box("steel", 1.1, site.mastHeight - 100, 1.1, 0, (site.mastHeight + 100) / 2, 0);
  for (const y of [104, 110, 116]) box("letters", 1.18, 2.5, 1.18, 0, y, 0);
  for (const y of [42, 72, 100, site.mastHeight]) {
    const positions = y < 100 ? [[-halfWidth(y), halfWidth(y)], [halfWidth(y), -halfWidth(y)]] : [[0, 0]];
    for (const [x, z] of positions) {
      const lamp = new THREE.SphereGeometry(y === site.mastHeight ? .85 : .55, 8, 6);
      lamp.translate(x!, y, z!); add("beacon", lamp);
    }
  }
  // Bitmap geometry avoids font downloads/canvas dependencies and keeps each
  // outward-facing sign readable instead of mirroring text on the back face.
  const glyphs: Record<string, string[]> = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  };
  for (let face = 0; face < 4; face++) {
    const yaw = face * Math.PI / 2;
    box("dark", 16, 9.6, .25, 0, 64, 8, yaw);
    box("steel", 16.4, .18, .4, 0, 69, 8, yaw);
    box("steel", 16.4, .18, .4, 0, 59, 8, yaw);
    ["PORT", "ALDER"].forEach((word, line) => {
      [...word].forEach((letter, index) => glyphs[letter]!.forEach((row, y) => [...row].forEach((bit, x) => {
        if (bit === "1") box("letters", .43, .43, .08, (index * 6 + x - (word.length * 6 - 2) / 2) * .48,
          67.6 - line * 4.2 - y * .48, 8.18, yaw);
      })));
    });
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
