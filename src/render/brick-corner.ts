import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import { marketBuilding } from "../sim/market-block.ts";

/** The original three-storey corner anchors the shared architectural kit. */
export const BRICK_CORNER_PLOT = "plot-799.000--945.000";
export const isBrickCorner = (block: BuildingBlock): boolean => marketBuilding(block) !== undefined;

/** Quiet, seamless concrete grain: broad cel shading carries the shape. */
function concreteTexture(): THREE.DataTexture {
  const width = 256, height = 128, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const grain = ((Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0) % 5 - 2;
    const shade = Math.round(grain + 2 * Math.sin(x / width * Math.PI * 4) * Math.cos(y / height * Math.PI * 2));
    const color = [106 + shade, 113 + shade, 118 + shade];
    const at = (y * width + x) * 4;
    pixels.set([...color, 255], at);
  }
  const map = new THREE.DataTexture(pixels, width, height);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}

const LETTERS: Record<string, string[]> = {
  A: ["010","101","111","101","101"], L: ["100","100","100","100","111"],
  D: ["110","101","101","101","110"], E: ["111","100","110","100","111"],
  R: ["110","101","110","101","101"], M: ["101","111","111","101","101"],
  K: ["101","101","110","101","101"], T: ["111","010","010","010","010"],
  O: ["111","101","101","101","111"], P: ["110","101","110","100","100"],
  N: ["101","111","111","111","101"],
  I: ["111","010","010","010","111"], S: ["111","100","111","001","111"],
};

const sceneTextures = new WeakMap<THREE.Scene, { brick: THREE.Texture; gradient: THREE.DataTexture }>();
function kitTextures(scene: THREE.Scene) {
  let textures = sceneTextures.get(scene);
  if (!textures) {
    const gradient = new THREE.DataTexture(new Uint8Array([80, 165, 245]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false; gradient.needsUpdate = true;
    textures = { brick: concreteTexture(), gradient }; sceneTextures.set(scene, textures);
  }
  return textures;
}

/** Architectural depth stays within the existing solid. Repeated details merge
 * by material, so windows do not each become a draw call or a dynamic light. */
export function addBrickCorner(scene: THREE.Scene, block: BuildingBlock): THREE.Group {
  const site = marketBuilding(block);
  if (!site) throw new Error("Brick architecture requires a matching Market block plot");
  const { gradient, brick: brickMap } = kitTextures(scene);
  const toon = (name: string, color: number, map?: THREE.Texture) => {
    const material = new THREE.MeshToonMaterial({ color, gradientMap: gradient, map: map ?? null });
    material.name = name; return material;
  };
  const brick = toon("corner-brick", site.brick, brickMap);
  const stone = toon("corner-limestone", 0x929ba1);
  const wood = toon("corner-shopfront", site.wood);
  const metal = toon("corner-metal", 0x394148);
  const roof = toon("corner-roof", 0x34363a);
  const recess = toon("corner-recess", 0x1d252b);
  const glass = toon("corner-glass", 0x344353);
  const glow = new THREE.MeshBasicMaterial({ color: 0xa99165, toneMapped: false }); glow.name = "corner-lit-rooms";
  const lettering = new THREE.MeshBasicMaterial({ color: 0xc7b896, toneMapped: false }); lettering.name = "corner-lettering";
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const root = new THREE.Group(); root.name = "alder-brick-corner";
  root.position.set(block.x, block.base, block.z); root.rotation.y = -block.rotation;
  root.userData.plotId = site.plotId;
  root.userData.business = site.name;
  function record(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const list = batches.get(material) ?? []; list.push(geometry); batches.set(material, list);
  }
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number,
    turn = 0, faceX = 0, faceZ = 0): void {
    const shape = new THREE.BoxGeometry(w, h, d);
    shape.translate(x, y, z);
    if (material === brick) {
      const p = shape.getAttribute("position"), n = shape.getAttribute("normal"), uv = shape.getAttribute("uv");
      for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getZ(i)) > .5 ? p.getX(i) : p.getZ(i)) / 2.24, p.getY(i) / .68);
    }
    shape.rotateY(turn); shape.translate(faceX, 0, faceZ); record(material, shape);
  }
  const faces = [
    { turn: 0, x: 0, z: block.depth / 2, width: block.width, shop: true },
    { turn: Math.PI, x: 0, z: -block.depth / 2, width: block.width, shop: false },
    { turn: Math.PI / 2, x: block.width / 2, z: 0, width: block.depth, shop: true },
    { turn: -Math.PI / 2, x: -block.width / 2, z: 0, width: block.depth, shop: false },
  ];
  const groundTop = 3.45, crownHeight = site.crown ? .65 : 0, roofY = block.height - .85 - crownHeight;
  const floors = Math.max(2, Math.round((roofY - groundTop - .5) / 2.7));
  const floorHeight = (roofY - .34 - groundTop - .16) / floors;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const cx = x * (block.width / 2 - .25), cz = z * (block.depth / 2 - .25);
    const bottom = groundTop + .11, top = roofY - .33;
    box(brick, cx, (bottom + top) / 2, cz, .5, top - bottom, .5);
    box(stone, cx, (.44 + groundTop - .11) / 2, cz, .5, groundTop - .11 - .44, .5);
  }
  faces.forEach((face, side) => {
    const fbox = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) =>
      box(m, x, y, z, w, h, d, face.turn, face.x, face.z);
    const width = face.width - .5, count = Math.floor(width / site.bayWidth), bay = width / count;
    fbox(recess, 0, roofY / 2, -.49, face.width, roofY, .02);
    // Butt the side bands against the front/back bands instead of overlapping
    // coplanar corner faces, which flicker when the car moves past them.
    const band = (m: THREE.Material, y: number, inset: number, h: number, d: number) =>
      fbox(m, 0, y, -inset, face.width - (side >= 2 ? 2 * (inset + d / 2) : 0), h, d);
    // Cornice and string courses are stepped inward; nothing sticks into the street.
    band(stone, .22, .22, .44, .44);
    band(stone, groundTop, .19, .22, .38);
    band(stone, roofY - .25, .22, .16, .44);
    band(stone, roofY - .08, .15, .18, .3);
    band(brick, block.height - crownHeight - .43, .27, .66, .36);
    band(stone, block.height - crownHeight - .06, .22, .12, .44);
    if (site.crown) {
      fbox(brick, 0, block.height - .38, -.27, face.width * .48, .64, .36);
      fbox(stone, 0, block.height - .06, -.22, face.width * .48 + .2, .12, .44);
    }
    for (let i = 0; i < count; i++) {
      const x = -width / 2 + bay * (i + .5), windowWidth = 1.35;
      // Actual openings: piers and spandrels surround a glass plane set back 22 cm.
      for (let floor = 0; floor < floors; floor++) {
        const bottom = groundTop + .16 + floor * floorHeight, top = bottom + floorHeight;
        const sill = bottom + .42, windowHeight = Math.min(1.65, top - sill - .2);
        const pier = (bay - windowWidth) / 2;
        for (const edge of [-1, 1]) fbox(brick, x + edge * (windowWidth + pier) / 2, (bottom + top) / 2, -.25, pier, top - bottom, .38);
        fbox(brick, x, (bottom + sill) / 2, -.25, windowWidth, sill - bottom, .38);
        fbox(brick, x, (sill + windowHeight + top) / 2, -.25, windowWidth, top - sill - windowHeight, .38);
        const lit = (i * 7 + floor * 3 + side * 11) % 5 === 0;
        fbox(lit ? glow : glass, x, sill + windowHeight / 2, -.35, windowWidth, windowHeight, .04);
        for (const edge of [-1, 1]) fbox(stone, x + edge * (windowWidth / 2 + .045), sill + windowHeight / 2, -.13, .09, windowHeight + .18, .26);
        fbox(stone, x, sill - .035, -.13, windowWidth + .25, .13, .26);
        fbox(stone, x, sill + windowHeight + .045, -.16, windowWidth + .21, .15, .2);
        fbox(wood, x, sill + windowHeight / 2, -.29, .055, windowHeight, .07);
        fbox(wood, x, sill + windowHeight * .62, -.29, windowWidth, .05, .07);
        if (lit) fbox(recess, x + .29, sill + windowHeight / 2, -.315, .18, windowHeight - .04, .02);
      }
      if (face.shop) {
        const door = i === count - 1;
        fbox(wood, x - bay / 2 + .12, 1.7, -.23, .24, 3, .46);
        fbox(wood, x, .61, -.25, bay - .22, .75, .42);
        fbox(glow, x, 1.9, -.42, bay - .35, 1.8, .04);
        // Mullions and a transom give the shop a solid timber frame.
        fbox(wood, x, 2.95, -.23, bay, .32, .46);
        fbox(wood, x, 2.55, -.3, bay - .22, .09, .16);
        fbox(wood, x + (door ? -.4 : 0), 1.7, -.3, .09, 2.5, .16);
        if (door) {
          fbox(recess, x + .4, 1.5, -.32, .94, 2.4, .06);
          fbox(glass, x + .4, 1.8, -.28, .8, 1.55, .035);
          fbox(stone, x + .72, 1.28, -.21, .045, .25, .045);
        } else {
          // Dim shelf silhouettes behind the glazing, no interior scene to render.
          fbox(recess, x, 1.43, -.39, bay - .45, .07, .02);
          for (let jar = 0; jar < 4; jar++) fbox(wood, x - .85 + jar * .52, 1.62, -.38, .23, .31, .02);
        }
      } else {
        fbox(brick, x, 1.84, -.25, bay, 3.1, .38);
        if (i === 1) {
          fbox(stone, x, 1.5, -.15, 1.35, 2.6, .25);
          fbox(metal, x, 1.48, -.01, 1.13, 2.4, .02);
          fbox(stone, x + .38, 1.38, 0, .12, .035, .015);
        }
      }
    }
    if (face.shop) {
      fbox(wood, 0, 3.12, -.21, face.width - .6, .48, .4);
      const text = site.name, pixel = .075, step = pixel * 4;
      for (let letter = 0; letter < text.length; letter++) {
        const rows = LETTERS[text[letter]!] ?? [];
        rows.forEach((row, y) => [...row].forEach((on, x) => {
          if (on === "1") fbox(lettering, (letter - (text.length - 1) / 2) * step + (x - 1) * pixel,
            3.12 + (2 - y) * pixel, -.005, pixel * .85, pixel * .85, .008);
        }));
      }
      // Recessed canvas canopy: strong dark underside, a slim pale leading edge.
      fbox(wood, 0, 2.78, -.35, face.width - .7, .1, .65);
      fbox(stone, 0, 2.73, -.025, face.width - .7, .12, .045);
    } else {
      fbox(metal, face.width / 2 - .55, roofY / 2, -.055, .11, roofY, .11);
    }
  });
  box(roof, 0, roofY + .03, 0, block.width - .7, .12, block.depth - .7);
  box(metal, -3, roofY + .42, -3, 2.1, .7, 1.4);
  for (let i = 0; i < 5; i++) box(recess, -3.8 + i * .4, roofY + .78, -3, .13, .015, 1.15);
  box(brick, block.width / 2 - 1.5, roofY + .37, -block.depth / 2 + 1.5, .85, .65, .85);
  box(stone, block.width / 2 - 1.5, roofY + .73, -block.depth / 2 + 1.5, 1.05, .12, 1.05);
  for (const [material, pieces] of batches) {
    const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = material.name;
    mesh.castShadow = material !== glow && material !== lettering;
    // The thin pale moldings read through their cel light bands. Sampling the
    // 1K district shadow map on these steps produces crawling self-shadow stripes.
    mesh.receiveShadow = material !== stone; root.add(mesh);
  }
  scene.add(root); return root;
}
