import * as THREE from "three";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import { buildingsDrawn, CEL_INK, CEL_UNIFORMS, celMaterial } from "./cel.ts";

/**
 * The buildings drawn the way the cars are: the `cel-city` look, the default
 * since 2026-09-24 (Shawn); `?look=cel` draws the city undrawn to compare
 * (render/cel.ts). The thesis is that the cars read as drawn and the city as
 * blockout, and the cars' own two tools, bands and ink, are the cheapest way to
 * stitch them. Both are here.
 *
 * The bands: a facade's light cut into three flat levels, the traffic's way
 * (no stripe, no cyan rim; those are a named car's). The ink below found that a
 * line needs a fill to border, and an unlit wall at night has none: the bands
 * are the fill. The facades and roofs of `addNightBuildings` only, which is most
 * of the city; tower relief, fitted fronts, brick corners and the garage keep
 * their own materials for now.
 *
 * They get their own levels rather than the cars', measured in Alder Center
 * (2026-09-24) by banding to black, half and full albedo and reading which
 * faces landed where. Every wall there is lit above 0.1 of its albedo (the two
 * hemisphere lights, scene.ts and render/alder.ts, plus the moon), and 0.2
 * splits a block's two sides: faces turned from the moon fall under it. Above
 * 0.45 is what a headlight reaches, and on a wall its pool is a hard-edged
 * shape one band up.
 *
 * The levels lift the city's lit sides, deliberately. As shipped a wall facing
 * away from the moon renders at (1, 5, 12) of 255 against a sky of (9, 15, 24):
 * the whole frame lives in the bottom tenth of the range, so neither a band nor
 * a line has any value to work with, and the ink vanished. Banded to albedo
 * alone the walls went grey, because a wall at night is blue from the light and
 * not the paint, so the bands keep the light's hue (`keepHue` in render/cel.ts).
 *
 * Shade 0.25, lit 0.8 is Shawn's pick (2026-09-24) of three, the in-between: a
 * block's two sides split hard, and the shade side stays near where it was. One
 * shade wall, same frame: (2, 7, 17) against a sky of (8, 12, 21), still darker
 * than the sky, where shade 0.5 made it (5, 18, 35), lighter. So on a shade side
 * seen against the sky the ink is back to little contrast; it reads against a
 * lit side and against the haze.
 */
export const BUILDING_CEL_UNIFORMS: typeof CEL_UNIFORMS = {
  ...CEL_UNIFORMS,
  celBands: { value: new THREE.Vector3(0.25, 0.8, 1.4) },
  celThresholds: { value: new THREE.Vector2(0.2, 0.45) },
};

/** Band a building material under `?look=cel-city`; a no-op otherwise. */
export function drawnBuilding<T extends THREE.MeshStandardMaterial>(material: T): T {
  return buildingsDrawn() ? celMaterial(material, false, BUILDING_CEL_UNIFORMS, true) : material;
}

/**
 * The ink.
 *
 * The same technique as a car's outline, an inverted hull: each building's box
 * again, pushed out along its corner normals and drawn back faces only, so only
 * the part that peeks past the building's own silhouette shows. A car's hull is
 * its mesh welded; a building's is its footprint, because what is drawn for a
 * building (facades, fronts, tower relief) is open quads and pieces that do not
 * weld into a closed shape. The footprint is the shape the collider has too.
 *
 * It draws the outline and nothing inside it: a roof's front edge seen from
 * above is a crease between two faces of one box, not a silhouette, and gets no
 * line. The cars have the same limit, so the pen is at least the same pen.
 *
 * Its own material so its width can be tuned apart from the cars' while this is
 * being judged; it starts at the cars' width.
 *
 * What the first frames showed (2026-09-24): at night the black ink is
 * invisible up close, because a building there is already near black against a
 * dark sky; the silhouette has all the contrast it can have. Where it earns its
 * place is the haze. Fogged like the buildings, it fades exactly as they do and
 * adds nothing; fogged less, it keeps a block's edge after its fill has gone to
 * blue-grey, and the smear of mid-distance towers comes apart into shapes again.
 * `inkFog` is that dial: 1 fogs like the buildings, 0 never fogs.
 */
export const BUILDING_INK = CEL_INK.clone();
BUILDING_INK.name = "cel-building-ink";
BUILDING_INK.uniforms.inkFog = { value: 0.5 };
BUILDING_INK.fragmentShader = /* glsl */ `
  uniform vec3 inkColor;
  uniform float inkFog;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(inkColor, 1.0);
    #include <colorspace_fragment>
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float inkFogDepth = fogDensity * inkFog * vFogDepth;
        float fogFactor = 1.0 - exp(-inkFogDepth * inkFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar / max(inkFog, 1e-3), vFogDepth);
      #endif
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    #endif
  }`;

/** How far below its base the hull reaches, so a slope never shows a gap. */
const SINK = 1.5;

export function buildingInk(blocks: readonly BuildingBlock[]): THREE.Mesh {
  const positions = new Float32Array(blocks.length * 8 * 3);
  const normals = new Float32Array(blocks.length * 8 * 3);
  // The unit cube's eight corners, and its twelve triangles wound outward, so
  // BackSide draws the faces turned away from the camera.
  const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] as const;
  const faces = [
    [0, 3, 2], [0, 2, 1], // -z
    [4, 5, 6], [4, 6, 7], // +z
    [0, 4, 7], [0, 7, 3], // -x
    [1, 2, 6], [1, 6, 5], // +x
    [3, 7, 6], [3, 6, 2], // +y
    [0, 1, 5], [0, 5, 4], // -y
  ] as const;
  const index: number[] = [];
  const diagonal = 1 / Math.sqrt(3);
  blocks.forEach((block, b) => {
    // blockCorners' convention: local +x runs along (cos r, sin r).
    const r = block.rotation ?? 0, c = Math.cos(r), s = Math.sin(r);
    const base = (block.base ?? 0) - SINK, top = (block.base ?? 0) + block.height;
    corners.forEach(([sx, sy, sz], k) => {
      const lx = sx * block.width / 2, lz = sz * block.depth / 2;
      const i = (b * 8 + k) * 3;
      positions[i] = block.x + lx * c - lz * s;
      positions[i + 1] = sy < 0 ? base : top;
      positions[i + 2] = block.z + lx * s + lz * c;
      // The corner's normal is the three faces' sum, so pushing along it moves
      // every face out by the same amount and the hull stays a box.
      normals[i] = (sx * c - sz * s) * diagonal;
      normals[i + 1] = sy * diagonal;
      normals[i + 2] = (sx * s + sz * c) * diagonal;
    });
    for (const [p, q, t] of faces) index.push(b * 8 + p, b * 8 + q, b * 8 + t);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, BUILDING_INK);
  mesh.name = "alder-building-ink";
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}
