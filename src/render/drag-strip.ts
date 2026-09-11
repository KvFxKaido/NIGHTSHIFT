import * as THREE from "three";
import type { DragStrip } from "../sim/drag-rules.ts";
import type { RaceState } from "../sim/race.ts";

/** Closed Harbor drag: lane edges, a checked finish and a three-light start tree. */
export function addDragStrip(scene: THREE.Scene, strip: DragStrip, height: (x: number, z: number) => number) {
  const root = new THREE.Group();
  root.name = "harbor-drag-strip";
  root.position.set(strip.start.x, height(strip.start.x, strip.start.z) + .025, strip.start.z);
  root.rotation.y = Math.atan2(-strip.forward.x, -strip.forward.z);
  scene.add(root);
  const white = new THREE.MeshBasicMaterial({ color: 0xe9d9b1 });
  const black = new THREE.MeshBasicMaterial({ color: 0x16191c });
  const orange = new THREE.MeshStandardMaterial({ color: 0xef7734, roughness: .85 });
  const edge = strip.laneOffset * 2;
  for (const x of [-edge, 0, edge]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(.09, .025, strip.length), white);
    line.position.set(x, 0, -strip.length / 2);
    root.add(line);
  }
  for (let distance = 0; distance <= strip.length + 100; distance += 25) {
    for (const x of [-edge - 1, edge + 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.28, .7, 8), orange);
      cone.position.set(x, .35, -distance);
      root.add(cone);
    }
  }
  for (const distance of [0, strip.length]) {
    for (let i = 0; i < 24; i++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(.5, .03, .55), i % 2 ? black : white);
      tile.position.set(-edge + .25 + i * .5, .015, -distance);
      root.add(tile);
    }
  }
  const pole = new THREE.Mesh(new THREE.BoxGeometry(.16, 4, .16), black);
  pole.position.set(0, 2, -9);
  root.add(pole);
  const lamps = [0, 1, 2].map(i => {
    const material = new THREE.MeshBasicMaterial({ color: 0x332515 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8), material);
    lamp.position.set(0, 3.5 - i * .7, -9);
    root.add(lamp);
    return material;
  });
  return { update(race: RaceState) {
    lamps.forEach((lamp, i) => lamp.color.setHex(race.countdown === 0 ? 0x72ff91
      : race.countdown <= (3 - i) * 60 ? 0xffb347 : 0x332515));
  } };
}
