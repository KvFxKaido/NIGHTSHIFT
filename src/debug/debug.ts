/* The shared inspection surface. Shawn drives it from the console, agents drive
   it from a URL, and a headless capture harness will drive the same entry
   points later. It deliberately clicks the real menu buttons rather than
   reaching into the menu state machine, so a scripted jump cannot diverge from
   what a person clicking would get. */

import * as THREE from "three";
import type { View } from "../render/scene.ts";
import { isDrivetrain, type Drivetrain, type Input, type Sim } from "../sim/sim.ts";
import { BLENDER_CARS } from "../render/blender-car.ts";

export type DebugScreen = "main" | "garage" | "track" | "pause";

export interface AudioReport {
  /** "absent" until a gesture builds the graph; "running" once it is audible. */
  state: "absent" | AudioContextState;
  levels: { master: number; engine: number; music: number };
  /** Live output of the mixer this frame, so silence has a visible cause. */
  engineHz: number;
  scrub: number;
  wind: number;
  tracks: number;
  nowPlaying: string | null;
}

export interface InputReport {
  gamepad: string | null;
  axes: number[];
  pressedButtons: number[];
  /** What the pad maps to right now, before the gate is applied. */
  mapped: Input;
  /** While true every driving input is replaced with zero, by design. */
  drivingGated: boolean;
  screen: string;
  /** What the simulation actually received on the last tick. */
  delivered: Input;
}

export interface DebugBridge {
  view: View;
  sim: Sim;
  canvas: HTMLCanvasElement;
  /** Steps the same fixed simulation as live driving. */
  advance(ticks: number, input: Input): void;
  renderOnce(frames?: number): void;
  setFrozen(frozen: boolean): void;
  isFrozen(): boolean;
  setTelemetry(visible: boolean): void;
  pause(): void;
  /** Audio is easy to have silently broken; make its real state inspectable. */
  audioReport(): AudioReport;
  /** Raw pad state plus the driving gate, so "controller does nothing" has an answer. */
  inputReport(): InputReport;
}

interface PickResult {
  name: string;
  position: [number, number, number];
  distance: number;
  material: string;
  geometry: string;
}

const NEUTRAL: Input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

function describeGeometry(geometry: THREE.BufferGeometry): string {
  const p = (geometry as { parameters?: Record<string, number | undefined> }).parameters;
  // Hand-built geometry carries no parameters, so measure it rather than
  // reporting a bare "BufferGeometry" and losing the size readout.
  if (!p) {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const vertices = geometry.getAttribute("position").count;
    return `mesh ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)} (${vertices} verts)`;
  }
  // Planes carry width/height but no depth, so presence has to be checked per
  // field rather than inferred from the first one that happens to exist.
  const n = (value: number | undefined) => (value === undefined ? "?" : value.toFixed(2));
  if (p.width !== undefined && p.depth !== undefined) return `box ${n(p.width)}x${n(p.height)}x${n(p.depth)}`;
  if (p.width !== undefined) return `plane ${n(p.width)}x${n(p.height)}`;
  if (p.radiusTop !== undefined) return `cyl r${n(p.radiusTop)} h${n(p.height)}`;
  if (p.radius !== undefined) return `${geometry.type} r${n(p.radius)}`;
  return geometry.type;
}

function describeMaterial(material: THREE.Material | THREE.Material[]): string {
  const one = Array.isArray(material) ? material[0]! : material;
  const standard = one as THREE.MeshStandardMaterial;
  const colour = standard.color ? `#${standard.color.getHexString()}` : "-";
  const rough = standard.roughness === undefined ? "" : ` rough ${standard.roughness}`;
  const metal = standard.metalness === undefined ? "" : ` metal ${standard.metalness}`;
  return `${one.type} ${colour}${rough}${metal}`;
}

// "W600,WD90,B45" -> hold throttle 600 ticks, throttle+right 90, handbrake 45.
const KEY_TO_INPUT: Record<string, (input: Input) => void> = {
  W: (i) => { i.throttle = 1; },
  S: (i) => { i.brake = 1; },
  A: (i) => { i.steer = -1; },
  D: (i) => { i.steer = 1; },
  B: (i) => { i.handbrake = 1; },
};

export function parseDriveScript(script: string): { input: Input; ticks: number }[] {
  const steps: { input: Input; ticks: number }[] = [];
  for (const chunk of script.split(",")) {
    const match = /^([WASDB]*)(\d+)$/i.exec(chunk.trim());
    if (!match) continue;
    const input: Input = { ...NEUTRAL };
    for (const key of match[1]!.toUpperCase()) KEY_TO_INPUT[key]?.(input);
    steps.push({ input, ticks: Number(match[2]) });
  }
  return steps;
}

export function installDebugApi(bridge: DebugBridge): void {
  const { view, sim, canvas } = bridge;
  const raycaster = new THREE.Raycaster();

  const activeScene = () => (view.mode === "garage" ? view.garageScene : view.scene);

  function click(selector: string): boolean {
    const button = document.querySelector<HTMLButtonElement>(selector);
    button?.click();
    return Boolean(button);
  }

  function go(screen: DebugScreen): string {
    if (screen === "garage") {
      click('[data-menu-screen="main"] [data-menu-action="garage"]');
    } else if (screen === "track") {
      click('[data-menu-action="start"]');
    } else if (screen === "main") {
      click('[data-menu-screen="pause"] [data-menu-action="main-menu"]');
    } else if (screen === "pause") {
      if (document.body.dataset.gameScreen !== "playing" && document.body.dataset.gameScreen !== "pause") go("track");
      bridge.pause();
    }
    bridge.renderOnce();
    return document.body.dataset.gameScreen ?? "unknown";
  }

  function set(options: { paint?: string; wheels?: string; stance?: string }): string[] {
    const applied: string[] = [];
    for (const [category, option] of Object.entries(options)) {
      if (!option) continue;
      if (click(`[data-customization="${category}"][data-option="${option}"]`)) {
        applied.push(`${category}=${option}`);
      } else {
        applied.push(`${category}=${option} (no such option)`);
      }
    }
    bridge.renderOnce();
    return applied;
  }

  // Coordinates are CSS pixels. A screenshot is usually a different size than
  // the viewport, so pass its width as `sourceWidth` and read pixels straight
  // off the image instead of converting by hand and getting it wrong.
  function pickAll(x: number, y: number, sourceWidth?: number): PickResult[] {
    const rect = canvas.getBoundingClientRect();
    const scale = sourceWidth ? rect.width / sourceWidth : 1;
    const localX = x * scale - rect.left;
    const localY = y * scale - rect.top;
    raycaster.setFromCamera(
      new THREE.Vector2((localX / rect.width) * 2 - 1, -((localY / rect.height) * 2 - 1)),
      view.camera,
    );
    const meshes: THREE.Mesh[] = [];
    activeScene().traverse((object) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });
    return raycaster.intersectObjects(meshes, false).map((hit) => {
      const mesh = hit.object as THREE.Mesh;
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      return {
        name: mesh.name || "(unnamed)",
        position: [
          Number(world.x.toFixed(3)),
          Number(world.y.toFixed(3)),
          Number(world.z.toFixed(3)),
        ] as [number, number, number],
        distance: Number(hit.distance.toFixed(3)),
        material: describeMaterial(mesh.material),
        geometry: describeGeometry(mesh.geometry),
      };
    });
  }

  function find(pattern: string): PickResult[] {
    const needle = pattern.toLowerCase();
    const found: PickResult[] = [];
    activeScene().traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.name.toLowerCase().includes(needle)) return;
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      found.push({
        name: mesh.name,
        position: [
          Number(world.x.toFixed(3)),
          Number(world.y.toFixed(3)),
          Number(world.z.toFixed(3)),
        ] as [number, number, number],
        distance: 0,
        material: describeMaterial(mesh.material),
        geometry: describeGeometry(mesh.geometry),
      });
    });
    return found;
  }

  function selected(category: string): string | null {
    const pressed = document.querySelector<HTMLButtonElement>(
      `[data-customization="${category}"][aria-pressed="true"]`,
    );
    return pressed?.dataset.option ?? null;
  }

  function state() {
    const car = sim.state.vehicle;
    const rect = canvas.getBoundingClientRect();
    return {
      screen: document.body.dataset.gameScreen ?? "unknown",
      mode: view.mode,
      carModel: view.car.userData.model ?? "classic",
      environment: "seattle",
      roadWorld: sim.roadWorld.id,
      // pick() takes these coordinates. A screenshot is often scaled from them.
      viewport: { width: Math.round(rect.width), height: Math.round(rect.height) },
      frozen: bridge.isFrozen(),
      physicsVersion: sim.state.physicsVersion,
      drivetrain: sim.state.drivetrain,
      autoCountersteer: false,
      tick: sim.state.tick,
      customization: {
        paint: selected("paint"),
        wheels: selected("wheels"),
        stance: selected("stance"),
      },
      vehicle: {
        x: Number(car.x.toFixed(2)),
        y: Number(car.y.toFixed(2)),
        z: Number(car.z.toFixed(2)),
        heading: Number(car.heading.toFixed(3)),
        speed: Number(car.speed.toFixed(2)),
        slipAngle: Number(car.slipAngle.toFixed(3)),
        wheels: Object.fromEntries(Object.entries(car.wheels).map(([id, tyre]) => [id, {
          steeringAngle: Number(tyre.steeringAngle.toFixed(3)),
          slipAngle: Number(tyre.slipAngle.toFixed(3)),
          normalLoad: Math.round(tyre.normalLoad),
          longitudinalForce: Math.round(tyre.longitudinalForce),
          lateralForce: Math.round(tyre.lateralForce),
          longitudinalSpeed: Number(tyre.longitudinalSpeed.toFixed(2)),
          gripUsed: Number((Math.hypot(tyre.longitudinalForce, tyre.lateralForce) / Math.max(1, tyre.gripLimit)).toFixed(3)),
        }])),
      },
    };
  }

  function drive(script: string): ReturnType<typeof state> {
    for (const step of parseDriveScript(script)) bridge.advance(step.ticks, step.input);
    bridge.renderOnce();
    return state();
  }

  function tick(count = 1): ReturnType<typeof state> {
    bridge.advance(count, NEUTRAL);
    bridge.renderOnce();
    return state();
  }

  // Capture in the same task as the draw: the drawing buffer is cleared once the
  // compositor runs, so a later call would hand back an empty image.
  function shot(): string {
    // The chase camera lerps, so settle it before capturing or two calls from
    // the same state hand back different images.
    bridge.renderOnce(24);
    return canvas.toDataURL("image/png");
  }

  function link(): string {
    const url = new URL(location.href);
    const world = url.searchParams.get("world"), route = url.searchParams.get("route");
    const race = url.searchParams.get("race"), lighting = url.searchParams.get("lighting");
    url.search = "";
    if (world === "district" || world === "seattle" || world === "blackglass") {
      url.searchParams.set("world", world);
      if (route && world === "district") url.searchParams.set("route", route);
    }
    if (race) url.searchParams.set("race", race);
    if (lighting) url.searchParams.set("lighting", lighting);
    // Round-trip whichever body is loaded, not just "is it the coupe".
    const loaded = view.car.userData.model;
    const authored = Object.entries(BLENDER_CARS).find(([, car]) => car.model === loaded);
    if (authored && authored[0] !== "blender") url.searchParams.set("car", authored[0]);
    else if (!authored) url.searchParams.set("car", "classic");
    const screen = document.body.dataset.gameScreen;
    url.searchParams.set("scene", screen === "playing" ? "track" : screen ?? "main");
    url.searchParams.set("drivetrain", sim.state.drivetrain);
    for (const category of ["paint", "wheels", "stance"]) {
      const option = selected(category);
      if (option) url.searchParams.set(category, option);
    }
    return url.toString();
  }

  const api = {
    pick: (x: number, y: number, sourceWidth?: number) => pickAll(x, y, sourceWidth)[0] ?? null,
    pickAll,
    find,
    state,
    go,
    set,
    drivetrain: (layout: Drivetrain) => {
      if (!isDrivetrain(layout)) throw new RangeError(`Unknown drivetrain: ${layout}`);
      // Use the same button and new-run boundary as the human comparison flow.
      const previous = document.body.dataset.gameScreen;
      go("pause");
      click(`[data-drivetrain="${layout}"]`);
      if (previous === "playing") click('[data-menu-action="resume"]');
      else if (previous === "main" || previous === "garage") go(previous);
      bridge.renderOnce();
      return state();
    },
    tick,
    drive,
    shot,
    link,
    freeze: (frozen = true) => { bridge.setFrozen(frozen); return bridge.isFrozen(); },
    telemetry: (visible = true) => bridge.setTelemetry(visible),
    view,
    sim,
    help: () => [
      "__ns.pick(x, y)        name the mesh under a viewport pixel",
      "__ns.pick(x, y, 1523)  same, for a pixel read off a 1523px-wide screenshot",
      "__ns.find('hood')      every mesh whose name contains a string",
      "__ns.state()           screen, tick, customization, vehicle",
      "__ns.go('garage')      'main' | 'garage' | 'track' | 'pause'",
      "__ns.set({paint:'ice', stance:'slammed', wheels:'alloy'})",
      "__ns.drivetrain('rwd') 'awd' | 'fwd' | 'rwd'; changing layout starts a fresh run",
      "__ns.tick(60)          advance 60 fixed ticks (works in a hidden tab)",
      "__ns.drive('W600,WD90') hold throttle 600 ticks, then throttle+right 90",
      "__ns.freeze()          stop the loop advancing, for stable captures",
      "__ns.shot()            PNG data URL of the current frame",
      "__ns.audio()           audio context state, levels and live mixer output",
      "__ns.input()           pad axes/buttons, mapped input and the driving gate",
      "__ns.link()            a URL that reproduces the current state",
      "url: ?scene=garage&paint=blackglass&stance=slammed&telemetry=1",
      "url: ?scene=track&drivetrain=rwd&drive=W600,WD90&freeze=1",
      "url: ?car=bulwark  preview the Bulwark garage car; ?car=classic the original procedural coupe",
    ].join("\n"),
    audio: (): AudioReport => bridge.audioReport(),
    input: (): InputReport => bridge.inputReport(),
  };

  (window as unknown as { __ns: typeof api }).__ns = api;
}

export function applyDeepLink(api: {
  go(screen: DebugScreen): string;
  set(options: { paint?: string; wheels?: string; stance?: string }): string[];
  drive(script: string): unknown;
  freeze(frozen?: boolean): boolean;
  telemetry(visible?: boolean): void;
  drivetrain(layout: Drivetrain): unknown;
}, search: string): void {
  const params = new URLSearchParams(search);
  if (params.size === 0) return;

  const scene = params.get("scene");
  const drivetrain = params.get("drivetrain");
  if (drivetrain !== null) {
    if (!isDrivetrain(drivetrain)) throw new RangeError(`Unknown drivetrain: ${drivetrain}`);
    api.drivetrain(drivetrain);
  }
  // Customization lives on the garage screen, so select it there before leaving.
  const wantsCustomization = ["paint", "wheels", "stance"].some((key) => params.has(key));
  if (wantsCustomization) api.go("garage");
  if (wantsCustomization) {
    api.set({
      paint: params.get("paint") ?? undefined,
      wheels: params.get("wheels") ?? undefined,
      stance: params.get("stance") ?? undefined,
    });
  }
  if (scene === "track" || scene === "garage" || scene === "main" || scene === "pause") {
    api.go(scene);
  }
  if (params.get("telemetry") === "1") api.telemetry(true);
  const script = params.get("drive");
  if (script) api.drive(script);
  if (params.get("freeze") === "1") api.freeze(true);
}
