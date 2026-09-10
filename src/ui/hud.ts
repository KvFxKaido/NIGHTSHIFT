import {
  gaugeReading, minimapPixel, segmentWithinMinimap, withinMinimap,
  GAUGE_CIRCUMFERENCE, GAUGE_SWEEP_DEGREES, type MinimapCamera,
} from "./hud-state.ts";

/**
 * The driving cluster: a swept speed dial and a heading-up minimap. Both are
 * pure readouts of a tick that has already happened — they are drawn after the
 * simulation, never consulted by it.
 */

export interface HudPolyline {
  readonly points: readonly { readonly x: number; readonly z: number }[];
  /** Route guides draw in the route's own colour over the plain street grid. */
  readonly color?: string;
}

export interface HudVehicle {
  x: number;
  z: number;
  heading: number;
  speed: number;
  forwardSpeed: number;
}

/** What the cluster shows of a race: the gate you are on, a label for the
 *  readout (countdown, time, position), and where the next gate is. */
export interface HudRace {
  checkpoint: number;
  total: number;
  label: string;
  next: { x: number; z: number } | null;
}

export interface Hud {
  update(vehicle: HudVehicle, race?: HudRace | null, rival?: HudVehicle | null): void;
}

/** How much of the world the minimap disc covers, edge to centre. */
const MINIMAP_RANGE = 235;

export interface HudOptions {
  readonly garage?: { readonly x: number; readonly z: number };
  readonly polylines: readonly HudPolyline[];
  readonly topSpeed: number;
  readonly document?: Document;
}

export function createHud(options: HudOptions): Hud {
  const root = options.document ?? document;
  const speedElement = root.getElementById("speed")!;
  const gearElement = root.getElementById("gear")!;
  const sweep = root.getElementById("gauge-sweep") as SVGCircleElement | null;
  const ticks = root.getElementById("gauge-ticks");
  const canvas = root.getElementById("minimap") as HTMLCanvasElement | null;
  const context = canvas?.getContext("2d") ?? null;
  const raceElement = root.getElementById("race");
  const raceGateElement = root.getElementById("race-gate");
  const raceTimeElement = root.getElementById("race-time");

  if (ticks) {
    // Twelve marks around the sweep, every third one long. Generated rather than
    // written out so the dial's start and span stay in one place.
    const namespace = "http://www.w3.org/2000/svg";
    for (let i = 0; i <= 12; i++) {
      const major = i % 3 === 0;
      const line = root.createElementNS(namespace, "line");
      line.setAttribute("x1", "100");
      line.setAttribute("y1", major ? "8" : "10");
      line.setAttribute("x2", "100");
      line.setAttribute("y2", major ? "19" : "16");
      line.setAttribute("class", major ? "gauge-tick major" : "gauge-tick");
      line.setAttribute("transform", `rotate(${220 + i * (GAUGE_SWEEP_DEGREES / 12)} 100 100)`);
      ticks.appendChild(line);
    }
  }

  let mapSize = 0;
  const sizeCanvas = () => {
    if (!canvas || !context) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const size = canvas.clientWidth || 168;
    if (mapSize === size * ratio) return;
    mapSize = size * ratio;
    canvas.width = canvas.height = mapSize;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const drawMinimap = (vehicle: HudVehicle, race: HudRace | null, rival?: HudVehicle | null) => {
    if (!canvas || !context) return;
    sizeCanvas();
    const size = mapSize / Math.min(devicePixelRatio || 1, 2);
    const radius = size / 2;
    const camera: MinimapCamera = {
      x: vehicle.x, z: vehicle.z, heading: vehicle.heading, range: MINIMAP_RANGE, radius,
    };
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(radius, radius);
    context.beginPath();
    context.arc(0, 0, radius - 1, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(4, 8, 14, .72)";
    context.fillRect(-radius, -radius, size, size);

    context.lineCap = "round";
    context.lineJoin = "round";
    for (const line of options.polylines) {
      context.strokeStyle = line.color ?? "rgba(120, 208, 235, .72)";
      context.lineWidth = line.color ? 3.6 : 2.8;
      context.beginPath();
      // Segment by segment, not vertex by vertex: a segment reaching in from
      // off-map still has to be drawn to the rim. The disc is already clipped,
      // so anything overhanging it costs nothing.
      for (let i = 1; i < line.points.length; i++) {
        const from = line.points[i - 1]!, to = line.points[i]!;
        if (!segmentWithinMinimap(camera, from.x, from.z, to.x, to.z)) continue;
        const a = minimapPixel(camera, from.x, from.z);
        const b = minimapPixel(camera, to.x, to.z);
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      }
      context.stroke();
    }

    if (options.garage) {
      const pixel = minimapPixel(camera, options.garage.x, options.garage.z);
      const distance = Math.hypot(pixel.x, pixel.y);
      const scale = distance > radius - 12 ? (radius - 12) / distance : 1;
      const x = pixel.x * scale, y = pixel.y * scale;
      context.fillStyle = "#081820";
      context.strokeStyle = "#75dfff";
      context.lineWidth = 1.5;
      context.fillRect(x - 6, y - 6, 12, 12);
      context.strokeRect(x - 6, y - 6, 12, 12);
      context.fillStyle = "#75dfff";
      context.font = "bold 9px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("G", x, y);
    }

    if (rival && withinMinimap(camera, rival.x, rival.z, 1)) {
      const pixel = minimapPixel(camera, rival.x, rival.z);
      context.fillStyle = "#ff4d6d";
      context.beginPath();
      context.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
      context.fill();
    }

    // The next gate: a ring where it is, or a chevron on the rim pointing at it
    // when it is off the disc. The Midnight Club arrow.
    if (race?.next) {
      const gate = race.next;
      context.strokeStyle = "#ffb347";
      context.lineWidth = 2.2;
      if (withinMinimap(camera, gate.x, gate.z, 1)) {
        const pixel = minimapPixel(camera, gate.x, gate.z);
        context.beginPath();
        context.arc(pixel.x, pixel.y, 5.5, 0, Math.PI * 2);
        context.stroke();
      } else {
        const pixel = minimapPixel(camera, gate.x, gate.z);
        const angle = Math.atan2(pixel.y, pixel.x);
        const rim = radius - 9;
        context.save();
        context.translate(Math.cos(angle) * rim, Math.sin(angle) * rim);
        context.rotate(angle);
        context.fillStyle = "#ffb347";
        context.beginPath();
        context.moveTo(6, 0);
        context.lineTo(-4, 5);
        context.lineTo(-4, -5);
        context.closePath();
        context.fill();
        context.restore();
      }
    }

    // The player is always the middle of the disc, pointing up — that is what
    // "heading up" means, and it is why the streets rotate instead.
    context.fillStyle = "#f4f7fa";
    context.beginPath();
    context.moveTo(0, -6.5);
    context.lineTo(4.6, 5);
    context.lineTo(0, 2.6);
    context.lineTo(-4.6, 5);
    context.closePath();
    context.fill();
    context.restore();
  };

  return {
    update(vehicle, race = null, rival = null) {
      const reading = gaugeReading(vehicle.speed, vehicle.forwardSpeed, options.topSpeed);
      speedElement.textContent = reading.mph.toString().padStart(3, "0");
      gearElement.textContent = reading.gear;
      if (raceElement) {
        raceElement.hidden = !race;
        if (race && raceGateElement && raceTimeElement) {
          raceGateElement.textContent = `GATE ${Math.min(race.checkpoint + 1, race.total)}/${race.total}`;
          raceTimeElement.textContent = race.label;
        }
      }
      if (sweep) {
        const arc = GAUGE_CIRCUMFERENCE * (GAUGE_SWEEP_DEGREES / 360);
        sweep.style.strokeDasharray = `${arc * reading.ratio} ${GAUGE_CIRCUMFERENCE}`;
        sweep.classList.toggle("redline", reading.redline);
      }
      drawMinimap(vehicle, race, rival);
    },
  };
}
