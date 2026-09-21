import type { FrontModule, IndustrialStyle } from "./building-fronts.ts";

/** SODO's businesses use the same editable modules, with their own bay grammar. */
export function industrialModules(style:IndustrialStyle,width:number,seed:number):FrontModule[] {
  const modules:FrontModule[]=[];
  const owner="industrial";
  const add=(kind:FrontModule["kind"],x:number,y:number,w:number,h:number,extra:Partial<FrontModule>={})=>
    modules.push({kind,owner,x,y,width:w,height:h,...extra});
  const sign=(x:number,y:number,w:number,h:number,text:string,caption:string,color="#c8c2a9")=>
    add("sign",x,y,w,h,{text,caption,color,finish:"painted"});
  // Keep a personnel entrance independent of the closed vehicle bays.
  const entrance=-width/2+1.5;
  add("door",entrance,1.35,1.25,2.7);
  sign(entrance,3.35,2.35,.55,`${100+seed%800}`,"OFFICE");
  add("light",entrance,4.1,.8,.12,{color:"#c6c5ab"});
  const workshop=style==="workshop",depot=style==="depot";
  // Depots reserve a small counter window beside the door; workshops favour
  // narrower service bays, freight stores favour wide receiving shutters.
  const counter=depot&&width>=18;
  const start=-width/2+(counter?7:4),available=width/2-.6-start;
  if(counter)add("glazing",-width/2+4.8,1.7,3.4,2.15);
  const count=Math.max(1,Math.floor(available/(workshop?4.8:6.8))),bay=available/count;
  for(let i=0;i<count;i++) {
    const x=start+bay*(i+.5),w=Math.min(workshop?4.4:5.8,bay-.65),h=workshop?3.6:4.3;
    add("shutter",x,h/2,w,h);
    sign(x,4.83,Math.min(w,2.6),.62,`${i+1}`.padStart(2,"0"),workshop?"SERVICE":depot?"COLLECTION":"RECEIVING");
    add("light",x,5.4,workshop?.8:1.2,.12,{color:"#d2d6c9"});
  }
  if(workshop)add("canopy",0,5.75,width-1,.16);
  const names=workshop?["SOUTH END MOTOR WORKS","NIGHT SHIFT TYRE CO","IRONWORK AUTO ELECTRIC","SODO RADIATOR WORKS"]:
    depot?["RAIL YARD TOOL & SUPPLY","ALDER INDUSTRIAL PARTS","SOUTHERN PIPE & VALVE","DOCKSIDE ELECTRICAL"]:
    ["SOUTH HARBOR FREIGHT","ALDER COLD STORAGE","RAILHEAD DISTRIBUTION","WEST DOCK TRANSFER"];
  sign(0,6.55,Math.min(width-1,16),1,names[Math.floor(seed/3)%names.length]!,
    workshop?"REPAIRS / TYRES / ALIGNMENT":depot?"TRADE COUNTER / COLLECTIONS":"DELIVERIES / DISPATCH",
    workshop?"#c4af75":depot?"#adbfb5":"#c8c6b9");
  return modules;
}
