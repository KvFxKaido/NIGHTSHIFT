import * as THREE from "three";
import landmarks from "../sim/seattle-landmarks.json" with { type: "json" };

/** Compressed landmark silhouette; the solid footprint lives in shared map data. */
export function addSpaceNeedle(scene: THREE.Scene, night: boolean): void {
  const site = landmarks.needle;
  const group = new THREE.Group();
  group.name = "space-needle";
  group.position.set(site.x, site.base, site.z);
  const steel = new THREE.MeshStandardMaterial({ color: 0xc7d1cb, roughness: .6,
    emissive: 0x243445, emissiveIntensity: night ? .45 : 0 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xbcc8bf, metalness: .35, roughness: .4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x253945, emissive: 0xffd693,
    emissiveIntensity: night ? .85 : .1, roughness: .28 });
  function part(name: string, geometry: THREE.BufferGeometry, y: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.y = y; mesh.castShadow = true;
    group.add(mesh); return mesh;
  }
  part("needle-plaza", new THREE.CylinderGeometry(28,28,.08,48), .015,
    new THREE.MeshStandardMaterial({ color: 0x727d77, roughness: .85 }));
  part("needle-footing", new THREE.CylinderGeometry(8,10,2,24), 1, steel);
  // Three tapering legs bend inward at the waist and flare into the saucer.
  for (let leg = 0; leg < 3; leg++) {
    const angle = leg * Math.PI * 2 / 3;
    const stations = [[8,2],[4,40],[3,65],[10,91]];
    for (let i = 1; i < stations.length; i++) {
      const a = stations[i-1]!, b = stations[i]!;
      const from = new THREE.Vector3(Math.cos(angle)*a[0]!,a[1]!,Math.sin(angle)*a[0]!);
      const to = new THREE.Vector3(Math.cos(angle)*b[0]!,b[1]!,Math.sin(angle)*b[0]!);
      const mesh = part("needle-leg", new THREE.CylinderGeometry(.9,1.2,from.distanceTo(to),8),0,steel);
      mesh.position.copy(from.clone().add(to).multiplyScalar(.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());
    }
  }
  part("needle-lift-core", new THREE.CylinderGeometry(1.7,2,88,12),45,steel);
  part("needle-saucer-under", new THREE.CylinderGeometry(17,5,7,48),92,roof);
  part("needle-observation-deck", new THREE.CylinderGeometry(15,15,4,48),97.5,glass);
  part("needle-saucer-roof", new THREE.CylinderGeometry(4,19,5,48),102,roof);
  part("needle-spire", new THREE.CylinderGeometry(.2,1,15.5,12),112.25,steel);
  const beacon = part("needle-beacon",new THREE.SphereGeometry(.65,8,6),120,
    new THREE.MeshBasicMaterial({color:0xff4c48}));
  beacon.castShadow = false;
  scene.add(group);
}
