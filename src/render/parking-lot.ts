import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { parkingPoint, type ParkedCar, type ParkingLot } from "../sim/parking-lot.ts";
import type { BuildingBlock } from "../sim/building-footprint.ts";
import { asphaltMaterial } from "./asphalt.ts";
import { trafficBodyGeometry } from "./traffic-body.ts";
import { glowTexture } from "./night.ts";

/** One deterministic plan feeds surface, paint, props and parked-car poses.
 * Ground is sampled in short tiles, so paving never floats over the terrain. */
export function addParkingLots(scene: THREE.Scene, lots: readonly ParkingLot[], heightAt: (x: number, z: number) => number, night: boolean): void {
  const root = new THREE.Group(); root.name = "alder-parking";
  const materials = {
    asphalt: asphaltMaterial(night ? 0x3b454d : 0x575f65),
    walk: new THREE.MeshStandardMaterial({ color: 0x858985, roughness: .95 }),
    paint: new THREE.MeshBasicMaterial({ color: 0xbcbdb0 }),
    blue: new THREE.MeshBasicMaterial({ color: 0x315b80 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x7b7f79, roughness: .9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x394047, roughness: .65, metalness: .4 }),
    lamps: new THREE.MeshBasicMaterial({ color: night ? 0xffd899 : 0xb0aba0, toneMapped: false }),
  };
  type Surface = keyof typeof materials;
  for (const material of [materials.asphalt, materials.walk, materials.paint, materials.blue]) {
    material.polygonOffset = true; material.polygonOffsetFactor = -2; material.polygonOffsetUnits = -2;
  }
  for (const lot of lots) {
    const group = new THREE.Group(); group.name = `parking-${lot.recipe.id}`; root.add(group);
    const batches = new Map<Surface, THREE.BufferGeometry[]>();
    function add(surface: Surface, geometry: THREE.BufferGeometry) {
      const batch = batches.get(surface) ?? []; batch.push(geometry); batches.set(surface, batch);
    }
    function ground(surface: Surface, rect: BuildingBlock, lift: number) {
      const g = new THREE.PlaneGeometry(rect.width, rect.depth, Math.max(1, Math.ceil(rect.width / 4)), Math.max(1, Math.ceil(rect.depth / 4)));
      g.rotateX(-Math.PI / 2); g.rotateY(-rect.rotation); g.translate(rect.x, 0, rect.z);
      const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)) + lift);
        uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
      }
      g.computeVertexNormals(); add(surface, g);
    }
    function local(x: number, z: number, width: number, depth: number, rotation = lot.recipe.rotation): BuildingBlock {
      const point = parkingPoint(lot.recipe, x, z);
      return { ...point, width, depth, rotation, height: 0, base: heightAt(point.x, point.z) };
    }
    function box(surface: Surface, block: BuildingBlock) {
      const g = new THREE.BoxGeometry(block.width, block.height, block.depth);
      g.rotateY(-block.rotation); g.translate(block.x, block.base + block.height / 2, block.z); add(surface, g);
    }
    for (const surface of lot.surfaces) ground(surface.kind, surface, surface.kind === "walk" ? .033 : .022);
    const { columns, stallWidth, stallDepth, aisleWidth, endMargin } = lot.recipe;
    const { width, depth } = lot.footprint;
    for (const sign of [-1, 1]) {
      const z = sign * (aisleWidth / 2 + stallDepth / 2);
      for (let i = 0; i <= columns; i++) ground("paint", local(-width / 2 + endMargin + i * stallWidth, z, .10, stallDepth), .043);
      ground("paint", local(0, sign * (aisleWidth / 2 + stallDepth), width - endMargin * 2, .10), .043);
    }
    for (const kerb of lot.kerbs) box("concrete", kerb);
    for (const stop of lot.wheelStops) box("concrete", stop);
    box("metal", lot.sign);
    box("metal", { ...lot.sign, width:2.5, depth:.12, height:1.6, base:lot.sign.base+1.6 });
    for (const bay of lot.bays) {
      const b = bay.footprint;
      if (bay.accessible) {
        ground("blue", { ...b, width: 2.4, depth: 2.4 }, .041);
        // Simple wheelchair mark: wheel, head, back, seat and angled footrest.
        const ring = new THREE.TorusGeometry(.47, .05, 5, 20); ring.rotateX(-Math.PI / 2);
        const p = parkingPoint(b, -.15, .2); ring.translate(p.x, b.base + .057, p.z); add("paint", ring);
        const head = new THREE.CircleGeometry(.13, 10); head.rotateX(-Math.PI / 2);
        const hp = parkingPoint(b, .02, -.75); head.translate(hp.x, b.base + .058, hp.z); add("paint", head);
        for (const [x,z,w,d,r] of [[0,-.35,.10,.6,0],[.24,-.04,.55,.10,0],[.5,.2,.10,.55,-.28]]) {
          const p = parkingPoint(b, x!, z!);
          ground("paint", { ...b, ...p, width:w!, depth:d!, rotation:b.rotation+r! }, .06);
        }
      }
      if (bay.accessSpace) {
        // Clip diagonal hatching to the reserved rectangle rather than leaking into adjacent bays.
        const half = stallWidth / 2 - .15, limit = stallDepth / 2 - .15;
        for (let offset = -limit-half; offset <= limit+half; offset += .65) {
          const x1 = Math.max(-half, -limit-offset), x2 = Math.min(half, limit-offset);
          if (x2 <= x1) continue;
          const centre = parkingPoint(b, (x1+x2)/2, offset+(x1+x2)/2);
          ground("paint", { ...b, ...centre, width:(x2-x1)*Math.SQRT2, depth:.10, rotation:b.rotation+Math.PI/4 }, .045);
        }
      }
    }
    // Two-way aisle arrows; the aisle and right turnaround never receive bays.
    for (const direction of [-1, 1]) {
      const x = direction * 11, z = direction * 2;
      ground("paint", local(x, z, 2.4, .16), .044);
      for (const side of [-1, 1]) ground("paint", local(x + direction * .9, z + side * .35, 1, .16, lot.recipe.rotation - direction * side * Math.PI / 4), .044);
    }
    const entranceX = width / 2 - endMargin / 2;
    ground("paint", local(entranceX - endMargin / 4, depth / 2 + lot.recipe.entranceLength - 3.5, endMargin / 2 - .4, .25), .044);
    for (let z = depth / 2 + 4; z < depth / 2 + lot.recipe.entranceLength - 6; z += 5)
      ground("paint", local(entranceX, z, .10, 2), .044);
    for (const lamp of lot.lamps) {
      box("metal", lamp);
      box("metal", { ...lamp, width:2.8, depth:.35, height:.16, base:lamp.base+lamp.height-.1 });
      box("lamps", { ...lamp, width:2.4, depth:.55, height:.10, base:lamp.base+lamp.height-.2 });
    }
    for (const [surface, geometries] of batches) {
      const geometry = mergeGeometries(geometries)!; geometries.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, materials[surface]); mesh.name = `${group.name}-${surface}`;
      mesh.receiveShadow = surface !== "lamps"; mesh.castShadow = surface === "metal" || surface === "concrete";
      group.add(mesh);
    }
    let signTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#173345"; ctx.fillRect(0,0,512,320);
        ctx.strokeStyle = "#adbebb"; ctx.lineWidth = 8; ctx.strokeRect(10,10,492,300);
        ctx.fillStyle = "#e0e7d8"; ctx.textAlign = "center";
        ctx.font = "bold 150px sans-serif"; ctx.fillText("P",256,170);
        ctx.font = "bold 36px monospace"; ctx.fillText(lot.recipe.label,256,227,460);
        ctx.font = "24px monospace"; ctx.fillText("VISITOR / STAFF",256,279);
        signTexture = new THREE.CanvasTexture(canvas); signTexture.colorSpace = THREE.SRGBColorSpace;
      }
    }
    const signMaterial = new THREE.MeshBasicMaterial({ color:signTexture ? 0xffffff : 0x173345, map:signTexture });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.5),signMaterial);
    sign.name = `${group.name}-sign`; sign.rotation.y = -lot.recipe.rotation;
    const signFace = parkingPoint(lot.sign,0,.10);
    sign.position.set(signFace.x,lot.sign.base+2.4,signFace.z); group.add(sign);
    addParkedCars(group,lot.cars);
    if (night) {
      const poolMaterial = new THREE.MeshBasicMaterial({ color:0xdba661, map:glowTexture(), transparent:true,
        opacity:.32, blending:THREE.AdditiveBlending, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 });
      for (const lamp of lot.lamps) {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), poolMaterial);
        const point = parkingPoint(lamp,0,6);
        pool.rotation.x = -Math.PI/2; pool.position.set(point.x, heightAt(point.x,point.z)+.052, point.z);
        pool.name = `${group.name}-lamp-pool`; group.add(pool);
      }
    }
  }
  scene.add(root);
}

export function addParkedCars(group:THREE.Group, parked:readonly ParkedCar[]):void {
    // Parked bodies reuse traffic geometry, but have no live lamps or AI.
    for (const kind of ["sedan", "suv"] as const) {
      const cars = parked.filter(c => c.kind === kind); if (!cars.length) continue;
      const geometry = trafficBodyGeometry(kind); geometry.silhouette.dispose();
      const pose = new THREE.Object3D();
      for (const layer of ["paint", "detail"] as const) {
        const material = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:layer === "detail", roughness:.7, metalness:.25 });
        const mesh = new THREE.InstancedMesh(geometry[layer], material, cars.length);
        mesh.name = `${group.name}-${kind}-${layer}`;
        cars.forEach((car, i) => {
          pose.position.set(car.solid.x, car.solid.base+.025, car.solid.z); pose.rotation.y = -car.solid.rotation;
          pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
          if (layer === "paint") mesh.setColorAt(i, new THREE.Color(car.color));
        });
        mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh);
      }
    }
}
