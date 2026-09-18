import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { RoadSolid } from "../sim/road-world.ts";

/**
 * Night dressing: the emissive layer that turns a grey blockout into a district
 * after dark (GDD §15.1 — pools of coloured light, sodium lamps, fluorescent
 * signage). Everything here is presentation only. It adds no lights beyond the
 * scene's existing few, because the look is carried by emissive surfaces and
 * additive glow quads rather than by anything the GPU has to shade per pixel.
 */

/**
 * Stable pseudo-random in [0, 1). The renderer is allowed `Math.random` — law 2
 * binds the sim, not the view — but a city that re-rolls its own windows on
 * every reload is a city you cannot screenshot twice, so every placement here
 * is a pure function of its index instead.
 */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A 2D context, or null when there is no DOM — the tests build scenes in node. */
function offscreen(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d");
}

function textureFrom(context: CanvasRenderingContext2D | null,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): THREE.Texture | null {
  if (!context) return null;
  const texture = new THREE.CanvasTexture(context.canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.anisotropy = 4;
  return texture;
}

const TILE_COLUMNS = 4;
/** Metres per window, which is what sets how many tiles a facade repeats. */
const WINDOW_PITCH_X = 3.4;
const WINDOW_PITCH_Y = 3.6;

const WARM_ROOM = "#ffcb87";
const COLD_ROOM = "#a8ccff";
/** Strip lights left on for a cleaning crew. */
const CLEANERS = "#dfe9ff";

/**
 * What the windows of a building say about who is in it (design/LOOK.md, "Lit
 * means occupied"). The difference between them is which cells are lit and the
 * shape of the glass, never a new wall.
 * - `scattered`: rooms lit here and there, warm outnumbering cold. Every
 *   building had this before neighbourhoods, and Blackglass still does.
 * - `office`: ribbon windows, dark but for whole floors lit where the cleaners
 *   are, one or two floors a tower, and a late desk or two.
 * - `residential`: smaller windows, a few warm rooms: the city asleep.
 * - `freight`: small high windows, almost none lit: warehouses light their
 *   docks, not their walls, and the docks are the shopfront row.
 */
export type WindowKind = "scattered" | "office" | "residential" | "freight";

interface WindowPattern {
  /** Floors in one tile; an office's is tall, so a tower's lit floors never repeat. */
  readonly rows: number;
  /** The glass in its cell, as fractions of the cell. */
  readonly glass: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** The colour a cell's room is lit, or null for dark glass. */
  lit(n: number, row: number): string | null;
}

/** The floors of an office tile the cleaners are on; each building starts the tile on a floor of its own. */
const CLEANED_FLOORS = [4, 15];

const WINDOW_PATTERNS: Readonly<Record<WindowKind, WindowPattern>> = {
  scattered: { rows: 6, glass: { x: 0.2, y: 0.18, width: 0.6, height: 0.5 },
    // Warm rooms outnumber the cold office floors, which is what stops a
    // block of flats from reading as a single strip-lit office tower.
    lit: n => hash01(n * 3.3) < 0.46 ? null : hash01(n * 7.7) > 0.34 ? WARM_ROOM : COLD_ROOM },
  office: { rows: 24, glass: { x: 0.04, y: 0.24, width: 0.92, height: 0.44 },
    lit: (n, row) => CLEANED_FLOORS.includes(row) ? CLEANERS : hash01(n * 5.9) > 0.94 ? WARM_ROOM : null },
  residential: { rows: 6, glass: { x: 0.28, y: 0.2, width: 0.44, height: 0.46 },
    lit: n => hash01(n * 4.1) < 0.86 ? null : hash01(n * 2.3) > 0.2 ? WARM_ROOM : COLD_ROOM },
  freight: { rows: 6, glass: { x: 0.3, y: 0.12, width: 0.4, height: 0.22 },
    lit: n => hash01(n * 6.1) > 0.96 ? COLD_ROOM : null },
};

interface FacadeTextures { map: THREE.Texture | null; emissiveMap: THREE.Texture | null }
const facadeCache = new Map<WindowKind, FacadeTextures>();

/**
 * One tile of a lit facade, painted twice: an albedo pass so the dark windows
 * read as glass in the moonlight, and an emissive pass carrying only the lit
 * ones so a room switches on without lifting the whole wall.
 */
function facadeTextures(kind: WindowKind): FacadeTextures {
  const cached = facadeCache.get(kind);
  if (cached) return cached;
  const pattern = WINDOW_PATTERNS[kind];
  const cellWidth = 64, cellHeight = 64;
  const size = { width: cellWidth * TILE_COLUMNS, height: cellHeight * pattern.rows };
  const base = offscreen(size.width, size.height);
  const glow = offscreen(size.width, size.height);
  if (base && glow) {
    base.fillStyle = "#2b333d";
    base.fillRect(0, 0, size.width, size.height);
    glow.fillStyle = "#000000";
    glow.fillRect(0, 0, size.width, size.height);
    for (let row = 0; row < pattern.rows; row++) {
      for (let column = 0; column < TILE_COLUMNS; column++) {
        const n = row * TILE_COLUMNS + column;
        const x = column * cellWidth + cellWidth * pattern.glass.x;
        const y = row * cellHeight + cellHeight * pattern.glass.y;
        const width = cellWidth * pattern.glass.width;
        const height = cellHeight * pattern.glass.height;
        base.fillStyle = "#10161e";
        base.fillRect(x, y, width, height);
        const lit = pattern.lit(n, row);
        if (!lit) continue;
        base.fillStyle = lit;
        base.fillRect(x, y, width, height);
        glow.fillStyle = lit;
        glow.fillRect(x, y, width, height);
      }
    }
  }
  const textures = { map: textureFrom(base), emissiveMap: textureFrom(glow) };
  facadeCache.set(kind, textures);
  return textures;
}

let glowCache: THREE.Texture | null | undefined;

/** A soft radial falloff, used additively wherever something has to bloom. */
export function glowTexture(): THREE.Texture | null {
  if (glowCache !== undefined) return glowCache;
  const context = offscreen(128, 128);
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.35, "rgba(255, 255, 255, .42)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = textureFrom(context);
  if (texture) texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  glowCache = texture;
  return glowCache;
}

/** Paint a merged geometry a flat colour, so many of them can share one draw call. */
export function tint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergedMesh(name: string, parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh | null {
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/**
 * A wall panel whose UVs repeat one window grid per `WINDOW_PITCH` metres.
 * `floor` starts the tile on a floor of its own; a building's faces share it, so
 * a lit floor runs round the whole building rather than along one wall.
 */
function facadePanel(width: number, height: number, phase: number, rowsPerTile: number, floor = 0): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const columns = Math.max(1, Math.round(width / WINDOW_PITCH_X)) / TILE_COLUMNS;
  const rows = Math.max(1, Math.round(height / WINDOW_PITCH_Y)) / rowsPerTile;
  const uv = geometry.getAttribute("uv");
  const offset = Math.round(phase * TILE_COLUMNS) / TILE_COLUMNS;
  const lift = Math.round(floor * rowsPerTile) / rowsPerTile;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * columns + offset, uv.getY(i) * rows + lift);
  return geometry;
}

/**
 * Neon is where something is still open, and it never borrows a colour that
 * means something else (design/LOOK.md): cyan is the race's, red is cars and the
 * rival, amber is the city's sodium and the objective.
 */
const SIGN_COLORS = ["#c46bff", "#ff4fd8", "#8cff5a", "#6f6bff"] as const;

/** Dock doors: shut steel, or open on a strip-lit inside. */
const DOCK_SHUT = new THREE.Color("#1c2229");
const DOCK_INSIDE = new THREE.Color("#b9c9e6").multiplyScalar(0.45);
/** A dock floodlight: white, because somebody private pays for it (design/LOOK.md). */
const FLOOD = new THREE.Color("#eef3ff");

export interface BuildingSite extends RoadSolid {
  /** Preserve a site's decoration when a neighbouring plot gets a custom model. */
  readonly decorationIndex?: number;
  /** How far a street is from each face centre, outward order +Z, -Z, +X, -X.
   *  Blackglass measures the nearest centreline, facing or not; Port Alder
   *  measures to the carriageway along the wall's own normal, Infinity where
   *  none is in reach (sim/frontage.ts). Each passes its own `FrontageReach`. */
  readonly faceDistances: readonly [number, number, number, number];
  /** What this building's street walls do at night; `STREET_DRESSING` when absent. */
  readonly dressing?: NightDressing;
}

/** How near a face's street must be for the face to carry signs, and a lit shopfront. */
export interface FrontageReach { readonly signs: number; readonly shopfronts: number }
const CENTRELINE_REACH: FrontageReach = { signs: 56, shopfronts: 40 };

/**
 * How busy a building's street walls are after dark, each a probability. The
 * difference between neighbourhoods is density, not a new language
 * (design/LOOK.md, Districts).
 */
export interface NightDressing {
  /** A reached wall carries neon. */
  readonly signs: number;
  /** A wall with neon carries a second sign. */
  readonly secondSign: number;
  /** One unit of a shopfront row is lit. */
  readonly shopfronts: number;
  /** A lit unit glows in a sign colour rather than white. */
  readonly coloured: number;
  /** A white unit is warm rather than cool. */
  readonly warm: number;
  /** What the windows above say about who is in; `scattered` when absent. */
  readonly windows?: WindowKind;
}

/** A facade mesh's name: `district-facades` for the scattered windows every building once had. */
export const facadeMeshName = (kind: WindowKind) => kind === "scattered" ? "district-facades" : `district-facades-${kind}`;

/** The dressing every building had before neighbourhoods; Blackglass keeps it. */
export const STREET_DRESSING: NightDressing = { signs: 0.8, secondSign: 0.55, shopfronts: 0.82, coloured: 0.2, warm: 0.5 };

/**
 * How far the adjacent road may sit above a block's base before its ground
 * floor stops being a ground floor. Past this the block is beside a viaduct,
 * not a street, and lighting a shopfront there puts a glow in mid-air.
 */
const SHOPFRONT_MAX_LIFT = 3;

/**
 * Buildings, their lit windows and the signage on the faces that a street can
 * see. Everything merges into a handful of meshes: the blockout is 400-odd
 * boxes and one draw call each would cost more than the entire car.
 */
export function addNightBuildings(scene: THREE.Scene, sites: readonly BuildingSite[],
  groundAt: (x: number, z: number) => number = () => 0, reach: FrontageReach = CENTRELINE_REACH): void {
  const facadeMaterial = (kind: WindowKind) => {
    const { map, emissiveMap } = facadeTextures(kind);
    return new THREE.MeshStandardMaterial({
      color: map ? 0xffffff : 0x39434d, map, emissiveMap,
      emissive: emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 1.35, roughness: 0.82,
    });
  };
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x232b33, roughness: 1 });
  // One mesh per kind of window, so each is one material and one draw a chunk.
  const facades = new Map<WindowKind, THREE.BufferGeometry[]>();
  const roofs: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  // Kept apart from the signage glow so that "a spill lies on the pavement in
  // front of its own shopfront" is a claim a test can actually make.
  const spills: THREE.BufferGeometry[] = [];

  sites.forEach((site, ordinal) => {
    const index = site.decorationIndex ?? ordinal;
    // Everything on this building is measured from its base, which is on the
    // ground it stands on — not from datum, which on the hill is underground.
    const base = site.base ?? 0;
    // And built in the building's OWN frame, then turned to face its street.
    // Every piece used to be placed axis-aligned at site.x +/- width/2, with
    // site.rotation never applied — while the footprint, the collider, the
    // blockout massing and every clearance test rotate. 218 of 272 buildings
    // were drawn more than a metre out of their own footprint, with corners in
    // roads, through rails and, on the loop, five metres into the tunnel bore.
    // The sign is the blockout's: rotation.y = -rotation matches blockCorners.
    const yaw = -(site.rotation ?? 0);
    // Each chance is taken as `hash < 1 - p`, so STREET_DRESSING keeps the
    // thresholds Blackglass was dressed with (0.2, 0.45, 0.18, 0.8, 0.5).
    const dressing = site.dressing ?? STREET_DRESSING;
    const finish = <T extends THREE.BufferGeometry>(geometry: T): T => {
      geometry.rotateY(yaw);
      geometry.translate(site.x, 0, site.z);
      return geometry;
    };
    const toWorld = (localX: number, localZ: number) => ({
      x: site.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      z: site.z - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
    });
    const faces = [
      { rotation: 0, x: 0, z: site.depth / 2, width: site.width },
      { rotation: Math.PI, x: 0, z: -site.depth / 2, width: site.width },
      { rotation: Math.PI / 2, x: site.width / 2, z: 0, width: site.depth },
      { rotation: -Math.PI / 2, x: -site.width / 2, z: 0, width: site.depth },
    ];
    const windows = dressing.windows ?? "scattered";
    // Which floor this building's tile starts on, the same on every face. The
    // scattered tile keeps the start it always had.
    const floor = windows === "scattered" ? 0 : hash01(index * 3.7);
    faces.forEach((face, side) => {
      const panel = facadePanel(face.width, site.height, hash01(index * 5.1 + side), WINDOW_PATTERNS[windows].rows, floor);
      panel.rotateY(face.rotation);
      panel.translate(face.x, base + site.height / 2, face.z);
      const walls = facades.get(windows) ?? [];
      walls.push(finish(panel));
      facades.set(windows, walls);

      // Signage goes on the faces a driver can actually read: a neon strip in a
      // courtyard nobody drives past is cost with no image behind it.
      if (face.width < 8 || site.faceDistances[side]! > reach.signs) return;
      if (hash01(index * 9.7 + side * 2.3) < 1 - dressing.signs) return;
      for (let slot = 0; slot < 2; slot++) {
        const seed = index * 9.7 + side * 2.3 + slot * 31.4;
        if (slot === 1 && hash01(seed) < 1 - dressing.secondSign) continue;
        const color = new THREE.Color(SIGN_COLORS[Math.floor(hash01(seed * 4.4) * SIGN_COLORS.length)]!);
        const blade = hash01(seed * 6.6) > 0.5;
        const width = blade ? 1.3 : Math.min(face.width * 0.42, 7.2);
        const height = blade ? 5.6 : 1.4;
        const y = blade ? 4.6 : 3.4 + hash01(seed * 8.2) * 4.2;
        const across = (slot - 0.5) * face.width * 0.44 + (hash01(seed * 2.7) - 0.5) * 3;
        const place = (geometry: THREE.BufferGeometry, depth: number) => {
          geometry.rotateY(face.rotation);
          geometry.translate(face.x, base + y, face.z);
          geometry.translate(
            Math.cos(face.rotation) * across + Math.sin(face.rotation) * depth,
            0,
            -Math.sin(face.rotation) * across + Math.cos(face.rotation) * depth,
          );
          return finish(geometry);
        };
        signs.push(tint(place(new THREE.PlaneGeometry(width, height), 0.32), color));
        glows.push(tint(place(new THREE.PlaneGeometry(width + 4, height + 4), 0.5),
          color.clone().multiplyScalar(0.45)));
      }
    });

    // Shopfronts. The reference image's whole ground plane is lit by windows at
    // eye level, not by the lamps: without this row the street reads as a canyon
    // of dark slab with a few signs floating on it.
    faces.forEach((face, side) => {
      if (site.faceDistances[side]! > reach.shopfronts || face.width < 8) return;
      // Where the road climbs away from the block's base — the bridge crown is
      // 24 m up, and 27 of the district's 165 street-facing blocks sit under
      // some lift — there is no ground floor to light. Dressing one anyway put
      // a detached pool of glow in the air beside the upper roadway.
      // The pavement in front of this face, in the building's frame — and the
      // lift is read where that pavement actually is in the world, turned.
      const spillLocalX = face.x + Math.sin(face.rotation) * 6.5;
      const spillLocalZ = face.z + Math.cos(face.rotation) * 6.5;
      const spillWorld = toWorld(spillLocalX, spillLocalZ);
      const street = groundAt(spillWorld.x, spillWorld.z);
      if (Math.abs(street - base) > SHOPFRONT_MAX_LIFT) return;
      if (windows === "freight") {
        // A warehouse lights its docks, not its walls (design/LOOK.md): roller
        // doors along the street wall, a few open on a strip-lit inside, and
        // floodlights over them throwing white across the apron. White because
        // somebody private pays for it; the street's own light is sodium.
        const onFace = (geometry: THREE.BufferGeometry, across: number, depth: number, y: number) => {
          geometry.rotateY(face.rotation);
          geometry.translate(face.x + Math.cos(face.rotation) * across + Math.sin(face.rotation) * depth, base + y,
            face.z - Math.sin(face.rotation) * across + Math.cos(face.rotation) * depth);
          return finish(geometry);
        };
        const doors = Math.max(2, Math.round(face.width / 9));
        const doorWidth = Math.min(4.6, face.width / doors * 0.72);
        for (let door = 0; door < doors; door++) {
          const open = hash01(index * 13.1 + side * 5.3 + door * 19.7) >= 1 - dressing.shopfronts;
          const across = (door + 0.5) / doors * face.width - face.width / 2;
          signs.push(tint(onFace(new THREE.PlaneGeometry(doorWidth, 4.2), across, 0.22, 2.1), open ? DOCK_INSIDE : DOCK_SHUT));
        }
        const floods = Math.max(1, Math.round(face.width / 22));
        for (let flood = 0; flood < floods; flood++) {
          const across = (flood + 0.5) / floods * face.width - face.width / 2;
          signs.push(tint(onFace(new THREE.PlaneGeometry(1.3, 0.4), across, 0.4, 6.4), FLOOD));
          glows.push(tint(onFace(new THREE.PlaneGeometry(4.5, 2.6), across, 0.55, 6.4), FLOOD.clone().multiplyScalar(0.3)));
        }
        // The apron in front, lit on the ground the dock stands on.
        const apron = new THREE.PlaneGeometry(face.width * 1.1, 18);
        apron.rotateX(-Math.PI / 2);
        apron.rotateY(face.rotation);
        apron.translate(face.x + Math.sin(face.rotation) * 9, street + 0.06, face.z + Math.cos(face.rotation) * 9);
        finish(apron);
        apron.setAttribute("base", new THREE.Float32BufferAttribute(new Array(apron.getAttribute("position").count).fill(base), 1));
        spills.push(tint(apron, FLOOD.clone().multiplyScalar(0.3)));
        return;
      }
      // A block front stands in for a row of shops, so light it as a row: one
      // unbroken strip of glass reads as a lightbox, not as a street.
      const units = Math.max(3, Math.round(face.width / 6));
      const unitWidth = face.width / units;
      let warm = new THREE.Color("#ffd9a2");
      let lit = 0;
      for (let unit = 0; unit < units; unit++) {
        const seed = index * 11.3 + side * 3.7 + unit * 17.9;
        if (hash01(seed) < 1 - dressing.shopfronts) continue;
        lit++;
        warm = new THREE.Color(hash01(seed * 1.9) > 1 - dressing.coloured
          ? SIGN_COLORS[Math.floor(hash01(seed * 12.1) * SIGN_COLORS.length)]!
          : hash01(seed * 5.3) > 1 - dressing.warm ? "#ffd9a2" : "#e8f0ff");
        const glass = new THREE.PlaneGeometry(unitWidth * 0.82, 1.9);
        glass.rotateY(face.rotation);
        const across = (unit + 0.5) / units * face.width - face.width / 2;
        glass.translate(face.x, base + 1.8, face.z);
        glass.translate(Math.cos(face.rotation) * across + Math.sin(face.rotation) * 0.22, 0,
          -Math.sin(face.rotation) * across + Math.cos(face.rotation) * 0.22);
        signs.push(tint(finish(glass), warm.clone().multiplyScalar(0.34)));
      }
      // A row with every shop shut throws no light on the pavement.
      if (!lit) return;

      const bloom = new THREE.PlaneGeometry(face.width * 1.35, 9);
      bloom.rotateY(face.rotation);
      bloom.translate(face.x + Math.sin(face.rotation) * 0.4, base + 2.4,
        face.z + Math.cos(face.rotation) * 0.4);
      glows.push(tint(finish(bloom), warm.clone().multiplyScalar(0.16)));

      // And the spill onto the pavement in front of it, on the local surface
      // rather than at datum — within the lift checked above the two are within
      // a few metres, so the glow stays under the glass that casts it.
      const spill = new THREE.PlaneGeometry(face.width * 1.3, 12);
      spill.rotateX(-Math.PI / 2);
      spill.rotateY(face.rotation);
      spill.translate(spillLocalX, street + 0.06, spillLocalZ);
      finish(spill);
      // Whose spill this is, for the test that asks whether it stayed on its
      // own building's pavement. Nearest-building pairing gets it wrong where
      // the ground steps between two levels beside the loop.
      spill.setAttribute("base", new THREE.Float32BufferAttribute(new Array(spill.getAttribute("position").count).fill(base), 1));
      spills.push(tint(spill, warm.clone().multiplyScalar(0.11)));
    });

    const roof = new THREE.PlaneGeometry(site.width, site.depth);
    roof.rotateX(-Math.PI / 2);
    roof.translate(0, base + site.height, 0);
    roofs.push(finish(roof));
  });

  for (const [kind, walls] of facades) {
    const facadeMesh = mergedMesh(facadeMeshName(kind), walls, facadeMaterial(kind));
    if (facadeMesh) { facadeMesh.castShadow = true; facadeMesh.receiveShadow = true; scene.add(facadeMesh); }
  }
  const roofMesh = mergedMesh("district-roofs", roofs, roofMaterial);
  if (roofMesh) scene.add(roofMesh);
  const signMesh = mergedMesh("district-signage", signs,
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  if (signMesh) scene.add(signMesh);
  const glowMesh = mergedMesh("district-signage-glow", glows, new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false, map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  if (glowMesh) { glowMesh.renderOrder = 2; scene.add(glowMesh); }
  const spillMesh = mergedMesh("district-shop-spill", spills, new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false, map: glowTexture(), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  if (spillMesh) { spillMesh.renderOrder = 1; scene.add(spillMesh); }
}
