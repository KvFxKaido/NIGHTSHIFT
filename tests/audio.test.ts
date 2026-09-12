import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  engineTone, tyreScrub, windLevel, smoothstep, DEFAULT_LEVELS, IDLE_RPM, REDLINE_RPM,
  SCRUB_ONSET, SCRUB_FULL,
} from "../src/audio/audio-mix.ts";
import { decodeManifest, shuffleOrder, MUSIC_MANIFEST_VERSION } from "../src/audio/soundtrack.ts";
import { decodeSettings, defaultSettings, createSettingsStore, SETTINGS_VERSION } from "../src/settings/settings.ts";
import { HANDLING, type Input, type VehicleState, type WheelId } from "../src/sim/sim.ts";
import { flatSim, flatStep, NEUTRAL } from "./helpers/handling.ts";
import { createTransmission } from "../src/sim/transmission.ts";

await RAPIER.init();

const WHEELS: WheelId[] = ["front-left", "front-right", "rear-left", "rear-right"];
function gas(throttle: number): Input { return { ...NEUTRAL, throttle }; }

/** A state carrying only what the mixer reads, so force levels are exact. */
function stateWithUtilisation(utilisation: number, speed: number): VehicleState {
  const wheels = Object.fromEntries(WHEELS.map(id => [id, {
    slipAngle: 0, longitudinalForce: 0, lateralForce: utilisation * 2000, gripLimit: 2000,
    steeringAngle: 0, loadFraction: .25, normalLoad: 2894, longitudinalSpeed: speed, lateralSpeed: 0,
    rollingDistance: 0,
  }]));
  return { speed, forwardSpeed: speed, wheels } as unknown as VehicleState;
}

test("drag sound follows simulated RPM, gear and limiter rather than speed bands", () => {
  const vehicle = stateWithUtilisation(0, 30);
  vehicle.transmission = { ...createTransmission(), rpm: 8100, gear: 2, limiter: true };
  const tone = engineTone(vehicle, gas(1));
  assert.equal(tone.rpm, 8100);
  assert.equal(tone.gear, 2);
  assert.equal(tone.limiter, true);
  vehicle.transmission.rpm = 5500;
  vehicle.transmission.gear = 3;
  vehicle.transmission.limiter = false;
  const shifted = engineTone(vehicle, gas(1));
  assert.equal(shifted.gear, 3);
  assert.ok(shifted.frequency < tone.frequency);
  assert.equal(shifted.limiter, false);
});

test("the engine note climbs with speed and drops on each upshift", () => {
  // Above walking pace road speed owns the note; below it the standing blip
  // does, and a real car drops revs as it takes up drive anyway.
  const climbing = [3, 5, 6.5, 7.4].map(speed =>
    engineTone(stateWithUtilisation(0, speed), gas(1)).frequency);
  assert.deepEqual([...climbing].sort((a, b) => a - b), climbing,
    `note must rise within a gear: ${climbing.join(" -> ")}`);

  // Across the whole range the note has to fall somewhere, or the car is one
  // continuous siren from standstill to top speed. Swept off-throttle so the
  // only discontinuities are the shifts themselves.
  const sweep: number[] = [];
  for (let speed = 0; speed <= HANDLING.topSpeed; speed += .5) {
    sweep.push(engineTone(stateWithUtilisation(0, speed), NEUTRAL).frequency);
  }
  const drops = sweep.filter((value, index) => index > 0 && value < sweep[index - 1]!).length;
  assert.equal(drops, 4, "five gear bands should produce exactly four upshift drops");
  assert.ok(sweep.every(frequency => frequency > 0));
});

test("rpm stays inside the idle-to-redline band at every speed and throttle", () => {
  for (let speed = -HANDLING.reverseSpeed; speed <= HANDLING.topSpeed * 1.2; speed += 1.3) {
    for (const throttle of [0, .5, 1]) {
      const tone = engineTone(stateWithUtilisation(0, speed), gas(throttle));
      assert.ok(tone.rpm >= IDLE_RPM - 1e-9 && tone.rpm <= REDLINE_RPM + 1e-9,
        `${speed} m/s at ${throttle} throttle produced ${tone.rpm} rpm`);
      assert.ok(tone.gain > 0 && tone.gain <= 1);
      assert.ok(tone.brightness >= 0 && tone.brightness <= 1);
    }
  }
});

test("a stationary car still answers the throttle, and reverse is its own gear", () => {
  const idle = engineTone(stateWithUtilisation(0, 0), NEUTRAL);
  const revving = engineTone(stateWithUtilisation(0, 0), gas(1));
  assert.ok(revving.rpm > idle.rpm + 500, "blipping the throttle on the grid must be audible");
  assert.equal(idle.rpm, IDLE_RPM);
  assert.equal(engineTone(stateWithUtilisation(0, -6), NEUTRAL).gear, 0);
  assert.ok(engineTone(stateWithUtilisation(0, 12), NEUTRAL).gear >= 1);
});

test("high-revving N/A tone layers respond distinctively to throttle and rpm", () => {
  const idle = engineTone(stateWithUtilisation(0, 0), NEUTRAL);
  const wideOpenHighSpeed = engineTone(stateWithUtilisation(0, HANDLING.topSpeed * 0.95), gas(1));
  const coastingHighSpeed = engineTone(stateWithUtilisation(0, HANDLING.topSpeed * 0.95), NEUTRAL);
  const lowSpeedGas = engineTone(stateWithUtilisation(0, 5), gas(1));

  // Intake honk: zero off-throttle, loud under full throttle
  assert.equal(idle.intake, 0);
  assert.equal(coastingHighSpeed.intake, 0);
  assert.ok(wideOpenHighSpeed.intake > 0.5, "full throttle at speed must have strong intake honk");

  // Exhaust drive: increases with throttle and revs
  assert.ok(wideOpenHighSpeed.exhaustDrive > idle.exhaustDrive);
  assert.ok(wideOpenHighSpeed.exhaustDrive > coastingHighSpeed.exhaustDrive);

  // High-cam screamer crossover: inactive at low RPM, engaged at high RPM under throttle
  assert.equal(lowSpeedGas.screamer, 0, "screamer crossover must not engage at low revs");
  assert.ok(wideOpenHighSpeed.screamer > 0.8, "screamer crossover must scream near redline");

  // Overrun: silent under power, active when lifting throttle at speed
  assert.equal(wideOpenHighSpeed.overrun, 0, "overrun must be silent under full throttle");
  assert.ok(coastingHighSpeed.overrun > 0.7, "lifting at speed must trigger overrun crackle");

  // Transmission whine: increases with speed and unmasked off-throttle
  assert.ok(coastingHighSpeed.whine > wideOpenHighSpeed.whine, "whine is unmasked off-throttle");

  // Rev limiter: triggers at top of rev range under throttle
  const bouncing = engineTone(stateWithUtilisation(0, HANDLING.topSpeed * 1.05), gas(1));
  assert.equal(bouncing.limiter, true, "rev limiter must cut when bouncing at redline under gas");
  assert.equal(coastingHighSpeed.limiter, false, "limiter must not cut off-throttle");
});

test("tyres are silent inside their cornering budget and audible past it", () => {
  assert.equal(tyreScrub(stateWithUtilisation(.4, 25)), 0, "ordinary cornering must not squeal");
  assert.equal(tyreScrub(stateWithUtilisation(SCRUB_ONSET, 25)), 0, "the onset itself is still silent");
  assert.ok(tyreScrub(stateWithUtilisation(.8, 25)) > 0, "a tyre near its limit has to be heard");
  assert.equal(tyreScrub(stateWithUtilisation(SCRUB_FULL, 25)), 1, "the top of the band saturates");
  assert.ok(tyreScrub(stateWithUtilisation(.9, 25)) > tyreScrub(stateWithUtilisation(.7, 25)),
    "a worse slide must be louder than a lesser one");
});

test("a parked car does not squeal however its forces are described", () => {
  assert.equal(tyreScrub(stateWithUtilisation(2, 0)), 0);
  assert.ok(tyreScrub(stateWithUtilisation(2, 3)) > 0);
});

test("wind rises with speed and never leaves 0..1", () => {
  assert.equal(windLevel(stateWithUtilisation(0, 0)), 0);
  assert.ok(windLevel(stateWithUtilisation(0, HANDLING.topSpeed * 2)) <= 1);
  let previous = -1;
  for (let speed = 0; speed <= HANDLING.topSpeed; speed += 2) {
    const level = windLevel(stateWithUtilisation(0, speed));
    assert.ok(level >= previous, "wind must be monotonic in speed");
    previous = level;
  }
});

test("smoothstep is clamped and monotonic", () => {
  assert.equal(smoothstep(1, 2, 0), 0);
  assert.equal(smoothstep(1, 2, 3), 1);
  assert.ok(smoothstep(1, 2, 1.25) < smoothstep(1, 2, 1.75));
});

// The mixer reads the real handling model, not only synthetic fixtures: a hard
// cornering run must actually drive the squeal it is supposed to expose.
test("a real sliding run pushes tyre utilisation into the audible range", () => {
  const sim = flatSim(30);
  let loudest = 0;
  for (let tick = 0; tick < 45; tick++) {
    flatStep(sim, { throttle: 1, steer: 1 });
    loudest = Math.max(loudest, tyreScrub(sim.state.vehicle));
  }
  assert.ok(loudest > 0, "full throttle and full lock at 30 m/s must reach the grip limit");

  const cruising = flatSim(18);
  let quietest = 0;
  for (let tick = 0; tick < 45; tick++) {
    flatStep(cruising, { throttle: .2 });
    quietest = Math.max(quietest, tyreScrub(cruising.state.vehicle));
  }
  assert.equal(quietest, 0, "gentle cruising must stay silent");
});

// The first pass keyed squeal off combined force over grip limit. The tyre
// model clamps force AT the limit, so that read exactly 1.000 for a slide, a
// straight-line stop and flat-out acceleration alike: a constant tone carrying
// no information. Straight-line silence is the guarantee that replaced it.
test("driving in a straight line is silent however hard the car is worked", () => {
  for (const [label, speed, input] of [
    ["standing start", 0, { throttle: 1 }],
    ["flat out", 55, { throttle: 1 }],
    ["emergency stop", 40, { brake: 1 }],
  ] as const) {
    const sim = flatSim(speed);
    let loudest = 0;
    for (let tick = 0; tick < 90; tick++) {
      flatStep(sim, input);
      loudest = Math.max(loudest, tyreScrub(sim.state.vehicle));
    }
    assert.equal(loudest, 0, `${label} must not squeal: the tyres are not cornering`);
  }
});

test("cornering harder is progressively louder, and a handbrake turn is loudest", () => {
  const level = (speed: number, input: Record<string, number>) => {
    const sim = flatSim(speed);
    let peak = 0;
    for (let tick = 0; tick < 90; tick++) {
      flatStep(sim, input);
      peak = Math.max(peak, tyreScrub(sim.state.vehicle));
    }
    return peak;
  };
  const gentle = level(20, { throttle: .3, steer: .2 });
  const hard = level(25, { throttle: .3, steer: .7 });
  const sliding = level(30, { throttle: 1, steer: 1 });
  const handbrake = level(30, { handbrake: 1, steer: .7 });
  assert.equal(gentle, 0, "a gentle curve is well inside the budget");
  assert.ok(hard > 0 && hard < .5, `a hard corner should whisper, not scream: ${hard}`);
  assert.ok(sliding > .8, `a full-lock slide should be loud: ${sliding}`);
  assert.ok(handbrake >= sliding, "a handbrake turn is the loudest thing the car does");
});

test("the soundtrack manifest keeps sane entries and rejects paths", () => {
  const tracks = decodeManifest({
    version: MUSIC_MANIFEST_VERSION,
    tracks: [
      { file: "one.mp3", title: "One" },
      { file: "two.ogg" },
      { file: "../../secret.mp3" },
      { file: "nested/three.mp3" },
      { file: "back\\slash.mp3" },
      { file: "" },
      { title: "no file" },
      "not an object",
    ],
  });
  assert.deepEqual(tracks, [{ file: "one.mp3", title: "One" }, { file: "two.ogg", title: "two" }]);
});

test("a missing, wrong-version or malformed manifest yields no music rather than an error", () => {
  assert.deepEqual(decodeManifest(null), []);
  assert.deepEqual(decodeManifest({ version: 99, tracks: [{ file: "a.mp3" }] }), []);
  assert.deepEqual(decodeManifest({ version: MUSIC_MANIFEST_VERSION, tracks: "nope" }), []);
  assert.deepEqual(decodeManifest({ version: MUSIC_MANIFEST_VERSION, tracks: [] }), []);
});

test("shuffling produces a permutation and not a truncation", () => {
  const order = shuffleOrder(9, () => 0.42);
  assert.equal(order.length, 9);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(shuffleOrder(0, Math.random), []);
});

test("audio levels save, restore and reject out-of-range values", () => {
  const defaults = defaultSettings();
  assert.deepEqual(defaults.audio, DEFAULT_LEVELS);

  const store = new Map<string, string>();
  const settings = createSettingsStore(() => ({
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  }));
  settings.update({ audio: { music: 0 } });
  assert.equal(settings.get().audio.music, 0);
  assert.equal(settings.get().audio.master, DEFAULT_LEVELS.master, "one channel must not reset the others");
  assert.throws(() => settings.update({ audio: { master: 1.5 } }), RangeError);
  assert.throws(() => settings.update({ audio: { engine: Number.NaN } }), RangeError);
});

test("a version 1 save migrates instead of resetting the player's garage", () => {
  const legacy = JSON.stringify({
    version: 1, drivetrain: "rwd", customization: { paint: "blackglass", wheels: "graphite", stance: "slammed" },
  });
  const { settings, status } = decodeSettings(legacy);
  // The drivetrain became a property of the body, so a v1 save that names one
  // loses it. Dropping a field must not read as damage: "recovered" here would
  // make decodeSaves throw, and it throws for every slot, not just the old one.
  assert.ok(!("drivetrain" in settings), "a stored drivetrain must not survive as a setting");
  assert.equal(settings.customization.paint, "blackglass");
  assert.deepEqual(settings.audio, DEFAULT_LEVELS);
  assert.equal(status, "saved", "adding a field must not report the old save as damaged");

  const current = JSON.stringify({ ...settings, version: SETTINGS_VERSION });
  assert.deepEqual(decodeSettings(current).settings, settings);
  assert.equal(decodeSettings(JSON.stringify({ version: 99 })).status, "recovered");
});

// Every layer below drives a gain node or a filter gain — exhaustFormant3 is
// scaled by screamer * 12 — so a value escaping 0..1 blows out the graph, and a
// NaN makes setTargetAtTime throw and kill ALL audio at once. Silence with no
// visible cause is precisely the failure this guards, and it cannot be caught
// by the point-sample assertions above: it needs the whole envelope, including
// reverse, past redline, and either side of the 0.15 overrun threshold.
test("every engine tone layer stays finite and inside 0..1 across the envelope", () => {
  const layers = ["intake", "exhaustDrive", "screamer", "overrun", "whine", "gain", "brightness"] as const;
  let checked = 0;
  for (let speed = -HANDLING.reverseSpeed * 1.2; speed <= HANDLING.topSpeed * 1.25; speed += 0.9) {
    for (const throttle of [0, .07, .149, .15, .5, .99, 1]) {
      const tone = engineTone(stateWithUtilisation(0, speed), gas(throttle));
      for (const layer of layers) {
        const value = tone[layer];
        assert.ok(Number.isFinite(value),
          `${layer} was ${value} at ${speed.toFixed(1)} m/s, throttle ${throttle}`);
        assert.ok(value >= 0 && value <= 1,
          `${layer} left 0..1 at ${speed.toFixed(1)} m/s, throttle ${throttle}: ${value}`);
      }
      // The oscillator bank is tuned to this; zero or NaN silences the engine.
      assert.ok(Number.isFinite(tone.frequency) && tone.frequency > 0,
        `frequency was ${tone.frequency} at ${speed.toFixed(1)} m/s`);
      assert.equal(typeof tone.limiter, "boolean");
      checked++;
    }
  }
  assert.ok(checked > 500, `expected a dense sweep, only sampled ${checked} points`);
});
