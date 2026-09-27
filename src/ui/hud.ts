import type { LaunchState } from "../sim/launch.ts";
import { uiColor } from "./theme.ts";
import { TRANSMISSION, type TransmissionState } from "../sim/transmission.ts";
import {
  gaugeReading, launchMeter, minimapPixel, nitrousArc, segmentWithinMinimap, speedDigits, tachAngle, tachReading, withinMinimap,
  SEGMENT_SHAPES, SPEED_DIGITS, type MinimapCamera,
} from "./hud-state.ts";
import { createStreetNamer, type NamedStreet } from "./street-name.ts";

/**
 * The driving cluster, laid out after Midnight Club: Los Angeles (Shawn's mockup, 2026-09-26): a tachometer inside
 * the nitrous arc, the speed in seven segments and the gear on a plate at its shoulder, the street you are on under
 * both, and a heading-up minimap with a north badge and blips pinned to its rim. All of it is a pure readout of a
 * tick that has already happened — drawn after the simulation, never consulted by it.
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
  launch?: LaunchState;
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
  /** The player's car's governor, read each frame: the dial redlines at its own top end. */
  readonly topSpeed: () => number;
  /** The streets the plate can name; none (a venue) and the plate stays hidden. */
  readonly streets?: readonly NamedStreet[];
  readonly document?: Document;
}

const SVG = "http://www.w3.org/2000/svg";
/** The tachometer's centre in its own units (index.html's `#cluster-dial`). */
const TACH_X = 118, TACH_Y = 120;
/** The street plate's text may run this many units before it is squeezed to fit. */
const STREET_TEXT_MAX = 181;

export function createHud(options: HudOptions): Hud {
  const root = options.document ?? document;
  const speedElement = root.getElementById("speed")!;
  const gearElement = root.getElementById("gear")!;
  const tachNeedle = root.getElementById("tach-needle");
  const tachRed = root.getElementById("tach-red");
  const nitrousCurve = root.getElementById("nitrous-curve");
  const nitrousBar = root.getElementById("nitrous-bar");
  const streetPlate = root.getElementById("street-plate");
  const streetName = root.getElementById("street-name") as SVGTextElement | null;
  const canvas = root.getElementById("minimap") as HTMLCanvasElement | null;
  const context = canvas?.getContext("2d") ?? null;
  const raceElement = root.getElementById("race");
  const raceGateElement = root.getElementById("race-gate");
  const raceTimeElement = root.getElementById("race-time");
  const namer = options.streets?.length ? createStreetNamer(options.streets) : null;
  const at = (angle: number, radius: number) => [
    TACH_X + Math.cos(angle * Math.PI / 180) * radius, TACH_Y + Math.sin(angle * Math.PI / 180) * radius] as const;

  /**
   * The tachometer's marks, one a thousand and one between, numbered every two thousand, generated so its start and
   * sweep stay in hud-state.ts. Redrawn only when the printed range changes (a car with another redline).
   */
  const dressTach = (maxThousands: number, redlineRatio: number) => {
    const group = root.getElementById("tach-ticks");
    if (!group) return;
    group.replaceChildren();
    const steps = maxThousands * 2;
    for (let i = 0; i <= steps; i++) {
      const major = i % 2 === 0, angle = tachAngle(i / steps);
      const [x1, y1] = at(angle, 56), [x2, y2] = at(angle, major ? 46 : 51);
      const line = root.createElementNS(SVG, "line");
      line.setAttribute("x1", x1.toFixed(1)); line.setAttribute("y1", y1.toFixed(1));
      line.setAttribute("x2", x2.toFixed(1)); line.setAttribute("y2", y2.toFixed(1));
      line.setAttribute("class", major ? "tach-tick major" : "tach-tick");
      group.appendChild(line);
      if (i % 4 !== 0) continue;
      const [x, y] = at(angle, 36);
      const label = root.createElementNS(SVG, "text");
      label.setAttribute("x", x.toFixed(1)); label.setAttribute("y", y.toFixed(1));
      label.setAttribute("class", "tach-numeral");
      label.textContent = String(i / 2);
      group.appendChild(label);
    }
    const [rx1, ry1] = at(tachAngle(redlineRatio), 53.5), [rx2, ry2] = at(tachAngle(1), 53.5);
    const large = (1 - redlineRatio) * 230 > 180 ? 1 : 0;
    tachRed?.setAttribute("d", `M${rx1.toFixed(1)} ${ry1.toFixed(1)} A53.5 53.5 0 ${large} 1 ${rx2.toFixed(1)} ${ry2.toFixed(1)}`);
  };
  let tachDressed = 0;

  // The speed plate's digits: seven polygons each, built once; a frame only moves which are lit.
  const digitSegments: SVGPolygonElement[][] = [];
  const digitsGroup = root.getElementById("speed-digits");
  for (let i = 0; digitsGroup && i < SPEED_DIGITS; i++) {
    const cell = root.createElementNS(SVG, "g");
    cell.setAttribute("transform", `translate(${i * 33} 0)`);
    digitSegments.push(Object.entries(SEGMENT_SHAPES).map(([segment, points]) => {
      const polygon = root.createElementNS(SVG, "polygon");
      polygon.setAttribute("points", points);
      polygon.setAttribute("class", "seg");
      polygon.dataset.segment = segment;
      cell.appendChild(polygon);
      return polygon;
    }));
    digitsGroup.appendChild(cell);
  }
  let shownMph = -1, shownStreet: string | null | undefined;

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
      const reading = gaugeReading(vehicle.speed, vehicle.forwardSpeed, options.topSpeed());
      if (reading.mph !== shownMph) {
        shownMph = reading.mph;
        speedElement.textContent = `${reading.mph} mph`;
        speedDigits(reading.mph).forEach((lit, i) => {
          for (const polygon of digitSegments[i] ?? []) polygon.classList.toggle("lit", lit.includes(polygon.dataset.segment!));
        });
      }
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
      // The nitrous arc: the launch charge building, at the line or in a burnout, then the boost draining away once
      // it is let go, up the curve and along the bar. Empty otherwise, until Surge feeds it.
      const arc = nitrousArc(launchMeter(vehicle.launch) ?? 0);
      nitrousCurve?.setAttribute("stroke-dasharray", `${(arc.curve * 100).toFixed(1)} 100`);
      nitrousBar?.setAttribute("stroke-dasharray", `${(arc.bar * 100).toFixed(1)} 100`);
      // The tachometer: the drag gearbox when there is one, otherwise the engine you hear.
      const tach = transmission ? tachReading(transmission.rpm, TRANSMISSION.redline)
        : engine ? tachReading(engine.rpm, engine.redlineRpm) : null;
      if (tach) {
        if (tachDressed !== tach.maxThousands) {
          dressTach(tach.maxThousands, tach.redlineRatio);
          tachDressed = tach.maxThousands;
        }
        tachNeedle?.setAttribute("transform", `rotate(${tachAngle(tach.ratio).toFixed(1)} ${TACH_X} ${TACH_Y})`);
        tachNeedle?.classList.toggle("redline", tach.redline);
      }
      gearElement.classList.toggle("redline", tach?.redline ?? false);
      // The street you are on, squeezed to fit the plate when its name is long.
      const street = namer?.at(vehicle.x, vehicle.z, performance.now()) ?? null;
      if (street !== shownStreet && streetPlate && streetName) {
        shownStreet = street;
        streetPlate.toggleAttribute("hidden", street === null);
        streetName.removeAttribute("textLength");
        streetName.textContent = street ?? "";
        if (street !== null && streetName.getComputedTextLength() > STREET_TEXT_MAX) {
          streetName.setAttribute("textLength", String(STREET_TEXT_MAX));
          streetName.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
      }
      drawMinimap(vehicle, race, rivals);
    },
  };
}
