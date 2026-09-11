import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/addons/controls/TransformControls.js";
import { addSeattle } from "../render/seattle.ts";
import seattleData from "../sim/seattle-data.json";
import { SEATTLE_LAYOUT, GENERATED_SEATTLE_BLOCKS, SEATTLE_LAYOUT_BASELINE, GARAGE_PLOT_ID,
  resolveSeattleLayout } from "../sim/seattle.ts";
import { buildingId, parseAnyLayout, authoredFromId, authoredSourceId, AUTHORED_ID_PREFIX,
  type AuthoredLayout } from "../sim/building-layout.ts";
import { placeBuilding, placementFromMesh, placementDiffers, layoutFromEditor, importEditorScene, exportEditorScene,
  type EditorEntry } from "./exchange.ts";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("editor-view"), viewport = element("viewport");
const picker = element<HTMLSelectElement>("building"), fields = element<HTMLFieldSetElement>("fields");
const validation = element("validation"), status = element("save-status");
const save = element<HTMLButtonElement>("save");
const undoButton = element<HTMLButtonElement>("undo"), redoButton = element<HTMLButtonElement>("redo");
const resetButton = element<HTMLButtonElement>("reset-building"), deleteButton = element<HTMLButtonElement>("delete-building");
const keys = ["x", "z", "width", "depth", "height", "rotation"] as const;
const COLOUR = { generated: 0x8baab8, authored: 0x93c9b3, garage: 0xe0b763, invalid: 0xf36d69 } as const;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x25343d);
scene.userData.nightshiftBaseline = SEATTLE_LAYOUT_BASELINE;
scene.add(new THREE.HemisphereLight(0xe2f3ff, 0x81917f, 2.4));
const sun = new THREE.DirectionalLight(0xfff1d9, 2.5);
sun.position.set(180, 450, 100); scene.add(sun);

const reference = new THREE.Scene();
addSeattle(reference, "blockout");
// The editor draws one unit box per shared solid; environment meshes are reference only.
for (const child of [...reference.children]) {
  if (child.name === "seattle-buildings" || child.name === "district-garage") {
    child.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    reference.remove(child);
  }
}
const environment = new THREE.Group(); environment.name = "Roads and terrain — reference only";
for (const child of [...reference.children]) environment.add(child);
scene.add(environment);

// Every building the editor knows, by id: generated plots (`plot-…`, with the
// plot they were generated as) and authored ones (`authored-…`). A deleted
// building keeps its mesh, hidden, so undo can bring it back.
type BuildingMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
const buildings = new Map<string, BuildingMesh>();
const hidden = new Set<string>();
const box = new THREE.BoxGeometry(1, 1, 1);
const originals = new Map(GENERATED_SEATTLE_BLOCKS.map(block => [buildingId(block), block]));
const isAuthored = (id: string) => id.startsWith(AUTHORED_ID_PREFIX);
function addMesh(id: string, name: string): BuildingMesh {
  const mesh: BuildingMesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: COLOUR.generated, roughness: 0.9 }));
  mesh.name = name;
  mesh.userData.nightshiftBuildingId = id;
  buildings.set(id, mesh); scene.add(mesh);
  return mesh;
}
GENERATED_SEATTLE_BLOCKS.forEach((block, index) => {
  const id = buildingId(block);
  placeBuilding(addMesh(id, id === GARAGE_PLOT_ID ? "Wharf Garage — fixed" : `Building ${String(index + 1).padStart(3, "0")}`), block);
});
function authoredName(id: string): string {
  const number = /^authored-(\d+)$/.exec(id)?.[1];
  return number ? `Authored ${number.padStart(3, "0")}` : id;
}
function nextAuthoredId(): string {
  let highest = 0;
  for (const id of buildings.keys()) { const n = Number(/^authored-(\d+)$/.exec(id)?.[1] ?? 0); if (n > highest) highest = n; }
  return `authored-${highest + 1}`;
}

const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 16000);
const orbit = new OrbitControls(camera, canvas);
orbit.maxPolarAngle = Math.PI / 2 - 0.025; orbit.minDistance = 8; orbit.maxDistance = 10000;
const transform = new TransformControls(camera, canvas);
scene.add(transform.getHelper());
const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xa0fff0);
scene.add(selectionBox);
let selected = "", mode: TransformControlsMode = "translate";
let revision: string | null = null, saving = false, dragging = false;
let issues: string[] = [], saved = "", committed = "";
const undo: string[] = [], redo: string[] = [];

function entries(): EditorEntry[] {
  return [...buildings].map(([id, mesh]) => ({
    id, source: isAuthored(id) ? "authored" : "generated", placement: placementFromMesh(mesh, id),
    original: originals.get(id), deleted: hidden.has(id),
  }));
}
function documentValue(): AuthoredLayout { return layoutFromEditor(entries()); }
function serialized(): string { return JSON.stringify(documentValue()); }
/** The mesh an issue or a layout entry is about: an edited generated plot is written as authored-from-<plot>. */
function meshIdFor(layoutId: string): string {
  const source = authoredSourceId(layoutId);
  return source && buildings.has(source) && !isAuthoredStandalone(layoutId) ? source : layoutId;
}
/** An authored-from id pairs with its generated plot only while that plot is retired by the document. */
let standalone = new Set<string>();
const isAuthoredStandalone = (id: string) => standalone.has(id);
function visibleIds(): string[] { return [...buildings.keys()].filter(id => !hidden.has(id)); }
function rebuildPicker(): void {
  const current = picker.value;
  picker.replaceChildren(...visibleIds().map(id => new Option(buildings.get(id)!.name, id)));
  if (visibleIds().includes(current)) picker.value = current;
}
function buttons(): void {
  const dirty = serialized() !== saved;
  save.disabled = !revision || saving || dragging || issues.length > 0 || !dirty;
  undoButton.disabled = !undo.length || dragging; redoButton.disabled = !redo.length || dragging;
  element<HTMLAnchorElement>("drive").textContent = dirty ? "Drive saved map ↗" : "Drive map ↗";
}
function readFields(): void {
  const mesh = buildings.get(selected);
  if (!mesh) return;
  const placement = placementFromMesh(mesh, selected);
  for (const key of keys) element<HTMLInputElement>(key).value = (key === "rotation" ? placement[key] * 180 / Math.PI : placement[key]).toFixed(3);
  const garage = selected === GARAGE_PLOT_ID, authored = isAuthored(selected);
  fields.disabled = garage;
  resetButton.disabled = garage || authored;
  deleteButton.disabled = garage;
  const original = originals.get(selected);
  element("selection-note").textContent = garage ? "Wharf Garage is fixed to protect its entrance and free-roam start."
    : authored ? `${mesh.name} · Authored, in world coordinates; a rebuild keeps it`
    : original && placementDiffers(original, placement) ? `${mesh.name} · Edited: saved as an authored plot, the generated one retired`
    : `${mesh.name} · Generated plot · Base follows terrain`;
  selectionBox.setFromObject(mesh);
}
function validate(): void {
  let displaced = 0;
  const layout = documentValue();
  try {
    const resolved = resolveSeattleLayout(layout);
    issues = resolved.issues; displaced = resolved.displaced.length;
  } catch (error) { issues = [String((error as Error).message)]; }
  const flagged = new Set(issues.map(issue => meshIdFor(issue.slice(0, Math.max(0, issue.indexOf(": "))))));
  for (const [id, mesh] of buildings) {
    const original = originals.get(id);
    const authored = isAuthored(id) || (original !== undefined && placementDiffers(original, placementFromMesh(mesh, id)));
    mesh.material.color.setHex(flagged.has(id) ? COLOUR.invalid : id === GARAGE_PLOT_ID ? COLOUR.garage : authored ? COLOUR.authored : COLOUR.generated);
  }
  validation.dataset.invalid = String(issues.length > 0);
  const summary = `${layout.authored.length} authored ${layout.authored.length === 1 ? "building" : "buildings"}, ${layout.retired.length} retired` +
    (displaced ? `, ${displaced} generated standing down` : "") + " · Placement checks pass";
  validation.textContent = issues.length ? issues.slice(0, 4).map(issue => {
    const split = issue.indexOf(": ");
    if (split < 0) return issue;
    return (buildings.get(meshIdFor(issue.slice(0, split)))?.name ?? "Layout") + issue.slice(split);
  }).join("\n") + (issues.length > 4 ? `\n+ ${issues.length - 4} more` : "") : summary;
  buttons();
}
function checkpoint(): void {
  const next = serialized();
  if (next !== committed) {
    undo.push(committed); if (undo.length > 100) undo.shift(); redo.length = 0; committed = next;
    status.textContent = "Draft changed. Save to apply it to the game.";
  }
  readFields(); validate();
}
/** Show the layout: generated plots as generated, retired or edited; authored plots as their own meshes. */
function applyLayout(layout: AuthoredLayout): void {
  const retired = new Set(layout.retired);
  const authoredById = new Map(layout.authored.map(placement => [placement.id, placement]));
  standalone = new Set();
  for (const [id, block] of originals) {
    const mesh = buildings.get(id)!;
    const edit = authoredById.get(authoredFromId(id));
    if (retired.has(id) && edit) { placeBuilding(mesh, edit); hidden.delete(id); }
    else if (retired.has(id)) { placeBuilding(mesh, block); hidden.add(id); }
    else { placeBuilding(mesh, block); hidden.delete(id); }
  }
  const shown = new Set<string>();
  for (const placement of layout.authored) {
    const source = authoredSourceId(placement.id);
    if (source && originals.has(source) && retired.has(source)) continue;   // shown through its generated mesh above
    standalone.add(placement.id);
    const mesh = buildings.get(placement.id) ?? addMesh(placement.id, authoredName(placement.id));
    placeBuilding(mesh, placement); hidden.delete(placement.id); shown.add(placement.id);
  }
  for (const id of buildings.keys()) if (isAuthored(id) && !shown.has(id)) hidden.add(id);
  for (const [id, mesh] of buildings) mesh.visible = !hidden.has(id);
  rebuildPicker();
  if (hidden.has(selected)) select(visibleIds()[0]!);
  readFields(); validate();
}
function focus(top = false): void {
  const mesh = buildings.get(selected)!;
  const reach = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) * 2.4;
  orbit.target.copy(mesh.position);
  camera.position.copy(mesh.position).add(top ? new THREE.Vector3(0, reach * 1.8, 0.01) : new THREE.Vector3(reach, reach * 0.9, reach));
  orbit.update();
}
function setMode(value: TransformControlsMode): void {
  mode = value; transform.setMode(mode); transform.setSpace(mode === "translate" ? "world" : "local");
  transform.showX = mode !== "rotate"; transform.showZ = mode !== "rotate"; transform.showY = mode !== "translate";
  transform.showE = false; transform.showXYZE = false;
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    button.disabled = selected === GARAGE_PLOT_ID;
  });
}
function select(id: string): void {
  selected = id; picker.value = id;
  if (id === GARAGE_PLOT_ID) transform.detach(); else transform.attach(buildings.get(id)!);
  setMode(mode); readFields();
}
function snap(): void {
  const enabled = element<HTMLInputElement>("snap").checked;
  transform.translationSnap = enabled ? 1 : null;
  transform.rotationSnap = enabled ? Math.PI / 36 : null;
  transform.scaleSnap = null;
}

picker.onchange = () => { select(picker.value); focus(); };
document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(button => button.onclick = () => setMode(button.dataset.mode as TransformControlsMode));
element("snap").onchange = snap; snap();
for (const key of keys) element<HTMLInputElement>(key).onchange = () => {
  if (selected === GARAGE_PLOT_ID) return;
  const input = element<HTMLInputElement>(key);
  if (!input.checkValidity() || input.value === "") { input.reportValidity(); readFields(); return; }
  const mesh = buildings.get(selected)!;
  const placement = placementFromMesh(mesh, selected);
  placement[key] = Number(input.value) * (key === "rotation" ? Math.PI / 180 : 1);
  placeBuilding(mesh, placement); checkpoint();
};
resetButton.onclick = () => {
  const original = originals.get(selected);
  if (selected !== GARAGE_PLOT_ID && original) { placeBuilding(buildings.get(selected)!, original); checkpoint(); }
};
element("add-building").onclick = () => {
  // A new authored plot where the camera is looking; move it from there.
  const id = nextAuthoredId();
  const mesh = addMesh(id, authoredName(id));
  placeBuilding(mesh, { x: Math.round(orbit.target.x), z: Math.round(orbit.target.z), width: 18, depth: 18, height: 14, rotation: 0 });
  standalone.add(id); rebuildPicker(); select(id); checkpoint();
};
function deleteSelected(): void {
  if (selected === GARAGE_PLOT_ID || !buildings.has(selected)) return;
  const gone = selected;
  hidden.add(gone); buildings.get(gone)!.visible = false; transform.detach();
  rebuildPicker();
  const next = visibleIds().sort((a, b) => {
    const at = buildings.get(gone)!.position;
    return buildings.get(a)!.position.distanceTo(at) - buildings.get(b)!.position.distanceTo(at);
  })[0]!;
  select(next); checkpoint();
}
deleteButton.onclick = deleteSelected;
undoButton.onclick = () => { const previous = undo.pop(); if (previous) { redo.push(committed); applyLayout(JSON.parse(previous)); committed = previous; status.textContent = "Undone. Save to apply this draft."; buttons(); } };
redoButton.onclick = () => { const next = redo.pop(); if (next) { undo.push(committed); applyLayout(JSON.parse(next)); committed = next; status.textContent = "Redone. Save to apply this draft."; buttons(); } };
element("focus").onclick = () => focus(); element("top").onclick = () => focus(true);
element("overview").onclick = () => {
  const [minX, minZ, maxX, maxZ] = seattleData.bounds as [number, number, number, number];
  const reach = Math.max(maxZ - minZ, (maxX - minX) / camera.aspect)
    / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15;
  orbit.target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  camera.position.copy(orbit.target).add(new THREE.Vector3(0, reach, reach * 0.4));
  orbit.update();
};
transform.addEventListener("dragging-changed", event => {
  dragging = !!event.value; orbit.enabled = !dragging; buttons();
});
transform.addEventListener("objectChange", () => {
  const mesh = buildings.get(selected)!;
  mesh.scale.clampScalar(2, 100);
  mesh.position.x = THREE.MathUtils.clamp(mesh.position.x, -1500, 1500);
  mesh.position.z = THREE.MathUtils.clamp(mesh.position.z, -1500, 1500);
  placeBuilding(mesh, placementFromMesh(mesh, selected)); readFields();
});
transform.addEventListener("mouseUp", checkpoint);
const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
let downX = 0, downY = 0, wasTransform = false;
canvas.addEventListener("pointerdown", event => { downX = event.clientX; downY = event.clientY; wasTransform = transform.axis !== null; });
canvas.addEventListener("pointerup", event => {
  if (event.button !== 0 || wasTransform || Math.hypot(event.clientX - downX, event.clientY - downY) > 4) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(visibleIds().map(id => buildings.get(id)!), false)[0];
  if (hit) select(hit.object.userData.nightshiftBuildingId);
});
window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || transform.dragging) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "s") { event.preventDefault(); if (!save.disabled) save.click(); return; }
  if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); (event.shiftKey ? redoButton : undoButton).click(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === "f") focus();
  if (key === "delete") deleteSelected();
  if (selected !== GARAGE_PLOT_ID) { if (key === "w") setMode("translate"); if (key === "e") setMode("rotate"); if (key === "r") setMode("scale"); }
});
window.addEventListener("beforeunload", event => { if (serialized() !== saved) { event.preventDefault(); event.returnValue = ""; } });

save.onclick = async () => {
  if (save.disabled) return;
  const draft = serialized(); saving = true; buttons(); status.textContent = "Saving placement…";
  try {
    const response = await fetch("/__editor/layout", { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": revision! }, body: draft });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Save failed");
    revision = result.revision; saved = draft;
    status.textContent = "Saved to project. Open or reload the game to drive this layout.";
  } catch (error) { status.textContent = String((error as Error).message); }
  finally { saving = false; buttons(); }
};
function download(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
element("export-layout").onclick = () => download("nightshift-placements.json", documentValue());
element("reload-saved").onclick = async () => {
  try {
    const response = await fetch("/__editor/layout");
    if (!response.ok) throw new Error("Saved placements are available through the local dev server");
    const result = await response.json();
    applyLayout(parseAnyLayout(result.layout, SEATTLE_LAYOUT_BASELINE)); checkpoint();
    saved = serialized(); revision = result.revision; buttons();
    status.textContent = "Loaded saved placements. Undo restores your previous draft.";
  } catch (error) { status.textContent = String((error as Error).message); }
};
element("export-scene").onclick = () => {
  // Export only the world, with neither editor controls nor executable scripts,
  // and without deleted buildings: a box that is missing from a scene is deleted.
  const exported = new THREE.Scene(); exported.name = "NIGHTSHIFT district";
  exported.background = scene.background; exported.userData.nightshiftBaseline = SEATTLE_LAYOUT_BASELINE;
  for (const child of scene.children) {
    if (child === selectionBox || child === transform.getHelper()) continue;
    if (typeof child.userData.nightshiftBuildingId === "string" && hidden.has(child.userData.nightshiftBuildingId)) continue;
    exported.add(child.clone(true));
  }
  download("nightshift-editor-scene.json", exportEditorScene(exported));
};
element<HTMLInputElement>("import-file").onchange = async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 128_000_000) throw new Error("Choose a scene smaller than 128 MB");
    const value = JSON.parse(await file.text());
    const layout = value.schema === 1 || value.schema === 2 ? parseAnyLayout(value, SEATTLE_LAYOUT_BASELINE) : importEditorScene(value);
    applyLayout(layout); checkpoint();
    status.textContent = `Imported as a draft: ${layout.authored.length} authored, ${layout.retired.length} retired. Review placement checks, then save to the project.`;
  } catch (error) { status.textContent = String((error as Error).message); }
  input.value = "";
};

applyLayout(SEATTLE_LAYOUT.layout);
const initial = visibleIds().filter(id => id !== GARAGE_PLOT_ID && originals.has(id)).sort((a, b) => {
  const garage = originals.get(GARAGE_PLOT_ID)!;
  const distance = (id: string) => Math.hypot(originals.get(id)!.x - garage.x, originals.get(id)!.z - garage.z);
  return distance(a) - distance(b);
})[0]!;
select(initial); focus(); committed = saved = serialized(); validate();
try {
  const response = await fetch("/__editor/layout");
  if (!response.ok) throw new Error("no save endpoint");
  const result = await response.json();
  applyLayout(parseAnyLayout(result.layout, SEATTLE_LAYOUT_BASELINE)); committed = saved = serialized(); revision = result.revision;
  status.textContent = "Edits save into the project and are shared by rendering and collision.";
} catch { status.textContent = "Preview mode. Export a backup, or use pnpm dev locally to save into the project."; }
buttons();
const resize = () => { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe(viewport); resize();
renderer.setAnimationLoop(() => { orbit.update(); selectionBox.update(); renderer.render(scene, camera); });
canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); status.textContent = "Graphics context lost. Export your draft before reloading."; });
canvas.addEventListener("webglcontextrestored", () => { status.textContent = "Graphics restored. Your draft is still here."; });
document.body.dataset.editorReady = "true";
