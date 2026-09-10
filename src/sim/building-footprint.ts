export interface BuildingBlock {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** Yaw, so a building can stand square to the street it fronts. */
  readonly rotation: number;
  /** Height of the base: the LOWEST drawn ground under the footprint, so no
   *  corner floats and the uphill side is buried by at most the ground's spread
   *  across the block. Not zero. This district climbs 20 m, and at zero 227 of
   *  321 buildings stood with their base more than a metre underground. */
  readonly base: number;
}

/** The four corners of an oriented footprint. Clearance is a rectangle problem;
 *  a circumscribed circle demanded a 35 m setback on an arterial and is why the
 *  first pass left every block floating in the middle of its face. */
export function blockCorners(block: BuildingBlock): { x: number; z: number }[] {
  const cos = Math.cos(block.rotation), sin = Math.sin(block.rotation);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => {
    const localX = sx * block.width / 2, localZ = sz * block.depth / 2;
    return { x: block.x + localX * cos - localZ * sin, z: block.z + localX * sin + localZ * cos };
  });
}


export function blockPenetration(a: BuildingBlock, b: BuildingBlock): number {
  let least = Infinity;
  for (const box of [a, b]) {
    const cos = Math.cos(box.rotation), sin = Math.sin(box.rotation);
    for (const [axisX, axisZ] of [[cos, sin], [-sin, cos]] as const) {
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const corner of blockCorners(a)) {
        const t = corner.x * axisX + corner.z * axisZ;
        aMin = Math.min(aMin, t); aMax = Math.max(aMax, t);
      }
      for (const corner of blockCorners(b)) {
        const t = corner.x * axisX + corner.z * axisZ;
        bMin = Math.min(bMin, t); bMax = Math.max(bMax, t);
      }
      least = Math.min(least, Math.min(aMax, bMax) - Math.max(aMin, bMin));
    }
  }
  return least;
}

/** Exact planar distance from a street segment to an oriented rectangle. */
export function segmentFootprintDistance(block: BuildingBlock, a: {x:number;z:number}, b: {x:number;z:number}): number {
  const cos=Math.cos(block.rotation),sin=Math.sin(block.rotation);
  const local=(p:{x:number;z:number})=>({x:(p.x-block.x)*cos+(p.z-block.z)*sin,z:-(p.x-block.x)*sin+(p.z-block.z)*cos});
  const p=local(a),q=local(b),halfX=block.width/2,halfZ=block.depth/2;
  let enter=0,exit=1;
  for(const [origin,delta,half] of [[p.x,q.x-p.x,halfX],[p.z,q.z-p.z,halfZ]]) {
    if(Math.abs(delta!)<1e-10){if(Math.abs(origin!)>half!){enter=1;exit=0;break;}}
    else {const t1=(-half!-origin!)/delta!,t2=(half!-origin!)/delta!;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));}
  }
  if(enter<=exit)return 0;
  const pointDistance=(p:{x:number;z:number})=>Math.hypot(Math.max(0,Math.abs(p.x)-halfX),Math.max(0,Math.abs(p.z)-halfZ));
  let distance=Math.min(pointDistance(p),pointDistance(q));
  const dx=q.x-p.x,dz=q.z-p.z,length2=dx*dx+dz*dz;
  for(const x of [-halfX,halfX])for(const z of [-halfZ,halfZ]){
    const t=length2?Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/length2)):0;
    distance=Math.min(distance,Math.hypot(x-p.x-t*dx,z-p.z-t*dz));
  }
  return distance;
}
