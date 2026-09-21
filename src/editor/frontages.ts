import * as THREE from "three";
import { addBuildingFronts } from "../render/building-fronts.ts";
import { ALDER_NEIGHBOURHOODS } from "../sim/alder-neighbourhoods.ts";
import { ALDER_FRONTAGE_DOCUMENT } from "../sim/alder.ts";
import { frontageForSite, parseFrontageDocument, placeFrontagePlan, resolveFrontages, type FrontageDocument, type SavedFrontage } from "../sim/frontage-document.ts";
import { generateFrontages, frontageAccessTools, refitFrontage, validateFrontageAccess, type FrontageContext } from "../sim/frontage-generator.ts";
import type { FrontKind, FrontModule, FrontPlan } from "../sim/building-fronts.ts";

interface FrontagePanelOptions {
  scene: THREE.Scene;
  context(): FrontageContext;
  selected(): string;
  pick(id:string): void;
  focus(plan:FrontPlan): void;
  placementDirty(): boolean;
}
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(key:string)=>element<HTMLInputElement>(`front-${key}`);
const button=(key:string)=>element<HTMLButtonElement>(`front-${key}`);
function dispose(root:THREE.Group):void {
  const materials=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const m of materials){if("map" in m)(m.map as THREE.Texture|null)?.dispose();m.dispose();}root.removeFromParent();
}

export function createFrontagePanel(options:FrontagePanelOptions) {
  let draft:FrontageDocument=structuredClone(ALDER_FRONTAGE_DOCUMENT),saved=JSON.stringify(draft),revision:string|null=null;
  let preview:THREE.Group|null=null,busy=false,errors:string[]=[],moduleIndex=0;
  const undo:string[]=[],redo:string[]=[];
  const status=element("front-status"),selection=element("front-selection"),modulePicker=element<HTMLSelectElement>("front-module");
  const kind=element<HTMLSelectElement>("front-kind"),district=element<HTMLSelectElement>("front-district");
  district.replaceChildren(...ALDER_NEIGHBOURHOODS.map(n=>new Option(n.name,n.id)));district.value="belltown";
  const current=()=>frontageForSite(draft,options.selected());
  const dirty=()=>JSON.stringify(draft)!==saved;
  const snapshot=()=>JSON.stringify(draft);
  function controls():void {
    const entry=current(),site=options.context().sites.find(s=>s.id===options.selected());
    button("save").disabled=busy||!revision||!dirty()||errors.length>0||options.placementDirty();
    button("reroll").disabled=busy||!site||!!entry?.locked||options.context().protectedIds.has(site?.id??"");
    button("refit").disabled=busy||!entry;button("view").disabled=!entry;
    input("locked").disabled=busy||!entry;
    button("apply").disabled=busy||!entry||!entry.plan.modules[moduleIndex];button("remove").disabled=button("apply").disabled;
    button("undo").disabled=!undo.length||busy;button("redo").disabled=!redo.length||busy;
    for(const id of ["generate","regenerate","reload"])button(id).disabled=busy;
  }
  function moduleFields():void {
    const module=current()?.plan.modules[moduleIndex];element<HTMLFieldSetElement>("front-fields").disabled=!module;
    if(!module)return;
    for(const key of ["x","y","width","height"] as const)input(key).value=String(module[key]);
    const sign=module.kind==="sign"||module.kind==="blade";
    input("text").value=module.text??"";input("caption").value=module.caption??"";
    input("text").disabled=input("caption").disabled=!sign;
    element<HTMLSelectElement>("front-mount").value=sign?module.kind:"sign";
    element<HTMLSelectElement>("front-mount").disabled=!sign;
    element<HTMLSelectElement>("front-finish").value=module.finish??"lit";
    element<HTMLSelectElement>("front-finish").disabled=!sign;
    input("color").value=module.color??"#c5c8c3";
    input("color").disabled=!module.color&&!sign;
  }
  function select():void {
    const entry=current();
    if(entry)kind.value=entry.plan.recipe.kind;
    input("locked").checked=entry?.locked??false;
    selection.textContent=entry?`${entry.plan.recipe.industrialStyle??entry.plan.recipe.kind} · ${entry.plan.modules.length} fitted modules${entry.edited?" · hand edited":""}`:"No saved frontage on this building. Choose its use and generate a draft.";
    moduleIndex=Math.min(moduleIndex,Math.max(0,(entry?.plan.modules.length??1)-1));
    modulePicker.replaceChildren(...(entry?.plan.modules??[]).map((m,i)=>new Option(`${m.kind} · ${m.text??m.owner}`,String(i))));
    modulePicker.value=String(moduleIndex);moduleFields();controls();
  }
  function refresh():void {
    const context=options.context(),resolved=resolveFrontages(draft,context.sites);
    errors=resolved.issues.map(i=>`${i.buildingId}: ${i.message}`);
    const tools=frontageAccessTools(context);
    for(const plan of resolved.plans)for(const error of validateFrontageAccess(plan,tools))errors.push(`${plan.recipe.id}: ${error}`);
    if(preview)dispose(preview);
    const moved=resolved.issues.flatMap(issue=>{
      const site=context.sites.find(s=>s.id===issue.buildingId),entry=frontageForSite(draft,issue.buildingId);
      return site&&entry?[placeFrontagePlan(entry.plan,site.block)]:[];
    });
    preview=addBuildingFronts(options.scene,[...resolved.plans,...moved],context.heightAt);
    const attention=[...draft.attention,...resolved.issues];
    element("front-summary").textContent=`Needs attention (${attention.length})`;
    element<HTMLSelectElement>("front-attention").replaceChildren(...attention.map(i=>new Option(`${i.buildingId}: ${i.message}`,i.buildingId)));
    status.textContent=errors.length?errors.slice(0,3).join("\n"):`${resolved.plans.length} frontages · ${attention.length} need attention. ${dirty()?"Draft preview — save to apply.":"Saved choices loaded."}`;
    if(options.placementDirty())status.textContent+="\nSave building placements before saving frontages.";
    select();
  }
  function commit(change:()=>void):void {
    const before=snapshot();
    try {
      change();draft=parseFrontageDocument(draft);
      if(before!==snapshot()){undo.push(before);if(undo.length>100)undo.shift();redo.length=0;}
      refresh();
    } catch(error){draft=JSON.parse(before);status.textContent=(error as Error).message;select();}
  }
  function replace(entry:SavedFrontage):void {
    const old=current();if(!old)return;draft.entries[draft.entries.indexOf(old)]=entry;
  }
  button("generate").onclick=()=>commit(()=>{draft=generateFrontages(draft,options.context(),{district:district.value});});
  button("regenerate").onclick=()=>commit(()=>{draft=generateFrontages(draft,options.context(),{district:district.value,reroll:true});});
  button("reroll").onclick=()=>commit(()=>{draft=generateFrontages(draft,options.context(),{buildingId:options.selected(),kind:kind.value as FrontKind,reroll:true});});
  input("locked").onchange=()=>commit(()=>{const e=current();if(e)replace({...e,locked:input("locked").checked});});
  button("refit").onclick=()=>commit(()=>{
    const entry=current(),context=options.context(),site=context.sites.find(s=>s.id===options.selected());if(!entry||!site)return;
    const fitted=refitFrontage(entry,site,frontageAccessTools(context));if(typeof fitted==="string")throw Error(fitted);
    replace({...fitted,edited:true,locked:true});
  });
  button("view").onclick=()=>{const entry=current(),site=options.context().sites.find(s=>s.id===options.selected());if(entry&&site)options.focus(placeFrontagePlan(entry.plan,site.block));};
  modulePicker.onchange=()=>{moduleIndex=Number(modulePicker.value);moduleFields();};
  button("apply").onclick=()=>commit(()=>{
    const entry=current();if(!entry)return;const module=entry.plan.modules[moduleIndex]!;
    const sign=module.kind==="sign"||module.kind==="blade";
    const changed:FrontModule={...module,x:Number(input("x").value),y:Number(input("y").value),width:Number(input("width").value),height:Number(input("height").value),
      ...(sign?{text:input("text").value,caption:input("caption").value,kind:element<HTMLSelectElement>("front-mount").value as "sign"|"blade",
        finish:element<HTMLSelectElement>("front-finish").value==="painted"?"painted" as const:undefined}:{}),
      ...(module.color||sign?{color:input("color").value}:{})};
    const modules=entry.plan.modules.map((m,i)=>i===moduleIndex?changed:(module.color||sign)&&m.owner===module.owner&&m.color?{...m,color:input("color").value}:m);
    replace({...entry,locked:true,edited:true,plan:{...entry.plan,modules}});
  });
  button("remove").onclick=()=>commit(()=>{const e=current();if(e)replace({...e,locked:true,edited:true,plan:{...e.plan,modules:e.plan.modules.filter((_,i)=>i!==moduleIndex)}});});
  button("undo").onclick=()=>{const previous=undo.pop();if(previous){redo.push(snapshot());draft=JSON.parse(previous);refresh();}};
  button("redo").onclick=()=>{const next=redo.pop();if(next){undo.push(snapshot());draft=JSON.parse(next);refresh();}};
  element<HTMLSelectElement>("front-attention").onchange=e=>options.pick((e.target as HTMLSelectElement).value);
  button("export").onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="nightshift-frontages.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  async function reload(initial=false):Promise<void> {
    busy=true;controls();
    try {
      const response=await fetch("/__editor/frontages");if(!response.ok)throw Error("Frontage saving needs the local dev server");
      const result=await response.json();const next=parseFrontageDocument(result.layout);
      if(!initial){undo.push(snapshot());redo.length=0;}draft=next;saved=snapshot();revision=result.revision;refresh();
    }catch(error){status.textContent=(error as Error).message;}finally{busy=false;controls();}
  }
  button("reload").onclick=()=>void reload();
  button("save").onclick=async()=>{
    if(button("save").disabled)return;busy=true;controls();const payload=snapshot();
    try {
      const response=await fetch("/__editor/frontages",{method:"PUT",headers:{"Content-Type":"application/json","If-Match":revision!},body:payload});
      const result=await response.json();if(!response.ok)throw Error(result.error??"Save failed");
      revision=result.revision;saved=payload;status.textContent="Saved frontages to project. Reload the game to see these exact choices.";
    }catch(error){status.textContent=(error as Error).message;}finally{busy=false;controls();}
  };
  refresh();void reload(true);
  return {select,layoutChanged:refresh,dirty};
}
