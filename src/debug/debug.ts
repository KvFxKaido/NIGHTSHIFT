/* The shared inspection surface. Shawn drives it from the console, agents drive
   it from a URL, and a headless capture harness will drive the same entry
   points later. It deliberately clicks the real menu buttons rather than
   reaching into the menu state machine, so a scripted jump cannot diverge from
   what a person clicking would get. */

import * as THREE from "three";
import type { View } from "../render/scene.ts";
import type { Input, Sim } from "../sim/sim.ts";

export type DebugScreen = "main" | "garage" | "track" | "pause";

export interface DebugBridge {
  view: View;
  sim: Sim;
  canvas: HTMLCanvasElement;
  /** Steps the fixed simulation, logging input exactly as a live run does. */
  advance(ticks: number, input: Input): void;
  renderOnce(frames?: number): void;
  setFrozen(frozen: boolean): void;
  isFrozen(): boolean;
  setTelemetry(visible: boolean): void;
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
  if (!p) return geometry.type;
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
      click('[data-menu-action="track-select"]');
      click('[data-menu-action="start"]');
    } else if (screen === "main") {
      click('[data-menu-screen="pause"] [data-menu-action="main-menu"]');
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
      // pick() takes these coordinates. A screenshot is often scaled from them.
      viewport: { width: Math.round(rect.width), height: Math.round(rect.height) },
      frozen: bridge.isFrozen(),
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
    url.search = "";
    const screen = document.body.dataset.gameScreen;
    url.searchParams.set("scene", screen === "playing" ? "track" : screen ?? "main");
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
      "__ns.tick(60)          advance 60 fixed ticks (works in a hidden tab)",
      "__ns.drive('W600,WD90') hold throttle 600 ticks, then throttle+right 90",
      "__ns.freeze()          stop the loop advancing, for stable captures",
      "__ns.shot()            PNG data URL of the current frame",
      "__ns.link()            a URL that reproduces the current state",
      "url: ?scene=garage&paint=blackglass&stance=slammed&telemetry=1",
      "url: ?scene=track&drive=W600,WD90&freeze=1",
    ].join("\n"),
  };

  (window as unknown as { __ns: typeof api }).__ns = api;
}

export function applyDeepLink(api: {
  go(screen: DebugScreen): string;
  set(options: { paint?: string; wheels?: string; stance?: string }): string[];
  drive(script: string): unknown;
  freeze(frozen?: boolean): boolean;
  telemetry(visible?: boolean): void;
}, search: string): void {
  const params = new URLSearchParams(search);
  if (params.size === 0) return;

  const scene = params.get("scene");
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
