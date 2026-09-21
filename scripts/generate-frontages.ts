import { readFile, writeFile, rename } from "node:fs/promises";
import { ALDER_FRONTAGE_CONTEXT } from "../src/sim/alder.ts";
import { parseFrontageDocument } from "../src/sim/frontage-document.ts";
import { generateFrontages } from "../src/sim/frontage-generator.ts";
import { ALDER_NEIGHBOURHOODS } from "../src/sim/alder-neighbourhoods.ts";

const district=process.argv.find(a=>a.startsWith("--district="))?.split("=")[1]??"belltown";
if(!ALDER_NEIGHBOURHOODS.some(n=>n.id===district))throw Error("Choose a known --district");
const file=new URL("../src/sim/alder-frontages.json",import.meta.url);
const original=await readFile(file,"utf8"),before=parseFrontageDocument(JSON.parse(original));
const after=generateFrontages(before,ALDER_FRONTAGE_CONTEXT,{district,reroll:process.argv.includes("--reroll-unedited")});
console.log(JSON.stringify({district,before:before.entries.length,after:after.entries.length,needsAttention:after.attention.length}));
// Preview is the default. Applying a pass is an explicit authoring action.
if(process.argv.includes("--write")) {
  if(await readFile(file,"utf8")!==original)throw Error("Frontages changed during generation; run the preview again");
  const temp=new URL("./alder-frontages.json.generate-tmp",file);
  await writeFile(temp,JSON.stringify(parseFrontageDocument(after),null,2)+"\n");await rename(temp,file);
}
