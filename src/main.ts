import RAPIER from "@dimforge/rapier3d-compat";
import {
  updateCustomization,
} from "./customization/customization.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController, mapGamepad } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CARS, isBlenderCarId, loadBlenderCar } from "./render/blender-car.ts";
import { BLENDER_COURSE_PATH } from "./render/course-asset-contract.ts";
import { loadBlenderCourse, type BlenderCourse } from "./render/blender-course.ts";
import { createView, render, resetViewCamera, setRival, setViewMode,
  type DistrictLighting } from "./render/scene.ts";
import { createSim, HANDLING, resetSim, step, DT, TICK_HZ,
  type Drivetrain, type Input, type Sim } from "./sim/sim.ts";
import { COURSE_POINTS, courseGap } from "./sim/track.ts";
import { createDistrictWorld, createFreeRoamWorld, districtRouteGap, DISTRICT_STREETS, getDistrictRoute,
  pathLength, routePoints, type DistrictRoute } from "./sim/district.ts";
import { BLACKGLASS_WORLD } from "./sim/road-world.ts";
import { createMenuController } from "./ui/menu.ts";
import { createHud, type HudPolyline } from "./ui/hud.ts";
import { createCarAudio, type CarAudio } from "./audio/engine-audio.ts";
import { loadSoundtrack, type Soundtrack } from "./audio/soundtrack.ts";
import { engineTone, tyreScrub, windLevel, type AudioLevels } from "./audio/audio-mix.ts";
import { createSettingsStore, settingsStatusMessage, withoutSettingsOverrides,
  type SettingsPatch, type SettingsUrlKey } from "./settings/settings.ts";

const settings = createSettingsStore(() => window.localStorage);
const restored = settings.get();

const assetStatus = document.getElementById("asset-status")!;
let carParts: CarView;
let course: BlenderCourse | null;
let rivalParts: CarView;
let districtRoute: DistrictRoute | null = null;
// The district is the game now, and free roam is how you meet it: no route
// picked, no line to follow, the whole network open. ?route= still overlays one
// of the guides for a specific study, and ?world=blackglass returns to the
// original closed course with its own geometry, physics and lighting.
let district = true;
let lighting: DistrictLighting = "night";
try {
  const params = new URLSearchParams(location.search);
  const world = params.get("world") ?? "district";
  if (world !== "blackglass" && world !== "district") throw new Error(`Unknown world '${world}'`);
  district = world === "district";
  const route = params.get("route");
  if (district && route) districtRoute = getDistrictRoute(route);
  // Night is the district's presentation. The flat work lighting the blockout
  // was judged under is still one parameter away, because a surface error is
  // easier to see under it than under neon.
  const requested = params.get("lighting") ?? "night";
  if (requested !== "night" && requested !== "blockout") throw new Error(`Unknown lighting '${requested}'`);
  lighting = requested;
  await RAPIER.init();
  const model = new URLSearchParams(location.search).get("car") ?? "blender";
  if (model !== "classic" && !isBlenderCarId(model)) throw new Error(`Unknown car model '${model}'`);
  const environment = new URLSearchParams(location.search).get("environment") ?? "blender";
  if (environment !== "blender" && environment !== "classic") throw new Error(`Unknown environment '${environment}'`);
  [carParts, course, rivalParts] = await Promise.all([
    model === "classic" ? Promise.resolve(createCar())
      : loadBlenderCar(new URL(BLENDER_CARS[model].path, document.baseURI).href, model),
    environment === "classic" ? Promise.resolve(null)
      : loadBlenderCourse(new URL(BLENDER_COURSE_PATH, document.baseURI).href),
    // The rival always drives the Bulwark: it is that car's whole reason to
    // exist, and a body you can tell apart at a glance is the point.
    loadBlenderCar(new URL(BLENDER_CARS.bulwark.path, document.baseURI).href, "bulwark"),
  ]);
} catch (error) {
  document.body.dataset.assetState = "error";
  assetStatus.setAttribute("role", "alert");
  assetStatus.textContent = `Asset loading failed: ${error instanceof Error ? error.message : String(error)}. ` +
    "Refresh to retry. ?car=classic or ?environment=classic explicitly selects the original asset.";
  // No invisible model or silent replacement when an authored asset breaks.
  throw error;
}

const input = createInputController();
const roadWorld = !district ? BLACKGLASS_WORLD
  : districtRoute ? createDistrictWorld(districtRoute) : createFreeRoamWorld();
const sim = createSim(restored.drivetrain, roadWorld);
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts, course,
  districtRoute, roadWorld, district, lighting);
if (district) {
  // The view's name follows the lighting. Night is the district's default now,
  // so a plain ?route= session is a night session and calling it a blockout in
  // the title and the pause menu is simply wrong.
  const view = lighting === "blockout" ? "Blockout" : "Night";
  const label = districtRoute ? `${districtRoute.name} ${view.toLowerCase()}` : "Blackglass District";
  document.body.dataset.world = "district";
  document.title = `NIGHTSHIFT — ${label}`;
  document.querySelector("#brand > span")!.textContent = `NIGHTSHIFT / ${districtRoute?.name ?? "FREE ROAM"}`;
  document.querySelector('[data-menu-screen="pause"] .menu-kicker')!.textContent =
    districtRoute ? `${districtRoute.name} / ${view}` : `Blackglass District / Free roam`;
  document.querySelector(".menu-lede")!.textContent = districtRoute
    ? `${(pathLength(routePoints(districtRoute)) / 1000).toFixed(2)} km guide over the district. Follow the coloured arrows, or ignore them.`
    : "One district, open. No route, no timing, no finish line — drive it and find out what it wants to be.";
}
document.querySelectorAll<HTMLButtonElement>("[data-district-map]").forEach(button => {
  button.addEventListener("click", () => {
    location.href = districtRoute ? `./district.html?route=${districtRoute.id}` : "./district.html";
  });
});
document.body.dataset.assetState = "ready";
assetStatus.remove();
const modeElement = document.getElementById("mode")!;
const deviceElement = document.getElementById("device")!;
const telemetryElement = document.getElementById("telemetry")!;
// The minimap draws the world the sim was given, not a second copy of it: free
// roam shows every street, a route guide highlights its own legs in its colour,
// and the closed circuit shows the lap.
const hudPolylines: HudPolyline[] = district
  ? [...DISTRICT_STREETS.map(street => ({ points: street.points })),
    ...(districtRoute ? [{ points: routePoints(districtRoute), color: districtRoute.color }] : [])]
  : [{ points: [...COURSE_POINTS, COURSE_POINTS[0]!], color: "#59d8ff" }];
const hud = createHud({ polylines: hudPolylines, topSpeed: HANDLING.topSpeed });
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

const inputLog: Input[] = [];
let lastRun: { drivetrain: Drivetrain; inputs: Input[] } | null = null;
let replay: Input[] | null = null;
let replayTick = 0;

// A recorded lap driven as an opponent, not a ghost of you: a second Sim fed
// the archived input log, stepped in the same fixed-tick loop so the two runs
// cannot drift apart. This is what law 2 was paid for — no AI is involved,
// because a deterministic input log already IS a driver.
//
// It has its own Rapier world, so it cannot touch you. That is deliberate for
// now: contact is the Bully's actual character and it needs one shared world
// with two bodies, which is a real change to a Sim that currently owns exactly
// one `body` and one `state.vehicle`. Worth doing once a car to chase has
// proven it fixes anything.
let rivalSim: Sim | null = null;
let rivalInputs: readonly Input[] = [];
let rivalTick = 0;
let rivalEnabled = new URLSearchParams(location.search).get("rival") !== "0";
const NEUTRAL_INPUT: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
const rivalRunning = () => rivalSim !== null && rivalTick < rivalInputs.length;

function startRival(run: { drivetrain: Drivetrain; inputs: readonly Input[] } | null): void {
  if (!rivalEnabled || !run || run.inputs.length === 0) {
    rivalSim = null;
    rivalInputs = [];
    rivalTick = 0;
    setRival(view, null);
    return;
  }
  // Reuse one world rather than leaking a Rapier world per restart.
  rivalSim ??= createSim(run.drivetrain, roadWorld);
  resetSim(rivalSim, run.drivetrain);
  rivalInputs = run.inputs;
  rivalTick = 0;
  setRival(view, rivalParts);
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
  // Whatever was just archived becomes the car you are racing next time round.
  startRival(lastRun);
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
  getCustomization: () => customization,
  selectDrivetrain: (drivetrain) => {
    if (drivetrain !== sim.state.drivetrain) {
      reset(false, drivetrain);
      input.armDrivingInputGate();
    }
    saveSettings({ drivetrain }, ["drivetrain"]);
  },
  customize: (category, optionId) => {
    customization = updateCustomization(customization, category, optionId);
    applyCarCustomization(view, customization);
    saveSettings({ customization: { [category]: customization[category] } }, [category]);
  },
  screenChanged: (screen) => setViewMode(view, screen === "garage" ? "garage" : "track"),
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

document.addEventListener("visibilitychange", () => {
  if (document.hidden) menu.pause();
});

function updateHud(): void {
  const car = sim.state.vehicle;
  hud.update(car, rivalSim?.state.vehicle ?? null);
  modeElement.textContent = replay ? `REPLAY ${Math.round((replayTick / replay.length) * 100)}%`
    : `LIVE / ${sim.state.drivetrain.toUpperCase()}${rivalRunning() ? " / RIVAL" : ""}`;
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
    lastInput = tickInput;
    step(sim, tickInput);
    // Same tick, same DT, so a recorded lap stays in step with the live one.
    // Past the end of the log it coasts on neutral rather than vanishing.
    if (rivalSim) {
      step(rivalSim, rivalInputs[rivalTick] ?? NEUTRAL_INPUT);
      rivalTick++;
    }
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
    rivalSim?.state.vehicle ?? null,
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
      // The rival advances here too, or a scripted run would silently desync
      // the two laps — the same reason the debug API clicks real menu buttons
      // rather than faking a state change.
      if (rivalSim) {
        step(rivalSim, rivalInputs[rivalTick] ?? NEUTRAL_INPUT);
        rivalTick++;
      }
    }
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
  rivalReport: (enabled?: boolean) => {
    if (enabled !== undefined && enabled !== rivalEnabled) {
      rivalEnabled = enabled;
      startRival(enabled ? lastRun : null);
    }
    const rival = rivalSim?.state.vehicle ?? null;
    const you = sim.state.vehicle;
    return {
      enabled: rivalEnabled,
      running: rivalRunning(),
      tick: rivalTick,
      ticks: rivalInputs.length,
      position: rival ? [Number(rival.x.toFixed(2)), Number(rival.y.toFixed(2)), Number(rival.z.toFixed(2))] as [number, number, number] : null,
      speed: rival ? Number(rival.speed.toFixed(2)) : null,
      // Distance ALONG the lap, not straight-line and emphatically not
      // CourseProjection.distance, which is the lateral offset from the
      // centreline and reads as a plausible sub-metre number for two cars a
      // hundred metres apart.
      gap: rival ? Number((districtRoute
        ? districtRouteGap(districtRoute, you.x, you.z, rival.x, rival.z)
        : courseGap(you.x, you.z, rival.x, rival.z)).toFixed(2)) : null,
    };
  },
  inputReport: () => {
    const pad = navigator.getGamepads().find(g => g?.connected && g.mapping === "standard") ?? null;
    return {
      gamepad: input.gamepadName(),
      axes: (pad?.axes ?? []).map(value => Number(value.toFixed(3))),
      pressedButtons: (pad?.buttons ?? []).flatMap((button, index) => button.pressed ? [index] : []),
      mapped: mapGamepad(pad),
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

const debugApi = (window as unknown as { __ns: Parameters<typeof applyDeepLink>[0] }).__ns;
settings.preview(() => applyDeepLink(debugApi, location.search));
renderSettingsStatus();

modeElement.title = `${sim.state.physicsVersion} · Rapier ${RAPIER.version()} · ${TICK_HZ} Hz fixed simulation`;
requestAnimationFrame(frame);
