import { readFile,writeFile,rename,mkdir } from "node:fs/promises";
import { ALDER_BUILDING_FRONTS, ALDER_FRONTAGE_CONTEXT } from "../src/sim/alder.ts";
import { generateSiteGrounds } from "../src/sim/site-grounds-generator.ts";
import type { SiteGroundsRecipe } from "../src/sim/site-grounds.ts";

const file=new URL("../src/sim/alder-site-grounds.json",import.meta.url);
const original=await readFile(file,"utf8"),before=JSON.parse(original) as SiteGroundsRecipe[];
const result=generateSiteGrounds(before,ALDER_BUILDING_FRONTS,ALDER_FRONTAGE_CONTEXT);
const summary={before:before.length,after:result.recipes.length,added:result.recipes.length-before.length,
  kinds:Object.fromEntries(["shops","residential","warehouse"].map(kind=>[kind,result.recipes.filter(r=>r.kind===kind).length])),
  courts:result.recipes.filter(r=>r.surface==="court").length,
  parkingSpaces:result.recipes.reduce((n,r)=>n+r.parking.across.length,0),
  parkedCars:result.recipes.reduce((n,r)=>n+r.parking.occupied.length,0),
  attention:result.attention};
await mkdir(new URL("../artifacts/site-grounds/",import.meta.url),{recursive:true});
await writeFile(new URL("../artifacts/site-grounds/generation.json",import.meta.url),JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({...summary,attention:summary.attention.length}));
if(process.argv.includes("--write")) {
  if(await readFile(file,"utf8")!==original)throw Error("Grounds changed during generation; preview again");
  const temp=new URL("./alder-site-grounds.json.generate-tmp",file);
  await writeFile(temp,JSON.stringify(result.recipes,null,2)+"\n");await rename(temp,file);
}
