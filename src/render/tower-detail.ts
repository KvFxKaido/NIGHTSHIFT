import * as THREE from "three";
import { facadeGrid, hash01, type BuildingSite } from "./night.ts";

/** The original batched walls, roofs and window lights remain the distant LOD. */
export const TOWER_DETAIL = { full: 110, faded: 210, cull: 240, hysteresis: .08 } as const;

function detailMaterial(color: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: .88 });
  material.name = "tower-distance-detail";
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying float vTowerDistance;\n${shader.vertexShader}`.replace("#include <begin_vertex>",
      `#include <begin_vertex>\nvTowerDistance = distance(cameraPosition, modelMatrix[3].xyz);`);
    shader.fragmentShader = `varying float vTowerDistance;\n${shader.fragmentShader}`.replace("#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
       float coverage = 1.0 - smoothstep(${TOWER_DETAIL.full.toFixed(1)}, ${TOWER_DETAIL.faded.toFixed(1)}, vTowerDistance);
       float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
       if (coverage <= threshold) discard;`);
  };
  material.customProgramCacheKey = () => "tower-detail-dither-v1";
  return material;
}

/** Details are relief on the existing shell, not a second copy of its windows.
 * Two merged meshes per nearby tower; distant detail submits no draw calls.
 * Built once at scene creation, so approaching a block never generates meshes. */
export function addTowerDetails(scene: THREE.Scene, sites: readonly BuildingSite[]): THREE.Group {
  const root = new THREE.Group(); root.name = "alder-tower-details";
  const materials = [detailMaterial(0x46515b), detailMaterial(0x252d35)];
  const unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const unitPosition = unit.getAttribute("position"), unitNormal = unit.getAttribute("normal");
  sites.forEach((site, ordinal) => {
    if (site.height < 40 || site.dressing?.windows !== "office") return;
    const lod = new THREE.LOD(); lod.name = "tower-detail-lod";
    lod.position.set(site.x, site.base ?? 0, site.z); lod.rotation.y = -(site.rotation ?? 0);
    lod.userData.site = { x: site.x, z: site.z, height: site.height };
    const near = new THREE.Group(); near.name = "tower-near-architecture";
    const batches = materials.map(() => ({ positions: [] as number[], normals: [] as number[] }));
    function box(batch: number, x: number, y: number, z: number, w: number, h: number, d: number,
      turn = 0, faceX = 0, faceZ = 0) {
      const out = batches[batch]!, c = Math.cos(turn), s = Math.sin(turn);
      for (let i = 0; i < unitPosition.count; i++) {
        const px = unitPosition.getX(i) * w + x, pz = unitPosition.getZ(i) * d + z;
        out.positions.push(px*c+pz*s+faceX, unitPosition.getY(i)*h+y, -px*s+pz*c+faceZ);
        const nx = unitNormal.getX(i), nz = unitNormal.getZ(i);
        out.normals.push(nx*c+nz*s, unitNormal.getY(i), -nx*s+nz*c);
      }
    }
    const faces = [
      { turn: 0, x: 0, z: site.depth/2, width: site.width },
      { turn: Math.PI, x: 0, z: -site.depth/2, width: site.width },
      { turn: Math.PI/2, x: site.width/2, z: 0, width: site.depth },
      { turn: -Math.PI/2, x: -site.width/2, z: 0, width: site.depth },
    ];
    const seed = site.decorationIndex ?? ordinal;
    const strongFloor = hash01(seed*2.9) > .5 ? 3 : 4;
    const entrySide = site.faceDistances.indexOf(Math.min(...site.faceDistances));
    faces.forEach((face, side) => {
      const faceBox = (batch: number, x: number, y: number, z: number, w: number, h: number, d: number) =>
        box(batch,x,y,z,w,h,d,face.turn,face.x,face.z);
      const grid = facadeGrid(face.width,site.height), pitchY = site.height/grid.floors;
      // The texture's cell phase is an integer: its floor/bay boundaries remain
      // the same across every seeded facade. Frames sit in those dark boundaries.
      const reliefStart = site.structuredFrontage ? site.frontageHeight??4.4 : 3.6;
      for (let column = 1; column < grid.columns; column++) {
        const x = column/grid.columns*face.width-face.width/2;
        faceBox(0,x,(site.height+reliefStart)/2,.065,.10,site.height-reliefStart,.13);
      }
      for (let floor = 1; floor < grid.floors; floor++) {
        const y = floor*pitchY;
        if (y < reliefStart) continue;
        const strong = floor%strongFloor === 0;
        faceBox(strong?0:1,0,y,.07,face.width-.3,strong?.25:.10,.14);
        if (strong) faceBox(1,0,y-.16,.045,face.width-.3,.055,.09);
      }
      // Narrow corner piers, a base course and a restrained parapet cap.
      const pierBase=site.structuredFrontage?reliefStart:0;
      for (const edge of [-1,1]) faceBox(0,edge*(face.width/2-.13),(site.height+pierBase)/2,.055,.22,site.height-pierBase,.11);
      if(!site.structuredFrontage)faceBox(1,0,.22,.065,face.width-.3,.44,.13);
      faceBox(0,0,site.height-.22,.08,face.width-.3,.34,.16);
      if (!site.structuredFrontage && side === entrySide && Number.isFinite(site.faceDistances[side]) && site.faceDistances[side]! < 46) {
        // Ground-floor portal stays shallower than the existing shop glow layer.
        for (const edge of [-1,1]) faceBox(0,edge*1.2,1.55,.14,.22,3.1,.28);
        faceBox(0,0,3.18,.14,2.62,.18,.28);
        faceBox(1,0,1.48,.16,.07,2.95,.32);
      }
    });
    // Low equipment inside the roof perimeter; no new tower silhouette or spire.
    const equipmentX = Math.min(2.5,site.width*.12), equipmentZ = -Math.min(2.5,site.depth*.12);
    box(1,equipmentX,site.height+.4,equipmentZ,3,.8,2);
    box(0,equipmentX,site.height+.84,equipmentZ,3.1,.08,2.1);
    for(let i=0;i<6;i++) box(1,equipmentX-1.2+i*.48,site.height+.90,equipmentZ,.12,.04,1.8);
    batches.forEach((batch,index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(batch.positions,3));
      geometry.setAttribute("normal",new THREE.Float32BufferAttribute(batch.normals,3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry,materials[index]); mesh.name = index===0?"tower-frame-relief":"tower-metal-relief";
      // The base shell already casts the building's shadow. Tiny relief avoids
      // the coarse city shadow map's self-shadow stripes and far shadow popping.
      mesh.castShadow = mesh.receiveShadow = false; near.add(mesh);
    });
    lod.addLevel(near,0);
    const far = new THREE.Group(); far.name = "tower-existing-shell-only";
    lod.addLevel(far,TOWER_DETAIL.cull,TOWER_DETAIL.hysteresis);
    root.add(lod);
  });
  unit.dispose(); scene.add(root); return root;
}
