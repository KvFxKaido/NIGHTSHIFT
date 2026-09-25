import * as THREE from "three";
import { addNightSky, ALDER_SKY } from "./sky.ts";
import { STADIUM, STADIUM_FLOOR, STADIUM_GATES, STADIUM_MARKER } from "../sim/stadium.ts";
import type { DistrictLighting } from "./scene.ts";

/**
 * The stadium venue's world, drawn (src/sim/stadium.ts): the night, the bowl's dirt floor, a dark apron beyond the
 * shell so nothing is void over the rim, the two gate markers. The shell itself and Sable's yard
 * are added by main.ts as they are for the city (`addWharfArena`, `addDriftYard` with its venue floor).
 */
export function addStadium(scene: THREE.Scene, lighting: DistrictLighting): void {
  const night = lighting === "night";
  if (night) addNightSky(scene, ALDER_SKY);
  if (night) scene.add(new THREE.HemisphereLight(0x9abbd0, 0x39444c, 1.0));

  // Bare ground beyond the shell, a little under the floor, in case the camera ever looks over a wall.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(3200, 2000), new THREE.MeshStandardMaterial({ color: 0x1a1d1c, roughness: 1 }));
  outside.name = "stadium-outside"; outside.rotation.x = -Math.PI / 2;
  outside.position.set(-600, STADIUM.base - .3, 1000);
  scene.add(outside);

  // The floor: dirt wall to wall, the shape of the bowl at car height. Sable's apron is laid over it as asphalt.
  // A shape is drawn in (x, y) and laid flat by -90 degrees about x, which sends its y to -z: so it is given -z.
  const shape = new THREE.Shape(STADIUM_FLOOR.map(p => new THREE.Vector2(p.x, -p.z)));
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1 }));
  floor.name = "stadium-floor"; floor.rotation.x = -Math.PI / 2; floor.position.y = STADIUM.base + .01;
  floor.receiveShadow = true;
  scene.add(floor);

  addStadiumMarkers(scene, "venue");
}

/**
 * A gate's marker, where a car stops to cross to the other side: an amber ring on the ground with the gate's name
 * beside it. Drawn on the venue's floor inside each restored wall, and in the city at each gate.
 */
export function addStadiumMarkers(scene: THREE.Scene, side: "city" | "venue"): void {
  const group = new THREE.Group(); group.name = `stadium-markers-${side}`; scene.add(group);
  for (const gate of STADIUM_GATES) {
    const { x, z } = gate[side].marker;
    const ring = new THREE.Mesh(new THREE.RingGeometry(STADIUM_MARKER.radius - .6, STADIUM_MARKER.radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xffc268, transparent: true, opacity: .8, depthWrite: false }));
    ring.name = `stadium-gate-${gate.id}`; ring.rotation.x = -Math.PI / 2; ring.position.set(x, STADIUM.base + .09, z);
    group.add(ring);
    if (typeof document === "undefined") continue;   // Headless: the ring still builds.
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#101f2a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffc268"; ctx.font = "bold 52px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(side === "city" ? STADIUM.name.toUpperCase() : gate.name.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    sign.name = `stadium-gate-sign-${gate.id}`;
    // Flat on the ground inside the ring, where the car stops on it.
    sign.rotation.x = -Math.PI / 2;
    sign.position.set(x, STADIUM.base + .1, z);
    group.add(sign);
  }
}
