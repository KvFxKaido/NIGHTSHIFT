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
const TILE_ROWS = 6;
/** Metres per window, which is what sets how many tiles a facade repeats. */
const WINDOW_PITCH_X = 3.4;
const WINDOW_PITCH_Y = 3.6;

interface FacadeTextures { map: THREE.Texture | null; emissiveMap: THREE.Texture | null }
let facadeCache: FacadeTextures | null = null;

/**
 * One tile of a lit facade, painted twice: an albedo pass so the dark windows
 * read as glass in the moonlight, and an emissive pass carrying only the lit
 * ones so a room switches on without lifting the whole wall.
 */
function facadeTextures(): FacadeTextures {
  if (facadeCache) return facadeCache;
  const size = { width: 256, height: 384 };
  const base = offscreen(size.width, size.height);
  const glow = offscreen(size.width, size.height);
  if (base && glow) {
    base.fillStyle = "#2b333d";
    base.fillRect(0, 0, size.width, size.height);
    glow.fillStyle = "#000000";
    glow.fillRect(0, 0, size.width, size.height);
    const cellWidth = size.width / TILE_COLUMNS;
    const cellHeight = size.height / TILE_ROWS;
    for (let row = 0; row < TILE_ROWS; row++) {
      for (let column = 0; column < TILE_COLUMNS; column++) {
        const n = row * TILE_COLUMNS + column;
        const x = column * cellWidth + cellWidth * 0.2;
        const y = row * cellHeight + cellHeight * 0.18;
        const width = cellWidth * 0.6;
        const height = cellHeight * 0.5;
        base.fillStyle = "#10161e";
        base.fillRect(x, y, width, height);
        if (hash01(n * 3.3) < 0.46) continue;
        // Warm rooms outnumber the cold office floors, which is what stops a
        // block of flats from reading as a single strip-lit office tower.
        const lit = hash01(n * 7.7) > 0.34 ? "#ffcb87" : "#a8ccff";
        base.fillStyle = lit;
        base.fillRect(x, y, width, height);
        glow.fillStyle = lit;
        glow.fillRect(x, y, width, height);
      }
    }
  }
  facadeCache = { map: textureFrom(base), emissiveMap: textureFrom(glow) };
  return facadeCache;
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

/** A wall panel whose UVs repeat one window grid per `WINDOW_PITCH` metres. */
function facadePanel(width: number, height: number, phase: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const columns = Math.max(1, Math.round(width / WINDOW_PITCH_X)) / TILE_COLUMNS;
  const rows = Math.max(1, Math.round(height / WINDOW_PITCH_Y)) / TILE_ROWS;
  const uv = geometry.getAttribute("uv");
  const offset = Math.round(phase * TILE_COLUMNS) / TILE_COLUMNS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * columns + offset, uv.getY(i) * rows);
  return geometry;
}

const SIGN_COLORS = ["#ff2d6f", "#39f0c2", "#ffb03a", "#5ac8ff", "#c46bff", "#ff5f3c"] as const;

export interface BuildingSite extends RoadSolid {
  /** How far the nearest street is from each face centre, outward order +Z, -Z, +X, -X. */
  readonly faceDistances: readonly [number, number, number, number];
}

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
  groundAt: (x: number, z: number) => number = () => 0): void {
  const { map, emissiveMap } = facadeTextures();
  const facadeMaterial = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : 0x39434d, map, emissiveMap,
    emissive: emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 1.35, roughness: 0.82,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x232b33, roughness: 1 });
  const facades: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  // Kept apart from the signage glow so that "a spill lies on the pavement in
  // front of its own shopfront" is a claim a test can actually make.
  const spills: THREE.BufferGeometry[] = [];

  sites.forEach((site, index) => {
    // Everything on this building is measured from its base, which is on the
    // ground it stands on — not from datum, which on the hill is underground.
    const base = site.base ?? 0;
    const faces = [
      { rotation: 0, x: 0, z: site.depth / 2, width: site.width },
      { rotation: Math.PI, x: 0, z: -site.depth / 2, width: site.width },
      { rotation: Math.PI / 2, x: site.width / 2, z: 0, width: site.depth },
      { rotation: -Math.PI / 2, x: -site.width / 2, z: 0, width: site.depth },
    ];
    faces.forEach((face, side) => {
      const panel = facadePanel(face.width, site.height, hash01(index * 5.1 + side));
      panel.rotateY(face.rotation);
      panel.translate(site.x + face.x, base + site.height / 2, site.z + face.z);
      facades.push(panel);

      // Signage goes on the faces a driver can actually read: a neon strip in a
      // courtyard nobody drives past is cost with no image behind it.
      if (face.width < 8 || site.faceDistances[side]! > 56) return;
      if (hash01(index * 9.7 + side * 2.3) < 0.2) return;
      for (let slot = 0; slot < 2; slot++) {
        const seed = index * 9.7 + side * 2.3 + slot * 31.4;
        if (slot === 1 && hash01(seed) < 0.45) continue;
        const color = new THREE.Color(SIGN_COLORS[Math.floor(hash01(seed * 4.4) * SIGN_COLORS.length)]!);
        const blade = hash01(seed * 6.6) > 0.5;
        const width = blade ? 1.3 : Math.min(face.width * 0.42, 7.2);
        const height = blade ? 5.6 : 1.4;
        const y = blade ? 4.6 : 3.4 + hash01(seed * 8.2) * 4.2;
        const across = (slot - 0.5) * face.width * 0.44 + (hash01(seed * 2.7) - 0.5) * 3;
        const place = (geometry: THREE.BufferGeometry, depth: number) => {
          geometry.rotateY(face.rotation);
          geometry.translate(site.x + face.x, base + y, site.z + face.z);
          geometry.translate(
            Math.cos(face.rotation) * across + Math.sin(face.rotation) * depth,
            0,
            -Math.sin(face.rotation) * across + Math.cos(face.rotation) * depth,
          );
          return geometry;
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
      if (site.faceDistances[side]! > 40 || face.width < 8) return;
      // Where the road climbs away from the block's base — the bridge crown is
      // 24 m up, and 27 of the district's 165 street-facing blocks sit under
      // some lift — there is no ground floor to light. Dressing one anyway put
      // a detached pool of glow in the air beside the upper roadway.
      const spillX = site.x + face.x + Math.sin(face.rotation) * 6.5;
      const spillZ = site.z + face.z + Math.cos(face.rotation) * 6.5;
      const street = groundAt(spillX, spillZ);
      if (Math.abs(street - base) > SHOPFRONT_MAX_LIFT) return;
      // A block front stands in for a row of shops, so light it as a row: one
      // unbroken strip of glass reads as a lightbox, not as a street.
      const units = Math.max(3, Math.round(face.width / 6));
      const unitWidth = face.width / units;
      let warm = new THREE.Color("#ffd9a2");
      for (let unit = 0; unit < units; unit++) {
        const seed = index * 11.3 + side * 3.7 + unit * 17.9;
        if (hash01(seed) < 0.18) continue;
        warm = new THREE.Color(hash01(seed * 1.9) > 0.8
          ? SIGN_COLORS[Math.floor(hash01(seed * 12.1) * SIGN_COLORS.length)]!
          : hash01(seed * 5.3) > 0.5 ? "#ffd9a2" : "#e8f0ff");
        const glass = new THREE.PlaneGeometry(unitWidth * 0.82, 1.9);
        glass.rotateY(face.rotation);
        const across = (unit + 0.5) / units * face.width - face.width / 2;
        glass.translate(site.x + face.x, base + 1.8, site.z + face.z);
        glass.translate(Math.cos(face.rotation) * across + Math.sin(face.rotation) * 0.22, 0,
          -Math.sin(face.rotation) * across + Math.cos(face.rotation) * 0.22);
        signs.push(tint(glass, warm.clone().multiplyScalar(0.34)));
      }

      const bloom = new THREE.PlaneGeometry(face.width * 1.35, 9);
      bloom.rotateY(face.rotation);
      bloom.translate(site.x + face.x + Math.sin(face.rotation) * 0.4, base + 2.4,
        site.z + face.z + Math.cos(face.rotation) * 0.4);
      glows.push(tint(bloom, warm.clone().multiplyScalar(0.16)));

      // And the spill onto the pavement in front of it, on the local surface
      // rather than at datum — within the lift checked above the two are within
      // a few metres, so the glow stays under the glass that casts it.
      const spill = new THREE.PlaneGeometry(face.width * 1.3, 12);
      spill.rotateX(-Math.PI / 2);
      spill.rotateY(face.rotation);
      spill.translate(spillX, street + 0.06, spillZ);
      // Whose spill this is, for the test that asks whether it stayed on its
      // own building's pavement. Nearest-building pairing gets it wrong where
      // the ground steps between two levels beside the loop.
      spill.setAttribute("base", new THREE.Float32BufferAttribute(new Array(spill.getAttribute("position").count).fill(base), 1));
      spills.push(tint(spill, warm.clone().multiplyScalar(0.11)));
    });

    const roof = new THREE.PlaneGeometry(site.width, site.depth);
    roof.rotateX(-Math.PI / 2);
    roof.translate(site.x, base + site.height, site.z);
    roofs.push(roof);
  });

  const facadeMesh = mergedMesh("district-facades", facades, facadeMaterial);
  if (facadeMesh) { facadeMesh.castShadow = true; facadeMesh.receiveShadow = true; scene.add(facadeMesh); }
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
