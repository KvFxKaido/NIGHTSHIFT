import * as THREE from "three";

/** A repeatable eight-metre tile: dry aggregate, subdued mottling and a few
 * sealed hairline cracks. World-space UVs keep every road/junction continuous. */
export function asphaltMaterial(color: number): THREE.MeshStandardMaterial {
  const pixels = new Uint8Array(512 * 512 * 4);
  let seed = 7183;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const lattice = Array.from({ length: 16 * 16 }, () => random());
  const noise = (x: number, y: number, scale: number) => {
    const gx = x / scale, gy = y / scale;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const u = smooth(gx - ix), v = smooth(gy - iy), period = 512 / scale;
    const at = (dx: number, dy: number) => lattice[((iy + dy) % period) * 16 + (ix + dx) % period]!;
    return (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) +
      (at(0, 1) * (1 - u) + at(1, 1) * u) * v - .5;
  };
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const mottling = 12 * noise(x, y, 128) + 8 * noise(x, y, 32);
    const value = 185 + mottling + (random() - .5) * 45;
    const i = (y * 512 + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  for (let crack = 0; crack < 3; crack++) {
    let x = 70 + random() * 300, y = 70 + random() * 230;
    for (let segment = 0; segment < 9; segment++) {
      const bx = x + (random() - .5) * 26, by = y + 7 + random() * 10;
      const steps = Math.ceil(Math.hypot(bx - x, by - y));
      for (let step = 0; step < steps; step++) {
        const px = Math.round(x + (bx - x) * step / steps), py = Math.round(y + (by - y) * step / steps);
        if (px < 0 || px >= 512 || py < 0 || py >= 512) continue;
        const i = (py * 512 + px) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i]! * .8;
      }
      x = bx; y = by;
    }
  }
  const map = new THREE.DataTexture(pixels, 512, 512);
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: .018,
    roughness: .96, metalness: 0 });
}
