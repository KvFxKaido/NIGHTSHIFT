import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { CarView } from "./car.ts";

/**
 * The cars are drawn: `cel`, the default since 2026-09-18. At night the
 * undrawn cars read as dark shapes with two tail lights; banded and inked they
 * read as cars again. Two comparisons stay reachable and are never saved:
 * `?look=plain` draws the cars as they were, and `?look=fx` is Driving Rogue's
 * and NFS Unbound's recipe, the undrawn cars with the drawn smoke on top.
 *
 * Unbound's idea, adapted. Its cars are rendered real and the drawn layer
 * sits on and around them. Ours are faceted Blender bodies that read as budget
 * realism under PBR, so here the cars are what gets drawn: their lighting is cut
 * into three flat bands of their own colour, with a hard highlight stripe on the
 * paint, the race's cyan on the rim (the rival portraits' rim light,
 * design/CHARACTERS.md) and an ink outline. Traffic and the city are untouched.
 * Tyre smoke is the one drawn effect.
 *
 * The bands are a patch on the cars' own standard materials, not a swap, so
 * paint, wheel finish and livery edits keep working on the same objects. The
 * drawn tyre smoke is its own module, render/smoke.ts.
 *
 * `?look=cel-traffic` is a third comparison (2026-09-20), undecided and never
 * saved: `cel`, with traffic banded and inked as well. Traffic gets the bands and
 * the ink and neither accent. The cyan rim is the race's colour and the stripe is
 * a named car's paint; traffic keeps its muted paint and its lamps still do the
 * announcing (render/traffic.ts). What it is there to settle is whether a drawn
 * hazard reads better at night or only stops the rival standing out.
 *
 * What one staged frame showed, against the guess that the bands' floor would
 * make traffic more legible: a van in the player's headlights goes the other way.
 * Undrawn, the headlight spot blows its muted paint out to pale salmon, which is
 * an accidental hazard flare. Drawn, the top band caps it at 78% of albedo and
 * it is a flat dark maroon, with its brake lamps standing out harder against it.
 * Out of the headlights the two looks barely differ. If the look is wanted and
 * the flare is missed, traffic's band levels are the knob, and they are uniforms
 * shared with the cars today. Cost, same spot and tick: 5 draw calls and 7,392
 * triangles, 1.7% of the frame.
 */
export type Look = "fx" | "cel" | "cel-traffic";
export const LOOKS: readonly Look[] = ["fx", "cel", "cel-traffic"];
let look: Look | null = null;
let celOn = false;
export function setLook(value: Look | null): void { look = value; celOn = value === "cel" || value === "cel-traffic"; }
/** Whether any drawn effects are on. */
export function drawnEffects(): boolean { return look !== null; }
/** Whether traffic is drawn too: only under `?look=cel-traffic`. */
export function trafficDrawn(): boolean { return look === "cel-traffic"; }

/** Shared by every patched material, so a value changed here changes every car. */
export const CEL_UNIFORMS = {
  /** Albedo multipliers for the dark, mid and lit bands. Night: nothing is lit to full. */
  celBands: { value: new THREE.Vector3(0.16, 0.38, 0.78) },
  /** Lighting relative to albedo at which a surface moves up a band. */
  celThresholds: { value: new THREE.Vector2(0.12, 0.3) },
  /** Specular luma above which the hard highlight stripe shows. Set in the
   *  garage, whose spots are the strongest light a car meets: lower, and the
   *  whole roof and bonnet went pale. */
  celSpecular: { value: 1.2 },
  celStripe: { value: 0.3 },
  celRim: { value: new THREE.Color(0x59d8ff) },
  /** 1 - N.V past which a surface is rim. */
  celRimEdge: { value: 0.78 },
  celRimStrength: { value: 0.35 },
};

const CEL_PARS = /* glsl */ `
uniform vec3 celBands;
uniform vec2 celThresholds;
uniform float celSpecular;
uniform float celStripe;
uniform vec3 celRim;
uniform float celRimEdge;
uniform float celRimStrength;
`;

// In place of the standard shader's sum of light. `material.diffuseColor` is the
// albedo after metalness, so dividing by it measures the light itself: metallic
// paint, which went dark with no environment to reflect, bands like any other.
const CEL_LIGHT = /* glsl */ `
  const vec3 celLuma = vec3(0.2126, 0.7152, 0.0722);
  float celLight = dot(totalDiffuse, celLuma) / max(dot(material.diffuseColor, celLuma), 1e-4);
  float celBand = celLight < celThresholds.x ? celBands.x : (celLight < celThresholds.y ? celBands.y : celBands.z);
  vec3 celColor = diffuseColor.rgb * celBand;
#ifndef CEL_BANDS_ONLY
  celColor += step(celSpecular, dot(totalSpecular, celLuma)) * celStripe;
  // The rim is an edge on the flanks. A roof seen from the chase camera is at a
  // grazing angle too, and rimmed whole it read as pale blue paint; a face
  // turned up towards the camera is not a flank.
  float celFacing = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
  celColor += step(celRimEdge, celFacing) * (1.0 - step(0.55, normal.y)) * celRim * celRimStrength;
#endif
  vec3 outgoingLight = celColor + totalEmissiveRadiance;
`;
const SUM_OF_LIGHT = "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;";

/**
 * Band a material when the cars are drawn; a no-op otherwise. `accents` are the
 * highlight stripe and the cyan rim, a named car's; traffic is banded without.
 */
export function celMaterial<T extends THREE.MeshStandardMaterial>(material: T, accents = true): T {
  if (!celOn || material.userData.cel) return material;
  // The shared uniforms, reachable from any car mesh for tuning in the browser.
  material.userData.cel = CEL_UNIFORMS;
  material.onBeforeCompile = shader => {
    if (!shader.fragmentShader.includes(SUM_OF_LIGHT)) throw new Error("The standard shader no longer sums light the way the cel patch expects");
    Object.assign(shader.uniforms, CEL_UNIFORMS);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${accents ? "" : "#define CEL_BANDS_ONLY\n"}${CEL_PARS}`)
      .replace(SUM_OF_LIGHT, CEL_LIGHT);
  };
  material.customProgramCacheKey = () => accents ? "cel" : "cel-bands";
  material.needsUpdate = true;
  return material;
}

/** The ink: each car mesh again, welded so its normals are smooth, pushed out
 *  along them and drawn back faces only. The push grows with depth, so the
 *  line holds about the same width on screen near and far. An instanced mesh
 *  is placed by its instance first, or every outline would be drawn at the origin. */
const INK = new THREE.ShaderMaterial({
  name: "cel-ink",
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    inkColor: { value: new THREE.Color(0x06080d) }, inkWidth: { value: 0.0022 },
  }]),
  vertexShader: /* glsl */ `
    uniform float inkWidth;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec4 inkPosition = vec4(position, 1.0);
      vec3 inkNormal = normal;
      #ifdef USE_INSTANCING
        inkPosition = instanceMatrix * inkPosition;
        inkNormal = mat3(instanceMatrix) * inkNormal;
      #endif
      vec4 mvPosition = modelViewMatrix * inkPosition;
      mvPosition.xyz += normalize(normalMatrix * inkNormal) * inkWidth * max(-mvPosition.z, 1.5);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 inkColor;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(inkColor, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
  side: THREE.BackSide,
  fog: true,
});
export const CEL_INK = INK;

function inkFor(mesh: THREE.Mesh): THREE.Mesh {
  // The optimized GLBs pack positions (interleaved, quantized), which
  // mergeVertices cannot write back into; unpack to plain floats first.
  const packed = mesh.geometry.getAttribute("position");
  const positions = new Float32Array(packed.count * 3);
  for (let i = 0; i < packed.count; i++) positions.set([packed.getX(i), packed.getY(i), packed.getZ(i)], i * 3);
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const index = mesh.geometry.index;
  if (index) source.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: index.count }, (_, i) => index.getX(i)), 1));
  const welded = mergeVertices(source, 1e-4);
  welded.computeVertexNormals();
  const ink = new THREE.Mesh(welded, INK);
  ink.name = `${mesh.name}-ink`;
  ink.castShadow = ink.receiveShadow = false;
  return ink;
}

/** Draw one loaded car in the cel look: every material banded, every mesh inked. */
export function celCar(parts: CarView): CarView {
  if (!celOn) return parts;
  const meshes: THREE.Mesh[] = [];
  parts.carVisual.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  for (const mesh of meshes) {
    if (mesh.material instanceof THREE.MeshStandardMaterial) celMaterial(mesh.material);
    mesh.add(inkFor(mesh));
  }
  return parts;
}
