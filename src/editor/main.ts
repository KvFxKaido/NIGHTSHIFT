import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/addons/controls/TransformControls.js";
import { addSeattle } from "../render/seattle.ts";
import { SEATTLE_BLOCKS, GENERATED_SEATTLE_BLOCKS, SEATTLE_LAYOUT_BASELINE, GARAGE_PLOT_ID,
  resolveSeattleLayout } from "../sim/seattle.ts";
import { buildingId, parseBuildingLayout, type BuildingLayout } from "../sim/building-layout.ts";
import { placeBuilding, placementFromMesh, layoutFromPlacements, importEditorScene, exportEditorScene } from "./exchange.ts";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("editor-view"), viewport = element("viewport");
const picker = element<HTMLSelectElement>("building"), fields = element<HTMLFieldSetElement>("fields");
const validation = element("validation"), status = element("save-status");
const save = element<HTMLButtonElement>("save");
const undoButton = element<HTMLButtonElement>("undo"), redoButton = element<HTMLButtonElement>("redo");
const keys = ["x", "z", "width", "depth", "height", "rotation"] as const;

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

const buildings = new Map<string, THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>>();
const box = new THREE.BoxGeometry(1, 1, 1);
const originals = new Map(GENERATED_SEATTLE_BLOCKS.map(block => [buildingId(block), block]));
SEATTLE_BLOCKS.forEach((block, index) => {
  const id = buildingId(GENERATED_SEATTLE_BLOCKS[index]!);
  const mesh = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: id === GARAGE_PLOT_ID ? 0xe0b763 : 0x8baab8, roughness: 0.9 }));
  mesh.name = id === GARAGE_PLOT_ID ? "Wharf Garage — fixed" : `Building ${String(index + 1).padStart(3, "0")}`;
  mesh.userData.nightshiftBuildingId = id;
  placeBuilding(mesh, block); buildings.set(id, mesh); scene.add(mesh);
  picker.add(new Option(mesh.name, id));
});

const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 5000);
const orbit = new OrbitControls(camera, canvas);
orbit.maxPolarAngle = Math.PI / 2 - 0.025; orbit.minDistance = 8; orbit.maxDistance = 2600;
const transform = new TransformControls(camera, canvas);
scene.add(transform.getHelper());
const selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xa0fff0);
scene.add(selectionBox);
let selected = "", mode: TransformControlsMode = "translate";
let revision: string | null = null, saving = false, dragging = false;
let issues: string[] = [], saved = "", committed = "";
const undo: string[] = [], redo: string[] = [];

function documentValue(): BuildingLayout {
  return layoutFromPlacements([...buildings].map(([id, mesh]) => placementFromMesh(mesh, id)));
}
function serialized(): string { return JSON.stringify(documentValue()); }
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
  fields.disabled = selected === GARAGE_PLOT_ID;
  element<HTMLButtonElement>("reset-building").disabled = fields.disabled;
  element("selection-note").textContent = fields.disabled ? "Wharf Garage is fixed to protect its entrance and free-roam start." : mesh.name + " · Base follows terrain";
  selectionBox.setFromObject(mesh);
}
function validate(): void {
  try { issues = resolveSeattleLayout(documentValue()).issues; }
  catch (error) { issues = [String((error as Error).message)]; }
  for (const [id, mesh] of buildings) mesh.material.color.setHex(issues.some(issue => issue.startsWith(id + ":")) ? 0xf36d69 : id === GARAGE_PLOT_ID ? 0xe0b763 : 0x8baab8);
  validation.dataset.invalid = String(issues.length > 0);
  const changed = documentValue().buildings.length;
  validation.textContent = issues.length ? issues.slice(0, 4).map(issue => {
    const split = issue.indexOf(": ");
    if (split < 0) return issue;
    return (buildings.get(issue.slice(0, split))?.name ?? "Layout") + issue.slice(split);
  }).join("\n") + (issues.length > 4 ? `\n+ ${issues.length - 4} more` : "") : `${changed} authored ${changed === 1 ? "building" : "buildings"} · Placement checks pass`;
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
function applyLayout(layout: BuildingLayout): void {
  const resolved = resolveSeattleLayout(layout);
  resolved.blocks.forEach((block, index) => placeBuilding(buildings.get(buildingId(GENERATED_SEATTLE_BLOCKS[index]!))!, block));
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
element("reset-building").onclick = () => { if (selected !== GARAGE_PLOT_ID) { placeBuilding(buildings.get(selected)!, originals.get(selected)!); checkpoint(); } };
undoButton.onclick = () => { const previous = undo.pop(); if (previous) { redo.push(committed); applyLayout(JSON.parse(previous)); committed = previous; status.textContent = "Undone. Save to apply this draft."; buttons(); } };
redoButton.onclick = () => { const next = redo.pop(); if (next) { undo.push(committed); applyLayout(JSON.parse(next)); committed = next; status.textContent = "Redone. Save to apply this draft."; buttons(); } };
element("focus").onclick = () => focus(); element("top").onclick = () => focus(true);
element("overview").onclick = () => { orbit.target.set(0, 0, 0); camera.position.set(1050, 1150, 1150); orbit.update(); };
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
  const hit = raycaster.intersectObjects([...buildings.values()], false)[0];
  if (hit) select(hit.object.userData.nightshiftBuildingId);
});
window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || transform.dragging) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "s") { event.preventDefault(); if (!save.disabled) save.click(); return; }
  if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); (event.shiftKey ? redoButton : undoButton).click(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === "f") focus();
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
    applyLayout(parseBuildingLayout(result.layout)); checkpoint();
    saved = serialized(); revision = result.revision; buttons();
    status.textContent = "Loaded saved placements. Undo restores your previous draft.";
  } catch (error) { status.textContent = String((error as Error).message); }
};
element("export-scene").onclick = () => {
  // Export only the world, with neither editor controls nor executable scripts.
  const exported = new THREE.Scene(); exported.name = "NIGHTSHIFT district";
  exported.background = scene.background; exported.userData.nightshiftBaseline = SEATTLE_LAYOUT_BASELINE;
  for (const child of scene.children) if (child !== selectionBox && child !== transform.getHelper()) exported.add(child.clone(true));
  download("nightshift-editor-scene.json", exportEditorScene(exported));
};
element<HTMLInputElement>("import-file").onchange = async event => {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 40_000_000) throw new Error("Choose a scene smaller than 40 MB");
    const value = JSON.parse(await file.text());
    const layout = value.schema === 1 ? parseBuildingLayout(value) : importEditorScene(value);
    applyLayout(layout); checkpoint();
    status.textContent = "Imported as a draft. Review placement checks, then save to the project.";
  } catch (error) { status.textContent = String((error as Error).message); }
  input.value = "";
};

const initial = [...buildings.keys()].filter(id => id !== GARAGE_PLOT_ID).sort((a, b) => {
  const garage = originals.get(GARAGE_PLOT_ID)!;
  const distance = (id: string) => Math.hypot(originals.get(id)!.x - garage.x, originals.get(id)!.z - garage.z);
  return distance(a) - distance(b);
})[0]!;
select(initial); focus(); committed = saved = serialized(); validate();
try {
  const response = await fetch("/__editor/layout");
  if (!response.ok) throw new Error("no save endpoint");
  const result = await response.json();
  const layout = parseBuildingLayout(result.layout);
  applyLayout(layout); committed = saved = serialized(); revision = result.revision;
  status.textContent = "Edits save into the project and are shared by rendering and collision.";
} catch { status.textContent = "Preview mode. Export a backup, or use pnpm dev locally to save into the project."; }
buttons();
const resize = () => { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe(viewport); resize();
renderer.setAnimationLoop(() => { orbit.update(); selectionBox.update(); renderer.render(scene, camera); });
canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); status.textContent = "Graphics context lost. Export your draft before reloading."; });
canvas.addEventListener("webglcontextrestored", () => { status.textContent = "Graphics restored. Your draft is still here."; });
document.body.dataset.editorReady = "true";
