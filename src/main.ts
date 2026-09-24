import { addWharfArena } from "./render/wharf-arena.ts";
import { createLiveryEditor } from "./ui/livery.ts";
import { padLabel, refreshControlHints } from "./ui/prompts.ts";
import { DRIFT_YARD, SABLE, YARD_LINE } from "./sim/drift-yard.ts";
import { SABLE_DRIFT, sableDriftFor } from "./sim/drift-event.ts";
import { addDriftYard } from "./render/drift-yard.ts";
import { HARBOR_DRAG, DRAG_START, RIVET, RIVET_DRAG_DRIVER } from "./sim/drag-event.ts";
import { addDragStrip } from "./render/drag-strip.ts";
import { createGameMap } from "./ui/game-map.ts";
import { createPerformanceOverlay } from "./ui/performance.ts";
import { createSaveStore, isSaveId, type DriveSave } from "./settings/saves.ts";
import { BULWARK_PRICE, createProgressStore, ownsCar, sameRaceBuild, type CareerResult } from "./settings/progress.ts";
import { BLACKLIST, blacklistName, stagePayout, type BlacklistName } from "./settings/blacklist.ts";
import { safeSavePosition } from "./settings/save-position.ts";
import { createSavesPanel } from "./ui/saves.ts";
import { createPlaylistStore } from "./settings/playlist.ts";
import { createRaceListPanel } from "./ui/race-list-panel.ts";
import { createBlacklistPanel } from "./ui/blacklist-panel.ts";
import { wonStages, type RaceLaunch } from "./ui/race-list.ts";
import { ALDER_CRUISE, nearbyChallenge } from "./sim/encounter.ts";
import { cardCopy, rivalCard, RIVAL_CARDS, type CardCopy, type RivalCard } from "./ui/rival-card.ts";
import type { SpotLight } from "three";
import { ALDER_RIVAL } from "./sim/alder-rival.ts";
import { createControlsPanel } from "./ui/controls.ts";
import { keyLabel } from "./input/bindings.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  updateCustomization, BODY_PRESET_CATEGORIES,
} from "./customization/customization.ts";
import { PLAYER_CAR_IDS, drivetrainFor } from "./customization/cars.ts";
import { renderCarStats } from "./ui/car-stats.ts";
import { applyDeepLink, installDebugApi } from "./debug/debug.ts";
import { createInputController, mapGamepad } from "./input/input.ts";
import { applyCarCustomization, createCar, type CarView } from "./render/car.ts";
import { BLENDER_CARS, isBlenderCarId, loadBlenderCar } from "./render/blender-car.ts";
import { drawnEffects, LOOKS, setLook, type Look } from "./render/cel.ts";
import { defaultPedalAssist } from "./sim/pedal-assist.ts";
import { addCelSmoke } from "./render/smoke.ts";
import { addGrass } from "./render/grass.ts";
import { blendPoses, capturePoses, type Poses } from "./render/interpolate.ts";
import { createDistrictBanner } from "./ui/district-banner.ts";
import { ALDER_NEIGHBOURHOODS, alderNeighbourhoodAt } from "./sim/alder-neighbourhoods.ts";
import { createView, render, resetViewCamera, setPlayerCar, setRivalCar, setParkedRivalCar, setViewMode,
  type DistrictLighting } from "./render/scene.ts";
import { CHASE_CAMERAS, nextChaseCamera } from "./render/camera.ts";
import { loadCameraPreference, saveCameraPreference } from "./settings/camera-preference.ts";
import { loadMusicPreference, saveMusicPreference } from "./settings/music-preference.ts";
import { carHandling, createSim, resetSim, leaveGarage, step, DT, TICK_HZ,
  type CarHandling, type Drivetrain, type Input } from "./sim/sim.ts";
import { createAlderWorld, ALDER_VERSION, ALDER_STREETS, ALDER_GARAGE, ALDER_GARAGE_EXIT, ALDER_RACE, ARENA_ROADS, ALDER_DRIVE_BOUNDS, alderHeight } from "./sim/alder.ts";
import { generatorRevision, seedFromTick } from "./sim/race-generator.ts";
import { generatedRaceId, parseGeneratedRaceId } from "./sim/race-id.ts";
import { authoredSprintFor } from "./sim/authored-sprints.ts";
import { alderCourseDraws } from "./sim/alder-course.ts";
import { recordedEvent, type RecordedEvent } from "./sim/recorded-event.ts";
import { BLACKLIST_CRUISERS, cruiserFor } from "./sim/alder-cruisers.ts";
import { circuitEvent, type CircuitEvent } from "./sim/circuits.ts";
import { withExits } from "./sim/rival.ts";
import { NO_RIVAL, rivalRevision } from "./sim/rival-revision.ts";
import { TRAFFIC_REVISION } from "./sim/traffic.ts";
import { bestLap, createLapRecorder, lapSession, recordTick, type LapRecorder } from "./sim/lap-recorder.ts";
import { createLapSaver, lapSessionId } from "./recording/save-laps.ts";
import { snapToLane, encodeStart } from "./sim/race-start.ts";
import type { RivalDefinition } from "./sim/rival.ts";
import type { RoadWorld } from "./sim/road-world.ts";
import { addAlder } from "./render/alder.ts";
import { canEnterGarage } from "./sim/garage.ts";
import { createMenuController } from "./ui/menu.ts";
import { createOptionRow } from "./ui/menu-rows.ts";
import { createHud, type HudPolyline } from "./ui/hud.ts";
import { formatRaceTime, racePosition, raceProgressLabel, type RaceDefinition } from "./sim/race.ts";
import { createCarAudio, type CarAudio } from "./audio/engine-audio.ts";
import { loadSoundtrack, type Soundtrack } from "./audio/soundtrack.ts";
import { loadMenuTheme, type MenuTheme } from "./audio/menu-theme.ts";
import { usesMenuTheme, type MenuScreen } from "./ui/menu-state.ts";
import { createGarageCutscene, advanceGarageCutscene, shotProgress, easeShot } from "./render/garage-cutscene.ts";
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
/** This build's identity for a generated course: its kind's generator revision and the map. */
const raceBuild = (raceId: string) => ({ generator: generatorRevision(raceId), world: ALDER_VERSION });
const progress = createProgressStore(() => window.localStorage, raceBuild, settings.get().car === "bulwark" || restored.car === "bulwark");
if (!ownsCar(progress.get(), restored.car)) restored.car = "cinder";
const playlist = createPlaylistStore(() => window.localStorage, raceBuild);
/** A beaten Blacklist name has left the streets: no cruise, no parked car, nobody to flash. */
const onTheStreets = (id: string) => (progress.get().names[id]?.wins ?? 0) < 3;
const streetCruisers = BLACKLIST_CRUISERS.filter(cruiser => onTheStreets(cruiser.id));
const money = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;

const assetStatus = document.getElementById("asset-status")!;
let carParts: CarView;
let rivalParts: CarView | null = null;
let rivetParts: CarView | null = null;
let sableParts: CarView | null = null;
/** Who a race fields: Rivet's Hammer on the strip; a rival's own car when the race id names one; otherwise Moth's Kestrel. */
const raceOpponentCar = () => (race?.kind === "drag" ? "hammer" : cruiserFor(race ? parseGeneratedRaceId(race.id)?.rival ?? authoredSprintFor(race.id)?.blacklist : null)?.car ?? "kestrel") as keyof typeof BLENDER_CARS;
/** The Blacklist names cruising their turfs in free roam, by id. */
const cruiserParts = new Map<string, CarView>();
let selectedCar = "cinder";
let race: RaceDefinition | null = null;
let rival: RivalDefinition | null = null;
/** Where a generated race starts: where the flash was, snapped to its lane. Null means the grid. */
let raceStart: RoadWorld["start"] | null = null;
/** A lapped circuit race, Ridge Circuit or a street circuit, solo or not. Its laps are recorded. */
let circuit: CircuitEvent | null = null;
/** What this race is recorded as, if it is: a circuit, or a generated race, which is one lap to the recorder
 *  (sim/recorded-event.ts). The replay check draws the same event from the session, so it is built there, not here. */
let recorded: RecordedEvent | null = null;
/** The flash a generated race was started from, as ?start= carried it: part of what a recording of it must name. */
let raceStartCode: string | null = null;
/** A generated race or Sound to Sky raced with nobody: `?solo=1`. Circuits carry solo in their race id. */
let solo = false;
let lighting: DistrictLighting = "night";
/** Draw between the last two ticks rather than at the last; `?smooth=0` turns it off. */
let smooth = true;
// How much of the pedals' excess the player's tyres forgive (SimOptions.pedalAssist):
// none by default, but all of it on the drag strip (sim/pedal-assist.ts). ?assist= is a
// developer comparison like ?drivetrain=: read from the URL, never saved.
let requestedAssist: number | null = null;
/** `?trafficSeed=`: every attempt at the race meets this traffic, to reproduce a report. A preview: never saved. */
let requestedTrafficSeed: number | null = null;
/** The tick before the last, taken before each live step; null when there is none to blend from. */
let previousPoses: Poses | null = null;
try {
  const url = new URL(location.href);
  const params = url.searchParams;
  if (requestedSave !== null) {
    // A slot is authoritative over preview links and always resumes free roam.
    for (const key of ["race", "car", "unlock", "drivetrain", "paint", "wheels", "stance", "drive", "freeze", "visit"]) params.delete(key);
    if (!loadedSave) { params.delete("save"); params.delete("scene"); }
  }
  // Old bookmarks now enter the Port Alder demo; incompatible routes are retired.
  // "seattle" is this city's old name; links carrying it are ours, not another world's.
  if (params.has("world") && !["alder", "seattle"].includes(params.get("world")!)) params.delete("race");
  if (params.get("race") === "crane-to-crest") params.delete("race");
  params.set("world", "alder");
  params.delete("route"); params.delete("environment"); params.delete("rival");
  const requestedRace = params.get("race");
  if (requestedRace?.startsWith("gen-")) {
    const tagged = params.has("generator") || params.has("raceWorld");
    const linkedBuild = { generator: params.get("generator") ?? "", world: params.get("raceWorld") ?? "" };
    if ((tagged && !sameRaceBuild(linkedBuild, raceBuild(requestedRace)))
      || progress.isOutdatedRace({ raceId: requestedRace, start: params.get("start") })) {
      params.delete("race"); params.delete("start"); params.delete("generator"); params.delete("raceWorld");
      params.set("scene", "garage");
      loadNotice = "That saved course belongs to an older version. Your wins, cash and cars are unchanged.";
    }
  }
  history.replaceState(history.state, "", url);
  const raceId = params.get("race");
  // A generated race is its seed: ?race=gen-[<turf>-]<seed>[-variant] draws the
  // same gates and rival line every time (src/sim/race-id.ts), and a turf leans
  // the draw toward a rival's home ground (src/sim/alder-turf.ts).
  const generated = raceId ? parseGeneratedRaceId(raceId) : null;
  const circuitRace = raceId ? circuitEvent(raceId) : null;
  // An authored sprint is a generated course pinned as data (src/sim/authored-sprints.ts), built as one is.
  const authoredSprint = raceId ? authoredSprintFor(raceId) : null;
  if (raceId && !generated && !authoredSprint && !circuitRace && raceId !== ALDER_RACE.id && raceId !== HARBOR_DRAG.id && !sableDriftFor(raceId)) throw new Error(`Unknown race '${raceId}'`);
  // A generated race starts where the flash was: ?start=x,z,heading, snapped
  // to its lane again here so the pose the URL carries is the pose driven.
  // The authored race starts on the grid its line was authored from.
  const startParam = params.get("start");
  if (startParam && !generated) { params.delete("start"); history.replaceState(history.state, "", url); }
  if (generated || authoredSprint) {
    // A course that cannot be drawn is not a broken asset: return to the garage
    // and say why, rather than an error screen that refreshing only repeats.
    try {
      // Solo is part of the event here: it keeps the race's arrows, which come from the rival's route, and fields nobody.
      recorded = recordedEvent(raceId!, undefined, { start: startParam, solo: params.get("solo") === "1" })!;
      race = recorded.race; rival = recorded.rival; raceStart = recorded.start ?? null; solo = recorded.solo; raceStartCode = startParam;
    } catch (error) {
      for (const key of ["race", "start", "generator", "raceWorld", "solo"]) params.delete(key);
      params.set("scene", "garage");
      history.replaceState(history.state, "", url);
      loadNotice = `That race can't be drawn (${error instanceof Error ? error.message : String(error)}). Your wins, cash and cars are unchanged.`;
    }
  } else if (circuitRace) {
    circuit = circuitRace;
    recorded = { ...circuit, comparable: true };
    race = circuit.race; rival = circuit.rival; raceStart = circuit.start;
  } else if (raceId === HARBOR_DRAG.id) {
    race = HARBOR_DRAG; rival = RIVET_DRAG_DRIVER; raceStart = DRAG_START;
  } else if (sableDriftFor(raceId)) { race = sableDriftFor(raceId); raceStart = DRIFT_YARD.start;
  } else if (raceId) { race = ALDER_RACE; rival = ALDER_RIVAL; }
  // Solo keeps the race and its gate arrows, which come from the rival's line, and fields nobody.
  if (params.has("solo") && !solo) {
    solo = params.get("solo") === "1" && race !== null && rival !== null && race === ALDER_RACE;
    if (solo) { race = withExits(race!, rival!); rival = null; }
    else { params.delete("solo"); history.replaceState(history.state, "", url); }
  }
  const requested = params.get("lighting") ?? "night";
  if (requested !== "night" && requested !== "blockout") throw new Error(`Unknown lighting '${requested}'`);
  lighting = requested;
  // The cars and the buildings are drawn (render/cel.ts, render/drawn-buildings.ts),
  // set before any body loads. To compare: ?look=cel draws the cars alone,
  // ?look=cel-traffic the cars and traffic, ?look=fx undrawn cars with the drawn
  // smoke, and ?look=plain nothing drawn.
  const look = params.get("look") ?? "cel-city";
  if (look !== "plain" && !LOOKS.some(known => known === look)) throw new Error(`Unknown look '${look}'`);
  setLook(look === "plain" ? null : look as Look);
  // Draw between ticks (render/interpolate.ts); ?smooth=0 draws the last tick, to compare.
  smooth = params.get("smooth") !== "0";
  const assist = params.get("assist");
  if (assist !== null) {
    requestedAssist = Number(assist);
    if (!(requestedAssist >= 0 && requestedAssist <= 1)) throw new Error(`?assist= is a number from 0 to 1, not '${assist}'`);
  }
  const trafficSeed = params.get("trafficSeed");
  if (trafficSeed !== null) {
    requestedTrafficSeed = Number(trafficSeed);
    if (!(Number.isInteger(requestedTrafficSeed) && requestedTrafficSeed >= 0 && requestedTrafficSeed <= 0xffffffff)) {
      throw new Error(`?trafficSeed= is a whole number from 0 to 4294967295, not '${trafficSeed}'`);
    }
  }
  await RAPIER.init();
  const requestedCar = new URLSearchParams(location.search).get("car") ?? restored.car;
  // ?car=<id>&unlock=1 drives a car the career has not won, for pad testing a
  // tune against another (design/HANDLING.md, "Cars"). A developer preview beside
  // ?drivetrain= and ?paint=: read from the URL on every load and never written
  // anywhere. It cannot become ownership -- `selectCar` and the save both ask
  // `ownsCar` themselves -- so the garage still reads Locked and a slot saved
  // while driving one records the Cinder.
  const unlocked = new URLSearchParams(location.search).get("unlock") === "1";
  // The NS-01 became the car Sable drives. Old links still resolve, the way
  // ?world=seattle does, rather than failing to an asset-error screen.
  const model = requestedCar === "blender" || (isBlenderCarId(requestedCar) && !unlocked && !ownsCar(progress.get(), requestedCar))
    ? "cinder" : requestedCar;
  if (model !== "classic" && !isBlenderCarId(model)) throw new Error(`Unknown car model '${model}'`);
  selectedCar = model;
  carParts = model === "classic" ? createCar()
    : await loadBlenderCar(new URL(BLENDER_CARS[model].path, document.baseURI).href, model);
  {
    const opponent = raceOpponentCar();
    // A solo run has nobody to draw.
    if (!circuit?.solo && !solo && (race || !progress.get().mothBeaten)) rivalParts = await loadBlenderCar(new URL(BLENDER_CARS[opponent].path, document.baseURI).href, opponent);
    if (!race && onTheStreets(RIVET.id)) rivetParts = await loadBlenderCar(new URL(BLENDER_CARS.hammer.path, document.baseURI).href, "hammer");
    if (!race) await Promise.all(streetCruisers.map(async cruiser => {
      const car = cruiser.car as keyof typeof BLENDER_CARS;
      cruiserParts.set(cruiser.id, await loadBlenderCar(new URL(BLENDER_CARS[car].path, document.baseURI).href, car));
    }));
    if ((!race && onTheStreets(SABLE.id)) || race?.kind === "drift") sableParts = await loadBlenderCar(new URL(BLENDER_CARS.blender.path, document.baseURI).href, "blender");
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
if (loadedSave && progress.preserveLegacyOwnership()) settings.update({ ...loadedSave.build, car: restored.car });
const controls = createControlsPanel(input);
const visiting = !race ? [RIVET, SABLE].find(r => r.id === new URLSearchParams(location.search).get("visit")) : undefined;
// Development arrival shortcut: start inside the arena so its scale can be judged
// from the car. Normal drives, saves, visits and races retain their own starts.
const yardShellStart = import.meta.env?.DEV && !race && !visiting && !loadedSave
  && new URLSearchParams(location.search).get("yardShell") === "1"
  ? { x: -730, z: 1040, y: 2, heading: Math.PI / 2, pitch: 0 } : undefined;
const roadWorld = createAlderWorld(!!race || !!visiting || !!yardShellStart, raceStart ?? (visiting
  ? { ...visiting.start, x: visiting.start.x - 6, z: visiting.start.z + 18 } : yardShellStart));
let pendingSavePosition = loadedSave ? safeSavePosition(loadedSave, roadWorld, ALDER_DRIVE_BOUNDS) : null;
if (loadedSave && loadedSave.position && !pendingSavePosition) loadNotice = "Saved build loaded. Returning to Wharf Garage because the saved location is no longer clear.";
const pedalAssist = requestedAssist ?? defaultPedalAssist(race);
/**
 * The traffic an attempt at a race meets (2026-09-22). With none, a race from the grid met the same cars in the same
 * places every time, since the sim starts at tick 0 and traffic had no seed; Shawn noticed on the third restart. Each
 * attempt draws one here, outside the sim, which is why law 2 holds: the recording carries it and a replay meets the
 * same traffic. Free roam keeps seed 0.
 */
function attemptTrafficSeed(): number {
  return requestedTrafficSeed ?? (crypto.getRandomValues(new Uint32Array(1))[0]! || 1);
}
const sim = createSim(carHandling(selectedCar), roadWorld, race ? { pedalAssist, trafficSeed: attemptTrafficSeed(), race, rival: rival ?? undefined, traffic: race.kind !== "drag" && race.kind !== "drift" && (!circuit || circuit.traffic), parkedRivals: race.kind === "drift" ? [SABLE] : [] }
  : { pedalAssist, encounterRoute: progress.get().mothBeaten ? undefined : ALDER_CRUISE, parkedRivals: [RIVET, SABLE].filter(parked => onTheStreets(parked.id)),
    cruisers: streetCruisers.map(cruiser => ({ id: cruiser.id, name: cruiser.name, route: cruiser.route })) });
const view = createView(document.getElementById("view") as HTMLCanvasElement, carParts,
  roadWorld, lighting, sim.state.traffic, scene => addAlder(scene, lighting), ALDER_RACE.checkpoints[0]!.radius);
// A ?camera= link previews over this after boot (debug.ts) without saving.
view.chaseCamera = loadCameraPreference(() => window.localStorage);
if (drawnEffects()) view.celSmoke = addCelSmoke(view.scene);
view.grass = addGrass(view.scene, roadWorld);
if (rivalParts) setRivalCar(view, rivalParts);
if (rivetParts) setParkedRivalCar(view, RIVET.id, rivetParts);
for (const [id, parts] of cruiserParts) setParkedRivalCar(view, id, parts);
if (sableParts) {
  // No repaint: the NS-01 leaves the factory in signal red, which is the car
  // the portrait in design/reference/characters/sable has always described.
  // It was teal only so it could not be mistaken for the car the player drove.
  setParkedRivalCar(view, SABLE.id, sableParts);
}
const driftYardView = addDriftYard(view.scene, lighting === "night");
await addWharfArena(view.scene);
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
for (const road of ARENA_ROADS) hudPolylines.push({ points: road.points });
const hud = createHud({ polylines: hudPolylines, topSpeed: () => sim.state.handling.topSpeed, garage: ALDER_GARAGE.entrance });
let customization = restored.customization;
applyCarCustomization(view, customization);
const liveryEditor = createLiveryEditor({ car: () => view,
  restorePaint: () => applyCarCustomization(view, customization),
  editing: active => { view.garageLiveryEditing = active; },
  facePanel: panel => { view.garageYaw = ({ hood: -Math.PI / 4, roof: -Math.PI / 4, left: -Math.PI * .75, right: Math.PI / 4, rear: Math.PI * .75 }[panel]); },
});
// The Livery section's switch: the design on or off without opening the editor.
document.querySelector("[data-livery-row]")!.append(createOptionRow({
  id: "livery", label: "Design",
  options: () => [{ id: "on", label: "On" }, { id: "off", label: "Off" }],
  value: () => liveryEditor.enabled() ? "on" : "off",
  choose: id => liveryEditor.setEnabled(id === "on"),
}).element);

// Audio is presentation, so it lives beside the renderer and reads state after
// the ticks are done. Browsers refuse an AudioContext without a gesture, so the
// whole stack is built on the first click or key and the game runs silent until
// then rather than logging a failure nobody can act on.
let audio: CarAudio | null = null;
let soundtrack: Soundtrack | null = null;
let menuTheme: MenuTheme | null = null;
let radioBus: GainNode | null = null;
let audioStarting = false;
let frontEndMusic = true;
let enteredMenu = new URLSearchParams(location.search).has("scene");
let radioStarted = false;
let audioLevels: AudioLevels = restored.audio;
let musicPreference = loadMusicPreference(() => window.localStorage);
let lastInput: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

async function startAudio(): Promise<void> {
  if (audio) {
    if (audio.context.state === "suspended") void audio.context.resume().catch(() => {});
    menuTheme?.retry();
    return;
  }
  if (audioStarting) return;
  audioStarting = true;
  try {
    const context = new AudioContext();
    // Chrome hands back a suspended context unless the gesture is still live.
    if (context.state === "suspended") void context.resume().catch(() => {});
    audio = createCarAudio(context, audioLevels);
    radioBus = context.createGain();
    radioBus.gain.value = frontEndMusic ? 0 : 1;
    radioBus.connect(audio.musicBus);
    [soundtrack, menuTheme] = await Promise.all([
      loadSoundtrack(context, radioBus, document.baseURI, { shuffle: musicPreference.shuffle, dj: musicPreference.dj }),
      loadMenuTheme(context, audio.musicBus),
    ]);
    soundtrack.onChange(() => menu.refreshAudio());
    syncMenuMusic();
    menu.refreshAudio();
  } catch {
    // A blocked or unsupported AudioContext is not worth breaking a run over.
    audio = null;
  } finally {
    audioStarting = false;
  }
}

function syncMenuMusic(): void {
  menuTheme?.setActive(enteredMenu && frontEndMusic);
  if (audio && radioBus) {
    const now = audio.context.currentTime;
    radioBus.gain.cancelAndHoldAtTime(now);
    radioBus.gain.linearRampToValueAtTime(frontEndMusic ? 0 : 1, now + .8);
  }
  // Start the station on the first drive, then preserve the player's Play/Pause choice.
  if (!frontEndMusic && soundtrack && !radioStarted) {
    radioStarted = true;
    if (!soundtrack.isPlaying()) soundtrack.toggle();
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

/** A fresh run: the same car, a car (`carHandling`), or the same car on another layout. */
function reset(setup: Drivetrain | CarHandling = sim.state.handling): void {
  previousPoses = null;
  challengePending = false;
  flashRemaining = 0;
  // Another attempt at a race meets other traffic.
  if (race) sim.trafficSeed = attemptTrafficSeed();
  resetSim(sim, setup);
  resetViewCamera(view);
  // A reset breaks the input log, so the run after it is a new recording.
  newRecording();
}

// Lap recording: the circuits, lap by lap, and since 2026-09-20 every generated race, as one lap from the flag to its
// last gate (sim/recorded-event.ts). Each completed lap saves the whole session to recordings/laps through pnpm dev.
let recorder: LapRecorder | null = null;
const recording = { id: "", recordedAt: "", status: "" };
const saveLaps = createLapSaver();
function newRecording(): void {
  if (!recorded || !race) return;
  recorder = createLapRecorder(recorded.track);
  const now = new Date();
  Object.assign(recording, { id: lapSessionId(now, race.id), recordedAt: now.toISOString(), status: "REC" });
}
function recordStep(tickInput: Input): void {
  if (!recorder || !recorded || !race) return;
  if (!recordTick(recorder, tickInput, sim.state.vehicle, sim.state.race, TICK_HZ)) return;
  const session = lapSession(recorder, { id: recording.id, recordedAt: recording.recordedAt, world: roadWorld.id, arena: recorded.identity, rival: recorded.rival ? rivalRevision(recorded.rival) : NO_RIVAL,
    physics: sim.state.physicsVersion, tickHz: TICK_HZ, race: race.id, layout: recorded.layout, solo: recorded.solo, traffic: recorded.traffic,
    ...(recorded.traffic ? { trafficRevision: TRAFFIC_REVISION } : {}), ...(recorded.traffic && sim.trafficSeed ? { trafficSeed: sim.trafficSeed } : {}), laps: race.laps ?? 1,
    // A generated race's flash is part of what its id draws: without it the replay draws another race.
    ...(raceStartCode ? { startCode: raceStartCode } : {}),
    car: selectedCar, drivetrain: sim.state.drivetrain, carRevision: sim.state.handling.revision,
    // What the tyres forgave is part of how the lap was driven; replay drives it the same. Left out when it is the clamp, as every older session was.
    ...(sim.pedalAssist !== 1 ? { pedalAssist: sim.pedalAssist } : {}), start: roadWorld.start });
  const id = recording.id;
  recording.status = "SAVING";
  void saveLaps(session).then(result => {
    if (recording.id !== id) return;
    recording.status = result.ok ? `SAVED ${result.laps} LAP${result.laps === 1 ? "" : "S"}` : `NOT SAVED: ${result.error.toUpperCase()}`;
  });
}
newRecording();

// Cache each loaded body once; only the active body belongs to a scene.
const cars = new Map<string, CarView>([[selectedCar, carParts]]);
let carLoading = false;
let previewCar = selectedCar;
let previewRequest = 0;
const carLoads = new Map<string, Promise<CarView>>();
const equipCar = document.querySelector<HTMLButtonElement>("[data-equip-car]")!;
// A URL car override is a session preview until explicitly saved, even when
// its body is already the one being rendered and simulated.
function isEquippedCar(id: string): boolean {
  return id === selectedCar && !new URL(location.href).searchParams.has("car");
}
function showCar(parts: CarView): void {
  setPlayerCar(view, parts);
  applyCarCustomization(view, customization);
  liveryEditor.refresh();
}
async function previewGarageCar(id: typeof selectedCar): Promise<void> {
  if (!isBlenderCarId(id)) return;
  const request = ++previewRequest;
  previewCar = id;
  carLoading = true;
  carNote.textContent = "Loading preview…";
  renderCarSelection();
  try {
    let parts = cars.get(id);
    if (!parts) {
      let pending = carLoads.get(id);
      if (!pending) {
        pending = loadBlenderCar(new URL(BLENDER_CARS[id].path, document.baseURI).href, id);
        carLoads.set(id, pending);
        void pending.finally(() => carLoads.delete(id)).catch(() => {});
      }
      parts = await pending;
      cars.set(id, parts);
    }
    if (request !== previewRequest) return;
    showCar(parts);
    carNote.textContent = isEquippedCar(id) ? "Your equipped car." : "Preview only · Equip an owned car to take it to the street.";
  } catch {
    if (request !== previewRequest) return;
    previewCar = selectedCar;
    showCar(cars.get(selectedCar)!);
    carNote.textContent = "Could not load that preview. Browse to it again to retry.";
  } finally {
    if (request === previewRequest) { carLoading = false; renderCarSelection(); }
  }
}
function restoreEquippedCar(): void {
  ++previewRequest;
  previewCar = selectedCar;
  carLoading = false;
  showCar(cars.get(selectedCar)!);
  carNote.textContent = isEquippedCar(selectedCar) ? "Your equipped car." : "URL preview · Confirm to save this car.";
  renderCarSelection();
}
const carNote = document.querySelector<HTMLElement>("[data-car-status]")!;
const carName = (id: string) => BLACKLIST.find(name => name.car === id)?.carName ?? (id === "bulwark" ? "Bulwark" : "Cinder");
// The car is a row like any other setting (design/MENUS.md): left / right browse,
// and confirm is the Car section's own hint, Drive this car, when it can act.
const carRow = createOptionRow({
  id: "car", label: "Car", confirm: "hint",
  options: () => PLAYER_CAR_IDS.map(id => ({ id, label: carName(id) })),
  value: () => previewCar,
  choose: id => { void previewGarageCar(id as typeof selectedCar); },
});
// Kept for the browser checks that browse and read the car by the old selector's hooks.
carRow.element.querySelectorAll<HTMLElement>("[data-row-step]").forEach(step => { step.dataset.carCycle = step.dataset.rowStep; });
carRow.value.querySelector("span")!.dataset.carName = "";
document.querySelector("[data-car-row]")!.append(carRow.element);
function renderCarSelection(): void {
  renderCarStats(document.querySelector<HTMLElement>("[data-car-stats]")!, previewCar);
  const career = progress.get();
  const current = progress.current();
  const owner = BLACKLIST.find(name => name.car === previewCar);
  const owned = ownsCar(career, previewCar);
  carRow.render();
  document.querySelector<HTMLElement>("[data-car-meta]")!.textContent = `${(PLAYER_CAR_IDS as readonly string[]).indexOf(previewCar) + 1} / ${PLAYER_CAR_IDS.length} · ${drivetrainFor(previewCar).toUpperCase()}`;
  document.querySelector<HTMLElement>("[data-car-ownership]")!.textContent = owned ? (isEquippedCar(previewCar) ? "Equipped" : "Owned")
    : owner ? `Win the pink slip · #${owner.rank} ${owner.name}` : "For sale · $1,500";
  // A hint, so it is there only when it can act; the ownership line above says why not.
  equipCar.hidden = carLoading || !owned || isEquippedCar(previewCar);
  document.querySelector<HTMLButtonElement>("[data-open-livery]")!.disabled = carLoading || previewCar !== selectedCar;
  document.querySelectorAll<HTMLButtonElement>("[data-customization]").forEach(button => { button.disabled = carLoading || previewCar !== selectedCar; });
  // The livery's Design row is built above, not from the customization list, so it is locked here by name: on a car
  // only being browsed it would switch that car's saved design (design/MENUS.md: every customization row locks).
  document.querySelectorAll<HTMLButtonElement>("[data-livery-row] button").forEach(button => { button.disabled = carLoading || previewCar !== selectedCar; });
  document.querySelectorAll<HTMLElement>("[data-cinder-parts]").forEach(section => {
    section.hidden = previewCar !== "cinder";
    section.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
      button.disabled = previewCar !== "cinder" || carLoading || previewCar !== selectedCar;
    });
  });
  const buy = document.querySelector<HTMLButtonElement>("[data-buy-bulwark]")!;
  buy.hidden = career.bulwarkOwned || previewCar !== "bulwark";
  buy.disabled = career.cash < BULWARK_PRICE || carLoading;
  document.querySelector<HTMLElement>("[data-cash]")!.textContent = `Cash · $${career.cash.toLocaleString("en-US")}`;
  const replace = document.querySelector<HTMLButtonElement>("[data-replace-stage-race]")!;
  replace.hidden = !progress.outdatedChallenge();
  replace.textContent = `Replace outdated ${current?.name ?? ""} course`;
  document.querySelector<HTMLElement>("[data-career-status]")!.textContent = progress.unavailable()
    ? "Career progress could not be read or saved. Existing data has been left untouched."
    : progress.outdatedChallenge()
      ? `Your unfinished ${current!.name} course belongs to an older version. Replace it to continue; wins, cash and cars stay yours.`
    : blacklistStatus();
}
/** Where the career stands, in one line: the name it is on, that name's wins and next stage. */
function blacklistStatus(): string {
  const current = progress.current();
  if (!current) return "The Blacklist is yours · all ten names retired, every car owned.";
  const wins = progress.get().names[current.id]!.wins;
  return `#${current.rank} ${current.name} · ${wins}/3 wins · Next: ${current.stages[wins]!.name}. Win the pink slip to own the ${current.carName}. Cash and cars save automatically.`;
}
function selectCar(): void {
  const id = previewCar;
  if (carLoading || !ownsCar(progress.get(), id) || isEquippedCar(id)) return;
  if (!progress.preserveLegacyOwnership()) {
    carNote.textContent = "Could not save your existing ownership. Try selecting again.";
    return;
  }
  selectedCar = id;
  saveSettings({ car: id }, ["car"]);
  const carUrl = new URL(location.href);
  carUrl.searchParams.delete("drivetrain");
  history.replaceState(history.state, "", carUrl);
  const yaw = view.garageYaw;
  if (carHandling(id) !== sim.state.handling) {
    reset(carHandling(id));
    input.armDrivingInputGate();
  }
  view.garageYaw = yaw;
  carNote.textContent = "Equipped · Ready to drive out.";
  renderCarSelection();
}
renderCarSelection();
equipCar.addEventListener("click", selectCar);
document.querySelector<HTMLButtonElement>("[data-buy-bulwark]")!.addEventListener("click", () => {
  const outcome = progress.buyBulwark();
  carNote.textContent = outcome === "purchased" ? "Bulwark purchased. Choose Drive this car to equip it."
    : outcome === "owned" ? "You already own the Bulwark."
    : outcome === "insufficient" ? "You need $1,500 to buy the Bulwark."
    : "Purchase could not be saved. No cash was spent; try again.";
  renderCarSelection();
});
document.querySelector<HTMLButtonElement>("[data-replace-stage-race]")!.addEventListener("click", () => {
  carNote.textContent = progress.discardOutdatedChallenge()
    ? `Old course replaced. Flash ${progress.current()?.name ?? "them"} to draw this stage again.`
    : "Could not replace the course. Existing progress is unchanged; try again.";
  renderCarSelection();
});

const savePanel = createSavesPanel(saves, () => ({
  world: roadWorld.id,
  build: { car: ownsCar(progress.get(), selectedCar) ? selectedCar : "cinder", customization: { ...customization } },
  position: race ? null : { x: sim.state.vehicle.x, z: sim.state.vehicle.z, heading: sim.state.vehicle.heading },
}));
/** Whether a drive is under way, so the race list can draw a race from where the car is. */
let onTheStreet = false;
let previousScreen: MenuScreen = "main";
const reducedGarageMotion = matchMedia("(prefers-reduced-motion: reduce)");
const garageShotSkip = document.querySelector<HTMLButtonElement>("#garage-shot-skip")!;
function finishGarageShot(): void {
  if (!view.garageCutscene) return;
  view.garageCutscene.elapsed = view.garageCutscene.duration;
  // Draw the exact endpoint before releasing either the controls or the camera.
  render(view, sim.state, 0, { x: 0, y: 0 });
  view.garageCutscene = undefined;
  delete document.body.dataset.garageCinematic;
  document.getElementById("menu-root")!.inert = false;
  garageShotSkip.hidden = true;
  // Enter can trigger the skip button's native click before the input queue
  // drains. Do not let that same press activate a garage item or re-enter it.
  input.consumeMenuCommands();
  previousPoses = null;
  input.armDrivingInputGate();
  if (view.mode === "garage") menu.restoreFocus();
  else view.renderer.domElement.focus({ preventScroll: true });
}
function beginGarageShot(kind: "enter" | "exit"): void {
  if (reducedGarageMotion.matches) return;
  const car = sim.state.vehicle;
  const roll = canEnterGarage(ALDER_GARAGE, car, !!race) && Math.abs(car.heading - Math.PI / 2) < .15;
  view.garageCutscene = createGarageCutscene(kind, roll);
  document.body.dataset.garageCinematic = kind;
  document.body.style.setProperty("--garage-shot-fade", "1");
  document.getElementById("menu-root")!.inert = true;
  garageShotSkip.hidden = false;
  garageShotSkip.focus();
}
garageShotSkip.addEventListener("click", finishGarageShot);
reducedGarageMotion.addEventListener("change", event => { if (event.matches) finishGarageShot(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) finishGarageShot(); });
const menu = createMenuController({
  enterMenu: () => {
    enteredMenu = true;
    void startAudio();
    syncMenuMusic();
  },
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
    const changed = category === "bodyKit" ? BODY_PRESET_CATEGORIES : [category];
    saveSettings({ customization: Object.fromEntries(changed.map(key => [key, customization[key]])) }, changed);
  },
  screenChanged: (screen, state) => {
    const from = previousScreen;
    previousScreen = screen;
    if (view.garageCutscene) finishGarageShot();
    frontEndMusic = usesMenuTheme(state);
    syncMenuMusic();
    if (screen !== "garage") {
      liveryEditor.close(false);
      restoreEquippedCar();
    }
    performanceOverlay.reset();
    if (screen === "main") savePanel.refreshSummary();
    controls.screenChanged(screen);
    if (screen === "map") gameMap.open();
    if (screen === "playing" || screen === "pause") onTheStreet = true;
    else if (screen === "main") onTheStreet = false;
    if (screen === "races") raceList.render();
    if (screen === "blacklist") blacklistPanel.render();
    if (screen === "playing" && from === "garage" && !race) {
      leaveGarage(sim, ALDER_GARAGE_EXIT);
      previousPoses = null;
      resetViewCamera(view);
    }
    setViewMode(view, screen === "garage" ? "garage" : screen === "main" ? "main" : "track");
    if (screen === "garage" && from !== "garage") beginGarageShot("enter");
    else if (screen === "playing" && (from === "garage" || from === "main")
      && canEnterGarage(ALDER_GARAGE, sim.state.vehicle, !!race)) beginGarageShot("exit");
  },
  getAudioLevels: () => audioLevels,
  setAudioLevel: (channel, value) => {
    audioLevels = { ...audioLevels, [channel]: value };
    audio?.setLevels({ [channel]: value });
    saveSettings({ audio: { [channel]: value } }, []);
  },
  soundtrackLabel: () => {
    // The two modes read the same on every path, whether or not anything can play.
    const modes = { shuffle: soundtrack?.isShuffled() ?? musicPreference.shuffle,
      dj: soundtrack?.isDjOn() ?? musicPreference.dj, hasDj: (soundtrack?.djClips().length ?? 0) > 0 };
    if (frontEndMusic) return { note: "Radio starts when you enter a drive. Music volume also controls the menu theme.", playing: false, enabled: false, ...modes };
    if (!audio) return { note: "Click or press a key to start audio.", playing: false, enabled: false, ...modes };
    const tracks = soundtrack?.tracks() ?? [];
    if (!tracks.length) {
      return {
        note: "No soundtrack tracks are installed.",
        playing: false,
        enabled: false,
        ...modes,
      };
    }
    if (soundtrack?.failed()) {
      return { note: "None of the tracks would load. Run pnpm music:scan and reload.", playing: false, enabled: true, ...modes };
    }
    const playing = soundtrack?.isPlaying() ?? false;
    const current = soundtrack?.nowPlaying();
    return {
      note: current ? `Now playing: ${current.title}` : soundtrack?.onAir() ? "On air: the DJ, between songs."
        : `${tracks.length} track${tracks.length === 1 ? "" : "s"} ready.`,
      playing,
      enabled: true,
      ...modes,
    };
  },
  soundtrack: (command) => {
    if (command === "shuffle") {
      musicPreference = { ...musicPreference, shuffle: !(soundtrack?.isShuffled() ?? musicPreference.shuffle) };
      soundtrack?.setShuffle(musicPreference.shuffle);
      saveMusicPreference(() => window.localStorage, musicPreference);
    } else if (command === "dj") {
      musicPreference = { ...musicPreference, dj: !(soundtrack?.isDjOn() ?? musicPreference.dj) };
      soundtrack?.setDj(musicPreference.dj);
      saveMusicPreference(() => window.localStorage, musicPreference);
    } else if (command === "toggle") soundtrack?.toggle();
    else if (command === "next") soundtrack?.next();
    else soundtrack?.previous();
  },
});

for (const event of ["pointerdown", "keydown"] as const) {
  window.addEventListener(event, () => void startAudio());
}

const garagePrompt = document.getElementById("garage-entry") as HTMLButtonElement;
const garageAvailable = () => canEnterGarage(ALDER_GARAGE, sim.state.vehicle, sim.state.race !== null);
garagePrompt.addEventListener("click", () => {
  if (!view.garageCutscene && menu.isGameplayActive() && garageAvailable()) menu.enterGarage();
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
/** Seeds a flash or a drawn race tries, in order, before saying nothing draws from here. Salts on the flash's tick. */
const DRAW_SEEDS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
let flashRemaining = 0;
let challengePending = false;
let challengeRival: string | null = null;
let challengeNotice = "";
const challengeTarget = () => nearbyChallenge(sim.state.vehicle, sim.state.encounter, sim.state.parkedRivals, !!sim.state.race, sim.state.cruisers);
const flashLabel = () => input.activeGamepadName()
  ? padLabel(input.bindings().gamepad.flash, input.activeGamepadName())
  : keyLabel(input.bindings().keyboard.flash);
function loadDrive(raceId: string | null, scene: "track" | "garage" = "track", start: string | null = null, soloRace = false): void {
  const url = new URL(location.href);
  if (soloRace) url.searchParams.set("solo", "1"); else url.searchParams.delete("solo");
  if (raceId) url.searchParams.set("race", raceId); else url.searchParams.delete("race");
  if (raceId?.startsWith("gen-")) {
    url.searchParams.set("generator", raceBuild(raceId).generator);
    url.searchParams.set("raceWorld", raceBuild(raceId).world);
  } else { url.searchParams.delete("generator"); url.searchParams.delete("raceWorld"); }
  if (start) url.searchParams.set("start", start); else url.searchParams.delete("start");
  url.searchParams.set("scene", scene);
  url.searchParams.set("car", selectedCar);
  url.searchParams.delete("save");
  // Race transitions retain the loaded slot's build without changing other slots.
  url.searchParams.set("drivetrain", sim.state.drivetrain);
  for (const [key, value] of Object.entries(customization)) url.searchParams.set(key, value);
  for (const key of ["drive", "freeze", "rival", "visit", "trafficSeed"]) url.searchParams.delete(key);
  location.href = url.href;
}
/** Seconds the brand line keeps naming the camera after a change. */
let cameraNoticeRemaining = 0;
/** And the track after a skip, or why nothing played. */
let trackNoticeRemaining = 0;
let trackNotice = "";
const districtBanner = createDistrictBanner();
const districtName = document.getElementById("district-name")!;
let districtShown: string | null = null;
/** The neighbourhood's name as you cross in (ui/district-banner.ts). Free roam
 *  only: a race's readout sits where it would. */
function updateDistrictName(frameDelta: number, driving: boolean): void {
  const here = alderNeighbourhoodAt(sim.state.vehicle.x, sim.state.vehicle.z)?.id ?? null;
  const named = driving && !race ? districtBanner.update(here, frameDelta) : null;
  if (named === districtShown) return;
  if (named) districtName.querySelector("strong")!.textContent = ALDER_NEIGHBOURHOODS.find(n => n.id === named)!.name;
  districtName.classList.toggle("shown", named !== null);
  districtShown = named;
}
function cycleCamera(): void {
  view.chaseCamera = nextChaseCamera(view.chaseCamera);
  saveCameraPreference(() => window.localStorage, view.chaseCamera);
  // A deliberate choice beats a ?camera= preview on refresh, like garage choices.
  const url = new URL(location.href);
  if (url.searchParams.has("camera")) { url.searchParams.delete("camera"); history.replaceState(history.state, "", url); }
  cameraNoticeRemaining = 1.6;
}
/** D-pad Left / Right on the road. A skip asks for music, so it starts the
 *  soundtrack if it was off; the menu's Pause is still how it stops. */
function skipTrack(direction: -1 | 1): void {
  if (!soundtrack?.tracks().length) trackNotice = audio ? "NO MUSIC INSTALLED" : "CLICK OR PRESS A KEY FOR AUDIO";
  else {
    if (direction > 0) soundtrack.next(); else soundtrack.previous();
    if (!soundtrack.isPlaying()) soundtrack.toggle();
    const title = soundtrack.nowPlaying()?.title.toUpperCase() ?? "";
    trackNotice = title.length > 48 ? `${title.slice(0, 47)}…` : title;
  }
  trackNoticeRemaining = 2.5;
}
function flashHeadlights(): void {
  if (!menu.isGameplayActive() || flashRemaining > 0) return;
  flashRemaining = .8;
  challengeNotice = "";
  challengeRival = challengeTarget();
  challengePending = challengeRival !== null;
}
rivalPrompt.addEventListener("click", flashHeadlights);
// The limit, felt: rumble while the pedals ask the tyres for more than they have,
// only under an ?assist= preview, where going past it costs something. Presentation
// only, and at most twenty times a second; a pad with no actuator is skipped.
let nextRumble = 0;
function rumblePedals(active: boolean): void {
  if (sim.pedalAssist === 1 || !active || performance.now() < nextRumble) return;
  const over = Math.max(sim.pedalFeedback.spin, sim.pedalFeedback.lock);
  if (over <= 0.05) return;
  nextRumble = performance.now() + 50;
  for (const pad of navigator.getGamepads?.() ?? []) {
    const actuator = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (kind: string, effect: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    actuator?.playEffect?.("dual-rumble", { duration: 70, weakMagnitude: Math.min(1, over * 0.7), strongMagnitude: Math.min(1, sim.pedalFeedback.lock * 0.5) })?.catch(() => {});
  }
}

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
    const name = blacklistName(challengeRival);
    if (!name) return;
    const here = snapToLane(ALDER_STREETS, sim.state.vehicle, alderHeight);
    const start = here ? encodeStart(here) : null;
    // Only the name the career is on races for a stage (settings/blacklist.ts). A drag or drift stage runs
    // its event; a generated stage draws once at the flash position and losses retry that same draw. Only a
    // course that draws is accepted or handed back (src/sim/alder-course.ts).
    const outcome = progress.flashName(name.id, DRAW_SEEDS.map(salt => seedFromTick(sim.state.tick, salt)), start,
      course => alderCourseDraws(course.raceId, course.start));
    if ("event" in outcome) { loadDrive(outcome.event); return; }
    if ("race" in outcome) { loadDrive(outcome.race.raceId, "track", outcome.race.start); return; }
    if (outcome.none === "not-yet") { freeRace(name, start); return; }
    challengeNotice = outcome.none === "unavailable" ? "Could not save challenge · Flash again to retry"
      : outcome.none === "outdated" ? "Course out of date · Replace it at the garage"
      : outcome.none === "undrawable" ? "No race from here · Drive on and flash again" : `${name.name} retired · Return to the garage`;
  }
}
/** A name above the one the career is on races for nothing: its race from here, in its own car. */
function freeRace(name: BlacklistName, start: string | null): void {
  if (name.id === SABLE.id) { loadDrive(SABLE_DRIFT.id); return; }
  if (name.id === RIVET.id) { loadDrive(HARBOR_DRAG.id); return; }
  const cruiser = cruiserFor(name.id);
  if (!cruiser) return;
  for (const salt of DRAW_SEEDS) {
    const raceId = generatedRaceId({ seed: seedFromTick(sim.state.tick, salt), kind: cruiser.kind, rival: cruiser.id });
    if (alderCourseDraws(raceId, start)) { loadDrive(raceId, "track", start); return; }
  }
  challengeNotice = "No race from here · Drive on and flash again";
}
/** The card of the name the career is on offers its next stage and what it pays; anyone above races for nothing. */
function careerCard(contact: RivalCard): RivalCard {
  const name = blacklistName(contact.id), current = progress.current();
  if (!name || !current) return contact;
  if (name.id !== current.id) return { ...contact, offer: `${contact.offer} · #${name.rank}, no stakes yet` };
  const index = progress.get().names[name.id]!.wins, stage = name.stages[index]!;
  const target = sableDriftFor(stage.event)?.drift?.targetScore;
  return { ...contact, accepted: stage.name,
    offer: `${stage.name} · ${stage.kind}${target ? ` ${target.toLocaleString("en-US")} pts` : ""} · ${money(stagePayout(name.rank, index))}${index === 2 ? ` + ${name.carName}` : ""}` };
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
    dragControls.textContent = `${up} UP / ${down} DOWN / ${input.activeGamepadName() ? "Stick" : `${keyLabel(bindings.keyboard.left)} or ${keyLabel(bindings.keyboard.right)}`} lane`;
  }
  const rival = sim.state.rival;
  const position = race && raceState && rival ? racePosition(race,
    { race: raceState, x: car.x, z: car.z },
    { race: rival.race, x: rival.vehicle.x, z: rival.vehicle.z }) : null;
  const lastLap = recorder?.laps.at(-1);
  const lapNote = lastLap ? ` · LAST ${formatRaceTime(lastLap.endTick - lastLap.startTick, TICK_HZ)}${lastLap.valid ? "" : " OFF"}` : "";
  // The launch (src/sim/launch.ts): what it is worth while charging, how it went once the flag drops.
  const launch = car.launch;
  const launchNote = !launch ? ""
    : launch.charge > 0 ? ` · LAUNCH ${Math.round(launch.charge * 100)}%`
    : raceState && raceState.countdown > 0 ? " · HOLD HANDBRAKE + GAS"
    : launch.feedbackTicks > 0 ? ` · ${launch.feedback}` : "";
  hud.update(car, race && raceState ? {
    progressLabel: raceProgressLabel(race, raceState), targets: race.kind === "drift" ? [race.drift!.zones[raceState.drift!.nextZone]!] : raceState.targets,
    checkpoint: raceState.checkpoint, total: race.checkpoints.length, next: raceState.next,
    label: raceState.countdown > 0 ? `${Math.ceil(raceState.countdown / TICK_HZ)}${launchNote}`
      : race.kind === "drift" ? `${Math.ceil(Math.max(0, race.drift!.durationTicks - raceState.ticks) / TICK_HZ)}s LEFT`
      : `${raceState.disqualified ? "DQ " : raceState.finished ? position === 1 ? "WIN " : "FIN " : ""}${formatRaceTime(raceState.ticks, TICK_HZ, race.kind === "drag" ? 3 : 1)}${position ? ` · P${position}/2` : ""}${rival?.race.finished && !raceState.finished ? (rival.race.disqualified ? " · RIVAL DQ" : " · RIVAL FIN") : ""}${lapNote}${launchNote}`,
  } : null,
  // Every rival gets a blip, pinned to the minimap rim when off the disc, as in Midnight Club 3.
  [rival?.vehicle, sim.state.encounter, ...sim.state.parkedRivals.map(parked => parked.vehicle), ...sim.state.cruisers.map(cruiser => cruiser.vehicle)]
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => !!vehicle),
  // The tachometer follows the engine you hear; the sim has no gears outside drag races.
  { rpm: engineTone(car, lastInput, sim.state.handling.topSpeed).rpm, redlineRpm: REDLINE_RPM });
  const driftPanel = document.getElementById("drift-instruments")!;
  driftPanel.hidden = !raceState?.drift;
  if (raceState?.drift) {
    const d = raceState.drift;
    document.getElementById("drift-chain")!.textContent = `+${Math.floor(d.chain)} x${d.multiplier}`;
    document.getElementById("drift-feedback")!.textContent = raceState.countdown > 0 ? `90s / BEAT SABLE / ${race!.drift!.targetScore.toLocaleString("en-US")} PTS` : d.feedbackTicks ? d.feedback : d.drifting ? `${Math.round(d.angle)} DEG / LINK THE NEXT CORNER` : "BUILD SPEED / TAP HANDBRAKE";
    document.getElementById("drift-zone")!.textContent = `NEXT: ${race!.drift!.zones[d.nextZone]!.name.toUpperCase()}`;
    const bindings = input.bindings();
    document.getElementById("drift-help")!.textContent = `${input.activeGamepadName() ? padLabel(bindings.gamepad.handbrake, input.activeGamepadName()) : keyLabel(bindings.keyboard.handbrake)}: initiate · Straighten to bank`;
  }
  modeElement.textContent = `${race ? race.name.toUpperCase() + " / " : ""}${recorder ? `${recording.status} / ` : ""}LIVE / ${sim.state.drivetrain.toUpperCase()}${sim.pedalAssist !== defaultPedalAssist(race) ? ` / ASSIST ${Math.round(sim.pedalAssist * 100)}%` : ""}`
    + (race && requestedTrafficSeed !== null ? ` / TRAFFIC ${requestedTrafficSeed}` : "")
    + (cameraNoticeRemaining > 0 ? ` / CAMERA ${CHASE_CAMERAS[view.chaseCamera].label.toUpperCase()}` : "")
    + (trackNoticeRemaining > 0 ? ` / ${trackNotice}` : "");
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
  menuTheme?.update();
  refreshControlHints(input.activeGamepadName(), input.bindings());
  const commands = input.consumeMenuCommands();
  garageShotSkip.textContent = input.activeGamepadName()
    ? `Skip · ${padLabel(0, input.activeGamepadName())} / Enter / Esc` : "Skip · Enter / Esc";
  if (view.garageCutscene) {
    if (commands.some(command => command === "confirm" || command === "back" || command === "pause")) finishGarageShot();
  } else if (menu.isGameplayActive() && garageAvailable() && commands.some(command => command === "interact" || command === "confirm")) {
    menu.enterGarage();
  } else if (!liveryEditor.handleBack(commands)) menu.handleCommands(commands);
  if (view.garageCutscene) {
    if (advanceGarageCutscene(view.garageCutscene, frameDelta)) finishGarageShot();
    else document.body.style.setProperty("--garage-shot-fade", String(1 - easeShot(shotProgress(view.garageCutscene) / .16)));
  }
  // After this frame's commands, so a menu they opened takes directions from the next key or frame on, and a
  // direction still held from driving into it counts once let go (input.ts, setMenuActive).
  input.setMenuActive(!menu.isGameplayActive() && !view.garageCutscene);
  const gameplayActive = menu.isGameplayActive() && !view.garageCutscene;
  const garageActive = menu.isGarageActive() && !view.garageCutscene;
  if (gameplayActive && commands.includes("flash")) flashHeadlights();
  // The card is the prompt: whoever the flash would reach, or whoever it just
  // did. A rival with no card cannot be offered, which is what the roster test
  // in tests/rival-card.test.ts is for.
  const contact = rivalCard(challengePending ? challengeRival : challengeTarget());
  rivalPrompt.hidden = !gameplayActive || !contact;
  if (contact) {
    const copy = cardCopy(careerCard(contact), challengePending, flashLabel());
    showRivalCard(challengeNotice ? { ...copy, action: challengeNotice } : copy);
  }
  garagePrompt.hidden = !gameplayActive || !garageAvailable() || !rivalPrompt.hidden;
  updateFlash(frameDelta, gameplayActive);
  updateDistrictName(frameDelta, gameplayActive && !frozen);
  garagePrompt.textContent = input.activeGamepadName() ? `${padLabel(0, input.activeGamepadName())} · Enter Wharf Garage` : `${keyLabel(input.bindings().keyboard.interact)} / Enter · Enter Wharf Garage`;
  const resetRequested = input.consumeReset();
  const cameraResetRequested = input.consumeCameraReset();
  const cameraCycleRequested = input.consumeCameraCycle();
  const trackSkip = input.consumeTrackSkip();
  const debugToggleRequested = input.consumeDebugToggle();
  if (gameplayActive && resetRequested) reset();
  if ((gameplayActive || garageActive) && cameraResetRequested) resetViewCamera(view);
  // The garage camera is fixed, so the cycle only means something on the street.
  if (gameplayActive && cameraCycleRequested) cycleCamera();
  cameraNoticeRemaining = Math.max(0, cameraNoticeRemaining - frameDelta);
  if (gameplayActive && trackSkip) skipTrack(trackSkip);
  trackNoticeRemaining = Math.max(0, trackNoticeRemaining - frameDelta);
  if (gameplayActive && debugToggleRequested) debugVisible = !debugVisible;

  if (gameplayActive && !frozen) accumulator += frameDelta;
  else accumulator = 0;

  const measuring = performanceOverlay.enabled();
  const simStart = measuring ? performance.now() : 0;
  while (gameplayActive && accumulator >= DT) {
    const tickInput = input.sample();
    lastInput = tickInput;
    if (smooth) previousPoses = capturePoses(sim.state);
    step(sim, tickInput);
    recordStep(tickInput);
    accumulator -= DT;
    if (sim.state.race?.finished && race?.kind === "drift") {
      const drift = sim.state.race.drift!;
      // Sable's stages are her yard at a rising target: beating the target is the win.
      saveRaceReward({ raceId: race.id, start: null, build: null, finished: true, disqualified: false, position: drift.won ? 1 : 2 });
      menu.finishRace(drift.won ? "Sable beaten" : "Target missed",
        `${Math.floor(drift.score)} / ${race.drift!.targetScore} points / ${drift.clips} clips / ${drift.transitions} transitions`);
      accumulator = 0;
      break;
    }
    if (sim.state.race?.finished && !sim.state.rival && circuit && race) {
      const best = bestLap(recorder?.laps ?? []);
      const valid = recorder?.laps.filter(lap => lap.valid).length ?? 0;
      menu.finishRace("Session complete", `${race.name} · ${formatRaceTime(sim.state.race.ticks, TICK_HZ)} · best lap ${best ? formatRaceTime(best.endTick - best.startTick, TICK_HZ, 2) : "none valid"} · ${valid}/${race.laps} laps valid`);
      accumulator = 0;
      break;
    }
    if (sim.state.race?.finished && !sim.state.rival && solo && race) {
      menu.finishRace("Finished", `${race.name} · Solo · ${formatRaceTime(sim.state.race.ticks, TICK_HZ)}`);
      renderKeep();
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
      saveRaceReward({ raceId: race.id, start: new URLSearchParams(location.search).get("start"), build: raceBuild(race.id), finished: sim.state.race.finished, disqualified: !!sim.state.race.disqualified, position });
      renderKeep();
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
  audio?.update(sim.state.vehicle, lastInput, gameplayActive && !frozen, sim.state.handling.topSpeed,
    // Heard only under a preview: at the default the tyres forgive everything, and a spin nobody pays for is noise.
    sim.pedalAssist !== 1 ? sim.pedalFeedback : undefined);
  rumblePedals(gameplayActive && !frozen);
  const renderStart = measuring ? performance.now() : 0;
  render(
    view,
    // Live play only: paused, frozen or scripted, the last tick is drawn exactly.
    smooth && previousPoses && gameplayActive && !frozen ? blendPoses(previousPoses, sim.state, accumulator / DT) : sim.state,
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
  setPedalAssist: value => { sim.pedalAssist = Math.max(0, Math.min(1, value)); reset(); input.armDrivingInputGate(); },
  canvas: view.renderer.domElement,
  // Scripted checks use the same fixed simulation as live driving.
  advance: (ticks, tickInput) => {
    for (let index = 0; index < ticks; index++) { step(sim, tickInput); recordStep(tickInput); }
    // Nothing to blend from across a scripted jump.
    previousPoses = null;
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
      engineHz: engineTone(vehicle, lastInput, sim.state.handling.topSpeed).frequency,
      scrub: tyreScrub(vehicle),
      wind: windLevel(vehicle),
      tracks: soundtrack?.tracks().length ?? 0,
      nowPlaying: soundtrack?.nowPlaying()?.title ?? null,
      menuTheme: menuTheme?.status() ?? null,
      frontEndMusic,
      radioGain: radioBus?.gain.value ?? 0,
    };
  },
});

// Leaving a race returns to the same city in free roam.
let pendingReward: CareerResult | null = null;
const retryReward = document.querySelector<HTMLButtonElement>("[data-retry-reward]")!;
function saveRaceReward(result: CareerResult): void {
  const outcome = progress.complete(result);
  const note = document.querySelector<HTMLElement>("[data-result-reward]")!;
  note.hidden = outcome === "none";
  const current = progress.current();
  // A stage can only have been won by the name the career was on: after a pink slip, the name below today's.
  const beaten = current ? BLACKLIST[BLACKLIST.indexOf(current) - 1] : BLACKLIST.at(-1);
  const wins = current ? progress.get().names[current.id]!.wins : 3;
  note.textContent = outcome === "awarded" && beaten
    ? `Pink slip won · +${money(stagePayout(beaten.rank, 2))} · ${beaten.carName} added to your garage. ${beaten.name} has left the streets. ${current ? `Next: #${current.rank} ${current.name}.` : "The Blacklist is yours."}`
    : outcome === "advanced" && current ? `+${money(stagePayout(current.rank, wins - 1))} · ${wins}/3 wins saved. Find ${current.name} for the ${current.stages[wins]!.name.toLowerCase()}.`
    : outcome === "recorded" ? "Stage already won · No additional payout."
    : outcome === "incompatible" ? "That course belongs to an older version. No progress or payout changed; return to the garage."
    : outcome === "unavailable" ? "Your win could not be saved. Retry before leaving to keep your progress and payout."
    : "";
  pendingReward = outcome === "unavailable" ? result : null;
  retryReward.hidden = pendingReward === null;
  renderCarSelection();
}
retryReward.addEventListener("click", () => { if (pendingReward) saveRaceReward(pendingReward); });
document.querySelectorAll<HTMLButtonElement>("[data-free-roam]").forEach(button => {
  button.hidden = !race;
  button.addEventListener("click", () => loadDrive(null));
});
document.querySelector<HTMLButtonElement>("[data-race-garage]")!.addEventListener("click", () => loadDrive(null, "garage"));

// The race list (design/PROCEDURAL_RACES.md, step 4): keep a generated race from
// its results, race anything listed with the rival or solo, or draw a new race
// from where the car is, as a flash used to before Moth's stages drew once.
const keepButton = document.querySelector<HTMLButtonElement>("[data-keep-race]")!;
const keepStatus = document.querySelector<HTMLElement>("[data-keep-status]")!;
const keptCourse = () => race?.id.startsWith("gen-") ? { raceId: race.id, start: new URLSearchParams(location.search).get("start") } : null;
function renderKeep(message = ""): void {
  const course = keptCourse();
  keepButton.hidden = !course;
  keepStatus.hidden = !message;
  keepStatus.textContent = message;
  if (!course) return;
  if (wonStages(progress.get()).some(({ race }) => race.raceId === course.raceId && race.start === course.start && sameRaceBuild(race.build, raceBuild(course.raceId)))) {
    keepButton.hidden = true;
    keepStatus.hidden = false;
    keepStatus.textContent = "Blacklist races you've won are in your race list.";
    return;
  }
  // Never disabled: a disabled button drops focus, and the next Confirm on a pad
  // would fall through to Return to free roam. Pressing it again says so instead.
  keepButton.textContent = playlist.has(course) ? "Kept in race list" : "Keep this race";
}
keepButton.addEventListener("click", () => {
  const course = keptCourse();
  if (!course || !race) return;
  const outcome = playlist.keep(course, race.name, Date.now());
  renderKeep(outcome === "kept" ? `“${race.name}” is in your race list.`
    : outcome === "already" ? "Already in your race list." : "Could not keep it. Your race list has been left untouched; try again.");
});
const blacklistPanel = createBlacklistPanel({
  career: () => progress.get(),
  unavailable: () => progress.unavailable(),
  card: id => { const card = rivalCard(id); return card ? { turf: card.turf, portrait: card.portrait.calm } : null; },
});
const raceList = createRaceListPanel({
  playlist,
  career: () => progress.get(),
  build: raceBuild,
  launch: (entry: RaceLaunch) => loadDrive(entry.raceId, "track", entry.start, entry.solo),
  drawBlocked: () => race ? "Leave this race to draw a new one."
    : !onTheStreet ? "Start a drive, then draw a race from wherever you are."
    : !snapToLane(ALDER_STREETS, sim.state.vehicle, alderHeight) ? "Get onto a street: a race starts from a lane." : null,
  draw: () => {
    const here = snapToLane(ALDER_STREETS, sim.state.vehicle, alderHeight);
    if (!here) return "Get onto a street: a race starts from a lane.";
    const start = encodeStart(here);
    for (const salt of DRAW_SEEDS) {
      const seed = seedFromTick(sim.state.tick, salt + 1);
      const raceId = generatedRaceId({ seed, kind: (["sprint", "circuit", "unordered"] as const)[seed % 3]!, rival: null });
      if (alderCourseDraws(raceId, start)) { loadDrive(raceId, "track", start); return null; }
    }
    return "No race draws from this lane. Drive on and try again.";
  },
});

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
  carNote.textContent = loadNotice;
}
renderSettingsStatus();

modeElement.title = `${sim.state.physicsVersion} · Rapier ${RAPIER.version()} · ${TICK_HZ} Hz fixed simulation`;
requestAnimationFrame(frame);
