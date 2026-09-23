import * as THREE from "three";
import { SITE_FENCE_WALLS, SITE_PAVING, DRIFT_YARD, DRIFT_ZONES, GATE_STRUCTURES, YARD_GATE, YARD_LINE, YARD_STRUCTURES } from "../sim/drift-yard.ts";
import type { RaceState } from "../sim/race.ts";

export function addDriftYard(scene: THREE.Scene, night: boolean) {
  const group = new THREE.Group(); group.name = "south-wharf-drift-yard"; scene.add(group);
  const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .85 });
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  const entry = DRIFT_YARD.driveway;
  const asphalt = material(night ? 0x303b43 : 0x46535a);
  // The whole site is paved now, not just the old lot: the two rectangles the
  // fence encloses, plus the driveway that reaches it.
  for (const [name, rect] of [...SITE_PAVING.map((r, i) => [`site-${i}`, r] as const),
    ["access-road", entry] as const]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ), asphalt);
    mesh.name = `drift-yard-${name}`; mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((rect.minX + rect.maxX) / 2, DRIFT_YARD.base + .035, (rect.minZ + rect.maxZ) / 2);
    mesh.receiveShadow = true; group.add(mesh);
  }
  const dark = material(0x26333d), trim = material(0x7c929b);
  const yellow = new THREE.MeshBasicMaterial({ color: 0xe7b15a });
  const teal = new THREE.MeshBasicMaterial({ color: 0x73e7d0 });
  for (const s of YARD_STRUCTURES) {
    box(`yard-${s.id}`, s.x, s.base + s.height / 2, s.z, s.width, s.height, s.depth, material(s.color));
    if (s.id === "warehouse") {
      box("warehouse-roof", s.x, 14.15, s.z, s.width + 1, .3, s.depth + 1, dark);
      for (let z = 928; z < 990; z += 18) {
        box("warehouse-loading-shutter", s.x - s.width / 2 - .12, 5, z, .2, 6, 12, dark);
        for (let y = 2.6; y < 8; y += .6) box("shutter-rib", s.x - s.width / 2 - .24, y, z, .08, .08, 11.5, trim);
        box("loading-bay-lamp", s.x - s.width / 2 - .3, 9, z, .4, .18, 8, teal);
      }
      for (const x of [-529, -505]) box("warehouse-roof-vent", x, 15, 955, 8, 1.5, 12, trim);
    } else if (s.id.startsWith("container")) {
      for (let x = s.x - s.width / 2 + .6; x < s.x + s.width / 2; x += 1.6)
        box("container-rib", x, 4.6, s.z, .15, 5, s.depth + .15, trim);
    } else if (s.id.startsWith("floodlight")) {
      box("yard-floodlight-head", s.x, 16, s.z, 5, .45, 1.2, yellow);
      if (night) {
        const light = new THREE.PointLight(0xc2def0, 160, 220, 1);
        light.position.set(s.x, 15, s.z); group.add(light);
      }
    } else if (s.id.includes("wall")) {
      const horizontal = s.width > s.depth;
      for (let offset = -Math.max(s.width, s.depth) / 2 + 3; offset < Math.max(s.width, s.depth) / 2; offset += 8)
        box("yard-wall-reflector", s.x + (horizontal ? offset : 0), 2.9, s.z + (horizontal ? 0 : offset), horizontal ? 2 : 2.1, .18, horizontal ? 2.1 : 2, yellow);
    }
  }
  // The east gate on Harbor Way. The garage exit faces it down z = 910, so this
  // is what the game shows a player who has just pressed New Drive.
  for (const s of GATE_STRUCTURES)
    box(`yard-${s.id}`, s.x, s.base + s.height / 2, s.z, s.width, s.height, s.depth, material(s.color));
  label(YARD_GATE.sign.text, YARD_GATE.x, YARD_GATE.sign.y, YARD_GATE.z,
    YARD_GATE.sign.width, YARD_GATE.sign.height, false, Math.PI / 2);
  for (const z of YARD_GATE.postZ) {
    const top = DRIFT_YARD.base + YARD_GATE.postHeight;
    // Sat on the post the way the apron's floods are, not hung beside it.
    box("gate-floodlight-head", YARD_GATE.x, top + .15, z, 2.4, .4, 1, yellow);
    box("gate-floodlight-mount", YARD_GATE.x, top - .35, z, .5, .7, .5, material(0x526775));
    if (night) {
      const light = new THREE.PointLight(0xc2def0, 70, 58, 1.4);
      light.position.set(YARD_GATE.x - 2, top - 1.4, z); group.add(light);
    }
  }
  // Lit means occupied: the gatehouse is how the player knows the meet is on.
  const boothWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1),
    new THREE.MeshStandardMaterial({ color: night ? 0xffd9a0 : 0x2a333b, emissive: night ? 0xffa94d : 0x000000, emissiveIntensity: night ? 1.1 : 0 }));
  boothWindow.name = "gate-booth-window";
  boothWindow.position.set(YARD_GATE.booth.x + YARD_GATE.booth.width / 2 + .02, DRIFT_YARD.base + 1.9, YARD_GATE.booth.z);
  boothWindow.rotation.y = Math.PI / 2;
  group.add(boothWindow);

  // The barrier round the whole site: the yard, what is built in it, and the
  // grass around it. Gaps are where the ways in are.
  for (const wall of SITE_FENCE_WALLS) {
    const mesh = box(`site-fence`, wall.x, wall.base + wall.height / 2, wall.z,
      wall.width, wall.height, wall.depth, material(wall.color));
    mesh.rotation.y = -wall.rotation;
    // The same reflectors the apron's walls carry, so it reads as the same place.
    const marks = Math.max(1, Math.round(wall.width / 9));
    for (let i = 0; i < marks; i++) {
      const along = (i + .5) / marks * wall.width - wall.width / 2;
      const mark = box("site-fence-reflector",
        wall.x + Math.cos(wall.rotation) * along, wall.base + wall.height - .5,
        wall.z + Math.sin(wall.rotation) * along, 2, .18, wall.depth + .1, yellow);
      mark.rotation.y = -wall.rotation;
    }
  }

  // Sparse arrows suggest the sweeper and transition, without prescribing steering.
  for (let i = 1; i < YARD_LINE.length; i++) {
    const a = YARD_LINE[i - 1]!, p = YARD_LINE[i]!;
    const dx = p.x - a.x, dz = p.z - a.z, length = Math.hypot(dx, dz);
    for (let distance = 12; distance < length; distance += 22) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(.85, 3, 3), yellow);
      arrow.name = "yard-direction-arrow";
      arrow.rotation.set(Math.PI / 2, 0, -Math.atan2(dx, dz));
      arrow.position.set(a.x + dx * distance / length, 2.065, a.z + dz * distance / length);
      arrow.scale.z = .02; group.add(arrow);
    }
  }
  // Numbered ground targets remain visible for free-roam practice.
  const rings = DRIFT_ZONES.map((zone, index) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x69c9bf, transparent: true, opacity: .35, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(zone.radius - .45, zone.radius, 48), mat);
    ring.name = `drift-zone-${zone.id}`; ring.rotation.x = -Math.PI / 2; ring.position.set(zone.x, 2.075, zone.z); group.add(ring);
    label(String(index + 1), zone.x, 2.08, zone.z, 5, 5, true);
    return ring;
  });
  function label(text: string, x: number, y: number, z: number, width: number, height: number, flat = false, yaw = Math.PI) {
    if (typeof document === "undefined") return; // Headless: the boxes still build.
    const canvas = document.createElement("canvas"); canvas.width = flat ? 256 : 1024; canvas.height = flat ? 256 : 128;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#101f2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#9ff1dc"; ctx.font = flat ? "bold 160px monospace" : "bold 64px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.name = `yard-sign-${text}`; mesh.position.set(x, y, z); if (flat) mesh.rotation.set(-Math.PI / 2, 0, Math.PI); else mesh.rotation.y = yaw; group.add(mesh);
  }
  label("SOUTH WHARF / DRIFT YARD", -457, 7, 807.8, 58, 6);
  label("SABLE / CLIP. LINK. BANK.", -515, 11, 919.8, 48, 5);
  return { update(race: RaceState | null) {
    rings.forEach((ring, i) => {
      const active = race?.drift?.nextZone === i && !race.finished;
      ring.material.color.setHex(active ? 0xffc268 : 0x69c9bf);
      ring.material.opacity = active ? .95 : .35;
    });
  } };
}
