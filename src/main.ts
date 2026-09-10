import { createControlsPanel } from "./ui/controls.ts";
import { keyLabel } from "./input/bindings.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  updateCustomization,
} from "./customization/customization.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController, mapGamepad } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CARS, isBlenderCarId, loadBlenderCar } from "./render/blender-car.ts";
import { createView, render, resetViewCamera, setPlayerCar, setViewMode,
  type DistrictLighting } from "./render/scene.ts";
import { createSim, HANDLING, resetSim, step, DT, TICK_HZ,
  type Input } from "./sim/sim.ts";
import { createSeattleWorld, SEATTLE_STREETS, SEATTLE_GARAGE, SEATTLE_RACE } from "./sim/seattle.ts";
import { addSeattle } from "./render/seattle.ts";
import { canEnterGarage } from "./sim/garage.ts";
import { createMenuController } from "./ui/menu.ts";
import { createHud, type HudPolyline } from "./ui/hud.ts";
import { formatRaceTime, type RaceDefinition } from "./sim/race.ts";
import { createCarAudio, type CarAudio } from "./audio/engine-audio.ts";
import { loadSoundtrack, type Soundtrack } from "./audio/soundtrack.ts";
import { engineTone, tyreScrub, windLevel, type AudioLevels } from "./audio/audio-mix.ts";
import { createSettingsStore, settingsStatusMessage, withoutSettingsOverrides,
  type SettingsPatch, type SettingsUrlKey } from "./settings/settings.ts";

const settings = createSettingsStore(() => window.localStorage);
const restored = settings.get();

const assetStatus = document.getElementById("asset-status")!;
let carParts: CarView;
let selectedCar = "blender";
let race: RaceDefinition | null = null;
let lighting: DistrictLighting = "night";
try {
  const url = new URL(location.href);
  const params = url.searchParams;
  // Old bookmarks now enter the Seattle demo; incompatible routes are retired.
  if (params.has("world") && params.get("world") !== "seattle") params.delete("race");
  if (params.get("race") === "crane-to-crest") params.delete("race");
  params.set("world", "seattle");
  params.delete("route"); params.delete("environment"); params.delete("rival");
  history.replaceState(history.state, "", url);
  const raceId = params.get("race");
  if (raceId && raceId !== SEATTLE_RACE.id) throw new Error(`Unknown race '${raceId}'`);
  if (raceId) race = SEATTLE_RACE;
  const requested = params.get("lighting") ?? "night";
  if (requested !== "night" && requested !== "blockout") throw new Error(`Unknown lighting '${requested}'`);
  lighting = requested;
  await RAPIER.init();
  const model = new URLSearchParams(location.search).get("car") ?? restored.car;
  if (model !== "classic" && !isBlenderCarId(model)) throw new Error(`Unknown car model '${model}'`);
  selectedCar = model;
  carParts = model === "classic" ? createCar()
    : await loadBlenderCar(new URL(BLENDER_CARS[model].path, document.baseURI).href, model);
} catch (error) {
  document.body.dataset.assetState = "error";
  assetStatus.setAttribute("role", "alert");
  assetStatus.textContent = `Asset loading failed: ${error instanceof Error ? error.message : String(error)}. ` +
    "Refresh to retry. ?car=classic selects the primitive car.";
  // No invisible model or silent replacement when an authored asset breaks.
  throw error;
}

const input = createInputController();
const controls = createControlsPanel(input);
const roadWorld = createSeattleWorld(!!race);
const sim = createSim(restored.drivetrain, roadWorld, race ? { race } : {});
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts,
  roadWorld, lighting, sim.state.traffic, scene => addSeattle(scene, lighting), SEATTLE_RACE.checkpoints[0]!.radius);
document.body.dataset.world = "seattle";
document.title = "NIGHTSHIFT — Seattle";
document.querySelector("#brand > span")!.textContent = "NIGHTSHIFT / SEATTLE";
document.querySelector('[data-menu-screen="pause"] .menu-kicker')!.textContent = race ? "Seattle / Sound to Sky" : "Seattle / Free roam";
document.querySelector(".menu-lede")!.textContent = "From Wharf Garage to the waterfront and the hills. Find your own way through Seattle.";
document.querySelectorAll<HTMLButtonElement>("[data-district-map]").forEach(button => {
  button.addEventListener("click", () => { location.href = "./seattle.html"; });
});
document.body.dataset.assetState = "ready";
assetStatus.remove();
const modeElement = document.getElementById("mode")!;
const deviceElement = document.getElementById("device")!;
const telemetryElement = document.getElementById("telemetry")!;
const hudPolylines: HudPolyline[] = SEATTLE_STREETS.map(street => ({ points: street.points }));
const hud = createHud({ polylines: hudPolylines, topSpeed: HANDLING.topSpeed, garage: SEATTLE_GARAGE.entrance });
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

const menu = createMenuController({
  startTrack: () => {
    reset();
    input.armDrivingInputGate();
  },
  restartRun: () => {
    reset();
    input.armDrivingInputGate();
  },
  returnToMain: () => reset(),
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
    controls.screenChanged(screen);
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
        note: "No music found. Drop files in public/assets/music and run pnpm music:scan.",
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
const garageAvailable = () => canEnterGarage(SEATTLE_GARAGE, sim.state.vehicle, sim.state.race !== null);
garagePrompt.addEventListener("click", () => {
  if (menu.isGameplayActive() && garageAvailable()) menu.enterGarage();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) menu.pause();
});

function updateHud(): void {
  const car = sim.state.vehicle;
  const raceState = sim.state.race;
  hud.update(car, race && raceState ? {
    checkpoint: raceState.checkpoint, total: race.checkpoints.length, next: raceState.next,
    label: raceState.countdown > 0 ? String(Math.ceil(raceState.countdown / TICK_HZ))
      : `${raceState.finished ? "FIN " : ""}${formatRaceTime(raceState.ticks, TICK_HZ)}`,
  } : null);
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
  if (menu.isGameplayActive() && garageAvailable() && commands.some(command => command === "interact" || command === "confirm")) {
    menu.enterGarage();
  } else menu.handleCommands(commands);
  const gameplayActive = menu.isGameplayActive();
  const garageActive = menu.isGarageActive();
  garagePrompt.hidden = !gameplayActive || !garageAvailable();
  garagePrompt.textContent = input.gamepadName() ? "Cross / A · Enter Wharf Garage" : `${keyLabel(input.bindings().keyboard.interact)} / Enter · Enter Wharf Garage`;
  const resetRequested = input.consumeReset();
  const cameraResetRequested = input.consumeCameraReset();
  const debugToggleRequested = input.consumeDebugToggle();
  if (gameplayActive && resetRequested) reset();
  if ((gameplayActive || garageActive) && cameraResetRequested) resetViewCamera(view);
  if (gameplayActive && debugToggleRequested) debugVisible = !debugVisible;

  if (gameplayActive && !frozen) accumulator += frameDelta;
  else accumulator = 0;

  while (gameplayActive && accumulator >= DT) {
    const tickInput = input.sample();
    lastInput = tickInput;
    step(sim, tickInput);
    accumulator -= DT;
  }

  updateHud();
  // Once per frame, never inside the tick: audio reads the simulation and can
  // neither change it nor make a run irreproducible.
  audio?.update(sim.state.vehicle, lastInput, gameplayActive && !frozen);
  render(
    view,
    sim.state,
    frameDelta,
    gameplayActive || garageActive ? input.cameraLook() : { x: 0, y: 0 },
  );
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

// A race is a page-level choice, like a route: the button reloads into it.
document.querySelectorAll<HTMLButtonElement>("[data-race]").forEach(button => {
  button.addEventListener("click", () => {
    const params = new URLSearchParams(location.search);
    params.set("race", button.dataset.race!);
    location.search = params.toString();
  });
});

const debugApi = (window as unknown as { __ns: Parameters<typeof applyDeepLink>[0] }).__ns;
settings.preview(() => applyDeepLink(debugApi, location.search));
renderSettingsStatus();

modeElement.title = `${sim.state.physicsVersion} · Rapier ${RAPIER.version()} · ${TICK_HZ} Hz fixed simulation`;
requestAnimationFrame(frame);
