import * as THREE from "three";

/**
 * The night sky (design/LOOK.md, "The sky is not black"): near-black overhead,
 * lifting to a faint cold haze at the horizon, where the city's light is held
 * in the air. Before it the sky was flat `#05080f`, so roofs, evergreens, the
 * Broadcast Tower and the drawn cars' ink had nothing to stand against.
 *
 * The fog is the haze's colour (scene.ts), so what is far off fades into the
 * haze rather than into black, and the nearer city stands dark in front of it.
 */

/** Overhead: the colour the whole sky used to be. */
export const NIGHT_ZENITH = 0x05080f;
/** The horizon, and the fog. Cold, and only just lifted: it is a backdrop. */
export const NIGHT_HAZE = 0x1b2638;

/** The Port Alder dome's name, by which the view finds it (scene.ts). */
export const ALDER_SKY = "alder-sky";

/** Inside the camera's 650 m far plane, following the car (scene.ts). */
const RADIUS = 560;

/** A dome of vertex colour, drawn first and behind everything, fog-free. */
export function addNightSky(scene: THREE.Scene, name: string): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(RADIUS, 32, 20);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const zenith = new THREE.Color(NIGHT_ZENITH), haze = new THREE.Color(NIGHT_HAZE), color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // Elevation 0 at the horizon, 1 overhead; below the horizon stays haze.
    const elevation = Math.max(0, position.getY(i) / RADIUS);
    // The haze is a band, most of it within about 15 degrees of the skyline.
    color.copy(haze).lerp(zenith, Math.min(1, Math.pow(elevation * 3.2, 0.7)));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false,
  }));
  sky.name = name;
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}
