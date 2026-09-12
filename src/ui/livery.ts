import { copyLivery, decodeLivery, defaultLivery, FINISHES, GRAPHICS, LIVERY_KEY, LiveryHistory, MAX_LAYERS, newLayer, PANELS,
  type Livery, type LiveryLayer, type Panel } from "../customization/livery.ts";
import { createLiveryRenderer } from "../render/livery.ts";
import type { CarView } from "../render/car.ts";
import type { MenuCommand } from "../input/input.ts";

export function createLiveryEditor(options: { car(): CarView; restorePaint(): void; facePanel(panel: Panel): void; editing(active: boolean): void }) {
  const root = document.getElementById("livery-editor")!;
  const build = document.getElementById("garage-build")!;
  const open = document.querySelector<HTMLButtonElement>("[data-open-livery]")!;
  const heading = document.getElementById("garage-menu-title")!;
  const renderer = createLiveryRenderer();
  let message = "Designs save automatically on this browser.";
  let initial = defaultLivery();
  try {
    const loaded = decodeLivery(localStorage.getItem(`${LIVERY_KEY}.blender`)); initial = loaded.design;
    if (loaded.recovered) message = "Saved design was unreadable. Started with a clean design.";
  } catch { message = "Storage unavailable. You can still design during this session."; }
  const history = new LiveryHistory(initial);
  let selected = initial.layers[0]?.id ?? -1;
  let panel: Panel = initial.layers[0]?.panel ?? "hood";
  const names: Record<Panel,string> = {hood:"Hood",roof:"Roof",left:"Left door",right:"Right door",rear:"Rear"};
  root.innerHTML = `
    <div class="livery-toolbar"><button class="garage-option" data-livery-close>Back to build</button><button class="garage-option" data-livery-toggle></button></div>
    <p class="livery-note">NS-01 / Right stick turns the platform. Choose a panel, then add a graphic.</p>
    <fieldset class="garage-control"><legend>Base paint</legend><label class="livery-field">Hex color<input type="text" maxlength="7" data-livery-base aria-label="Base paint hex color"></label>
      <div class="livery-swatches" data-base-swatches></div><div class="livery-toolbar">${FINISHES.map(f=>`<button class="garage-option" data-finish="${f}">${f}</button>`).join("")}</div>
    </fieldset>
    <fieldset class="garage-control"><legend>Panel</legend><div class="livery-grid">${PANELS.map(p=>`<button class="garage-option" data-panel="${p}">${names[p]}</button>`).join("")}</div></fieldset>
    <fieldset class="garage-control"><legend>Add graphic <span>12 layers max</span></legend><div class="livery-grid">${GRAPHICS.map(g=>`<button class="garage-option" data-graphic="${g}">${g}</button>`).join("")}</div></fieldset>
    <fieldset class="garage-control"><legend>Layers <span>Bottom → top</span></legend><div class="livery-layer-list"></div></fieldset>
    <div data-layer-editor hidden>
      <p class="livery-note">Move selected layer to</p><div class="livery-grid">${PANELS.map(p=>`<button class="garage-option" data-place-panel="${p}">${names[p]}</button>`).join("")}</div>
      <label class="livery-field">Graphic color<input type="text" maxlength="7" data-layer-color aria-label="Graphic hex color"></label><div class="livery-swatches" data-layer-swatches></div>
      <label class="livery-field" data-text-field>Text / number<input type="text" maxlength="18" data-layer-text aria-label="Graphic text or number"></label>
      <div class="livery-toolbar"><button class="garage-option" data-number-step="-1">Number −</button><button class="garage-option" data-number-step="1">Number +</button></div>
      ${[["x","Horizontal",-1,1,.05],["y","Vertical",-1,1,.05],["scale","Size",.2,1.5,.05],["rotation","Rotation",-180,180,5]].map(([id,label,min,max,step])=>`<label class="livery-field">${label}<output data-value="${id}"></output><input type="range" min="${min}" max="${max}" step="${step}" data-transform="${id}" aria-label="Graphic ${label}"></label>`).join("")}
      <button class="garage-option" data-mirror></button>
      <div class="livery-toolbar"><button class="garage-option" data-layer-move="-1">Lower layer</button><button class="garage-option" data-layer-move="1">Raise layer</button><button class="garage-option" data-delete-layer>Delete</button></div>
    </div>
    <div class="livery-toolbar"><button class="garage-option" data-undo>Undo</button><button class="garage-option" data-redo>Redo</button></div>
    <p class="livery-note" data-livery-status role="status"></p>`;
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const currentLayer = () => history.current.layers.find(l=>l.id===selected);
  function apply() {
    options.restorePaint(); renderer.invalidate(); renderer.apply(options.car(), history.current);
  }
  function save() {
    try { localStorage.setItem(`${LIVERY_KEY}.blender`, JSON.stringify({version:1,design:history.current})); message = "Design saved on this browser."; }
    catch { message = "Could not save. Design remains available during this session."; }
    apply(); render();
  }
  function edit(change: (design: Livery) => void) {
    const next = copyLivery(history.current); next.enabled = true; change(next);
    if (history.commit(next)) save();
  }
  function editLayer(change: (layer: LiveryLayer) => void) { edit(d => { const l=d.layers.find(l=>l.id===selected); if(l) change(l); }); }
  function render() {
    const d = history.current;
    if (selected !== -1 && !currentLayer()) selected = d.layers.filter(l=>l.panel===panel).at(-1)?.id ?? -1;
    const l = currentLayer(); if (l) panel = l.panel;
    get<HTMLButtonElement>("[data-livery-toggle]").textContent = d.enabled ? "Livery on" : "Livery off";
    get("[data-livery-toggle]").setAttribute("aria-pressed",String(d.enabled));
    get<HTMLInputElement>("[data-livery-base]").value = d.base;
    root.querySelectorAll<HTMLElement>("[data-finish]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.finish===d.finish)));
    root.querySelectorAll<HTMLElement>("[data-panel]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.panel===panel)));
    root.querySelectorAll<HTMLButtonElement>("[data-graphic]").forEach(b=>b.disabled=d.layers.length>=MAX_LAYERS);
    const list = get(".livery-layer-list");
    const focusedLayer = (document.activeElement as HTMLElement)?.dataset.layerId;
    list.replaceChildren();
    for (const [i,layer] of d.layers.entries()) {
      const button=document.createElement("button"); button.className="garage-option"; button.dataset.layerId=String(layer.id);
      button.textContent=`${i+1} / ${names[layer.panel]} / ${layer.graphic}${layer.graphic==='number' ? ` ${layer.text}` : ''}`;
      button.setAttribute("aria-pressed",String(layer.id===selected));
      button.onclick=()=>{selected=layer.id;panel=layer.panel;options.facePanel(panel);render();}; list.append(button);
    }
    if (focusedLayer) root.querySelector<HTMLButtonElement>(`[data-layer-id="${focusedLayer}"]`)?.focus();
    get("[data-layer-editor]").hidden=!l;
    if (l) {
      get<HTMLInputElement>("[data-layer-color]").value=l.color;
      get<HTMLInputElement>("[data-layer-text]").value=l.text;
      get("[data-text-field]").hidden=!['number','label'].includes(l.graphic);
      root.querySelectorAll<HTMLButtonElement>("[data-number-step]").forEach(b=>b.disabled=l.graphic!=='number');
      for (const key of ['x','y','scale','rotation'] as const) {
        get<HTMLInputElement>(`[data-transform="${key}"]`).value=String(l[key]);
        get(`[data-value="${key}"]`).textContent=key==='rotation'?`${l[key]}°`:`${Math.round(l[key]*100)}%`;
      }
      const mirror=get<HTMLButtonElement>("[data-mirror]"); mirror.disabled=!['left','right'].includes(l.panel);
      mirror.textContent=l.mirror?"Mirror opposite door: on":"Mirror opposite door: off"; mirror.setAttribute('aria-pressed',String(l.mirror));
      const index=d.layers.indexOf(l);
      get<HTMLButtonElement>('[data-layer-move="-1"]').disabled=index===0;
      get<HTMLButtonElement>('[data-layer-move="1"]').disabled=index===d.layers.length-1;
    }
    get<HTMLButtonElement>("[data-undo]").disabled=!history.canUndo;
    get<HTMLButtonElement>("[data-redo]").disabled=!history.canRedo;
    get("[data-livery-status]").textContent=message;
  }
  for (const [selector,base] of [["[data-base-swatches]",true],["[data-layer-swatches]",false]] as const) {
    for (const [name,color] of [["Ivory","#f2eee3"],["Black","#111722"],["Red","#a80d2f"],["Cyan","#59d8ff"],["Gold","#ffb347"],["Mint","#7edfc6"]]) {
      const b=document.createElement('button');b.className='garage-option';b.style.background=color!;b.setAttribute('aria-label',`${base?'Base':'Graphic'} ${name}`);
      b.onclick=()=>base?edit(d=>{d.base=color!;}):editLayer(l=>{l.color=color!;});get(selector).append(b);
    }
  }
  get<HTMLInputElement>('[data-livery-base]').onchange=e=>{
    const v=(e.target as HTMLInputElement).value;
    if (/^#[\da-f]{6}$/i.test(v)) edit(d=>{d.base=v;}); else {message='Use a six-digit hex color, such as #59d8ff.';render();}
  };
  get<HTMLInputElement>('[data-layer-color]').onchange=e=>{
    const v=(e.target as HTMLInputElement).value;
    if (/^#[\da-f]{6}$/i.test(v)) editLayer(l=>{l.color=v;}); else {message='Use a six-digit hex color, such as #59d8ff.';render();}
  };
  get<HTMLInputElement>('[data-layer-text]').onchange=e=>editLayer(l=>{l.text=(e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9 .-]/g,'').slice(0,18);});
  root.querySelectorAll<HTMLInputElement>('[data-transform]').forEach(input=>input.oninput=()=>editLayer(l=>{l[input.dataset.transform as 'x'|'y'|'scale'|'rotation']=Number(input.value);}));
  root.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach(b=>b.onclick=()=>edit(d=>{d.finish=b.dataset.finish as Livery['finish'];}));
  root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(b=>b.onclick=()=>{panel=b.dataset.panel as Panel; selected=history.current.layers.filter(l=>l.panel===panel).at(-1)?.id ?? -1; options.facePanel(panel);render();});
  root.querySelectorAll<HTMLButtonElement>('[data-place-panel]').forEach(b=>b.onclick=()=>{panel=b.dataset.placePanel as Panel; options.facePanel(panel);editLayer(l=>{l.panel=panel;});});
  root.querySelectorAll<HTMLButtonElement>('[data-graphic]').forEach(b=>b.onclick=()=>edit(d=>{if(d.layers.length<MAX_LAYERS){const l=newLayer(d,b.dataset.graphic as LiveryLayer['graphic'],panel);d.layers.push(l);selected=l.id;}}));
  root.querySelectorAll<HTMLButtonElement>('[data-number-step]').forEach(b=>b.onclick=()=>editLayer(l=>{l.text=String(Math.max(0,Math.min(999,(Number(l.text)||0)+Number(b.dataset.numberStep)))).padStart(2,'0');}));
  root.querySelectorAll<HTMLButtonElement>('[data-layer-move]').forEach(b=>b.onclick=()=>edit(d=>{const i=d.layers.findIndex(l=>l.id===selected),j=i+Number(b.dataset.layerMove);if(i>=0&&j>=0&&j<d.layers.length)[d.layers[i],d.layers[j]]=[d.layers[j]!,d.layers[i]!];}));
  get('[data-delete-layer]').onclick=()=>edit(d=>{d.layers=d.layers.filter(l=>l.id!==selected);});
  get('[data-mirror]').onclick=()=>editLayer(l=>{l.mirror=!l.mirror;});
  get('[data-undo]').onclick=()=>{history.undo();save();};get('[data-redo]').onclick=()=>{history.redo();save();};
  get('[data-livery-toggle]').onclick=()=>{const d=copyLivery(history.current);d.enabled=!d.enabled;history.commit(d);save();};
  function close(focus = true) {root.hidden=true;build.hidden=false;open.hidden=false;heading.textContent='Street build';options.editing(false);if(focus)open.focus();}
  get('[data-livery-close]').onclick=()=>close();
  open.onclick=()=>{options.editing(true);root.hidden=false;build.hidden=true;open.hidden=true;heading.textContent='Livery';render();get<HTMLButtonElement>('[data-livery-close]').focus();options.facePanel(panel);};
  function refresh() {
    const supported=options.car().car.userData.model==='ns-01';open.disabled=!supported;
    open.textContent=supported?'Livery / NS-01':'Livery / NS-01 only';
    if(!supported&&!root.hidden)close();apply();render();
  }
  refresh();
  return { refresh, close, handleBack(commands: readonly MenuCommand[]) {if(!root.hidden&&commands.some(c=>c==='back'||c==='pause')){close();return true;}return false;},
    useFactoryPaint() {if(options.car().car.userData.model==='ns-01' && history.current.enabled){const d=copyLivery(history.current);d.enabled=false;history.commit(d);save();}} };
}
