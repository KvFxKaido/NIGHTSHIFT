import * as THREE from "three";
import { firNeedleTexture } from "./fir-needles.ts";

/** Coastal fir: exposed branch forks and overlapping, broken needle fans.
 * Crown coordinates fit the existing radius/height envelope; the trunk keeps
 * the collision proxy's centred, unit-sized transform. No planting changes. */
export function firGeometry(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(.2, .49, 1, 9, 5);
  const trunkPosition = trunk.getAttribute("position");
  const bark: number[] = [];
  const barkDark = new THREE.Color(0x413b35), barkLight = new THREE.Color(0x89705a);
  for (let i = 0; i < trunkPosition.count; i++) {
    const x = trunkPosition.getX(i), y = trunkPosition.getY(i), z = trunkPosition.getZ(i);
    const angle = Math.atan2(z, x), height = y + .5;
    trunkPosition.setX(i, x + .065 * height * Math.sin(height * 4));
    trunkPosition.setZ(i, z + .045 * height * height);
    const stripe = .5 + .5 * Math.sin(angle * 7 + .6);
    const color = barkDark.clone().lerp(barkLight, .15 + stripe * .65);
    bark.push(color.r, color.g, color.b);
  }
  trunk.setAttribute("color", new THREE.Float32BufferAttribute(bark, 3));
  trunk.computeVertexNormals();

  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  const green = [0x486151, 0x60795b, 0x799066].map(c => new THREE.Color(c));
  const wood = new THREE.Color(0x75614d);
  let seed = 1673;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color): void {
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); uvs.push(.75, .5); }
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
    const axis = b.clone().sub(a).normalize();
    const right = new THREE.Vector3(0, 1, 0).cross(axis);
    if (right.lengthSq() < .001) right.set(1, 0, 0);
    right.normalize();
    const up = axis.clone().cross(right).normalize();
    const ring = (at: THREE.Vector3, r: number, angle: number) => at.clone()
      .addScaledVector(right, Math.cos(angle) * r).addScaledVector(up, Math.sin(angle) * r);
    for (let face = 0; face < 5; face++) {
      const angle = face * Math.PI * 2 / 5, next = (face + 1) * Math.PI * 2 / 5;
      const p = ring(a, radius, angle), q = ring(a, radius, next);
      const r = ring(b, radius * .35, angle), s = ring(b, radius * .35, next);
      triangle(p, q, r, wood); triangle(q, s, r, wood);
    }
  }
  function bough(y: number, reach: number, angle: number, shade: number): void {
    const crownTaper = Math.min(1, Math.max(0, (.998 - y) / .059));
    // Three forked sprays follow each limb. Crossed, tilted cutouts carry
    // needles across the branch and down its tip instead of hanging upright.
    for (let spray = 0; spray < 3; spray++) {
      const turn = angle + (spray - 1) * .36, c = Math.cos(turn), s = Math.sin(turn);
      const start = spray === 1 ? .12 : .27, end = spray === 1 ? .98 : .86;
      const width = reach * (spray === 1 ? .22 : .28);
      for (let layer = 0; layer < 2; layer++) {
        function vertex(u: number, v: number): void {
          const radius = reach * (start + (end - start) * v);
          const side = u * width * (layer === 0 ? 1 : .65);
          const height = y + crownTaper * (.014 + u * (layer === 0 ? .013 : .045)) - v * (.062 + reach * .023);
          positions.push(c * radius - s * side, height, s * radius + c * side);
          const color = green[layer === 0 ? shade : 0]!;
          colors.push(color.r, color.g, color.b);
          uvs.push(.25 + u * .235, .03 + v * .94);
        }
        vertex(-1, 0); vertex(1, 0); vertex(-1, 1);
        vertex(1, 0); vertex(1, 1); vertex(-1, 1);
      }
    }
  }
  // A small faceted inner crown keeps the trunk occluded between sprays and
  // preserves the tree's mass when fine needles shrink below a screen pixel.
  const rings: THREE.Vector3[][] = [];
  for (let row = 0; row <= 10; row++) {
    const t = row / 10, radius = .32 * (1 - t) ** .75;
    rings.push(Array.from({ length: 8 }, (_, face) => {
      const angle = face * Math.PI / 4 + row * .21;
      const reach = radius * (.94 + random() * .06);
      return new THREE.Vector3(Math.cos(angle) * reach, .20 + t * .788, Math.sin(angle) * reach);
    }));
  }
  for (let row = 0; row < 10; row++) for (let face = 0; face < 8; face++) {
    const next = (face + 1) % 8, bottom = rings[row]!, top = rings[row + 1]!;
    triangle(bottom[face]!, top[face]!, bottom[next]!, green[0]!);
    triangle(bottom[next]!, top[face]!, top[next]!, green[0]!);
  }
  branch(new THREE.Vector3(0, .48, 0), new THREE.Vector3(.012, .995, -.008), .028);
  for (let tier = 0; tier < 11; tier++) {
    const height = .218 + tier * .075, reach = .97 * (1 - tier / 11) ** .75;
    const count = 8 - Math.floor(tier / 3);
    const turn = tier * 2.399;
    for (let arm = 0; arm < count; arm++) {
      const angle = turn + arm * Math.PI * 2 / count + (random() - .5) * .22;
      const radius = reach * (.83 + random() * .17), c = Math.cos(angle), s = Math.sin(angle);
      const y = height + (arm / count - .5) * .065 + (random() - .5) * .013;
      const fork = new THREE.Vector3(c * radius * .43, y + .003, s * radius * .43);
      const tip = new THREE.Vector3(c * radius * .77, y - radius * .025, s * radius * .77);
      // Higher limbs disappear into the crown; only the exposed lower forks
      // need separate wood geometry among thousands of instanced city trees.
      if (tier < 2) branch(new THREE.Vector3(0, y, 0), tip, .009);
      bough(y, radius, angle, 1 + (arm + tier) % 2);
      if (tier < 2) {
        const split = angle + (arm % 2 ? -.52 : .52);
        const side = new THREE.Vector3(c * radius * .38 + Math.cos(split) * radius * .37, y - .017,
          s * radius * .38 + Math.sin(split) * radius * .37);
        branch(fork, side, .007);
      }
    }
  }
  // A short upright shoot closes the silhouette above the youngest limbs.
  for (let card = 0; card < 3; card++) {
    const angle = card * Math.PI / 3, c = Math.cos(angle) * .07, s = Math.sin(angle) * .07;
    const a = new THREE.Vector3(-c, .932, -s), b = new THREE.Vector3(c, .932, s);
    const d = new THREE.Vector3(-c, .998, -s), e = new THREE.Vector3(c, .998, s);
    const start = uvs.length;
    triangle(a, b, d, green[1]!); triangle(b, e, d, green[1]!);
    uvs.splice(start, 12, .015, .03, .485, .03, .015, .97, .485, .03, .485, .97, .015, .97);
  }
  const crown = new THREE.BufferGeometry();
  crown.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  crown.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  crown.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  crown.computeVertexNormals();
  for (const geometry of [trunk, crown]) { geometry.computeBoundingBox(); geometry.computeBoundingSphere(); }
  return { trunk, crown };
}

/** Three broad light bands, without the race cars' highlight stripe or cyan rim. */
export function firMaterials(): { trunk: THREE.MeshToonMaterial; crown: THREE.MeshToonMaterial } {
  const gradient = new THREE.DataTexture(new Uint8Array([65, 145, 235]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const trunk = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const crown = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient,
    map: firNeedleTexture(), alphaTest: .35, side: THREE.DoubleSide, alphaToCoverage: true });
  trunk.name = "fir-bark"; crown.name = "fir-needles";
  return { trunk, crown };
}
