import * as THREE from "three";

/** Drawn needle sprays, not photographic foliage. Opaque cutouts keep sorting
 * and depth predictable when thousands of overlapping boughs fill a grove. */
export function firNeedleTexture(): THREE.DataTexture {
  const size = 256, atlasWidth = size * 2, pixels = new Uint8Array(atlasWidth * size * 4);
  let seed = 481;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  function stroke(ax: number, ay: number, bx: number, by: number, width: number, value: number): void {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - width)); y <= Math.min(size - 1, Math.ceil(Math.max(ay, by) + width)); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - width)); x <= Math.min(size - 1, Math.ceil(Math.max(ax, bx) + width)); x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(.001, length2)));
        const distance = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        const alpha = Math.max(0, Math.min(1, width + .5 - distance)) * 255;
        const i = (y * atlasWidth + x) * 4;
        if (alpha <= pixels[i + 3]!) continue;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
        pixels[i + 3] = alpha;
      }
    }
  }
  // Several feathered twigs fan out from a central stem. In the mesh, UV-up
  // points outward along the limb, so these forks form the bough's broken edge.
  function twig(ax: number, ay: number, bx: number, by: number): void {
    stroke(ax, ay, bx, by, 2.6, 220);
    const length = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / length, dy = (by - ay) / length;
    const count = Math.ceil(length / 5);
    for (let needle = 0; needle < count; needle++) {
      const t = needle / count, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const spread = (12 + random() * 8) * (1 - t * .55);
      for (const side of [-1, 1]) {
        const value = [225, 240, 255][Math.floor(random() * 3)]!;
        stroke(x, y, x + dx * 10 - dy * side * spread, y + dy * 10 + dx * side * spread, 2.5, value);
      }
    }
  }
  twig(128, 16, 124, 235);
  for (let fork = 0; fork < 4; fork++) for (const side of [-1, 1]) {
    const y = 30 + fork * 42, span = 89 - fork * 14;
    twig(128, y, 128 + side * span, y + 69 + random() * 13);
  }
  // Wood shares the crown draw. Give it a padded, opaque half of the atlas so
  // mip filtering cannot erase distant branches by sampling the leaf cutout.
  for (let y = 0; y < size; y++) for (let x = size; x < atlasWidth; x++) pixels.set([255, 255, 255, 255], (y * atlasWidth + x) * 4);
  const map = new THREE.DataTexture(pixels, atlasWidth, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
  map.name = "drawn-fir-needles";
  return map;
}
