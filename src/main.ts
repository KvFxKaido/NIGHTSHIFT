import RAPIER from "@dimforge/rapier3d-compat";
import {
  createDefaultCustomization,
  updateCustomization,
} from "./customization/customization.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CAR_PATH, loadBlenderCar } from "./render/blender-car.ts";
import { createView, render, resetViewCamera, setViewMode } from "./render/scene.ts";
import { createSim, resetSim, step, DT, TICK_HZ, type Drivetrain, type Input } from "./sim/sim.ts";
import { createMenuController } from "./ui/menu.ts";

const assetStatus = document.getElementById("asset-status")!;
let carParts: CarView;
try {
  await RAPIER.init();
  const model = new URLSearchParams(location.search).get("car") ?? "blender";
  if (model !== "blender" && model !== "classic") throw new Error(`Unknown car model '${model}'`);
  carParts = model === "classic" ? createCar()
    : await loadBlenderCar(new URL(BLENDER_CAR_PATH, document.baseURI).href);
} catch (error) {
  document.body.dataset.assetState = "error";
  assetStatus.setAttribute("role", "alert");
  assetStatus.textContent = `Car loading failed: ${error instanceof Error ? error.message : String(error)}. ` +
    "Refresh to retry, or use ?car=classic for the original procedural car.";
  // No invisible model or silent replacement when an authored asset breaks.
  throw error;
}

const input = createInputController();
const sim = createSim();
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts);
document.body.dataset.assetState = "ready";
assetStatus.remove();
const speedElement = document.getElementById("speed")!;
const gearElement = document.getElementById("gear")!;
const modeElement = document.getElementById("mode")!;
const deviceElement = document.getElementById("device")!;
const telemetryElement = document.getElementById("telemetry")!;
let customization = createDefaultCustomization();
applyCarCustomization(view, customization);

const inputLog: Input[] = [];
let lastRun: { drivetrain: Drivetrain; inputs: Input[] } | null = null;
let replay: Input[] | null = null;
let replayTick = 0;
let debugVisible = false;
// Set by __ns.freeze(): holds the fixed simulation still so a capture of a given
// state is the same image every time.
let frozen = false;

function reset(archive = true, drivetrain = sim.state.drivetrain): void {
  // A comparison is a new run, never a mid-replay physics change.
  if (drivetrain !== sim.state.drivetrain) lastRun = null;
  else if (archive && inputLog.length > 0) {
    lastRun = { drivetrain, inputs: inputLog.slice() };
  }
  inputLog.length = 0;
  replay = null;
  replayTick = 0;
  resetSim(sim, drivetrain);
  resetViewCamera(view);
}

function beginReplay(): void {
  const source = inputLog.length > 0
    ? { drivetrain: sim.state.drivetrain, inputs: inputLog.slice() } : lastRun;
  if (!source) return;
  reset(false, source.drivetrain);
  lastRun = source;
  replay = source.inputs;
}

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
  selectDrivetrain: (drivetrain) => {
    if (drivetrain === sim.state.drivetrain) return;
    reset(false, drivetrain);
    input.armDrivingInputGate();
  },
  customize: (category, optionId) => {
    customization = updateCustomization(customization, category, optionId);
    applyCarCustomization(view, customization);
  },
  screenChanged: (screen) => setViewMode(view, screen === "garage" ? "garage" : "track"),
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) menu.pause();
});

function updateHud(): void {
  const car = sim.state.vehicle;
  speedElement.textContent = Math.round(car.speed * 2.237).toString().padStart(3, "0");
  gearElement.textContent = car.forwardSpeed < -0.5 ? "R" : car.speed < 0.5 ? "N" : "D";
  modeElement.textContent = replay ? `REPLAY ${Math.round((replayTick / replay.length) * 100)}%`
    : `LIVE / ${sim.state.drivetrain.toUpperCase()}`;
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
  const frameDelta = Math.min(0.1, (now - last) / 1000);
  last = now;

  input.update();
  menu.handleCommands(input.consumeMenuCommands());
  const gameplayActive = menu.isGameplayActive();
  const garageActive = menu.isGarageActive();
  const resetRequested = input.consumeReset();
  const cameraResetRequested = input.consumeCameraReset();
  const replayRequested = input.consumeReplay();
  const debugToggleRequested = input.consumeDebugToggle();
  if (gameplayActive && resetRequested) reset();
  if ((gameplayActive || garageActive) && cameraResetRequested) resetViewCamera(view);
  if (gameplayActive && replayRequested) beginReplay();
  if (gameplayActive && debugToggleRequested) debugVisible = !debugVisible;

  if (gameplayActive && !frozen) accumulator += frameDelta;
  else accumulator = 0;

  while (gameplayActive && accumulator >= DT) {
    let tickInput: Input;
    if (replay) {
      tickInput = replay[replayTick] ?? { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
      replayTick++;
      if (replayTick >= replay.length) {
        replay = null;
        replayTick = 0;
        inputLog.length = 0;
      }
    } else {
      tickInput = input.sample();
      inputLog.push(tickInput);
    }
    step(sim, tickInput);
    accumulator -= DT;
  }

  updateHud();
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
  // Ticks the same way the live loop does, so a scripted run stays a real run:
  // the input still lands in the log and replay reproduces it.
  advance: (ticks, tickInput) => {
    for (let index = 0; index < ticks; index++) {
      inputLog.push(tickInput);
      step(sim, tickInput);
    }
  },
  renderOnce: (frames = 1) => {
    for (let index = 0; index < frames; index++) renderFrame(DT);
  },
  setFrozen: (value) => { frozen = value; },
  isFrozen: () => frozen,
  setTelemetry: (visible) => { debugVisible = visible; },
  pause: () => menu.pause(),
});

const debugApi = (window as unknown as { __ns: Parameters<typeof applyDeepLink>[0] }).__ns;
applyDeepLink(debugApi, location.search);

modeElement.title = `${sim.state.physicsVersion} · Rapier ${RAPIER.version()} · ${TICK_HZ} Hz fixed simulation`;
requestAnimationFrame(frame);
