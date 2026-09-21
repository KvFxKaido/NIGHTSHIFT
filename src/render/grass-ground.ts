import * as THREE from "three";

/** A quiet mat beneath the blades: fine dry fibres over irregular green/brown patches. */
export function grassGroundMaterial(color: number): THREE.MeshStandardMaterial {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  let seed = 8821;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const lattice = Array.from({ length: 64 }, random);
  const noise = (x: number, y: number) => {
    const gx = x / 32, gy = y / 32, ix = Math.floor(gx), iy = Math.floor(gy);
    const ease = (v: number) => v * v * (3 - 2 * v);
    const u = ease(gx - ix), v = ease(gy - iy);
    const at = (dx: number, dy: number) => lattice[((iy + dy) % 8) * 8 + (ix + dx) % 8]!;
    return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const patch = noise(x, y), grain = (random() - .5) * 48;
    const i = (y * size + x) * 4;
    pixels[i] = 148 + patch * 66 + grain;
    pixels[i + 1] = 157 + patch * 57 + grain;
    pixels[i + 2] = 131 + patch * 56 + grain;
    pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, size, size);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: .035, roughness: 1, metalness: 0 });
}
