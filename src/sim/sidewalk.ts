/** Triangle heights shared by the sidewalk mesh and the vehicle surface. */
export function sidewalkSampler(points: readonly number[], lifts: readonly number[]) {
  const size=32, cells=new Map<string,number[]>();
  for(let i=0;i<points.length;i+=6) {
    const xs=[points[i]!,points[i+2]!,points[i+4]!], zs=[points[i+1]!,points[i+3]!,points[i+5]!];
    for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)
      for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++) {
        const key=`${x},${z}`, list=cells.get(key)??[];list.push(i);cells.set(key,list);
      }
  }
  return (x:number,z:number):number=>{
    for(const i of cells.get(`${Math.floor(x/size)},${Math.floor(z/size)}`)??[]) {
      const ax=points[i]!,az=points[i+1]!,bx=points[i+2]!,bz=points[i+3]!,cx=points[i+4]!,cz=points[i+5]!;
      const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(det)<1e-10)continue;
      const a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det;
      const b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,c=1-a-b;
      if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7)return Math.max(0,a*lifts[i/2]!+b*lifts[i/2+1]!+c*lifts[i/2+2]!);
    }
    return 0;
  };
}

/** Dissipate a little energy when climbing a curb, never while cruising on top.
 * Substeps catch the narrow bevel even at racing speed. No stored crossing
 * state, so resets and CPU cars use exactly the same response. */
export function curbRise(sample:(x:number,z:number)=>number,x:number,z:number,dx:number,dz:number):number {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));
  let previous=sample(x,z),rise=0;
  for(let i=1;i<=steps;i++) {
    const next=sample(x+dx*i/steps,z+dz*i/steps);
    rise+=Math.max(0,next-previous);previous=next;
  }
  return rise;
}
