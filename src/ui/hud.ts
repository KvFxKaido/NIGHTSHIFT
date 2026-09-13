import { uiColor } from "./theme.ts";
import { TRANSMISSION, type TransmissionState } from "../sim/transmission.ts";
import {
  dialAngle, gaugeReading, minimapPixel, segmentWithinMinimap, tachReading, withinMinimap,
  SPEED_DIAL_MAX_MPH, SPEED_DIAL_STEP_MPH,
  GAUGE_CIRCUMFERENCE, GAUGE_SWEEP_DEGREES, type MinimapCamera,
} from "./hud-state.ts";

/**
 * The driving cluster, laid out after Midnight Club 3: a needle speedometer
 * with a tachometer riding its shoulder, and a heading-up minimap with a north
 * badge and blips pinned to its rim. All of it is a pure readout of a tick that
 * has already happened — drawn after the simulation, never consulted by it.
 */

/** What the tachometer shows: the engine you hear, or the drag gearbox. */
export interface HudEngine {
  rpm: number;
  redlineRpm: number;
}

export interface HudPolyline {
  readonly points: readonly { readonly x: number; readonly z: number }[];
  /** Route guides draw in the route's own colour over the plain street grid. */
  readonly color?: string;
}

export interface HudVehicle {
  transmission?: TransmissionState;
  x: number;
  z: number;
  heading: number;
  speed: number;
  forwardSpeed: number;
}

/** What the cluster shows of a race: the gate you are on, a label for the
 *  readout (countdown, time, position), and where the next gate is. */
export interface HudRace {
  progressLabel?: string;
  targets?: readonly { x: number; z: number; exit?: { x: number; z: number } | null }[];
  checkpoint: number;
  total: number;
  label: string;
  /** Where the next gate is, and which way the route leaves it (none at the finish). */
  next: { x: number; z: number; exit?: { x: number; z: number } | null } | null;
}

export interface Hud {
  /** `rivals` are every rival worth a blip: on the disc where they are, on its rim when not. */
  update(vehicle: HudVehicle, race?: HudRace | null, rivals?: readonly HudVehicle[], engine?: HudEngine | null): void;
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
  const needle = root.getElementById("gauge-needle");
  const tachNeedle = root.getElementById("tacho-needle");
  const tachRed = root.getElementById("tacho-red");
  const canvas = root.getElementById("minimap") as HTMLCanvasElement | null;
  const context = canvas?.getContext("2d") ?? null;
  const raceElement = root.getElementById("race");
  const raceGateElement = root.getElementById("race-gate");
  const raceTimeElement = root.getElementById("race-time");
  const dialMax = SPEED_DIAL_MAX_MPH;
  const arcLength = GAUGE_CIRCUMFERENCE * (GAUGE_SWEEP_DEGREES / 360);
  const namespace = "http://www.w3.org/2000/svg";

  /**
   * Marks and numerals around a dial, generated so the dial's start and span
   * stay in hud-state.ts. `labels` is how many numbered divisions the printed
   * range has; each gets `minor` unnumbered marks between it and the next.
   */
  const dressDial = (group: Element | null, labels: number, minor: number, text: (index: number) => string) => {
    if (!group) return;
    const steps = labels * (minor + 1);
    for (let i = 0; i <= steps; i++) {
      const major = i % (minor + 1) === 0;
      const angle = dialAngle(i / steps);
      const line = root.createElementNS(namespace, "line");
      line.setAttribute("x1", "100"); line.setAttribute("y1", major ? "8" : "11");
      line.setAttribute("x2", "100"); line.setAttribute("y2", major ? "20" : "16");
      line.setAttribute("class", major ? "gauge-tick major" : "gauge-tick");
      // Marks are drawn pointing up (-90°), so turn them by the angle plus 90.
      line.setAttribute("transform", `rotate(${angle + 90} 100 100)`);
      group.appendChild(line);
      if (!major) continue;
      const radians = angle * Math.PI / 180;
      const label = root.createElementNS(namespace, "text");
      label.setAttribute("x", (100 + Math.cos(radians) * 60).toFixed(1));
      label.setAttribute("y", (100 + Math.sin(radians) * 60).toFixed(1));
      label.setAttribute("class", "gauge-numeral");
      label.textContent = text(i / (minor + 1));
      group.appendChild(label);
    }
  };
  // 0-250 mph numbered every 25, with a mark between each.
  dressDial(root.getElementById("gauge-ticks"), dialMax / SPEED_DIAL_STEP_MPH, 1, index => String(index * SPEED_DIAL_STEP_MPH));
  let tachDressed = 0;

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

  /** A blip pinned to the bezel: where a thing is, clamped to the rim ring when it is off the disc. */
  const rimPoint = (camera: MinimapCamera, x: number, z: number, rim: number) => {
    const pixel = minimapPixel(camera, x, z);
    const distance = Math.hypot(pixel.x, pixel.y);
    if (withinMinimap(camera, x, z, 1)) return { x: pixel.x, y: pixel.y, onRim: false };
    const scale = rim / (distance || 1);
    return { x: pixel.x * scale, y: pixel.y * scale, onRim: true };
  };

  const drawMinimap = (vehicle: HudVehicle, race: HudRace | null, rivals: readonly HudVehicle[]) => {
    if (!canvas || !context) return;
    sizeCanvas();
    const size = mapSize / Math.min(devicePixelRatio || 1, 2);
    const outer = size / 2;
    // The map is a disc inside a bezel ring; blips for things off the map sit on the ring.
    const radius = outer - 12;
    const rim = outer - 7;
    const camera: MinimapCamera = {
      x: vehicle.x, z: vehicle.z, heading: vehicle.heading, range: MINIMAP_RANGE, radius,
    };
    context.clearRect(0, 0, size, size);
    context.save();
    context.translate(outer, outer);
    // Bezel: a dark ring with a cream edge, then a navigation hairline around the map.
    context.beginPath();
    context.arc(0, 0, outer - 1.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(4, 8, 14, .82)";
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = "rgba(242, 238, 227, .38)";
    context.stroke();
    context.save();
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "rgba(8, 16, 24, .9)";
    context.fillRect(-radius, -radius, radius * 2, radius * 2);

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

    // A gate on the disc: a ring with a tick the way the route leaves it.
    const gates = race?.targets ?? (race?.next ? [race.next] : []);
    context.strokeStyle = uiColor("objective");
    context.lineWidth = 2.2;
    for (const gate of gates) {
      if (!withinMinimap(camera, gate.x, gate.z, 1)) continue;
      const pixel = minimapPixel(camera, gate.x, gate.z);
      context.beginPath();
      context.arc(pixel.x, pixel.y, 5.5, 0, Math.PI * 2);
      context.stroke();
      if ("exit" in gate && gate.exit) {
        // A point a few metres along the exit, projected like the gate, gives
        // the direction in the heading-up frame without repeating its maths.
        const ahead = minimapPixel(camera, gate.x + gate.exit.x * 10, gate.z + gate.exit.z * 10);
        const run = Math.hypot(ahead.x - pixel.x, ahead.y - pixel.y) || 1;
        const ux = (ahead.x - pixel.x) / run, uy = (ahead.y - pixel.y) / run;
        context.beginPath();
        context.moveTo(pixel.x + ux * 5.5, pixel.y + uy * 5.5);
        context.lineTo(pixel.x + ux * 12.5, pixel.y + uy * 12.5);
        context.stroke();
      }
    }
    context.restore(); // leave the map clip: blips may sit on the bezel

    context.lineWidth = 1.5;
    context.strokeStyle = "rgba(89, 216, 255, .42)";
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();

    // An off-map gate: a chevron on the bezel pointing at it. The Midnight Club arrow.
    for (const gate of gates) {
      if (withinMinimap(camera, gate.x, gate.z, 1)) continue;
      const point = rimPoint(camera, gate.x, gate.z, rim);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(Math.atan2(point.y, point.x));
      context.fillStyle = uiColor("objective");
      context.beginPath();
      context.moveTo(6, 0);
      context.lineTo(-4, 5);
      context.lineTo(-4, -5);
      context.closePath();
      context.fill();
      context.restore();
    }

    if (options.garage) {
      const point = rimPoint(camera, options.garage.x, options.garage.z, rim);
      context.fillStyle = "#081820";
      context.strokeStyle = uiColor("navigation");
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = uiColor("navigation");
      context.font = "bold 9px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("G", point.x, point.y + .5);
    }

    // Rivals: a blip where they are, or pinned to the bezel the way they lie.
    for (const rival of rivals) {
      const point = rimPoint(camera, rival.x, rival.z, rim);
      context.fillStyle = uiColor("rival");
      context.strokeStyle = "#04080e";
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(point.x, point.y, point.onRim ? 4.5 : 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    // North rides the bezel. Port Alder's north is -Z (the start heads north up 1st Ave S).
    const north = minimapPixel(camera, vehicle.x, vehicle.z - 1);
    const northLength = Math.hypot(north.x, north.y) || 1;
    const nx = north.x / northLength * rim, ny = north.y / northLength * rim;
    context.fillStyle = "#04080e";
    context.strokeStyle = "rgba(242, 238, 227, .7)";
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(nx, ny, 7, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "rgba(242, 238, 227, .95)";
    context.font = "bold 9px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("N", nx, ny + .5);

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
    update(vehicle, race = null, rivals = [], engine = null) {
      const reading = gaugeReading(vehicle.speed, vehicle.forwardSpeed, options.topSpeed);
      speedElement.textContent = reading.mph.toString().padStart(3, "0");
      const transmission = vehicle.transmission;
      gearElement.textContent = transmission ? String(transmission.gear) : reading.gear;
      gearElement.classList.toggle("manual", !!transmission);
      const drag = root.getElementById("drag-instruments");
      if (drag) drag.hidden = !transmission;
      if (transmission) {
        const rpm = root.getElementById("drag-rpm");
        const light = root.getElementById("drag-shift");
        const feedback = root.getElementById("drag-feedback");
        const reaction = root.getElementById("drag-reaction");
        if (rpm) rpm.textContent = `${Math.round(transmission.rpm / 10) * 10} RPM`;
        const ready = !transmission.launched ? transmission.rpm >= TRANSMISSION.launchMin && transmission.rpm <= TRANSMISSION.launchMax
          : transmission.rpm >= TRANSMISSION.shiftMin && transmission.rpm <= TRANSMISSION.shiftMax;
        if (light) {
          light.textContent = transmission.limiter ? "LIMITER" : !transmission.launched ? ready ? "LAUNCH READY" : "BUILD REVS" : transmission.shiftTicks ? "SHIFTING" : transmission.gear === 5 ? "TOP GEAR" : ready ? "SHIFT NOW" : "HOLD GEAR";
          light.classList.toggle("ready", ready);
          light.classList.toggle("limit", transmission.limiter);
        }
        if (feedback) feedback.textContent = transmission.feedbackTicks ? transmission.feedback : !transmission.launched ? "LAUNCH 3,800-5,500 RPM" : "SHIFT 7,400-7,900 RPM";
        if (reaction) reaction.textContent = transmission.reactionTicks === null ? "RT -" : `RT ${(transmission.reactionTicks / 60).toFixed(3)} s`;
      }
      if (raceElement) {
        raceElement.hidden = !race;
        if (race && raceGateElement && raceTimeElement) {
          raceGateElement.textContent = race.progressLabel ?? `GATE ${Math.min(race.checkpoint + 1, race.total)}/${race.total}`;
          raceTimeElement.textContent = race.label;
        }
      }
      // The speedometer: the needle and a thin sweep behind it share one scale,
      // the printed 0..dialMax, so the sweep ends exactly under the needle.
      const speedRatio = reading.mph / dialMax;
      needle?.setAttribute("transform", `rotate(${dialAngle(speedRatio)} 100 100)`);
      if (sweep) {
        sweep.style.strokeDasharray = `${arcLength * Math.min(1, speedRatio)} ${GAUGE_CIRCUMFERENCE}`;
        sweep.classList.toggle("redline", reading.redline);
      }
      // The tachometer: the drag gearbox when there is one, otherwise the engine you hear.
      const tach = transmission ? tachReading(transmission.rpm, TRANSMISSION.redline)
        : engine ? tachReading(engine.rpm, engine.redlineRpm) : null;
      if (tach) {
        if (tachDressed !== tach.maxThousands) {
          const group = root.getElementById("tacho-ticks");
          if (group) group.replaceChildren();
          dressDial(group, tach.maxThousands, 1, index => String(index));
          tachDressed = tach.maxThousands;
          if (tachRed) {
            tachRed.setAttribute("stroke-dasharray", `${arcLength * (1 - tach.redlineRatio)} ${GAUGE_CIRCUMFERENCE}`);
            tachRed.setAttribute("transform", `rotate(${dialAngle(tach.redlineRatio)} 100 100)`);
          }
        }
        tachNeedle?.setAttribute("transform", `rotate(${dialAngle(tach.ratio)} 100 100)`);
        tachNeedle?.classList.toggle("redline", tach.redline);
      }
      drawMinimap(vehicle, race, rivals);
    },
  };
}
