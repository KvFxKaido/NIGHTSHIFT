import { HARBOR_DRAG, DRAG_START, RIVET, RIVET_DRAG_DRIVER } from "./sim/drag-event.ts";
import { addDragStrip } from "./render/drag-strip.ts";
import { createGameMap } from "./ui/game-map.ts";
import { createPerformanceOverlay } from "./ui/performance.ts";
import { createSaveStore, isSaveId, type DriveSave } from "./settings/saves.ts";
import { safeSavePosition } from "./settings/save-position.ts";
import { createSavesPanel } from "./ui/saves.ts";
import { ALDER_CRUISE, nearbyChallenge } from "./sim/encounter.ts";
import type { SpotLight } from "three";
import { ALDER_RIVAL } from "./sim/alder-rival.ts";
import { createControlsPanel } from "./ui/controls.ts";
import { PAD_LABELS, keyLabel } from "./input/bindings.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  updateCustomization,
} from "./customization/customization.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController, mapGamepad } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CARS, isBlenderCarId, loadBlenderCar } from "./render/blender-car.ts";
import { createView, render, resetViewCamera, setPlayerCar, setRivalCar, setParkedRivalCar, setViewMode,
  type DistrictLighting } from "./render/scene.ts";
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
import { engineTone, tyreScrub, windLevel, type AudioLevels } from "./audio/audio-mix.ts";
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
const opponentCar = (id: string) => id === "bulwark" ? "blender" : "bulwark";
const raceOpponentCar = (id: string) => race?.kind === "drag" ? "hammer" : opponentCar(id);
let selectedCar = "blender";
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
  if (raceId && !generated && raceId !== ALDER_RACE.id && raceId !== HARBOR_DRAG.id) throw new Error(`Unknown race '${raceId}'`);
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
    const drawn = alderGeneratedRace(Number(generated[1]), raceStart ?? undefined, (generated[2] ?? "sprint") as Exclude<RaceKind, "drag">);
    race = drawn.race; rival = drawn.rival;
  } else if (raceId === HARBOR_DRAG.id) {
    race = HARBOR_DRAG; rival = RIVET_DRAG_DRIVER; raceStart = DRAG_START;
  } else if (raceId) { race = ALDER_RACE; rival = ALDER_RIVAL; }
  const requested = params.get("lighting") ?? "night";
  if (requested !== "night" && requested !== "blockout") throw new Error(`Unknown lighting '${requested}'`);
  lighting = requested;
  await RAPIER.init();
  const model = new URLSearchParams(location.search).get("car") ?? restored.car;
  if (model !== "classic" && !isBlenderCarId(model)) throw new Error(`Unknown car model '${model}'`);
  selectedCar = model;
  carParts = model === "classic" ? createCar()
    : await loadBlenderCar(new URL(BLENDER_CARS[model].path, document.baseURI).href, model);
  {
    const opponent = raceOpponentCar(model);
    rivalParts = await loadBlenderCar(new URL(BLENDER_CARS[opponent].path, document.baseURI).href, opponent);
    if (!race) rivetParts = await loadBlenderCar(new URL(BLENDER_CARS.hammer.path, document.baseURI).href, "hammer");
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
const visitingRivet = !race && new URLSearchParams(location.search).get("visit") === RIVET.id;
const roadWorld = createAlderWorld(!!race || visitingRivet, raceStart ?? (visitingRivet
  ? { ...RIVET.start, x: RIVET.start.x - 6, z: RIVET.start.z + 18 } : undefined));
let pendingSavePosition = loadedSave ? safeSavePosition(loadedSave, roadWorld, ALDER_DATA.bounds) : null;
if (loadedSave && loadedSave.position && !pendingSavePosition) loadNotice = "Saved build loaded. Returning to Wharf Garage because the saved location is no longer clear.";
const sim = createSim(restored.drivetrain, roadWorld, race && rival ? { race, rival, traffic: race.kind !== "drag" }
  : { encounterRoute: ALDER_CRUISE, parkedRivals: [RIVET] });
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts,
  roadWorld, lighting, sim.state.traffic, scene => addAlder(scene, lighting), ALDER_RACE.checkpoints[0]!.radius);
if (rivalParts) setRivalCar(view, rivalParts);
if (rivetParts) setParkedRivalCar(view, RIVET.id, rivetParts);
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
const hud = createHud({ polylines: hudPolylines, topSpeed: HANDLING.topSpeed, garage: ALDER_GARAGE.entrance });
let customization = restored.customization;
applyCarCustomization(view, customization);

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
if (rivalParts) cars.set(raceOpponentCar(selectedCar), rivalParts);
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
    const opponent = raceOpponentCar(id);
    const other = cars.get(opponent)
      ?? await loadBlenderCar(new URL(BLENDER_CARS[opponent].path, document.baseURI).href, opponent);
    if (other) cars.set(opponent, other);
    setRivalCar(view, null);
    setPlayerCar(view, parts);
    if (other) setRivalCar(view, other);
    applyCarCustomization(view, customization);
    selectedCar = id;
    saveSettings({ car: id }, ["car"]);
    carNote.textContent = "Both cars use your current handling and visual setup.";
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
  build: { car: isBlenderCarId(selectedCar) ? selectedCar : "blender", drivetrain: sim.state.drivetrain, customization: { ...customization } },
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
  getDrivetrain: () => sim.state.drivetrain,
  getCustomization: () => customization,
  selectDrivetrain: (drivetrain) => {
    if (drivetrain !== sim.state.drivetrain) {
      reset(drivetrain);
      input.armDrivingInputGate();
    }
    saveSettings({ drivetrain }, ["drivetrain"]);
  },
  customize: (category, optionId) => {
    customization = updateCustomization(customization, category, optionId);
    applyCarCustomization(view, customization);
    saveSettings({ customization: { [category]: customization[category] } }, [category]);
  },
  screenChanged: (screen) => {
    performanceOverlay.reset();
    if (screen === "main") savePanel.refreshSummary();
    controls.screenChanged(screen);
    if (screen === "map") gameMap.open(input.bindings());
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
let flashRemaining = 0;
let challengePending = false;
let challengeRival: string | null = null;
const challengeTarget = () => nearbyChallenge(sim.state.vehicle, sim.state.encounter, sim.state.parkedRivals, !!sim.state.race);
const challengeAvailable = () => challengeTarget() !== null;
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
  if (dragStripView && raceState) dragStripView.update(raceState);
  const rival = sim.state.rival;
  const position = race && raceState && rival ? racePosition(race,
    { race: raceState, x: car.x, z: car.z },
    { race: rival.race, x: rival.vehicle.x, z: rival.vehicle.z }) : null;
  hud.update(car, race && raceState ? {
    progressLabel: raceProgressLabel(race, raceState), targets: raceState.targets,
    checkpoint: raceState.checkpoint, total: race.checkpoints.length, next: raceState.next,
    label: raceState.countdown > 0 ? String(Math.ceil(raceState.countdown / TICK_HZ))
      : `${raceState.disqualified ? "DQ " : raceState.finished ? position === 1 ? "WIN " : "FIN " : ""}${formatRaceTime(raceState.ticks, TICK_HZ, race.kind === "drag" ? 3 : 1)}${position ? ` · P${position}/2` : ""}${rival?.race.finished && !raceState.finished ? (rival.race.disqualified ? " · RIVAL DQ" : " · RIVAL FIN") : ""}`,
  } : null, rival?.vehicle ?? (challengeTarget() === RIVET.id ? sim.state.parkedRivals.find(r => r.id === RIVET.id)?.vehicle : sim.state.encounter));
  modeElement.textContent = `${race ? race.name.toUpperCase() + " / " : ""}LIVE / ${sim.state.drivetrain.toUpperCase()}`;
  const gamepadName = input.gamepadName();
  deviceElement.textContent = gamepadName ? "PAD READY" : "KEYBOARD";
  deviceElement.title = gamepadName ?? "No standard gamepad detected";
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
  const commands = input.consumeMenuCommands();
  if (commands.includes("flash")) flashHeadlights();
  if (menu.isGameplayActive() && garageAvailable() && commands.some(command => command === "interact" || command === "confirm")) {
    menu.enterGarage();
  } else menu.handleCommands(commands);
  const gameplayActive = menu.isGameplayActive();
  const garageActive = menu.isGarageActive();
  rivalPrompt.hidden = !gameplayActive || (!challengeAvailable() && !challengePending);
  rivalPrompt.textContent = challengePending ? (challengeRival === RIVET.id ? "Rivet accepted · Harbor Quarter · 402 m drag" : "Challenge accepted · Drawing a race…")
    : `${input.gamepadName() ? PAD_LABELS[input.bindings().gamepad.flash] : keyLabel(input.bindings().keyboard.flash)} · Flash headlights — challenge ${challengeTarget() === RIVET.id ? "Rivet / Hammer · 402 m drag" : opponentCar(selectedCar) === "bulwark" ? "Bulwark" : "NS-01"}`;
  garagePrompt.hidden = !gameplayActive || !garageAvailable() || !rivalPrompt.hidden;
  updateFlash(frameDelta, gameplayActive);
  garagePrompt.textContent = input.gamepadName() ? "Cross / A · Enter Wharf Garage" : `${keyLabel(input.bindings().keyboard.interact)} / Enter · Enter Wharf Garage`;
  const resetRequested = input.consumeReset();
  const cameraResetRequested = input.consumeCameraReset();
  const debugToggleRequested = input.consumeDebugToggle();
  if (gameplayActive && resetRequested) reset();
  if ((gameplayActive || garageActive) && cameraResetRequested) resetViewCamera(view);
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
    if (sim.state.race?.finished && sim.state.rival && race) {
      const position = racePosition(race,
        { race: sim.state.race, x: sim.state.vehicle.x, z: sim.state.vehicle.z },
        { race: sim.state.rival.race, x: sim.state.rival.vehicle.x, z: sim.state.rival.vehicle.z });
      menu.finishRace(sim.state.race.disqualified ? "Disqualified" : position === 1 ? "You win" : "Second place",
        `${race.name} · ${sim.state.race.disqualified ? "Left your lane" : `P${position}/2`} · ${formatRaceTime(sim.state.race.ticks, TICK_HZ, race.kind === "drag" ? 3 : 1)}`);
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
