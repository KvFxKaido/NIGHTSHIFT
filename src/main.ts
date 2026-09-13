import { createLiveryEditor } from "./ui/livery.ts";
import { padLabel, refreshControlHints } from "./ui/prompts.ts";
import { DRIFT_YARD, SABLE, YARD_LINE } from "./sim/drift-yard.ts";
import { SABLE_DRIFT } from "./sim/drift-event.ts";
import { addDriftYard } from "./render/drift-yard.ts";
import { HARBOR_DRAG, DRAG_START, RIVET, RIVET_DRAG_DRIVER } from "./sim/drag-event.ts";
import { addDragStrip } from "./render/drag-strip.ts";
import { createGameMap } from "./ui/game-map.ts";
import { createPerformanceOverlay } from "./ui/performance.ts";
import { createSaveStore, isSaveId, type DriveSave } from "./settings/saves.ts";
import { safeSavePosition } from "./settings/save-position.ts";
import { createSavesPanel } from "./ui/saves.ts";
import { ALDER_CRUISE, nearbyChallenge } from "./sim/encounter.ts";
import { cardCopy, rivalCard, RIVAL_CARDS, type CardCopy } from "./ui/rival-card.ts";
import type { SpotLight } from "three";
import { ALDER_RIVAL } from "./sim/alder-rival.ts";
import { createControlsPanel } from "./ui/controls.ts";
import { keyLabel } from "./input/bindings.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  updateCustomization,
} from "./customization/customization.ts";
import { drivetrainFor } from "./customization/cars.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController, mapGamepad } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CARS, isBlenderCarId, loadBlenderCar } from "./render/blender-car.ts";
import { createView, render, resetViewCamera, setPlayerCar, setRivalCar, setParkedRivalCar, setViewMode,
  type DistrictLighting } from "./render/scene.ts";
import { CHASE_CAMERAS, nextChaseCamera } from "./render/camera.ts";
import { loadCameraPreference, saveCameraPreference } from "./settings/camera-preference.ts";
import { createSim, HANDLING, resetSim, step, DT, TICK_HZ,
  type Input } from "./sim/sim.ts";
import { createAlderWorld, ALDER_DATA, ALDER_STREETS, ALDER_GARAGE, ALDER_RACE, alderGeneratedRace, alderHeight } from "./sim/alder.ts";
import { seedFromTick } from "./sim/race-generator.ts";
import { snapToLane, encodeStart, decodeStart } from "./sim/race-start.ts";
import type { RivalDefinition } from "./sim/rival.ts";
import type { RoadWorld } from "./sim/road-world.ts";
import { addAlder } from "./render/alder.ts";
import { canEnterGarage } from "./sim/garage.ts";
import { createMenuController } from "./ui/menu.ts";
import { createHud, type HudPolyline } from "./ui/hud.ts";
import { formatRaceTime, racePosition, raceProgressLabel, type RaceKind, type RaceDefinition } from "./sim/race.ts";
import { createCarAudio, type CarAudio } from "./audio/engine-audio.ts";
import { loadSoundtrack, type Soundtrack } from "./audio/soundtrack.ts";
import { engineTone, REDLINE_RPM, tyreScrub, windLevel, type AudioLevels } from "./audio/audio-mix.ts";
import { createSettingsStore, settingsStatusMessage, withoutSettingsOverrides,
  type SettingsPatch, type SettingsUrlKey } from "./settings/settings.ts";

const settings = createSettingsStore(() => window.localStorage);
const saves = createSaveStore(() => window.localStorage);
let loadedSave: DriveSave | undefined;
let loadNotice = "";
const requestedSave = new URLSearchParams(location.search).get("save");
if (requestedSave !== null) {
  try {
    loadedSave = saves.list().find(s => isSaveId(requestedSave) && s.id === requestedSave);
    if (!loadedSave) loadNotice = "That save is unavailable. Choose another slot or start a new drive.";
  } catch { loadNotice = "Saved games could not be loaded. Your existing data is unchanged."; }
}
const restored = { ...settings.get(), ...loadedSave?.build };

const assetStatus = document.getElementById("asset-status")!;
let carParts: CarView;
let rivalParts: CarView | null = null;
let rivetParts: CarView | null = null;
let sableParts: CarView | null = null;
const raceOpponentCar = () => race?.kind === "drag" ? "hammer" : "kestrel";
let selectedCar = "cinder";
let race: RaceDefinition | null = null;
let rival: RivalDefinition | null = null;
/** Where a generated race starts: where the flash was, snapped to its lane. Null means the grid. */
let raceStart: RoadWorld["start"] | null = null;
let lighting: DistrictLighting = "night";
try {
  const url = new URL(location.href);
  const params = url.searchParams;
  if (requestedSave !== null) {
    // A slot is authoritative over preview links and always resumes free roam.
    for (const key of ["race", "car", "drivetrain", "paint", "wheels", "stance", "drive", "freeze", "visit"]) params.delete(key);
    if (!loadedSave) { params.delete("save"); params.delete("scene"); }
  }
  // Old bookmarks now enter the Port Alder demo; incompatible routes are retired.
  // "seattle" is this city's old name; links carrying it are ours, not another world's.
  if (params.has("world") && !["alder", "seattle"].includes(params.get("world")!)) params.delete("race");
  if (params.get("race") === "crane-to-crest") params.delete("race");
  params.set("world", "alder");
  params.delete("route"); params.delete("environment"); params.delete("rival");
  history.replaceState(history.state, "", url);
  const raceId = params.get("race");
  // A generated race is its seed: ?race=gen-<seed> draws the same gates and
  // the same rival line every time, which is all a playlist needs to keep.
  const generated = raceId ? /^gen-(\d{1,9})(?:-(circuit|unordered))?$/.exec(raceId) : null;
  if (raceId && !generated && raceId !== ALDER_RACE.id && raceId !== HARBOR_DRAG.id && raceId !== SABLE_DRIFT.id) throw new Error(`Unknown race '${raceId}'`);
  // A generated race starts where the flash was: ?start=x,z,heading, snapped
  // to its lane again here so the pose the URL carries is the pose driven.
  // The authored race starts on the grid its line was authored from.
  const startParam = params.get("start");
  if (startParam && generated) {
    const flashed = decodeStart(startParam);
    if (!flashed) throw new Error(`Unknown start '${startParam}'`);
    raceStart = snapToLane(ALDER_STREETS, flashed, alderHeight);
    if (!raceStart) throw new Error(`No street to start on at ${startParam}`);
  } else if (startParam) { params.delete("start"); history.replaceState(history.state, "", url); }
  if (generated) {
    const drawn = alderGeneratedRace(Number(generated[1]), raceStart ?? undefined, (generated[2] ?? "sprint") as Exclude<RaceKind, "drag" | "drift">);
    race = drawn.race; rival = drawn.rival;
  } else if (raceId === HARBOR_DRAG.id) {
    race = HARBOR_DRAG; rival = RIVET_DRAG_DRIVER; raceStart = DRAG_START;
  } else if (raceId === SABLE_DRIFT.id) { race = SABLE_DRIFT; raceStart = DRIFT_YARD.start;
  } else if (raceId) { race = ALDER_RACE; rival = ALDER_RIVAL; }
  const requested = params.get("lighting") ?? "night";
  if (requested !== "night" && requested !== "blockout") throw new Error(`Unknown lighting '${requested}'`);
  lighting = requested;
  await RAPIER.init();
  const requestedCar = new URLSearchParams(location.search).get("car") ?? restored.car;
  // The NS-01 became the car Sable drives. Old links still resolve, the way
  // ?world=seattle does, rather than failing to an asset-error screen.
  const model = requestedCar === "blender" ? "cinder" : requestedCar;
  if (model !== "classic" && !isBlenderCarId(model)) throw new Error(`Unknown car model '${model}'`);
  selectedCar = model;
  carParts = model === "classic" ? createCar()
    : await loadBlenderCar(new URL(BLENDER_CARS[model].path, document.baseURI).href, model);
  {
    const opponent = raceOpponentCar();
    rivalParts = await loadBlenderCar(new URL(BLENDER_CARS[opponent].path, document.baseURI).href, opponent);
    if (!race) rivetParts = await loadBlenderCar(new URL(BLENDER_CARS.hammer.path, document.baseURI).href, "hammer");
    if (!race || race.kind === "drift") sableParts = await loadBlenderCar(new URL(BLENDER_CARS.blender.path, document.baseURI).href, "blender");
  }
} catch (error) {
  document.body.dataset.assetState = "error";
  assetStatus.setAttribute("role", "alert");
  assetStatus.textContent = `Asset loading failed: ${error instanceof Error ? error.message : String(error)}. ` +
    "Refresh to retry. ?car=classic selects the primitive car.";
  // No invisible model or silent replacement when an authored asset breaks.
  throw error;
}

const input = createInputController();
if (loadedSave) settings.update(loadedSave.build);
const controls = createControlsPanel(input);
const visiting = !race ? [RIVET, SABLE].find(r => r.id === new URLSearchParams(location.search).get("visit")) : undefined;
const roadWorld = createAlderWorld(!!race || !!visiting, raceStart ?? (visiting
  ? { ...visiting.start, x: visiting.start.x - 6, z: visiting.start.z + 18 } : undefined));
let pendingSavePosition = loadedSave ? safeSavePosition(loadedSave, roadWorld, ALDER_DATA.bounds) : null;
if (loadedSave && loadedSave.position && !pendingSavePosition) loadNotice = "Saved build loaded. Returning to Wharf Garage because the saved location is no longer clear.";
const sim = createSim(drivetrainFor(selectedCar), roadWorld, race ? { race, rival: rival ?? undefined, traffic: race.kind !== "drag" && race.kind !== "drift", parkedRivals: race.kind === "drift" ? [SABLE] : [] }
  : { encounterRoute: ALDER_CRUISE, parkedRivals: [RIVET, SABLE] });
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts,
  roadWorld, lighting, sim.state.traffic, scene => addAlder(scene, lighting), ALDER_RACE.checkpoints[0]!.radius);
// A ?camera= link previews over this after boot (debug.ts) without saving.
view.chaseCamera = loadCameraPreference(() => window.localStorage);
if (rivalParts) setRivalCar(view, rivalParts);
if (rivetParts) setParkedRivalCar(view, RIVET.id, rivetParts);
if (sableParts) {
  // No repaint: the NS-01 leaves the factory in signal red, which is the car
  // the portrait in design/reference/characters/sable has always described.
  // It was teal only so it could not be mistaken for the car the player drove.
  setParkedRivalCar(view, SABLE.id, sableParts);
}
const driftYardView = addDriftYard(view.scene, lighting === "night");
const dragStripView = race?.drag ? addDragStrip(view.scene, race.drag, alderHeight) : null;
document.body.dataset.world = "alder";
document.title = "NIGHTSHIFT — Port Alder";
document.querySelector("#brand > span")!.textContent = "NIGHTSHIFT / PORT ALDER";
document.querySelector('[data-menu-screen="pause"] .menu-kicker')!.textContent = race ? `Port Alder / ${race.name}` : "Port Alder / Free roam";
document.querySelector<HTMLElement>("[data-restart-label]")!.textContent = race ? "Restart race" : "Return to garage";
const gameMap = createGameMap(sim);
document.body.dataset.assetState = "ready";
assetStatus.remove();
const modeElement = document.getElementById("mode")!;
const deviceElement = document.getElementById("device")!;
const telemetryElement = document.getElementById("telemetry")!;
const performanceOverlay = createPerformanceOverlay();
const hudPolylines: HudPolyline[] = ALDER_STREETS.map(street => ({ points: street.points }));
hudPolylines.push({ points: YARD_LINE, color: "#7edfc6" });
const hud = createHud({ polylines: hudPolylines, topSpeed: HANDLING.topSpeed, garage: ALDER_GARAGE.entrance });
let customization = restored.customization;
applyCarCustomization(view, customization);
const liveryEditor = createLiveryEditor({ car: () => view,
  restorePaint: () => applyCarCustomization(view, customization),
  editing: active => { view.garageLiveryEditing = active; },
  facePanel: panel => { view.garageYaw = ({ hood: -Math.PI / 4, roof: -Math.PI / 4, left: -Math.PI * .75, right: Math.PI / 4, rear: Math.PI * .75 }[panel]); },
});

// Audio is presentation, so it lives beside the renderer and reads state after
// the ticks are done. Browsers refuse an AudioContext without a gesture, so the
// whole stack is built on the first click or key and the game runs silent until
// then rather than logging a failure nobody can act on.
let audio: CarAudio | null = null;
let soundtrack: Soundtrack | null = null;
let audioLevels: AudioLevels = restored.audio;
let lastInput: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

async function startAudio(): Promise<void> {
  if (audio) return;
  try {
    const context = new AudioContext();
    // Chrome hands back a suspended context unless the gesture is still live.
    if (context.state === "suspended") await context.resume();
    audio = createCarAudio(context, audioLevels);
    soundtrack = await loadSoundtrack(context, audio.musicBus);
    soundtrack.onChange(() => menu.refreshAudio());
    menu.refreshAudio();
  } catch {
    // A blocked or unsupported AudioContext is not worth breaking a run over.
    audio = null;
  }
}

let debugVisible = false;
// Set by __ns.freeze(): holds the fixed simulation still so a capture of a given
// state is the same image every time.
let frozen = false;

function renderSettingsStatus(): void {
  document.querySelectorAll<HTMLElement>("[data-settings-status]").forEach(element => {
    element.textContent = settingsStatusMessage(settings.status(), location.search);
    element.dataset.saveState = settings.status();
  });
}

function saveSettings(patch: SettingsPatch, keys: SettingsUrlKey[]): void {
  if (!settings.update(patch)) return;
  // A saved choice must win on refresh even when the tab began as a preview
  // link. Leave unrelated scene/drive/camera and other preview fields intact.
  history.replaceState(history.state, "", withoutSettingsOverrides(location.href, keys));
  renderSettingsStatus();
}

function reset(drivetrain = sim.state.drivetrain): void {
  challengePending = false;
  flashRemaining = 0;
  resetSim(sim, drivetrain);
  resetViewCamera(view);
}

// Cache each loaded body once; only the active body belongs to a scene.
const cars = new Map<string, CarView>([[selectedCar, carParts]]);
let carLoading = false;
const carNote = document.querySelector<HTMLElement>("[data-car-status]")!;
function renderCarSelection(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.car === selectedCar));
    button.disabled = carLoading;
  });
}
async function selectCar(id: string): Promise<void> {
  if (carLoading || !isBlenderCarId(id)) return;
  carLoading = true;
  carNote.textContent = "Loading car…";
  renderCarSelection();
  try {
    const parts = cars.get(id)
      ?? await loadBlenderCar(new URL(BLENDER_CARS[id].path, document.baseURI).href, id);
    cars.set(id, parts);
    setPlayerCar(view, parts);
    applyCarCustomization(view, customization);
    selectedCar = id;
    liveryEditor.refresh();
    saveSettings({ car: id }, ["car"]);
    // The body carries the drivetrain, so a different car is a different drive.
    if (drivetrainFor(id) !== sim.state.drivetrain) {
      reset(drivetrainFor(id));
      input.armDrivingInputGate();
    }
    carNote.textContent = `Each car has its own drivetrain; this one is ${drivetrainFor(id).toUpperCase()}.`;
  } catch {
    carNote.textContent = "Could not load that car. Your current car is still ready; select again to retry.";
  } finally {
    carLoading = false;
    renderCarSelection();
  }
}
renderCarSelection();
document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach(button => {
  button.addEventListener("click", () => void selectCar(button.dataset.car!));
});

const savePanel = createSavesPanel(saves, () => ({
  world: roadWorld.id,
  build: { car: isBlenderCarId(selectedCar) ? selectedCar : "cinder", customization: { ...customization } },
  position: race ? null : { x: sim.state.vehicle.x, z: sim.state.vehicle.z, heading: sim.state.vehicle.heading },
}));
const menu = createMenuController({
  startTrack: (fresh) => {
    if (fresh) {
      pendingSavePosition = null;
      if (race) { loadDrive(null); return; }
    }
    reset();
    if (pendingSavePosition) {
      const p = pendingSavePosition;
      sim.body.setTranslation({ x: p.x, y: p.y + .5, z: p.z }, true);
      sim.body.setRotation({ x: 0, y: Math.sin(p.heading / 2), z: 0, w: Math.cos(p.heading / 2) }, true);
      step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
      pendingSavePosition = null;
      resetViewCamera(view);
    }
    input.armDrivingInputGate();
  },
  restartRun: () => {
    reset();
    input.armDrivingInputGate();
  },
  returnToMain: () => {},
  openSaves: mode => savePanel.open(mode),
  resumeRun: () => input.armDrivingInputGate(),
  getCustomization: () => customization,
  customize: (category, optionId) => {
    customization = updateCustomization(customization, category, optionId);
    applyCarCustomization(view, customization);
    if (category === "paint") liveryEditor.useFactoryPaint();
    liveryEditor.refresh();
    saveSettings({ customization: { [category]: customization[category] } }, [category]);
  },
  screenChanged: (screen) => {
    if (screen !== "garage") liveryEditor.close(false);
    performanceOverlay.reset();
    if (screen === "main") savePanel.refreshSummary();
    controls.screenChanged(screen);
    if (screen === "map") gameMap.open();
    setViewMode(view, screen === "garage" ? "garage" : "track");
  },
  getAudioLevels: () => audioLevels,
  setAudioLevel: (channel, value) => {
    audioLevels = { ...audioLevels, [channel]: value };
    audio?.setLevels({ [channel]: value });
    saveSettings({ audio: { [channel]: value } }, []);
  },
  soundtrackLabel: () => {
    if (!audio) return { note: "Click or press a key to start audio.", playing: false, enabled: false };
    const tracks = soundtrack?.tracks() ?? [];
    if (!tracks.length) {
      return {
        note: "No soundtrack tracks are installed.",
        playing: false,
        enabled: false,
      };
    }
    const playing = soundtrack?.isPlaying() ?? false;
    const current = soundtrack?.nowPlaying();
    return {
      note: current ? `Now playing: ${current.title}` : `${tracks.length} track${tracks.length === 1 ? "" : "s"} ready.`,
      playing,
      enabled: true,
    };
  },
  soundtrack: (command) => {
    if (command === "toggle") soundtrack?.toggle();
    else if (command === "next") soundtrack?.next();
    else soundtrack?.previous();
  },
});

for (const event of ["pointerdown", "keydown"] as const) {
  window.addEventListener(event, () => void startAudio(), { once: true });
}

const garagePrompt = document.getElementById("garage-entry") as HTMLButtonElement;
const garageAvailable = () => canEnterGarage(ALDER_GARAGE, sim.state.vehicle, sim.state.race !== null);
garagePrompt.addEventListener("click", () => {
  if (menu.isGameplayActive() && garageAvailable()) menu.enterGarage();
});

const rivalPrompt = document.getElementById("rival-challenge") as HTMLButtonElement;
const cardPortrait = rivalPrompt.querySelector<HTMLImageElement>("[data-card-portrait]")!;
const cardName = rivalPrompt.querySelector<HTMLElement>("[data-card-name]")!;
const cardMeta = rivalPrompt.querySelector<HTMLElement>("[data-card-meta]")!;
const cardAction = rivalPrompt.querySelector<HTMLElement>("[data-card-action]")!;
const portraitUrl = (path: string) => new URL(path, document.baseURI).href;
// Fetch every face at load. A card that appears blank the first time you pull
// alongside somebody is worse than the line of text it replaced.
for (const card of RIVAL_CARDS) {
  for (const path of [card.portrait.calm, card.portrait.keen]) new Image().src = portraitUrl(path);
}
function showRivalCard(copy: CardCopy): void {
  const portrait = portraitUrl(copy.portrait);
  if (cardPortrait.src !== portrait) cardPortrait.src = portrait;
  cardName.textContent = copy.name;
  cardMeta.textContent = copy.meta;
  cardAction.textContent = copy.action;
}
let flashRemaining = 0;
let challengePending = false;
let challengeRival: string | null = null;
const challengeTarget = () => nearbyChallenge(sim.state.vehicle, sim.state.encounter, sim.state.parkedRivals, !!sim.state.race);
const flashLabel = () => input.activeGamepadName()
  ? padLabel(input.bindings().gamepad.flash, input.activeGamepadName())
  : keyLabel(input.bindings().keyboard.flash);
function loadDrive(raceId: string | null, scene: "track" | "garage" = "track", start: string | null = null): void {
  const url = new URL(location.href);
  if (raceId) url.searchParams.set("race", raceId); else url.searchParams.delete("race");
  if (start) url.searchParams.set("start", start); else url.searchParams.delete("start");
  url.searchParams.set("scene", scene);
  url.searchParams.set("car", selectedCar);
  url.searchParams.delete("save");
  // Race transitions retain the loaded slot's build without changing other slots.
  url.searchParams.set("drivetrain", sim.state.drivetrain);
  for (const [key, value] of Object.entries(customization)) url.searchParams.set(key, value);
  for (const key of ["drive", "freeze", "rival", "visit"]) url.searchParams.delete(key);
  location.href = url.href;
}
/** Seconds the brand line keeps naming the camera after a change. */
let cameraNoticeRemaining = 0;
function cycleCamera(): void {
  view.chaseCamera = nextChaseCamera(view.chaseCamera);
  saveCameraPreference(() => window.localStorage, view.chaseCamera);
  // A deliberate choice beats a ?camera= preview on refresh, like garage choices.
  const url = new URL(location.href);
  if (url.searchParams.has("camera")) { url.searchParams.delete("camera"); history.replaceState(history.state, "", url); }
  cameraNoticeRemaining = 1.6;
}
function flashHeadlights(): void {
  if (!menu.isGameplayActive() || flashRemaining > 0) return;
  flashRemaining = .8;
  challengeRival = challengeTarget();
  challengePending = challengeRival !== null;
}
rivalPrompt.addEventListener("click", flashHeadlights);
// Flash is presentation only. Cache each lamp's authored intensity so swaps and
// future car-specific lamps restore correctly after the double pulse.
function updateFlash(dt: number, active: boolean): void {
  if (active) flashRemaining = Math.max(0, flashRemaining - dt);
  const bright = active && (flashRemaining > .6 || (flashRemaining > .2 && flashRemaining < .4));
  view.car.traverse(object => {
    if (!(object as SpotLight).isSpotLight) return;
    const lamp = object as SpotLight;
    lamp.userData.baseIntensity ??= lamp.intensity;
    lamp.intensity = lamp.userData.baseIntensity * (bright ? 4 : 1);
  });
  if (challengePending && flashRemaining === 0 && active) {
    challengePending = false;
    if (challengeRival === SABLE.id) { loadDrive(SABLE_DRIFT.id); return; }
    if (challengeRival === RIVET.id) { loadDrive(HARBOR_DRAG.id); return; }
    // Every flash draws a new race; the seed comes from the tick of the flash,
    // so a replay of the cruise would draw the same one. It starts where you
    // are, snapped to your lane; off every street, it starts on the grid.
    const here = snapToLane(ALDER_STREETS, sim.state.vehicle, alderHeight);
    const seed = seedFromTick(sim.state.tick);
    const kind = (["sprint", "circuit", "unordered"] as const)[seed % 3]!;
    loadDrive(`gen-${seed}${kind === "sprint" ? "" : `-${kind}`}`, "track", here ? encodeStart(here) : null);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) menu.pause();
});

function updateHud(): void {
  const car = sim.state.vehicle;
  const raceState = sim.state.race;
  driftYardView.update(raceState);
  if (dragStripView && raceState) dragStripView.update(raceState);
  const dragControls = document.getElementById("drag-controls");
  if (dragControls && race?.kind === "drag") {
    const bindings = input.bindings();
    const up = input.activeGamepadName() ? padLabel(bindings.gamepad.shiftUp, input.activeGamepadName()) : keyLabel(bindings.keyboard.shiftUp);
    const down = input.activeGamepadName() ? padLabel(bindings.gamepad.shiftDown, input.activeGamepadName()) : keyLabel(bindings.keyboard.shiftDown);
    dragControls.textContent = `${up} UP / ${down} DOWN / ${input.activeGamepadName() ? "Stick or D-pad" : `${keyLabel(bindings.keyboard.left)} or ${keyLabel(bindings.keyboard.right)}`} lane`;
  }
  const rival = sim.state.rival;
  const position = race && raceState && rival ? racePosition(race,
    { race: raceState, x: car.x, z: car.z },
    { race: rival.race, x: rival.vehicle.x, z: rival.vehicle.z }) : null;
  hud.update(car, race && raceState ? {
    progressLabel: raceProgressLabel(race, raceState), targets: race.kind === "drift" ? [race.drift!.zones[raceState.drift!.nextZone]!] : raceState.targets,
    checkpoint: raceState.checkpoint, total: race.checkpoints.length, next: raceState.next,
    label: raceState.countdown > 0 ? String(Math.ceil(raceState.countdown / TICK_HZ))
      : race.kind === "drift" ? `${Math.ceil(Math.max(0, race.drift!.durationTicks - raceState.ticks) / TICK_HZ)}s LEFT`
      : `${raceState.disqualified ? "DQ " : raceState.finished ? position === 1 ? "WIN " : "FIN " : ""}${formatRaceTime(raceState.ticks, TICK_HZ, race.kind === "drag" ? 3 : 1)}${position ? ` · P${position}/2` : ""}${rival?.race.finished && !raceState.finished ? (rival.race.disqualified ? " · RIVAL DQ" : " · RIVAL FIN") : ""}`,
  } : null,
  // Every rival gets a blip, pinned to the minimap rim when off the disc, as in Midnight Club 3.
  [rival?.vehicle, sim.state.encounter, ...sim.state.parkedRivals.map(parked => parked.vehicle)]
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => !!vehicle),
  // The tachometer follows the engine you hear; the sim has no gears outside drag races.
  { rpm: engineTone(car, lastInput).rpm, redlineRpm: REDLINE_RPM });
  const driftPanel = document.getElementById("drift-instruments")!;
  driftPanel.hidden = !raceState?.drift;
  if (raceState?.drift) {
    const d = raceState.drift;
    document.getElementById("drift-chain")!.textContent = `+${Math.floor(d.chain)} x${d.multiplier}`;
    document.getElementById("drift-feedback")!.textContent = raceState.countdown > 0 ? "90s / BEAT SABLE / 3,000 PTS" : d.feedbackTicks ? d.feedback : d.drifting ? `${Math.round(d.angle)} DEG / LINK THE NEXT CORNER` : "BUILD SPEED / TAP HANDBRAKE";
    document.getElementById("drift-zone")!.textContent = `NEXT: ${race!.drift!.zones[d.nextZone]!.name.toUpperCase()}`;
    const bindings = input.bindings();
    document.getElementById("drift-help")!.textContent = `${input.activeGamepadName() ? padLabel(bindings.gamepad.handbrake, input.activeGamepadName()) : keyLabel(bindings.keyboard.handbrake)}: initiate · Straighten to bank`;
  }
  modeElement.textContent = `${race ? race.name.toUpperCase() + " / " : ""}LIVE / ${sim.state.drivetrain.toUpperCase()}`
    + (cameraNoticeRemaining > 0 ? ` / CAMERA ${CHASE_CAMERAS[view.chaseCamera].label.toUpperCase()}` : "");
  const gamepadName = input.activeGamepadName();
  deviceElement.textContent = gamepadName ? "PAD READY" : "KEYBOARD";
  deviceElement.title = gamepadName ?? "Keyboard controls active";
  telemetryElement.textContent =
    `auto-countersteer OFF\n` +
    `forward ${car.forwardSpeed.toFixed(1)} m/s\n` +
    `lateral ${car.lateralSpeed.toFixed(1)} m/s\n` +
    `slip ${(car.slipAngle * 180 / Math.PI).toFixed(1)}°\n` +
    `yaw ${car.yawRate.toFixed(2)} rad/s\n` +
    `load F/R ${Math.round(car.frontLoadFraction * 100)}/${Math.round((1 - car.frontLoadFraction) * 100)}%\n` +
    `load L/R ${Math.round((1 - car.rightLoadFraction) * 100)}/${Math.round(car.rightLoadFraction * 100)}%\n` +
    `altitude ${car.y.toFixed(1)} m\n` +
    `grade ${(Math.tan(car.pitch) * 100).toFixed(1)}%\n` +
    `ground ${Math.round(car.groundContact * 4)}/4 tyres${car.groundContact > 0 && sim.state.drivetrain === "awd" ? " (AWD: no cost)" : ""}\n` +
    `tick ${sim.state.tick}`;
  telemetryElement.classList.toggle("visible", debugVisible);
}

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  // The first RAF timestamp can predate synchronous world construction.
  // Negative time makes camera smoothing extrapolate away from the car.
  const frameDelta = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;

  input.update();
  refreshControlHints(input.activeGamepadName(), input.bindings());
  const commands = input.consumeMenuCommands();
  if (commands.includes("flash")) flashHeadlights();
  if (menu.isGameplayActive() && garageAvailable() && commands.some(command => command === "interact" || command === "confirm")) {
    menu.enterGarage();
  } else if (!liveryEditor.handleBack(commands)) menu.handleCommands(commands);
  const gameplayActive = menu.isGameplayActive();
  const garageActive = menu.isGarageActive();
  // The card is the prompt: whoever the flash would reach, or whoever it just
  // did. A rival with no card cannot be offered, which is what the roster test
  // in tests/rival-card.test.ts is for.
  const contact = rivalCard(challengePending ? challengeRival : challengeTarget());
  rivalPrompt.hidden = !gameplayActive || !contact;
  if (contact) showRivalCard(cardCopy(contact, challengePending, flashLabel()));
  garagePrompt.hidden = !gameplayActive || !garageAvailable() || !rivalPrompt.hidden;
  updateFlash(frameDelta, gameplayActive);
  garagePrompt.textContent = input.activeGamepadName() ? `${padLabel(0, input.activeGamepadName())} · Enter Wharf Garage` : `${keyLabel(input.bindings().keyboard.interact)} / Enter · Enter Wharf Garage`;
  const resetRequested = input.consumeReset();
  const cameraResetRequested = input.consumeCameraReset();
  const cameraCycleRequested = input.consumeCameraCycle();
  const debugToggleRequested = input.consumeDebugToggle();
  if (gameplayActive && resetRequested) reset();
  if ((gameplayActive || garageActive) && cameraResetRequested) resetViewCamera(view);
  // The garage camera is fixed, so the cycle only means something on the street.
  if (gameplayActive && cameraCycleRequested) cycleCamera();
  cameraNoticeRemaining = Math.max(0, cameraNoticeRemaining - frameDelta);
  if (gameplayActive && debugToggleRequested) debugVisible = !debugVisible;

  if (gameplayActive && !frozen) accumulator += frameDelta;
  else accumulator = 0;

  const measuring = performanceOverlay.enabled();
  const simStart = measuring ? performance.now() : 0;
  while (gameplayActive && accumulator >= DT) {
    const tickInput = input.sample();
    lastInput = tickInput;
    step(sim, tickInput);
    accumulator -= DT;
    if (sim.state.race?.finished && race?.kind === "drift") {
      const drift = sim.state.race.drift!;
      menu.finishRace(drift.won ? "Sable beaten" : "Target missed",
        `${Math.floor(drift.score)} / ${race.drift!.targetScore} points / ${drift.clips} clips / ${drift.transitions} transitions`);
      accumulator = 0;
      break;
    }
    if (sim.state.race?.finished && sim.state.rival && race) {
      const position = racePosition(race,
        { race: sim.state.race, x: sim.state.vehicle.x, z: sim.state.vehicle.z },
        { race: sim.state.rival.race, x: sim.state.rival.vehicle.x, z: sim.state.rival.vehicle.z });
      const reactionTicks = sim.state.vehicle.transmission?.reactionTicks;
      const dragTiming = race.kind === "drag" && reactionTicks != null
        ? ` / RT ${(reactionTicks / TICK_HZ).toFixed(3)} s / ET ${formatRaceTime(sim.state.race.ticks - reactionTicks, TICK_HZ, 3)}` : "";
      menu.finishRace(sim.state.race.disqualified ? "Disqualified" : position === 1 ? "You win" : "Second place",
        `${race.name} · ${sim.state.race.disqualified ? "Left the strip" : `P${position}/2`} · ${formatRaceTime(sim.state.race.ticks, TICK_HZ, race.kind === "drag" ? 3 : 1)}${dragTiming}`);
      accumulator = 0;
      break;
    }
  }
  const simMs = measuring ? performance.now() - simStart : 0;

  updateHud();
  // Once per frame, never inside the tick: audio reads the simulation and can
  // neither change it nor make a run irreproducible.
  audio?.update(sim.state.vehicle, lastInput, menu.isGameplayActive() && !frozen);
  const renderStart = measuring ? performance.now() : 0;
  render(
    view,
    sim.state,
    frameDelta,
    gameplayActive || garageActive ? input.cameraLook() : { x: 0, y: 0 },
  );
  if (measuring) performanceOverlay.record(now, simMs, performance.now() - renderStart,
    view.renderer.info, view.renderer.domElement.width, view.renderer.domElement.height,
    frozen ? "frozen" : document.body.dataset.gameScreen ?? "playing");
  requestAnimationFrame(frame);
}

function renderFrame(frameDelta: number): void {
  updateHud();
  render(
    view,
    sim.state,
    frameDelta,
    menu.isGameplayActive() || menu.isGarageActive() ? input.cameraLook() : { x: 0, y: 0 },
  );
}

installDebugApi({
  view,
  sim,
  // Drivetrain is a developer control now, not a garage choice: there is no
  // button left to click, so the comparison flow resets the run directly.
  setDrivetrain: layout => { reset(layout); input.armDrivingInputGate(); },
  canvas: view.renderer.domElement,
  // Scripted checks use the same fixed simulation as live driving.
  advance: (ticks, tickInput) => {
    for (let index = 0; index < ticks; index++) step(sim, tickInput);
    // A scripted run should sound like a driven one as well.
    lastInput = tickInput;
  },
  renderOnce: (frames = 1) => {
    for (let index = 0; index < frames; index++) renderFrame(DT);
  },
  setFrozen: (value) => { frozen = value; },
  isFrozen: () => frozen,
  setTelemetry: (visible) => { debugVisible = visible; },
  pause: () => menu.pause(),
  inputReport: () => {
    const pad = navigator.getGamepads().find(g => g?.connected && g.mapping === "standard") ?? null;
    return {
      gamepad: input.gamepadName(),
      axes: (pad?.axes ?? []).map(value => Number(value.toFixed(3))),
      pressedButtons: (pad?.buttons ?? []).flatMap((button, index) => button.pressed ? [index] : []),
      mapped: mapGamepad(pad, input.bindings().gamepad),
      drivingGated: input.isDrivingGated(),
      screen: document.body.dataset.gameScreen ?? "unknown",
      delivered: lastInput,
    };
  },
  audioReport: () => {
    const vehicle = sim.state.vehicle;
    return {
      state: audio ? audio.context.state : "absent" as const,
      levels: audioLevels,
      engineHz: engineTone(vehicle, lastInput).frequency,
      scrub: tyreScrub(vehicle),
      wind: windLevel(vehicle),
      tracks: soundtrack?.tracks().length ?? 0,
      nowPlaying: soundtrack?.nowPlaying()?.title ?? null,
    };
  },
});

// Leaving a race returns to the same city in free roam.
document.querySelectorAll<HTMLButtonElement>("[data-free-roam]").forEach(button => {
  button.hidden = !race;
  button.addEventListener("click", () => loadDrive(null));
});
document.querySelector<HTMLButtonElement>("[data-race-garage]")!.addEventListener("click", () => loadDrive(null, "garage"));

const debugApi = (window as unknown as { __ns: Parameters<typeof applyDeepLink>[0] }).__ns;
settings.preview(() => applyDeepLink(debugApi, location.search));
// The slot has been consumed; refreshing must not silently reload an older build.
if (requestedSave !== null) {
  const url = new URL(location.href); url.searchParams.delete("save");
  history.replaceState(history.state, "", url);
}
if (loadNotice) {
  document.querySelector<HTMLElement>("[data-save-summary]")!.textContent = loadNotice;
  document.querySelector<HTMLElement>("[data-settings-status]")!.textContent = loadNotice;
}
renderSettingsStatus();

modeElement.title = `${sim.state.physicsVersion} · Rapier ${RAPIER.version()} · ${TICK_HZ} Hz fixed simulation`;
requestAnimationFrame(frame);
