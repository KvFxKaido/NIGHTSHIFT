import type { Input, VehicleState } from "../sim/sim.ts";
import {
  DEFAULT_LEVELS, engineTone, IDLE_RPM, REDLINE_RPM, tyreScrub, windLevel, type AudioLevels,
} from "./audio-mix.ts";

/**
 * The WebAudio half of the car's voice. All decisions live in audio-mix.ts;
 * this only builds the graph and follows. Every source is synthesised, so no
 * audio asset ships and GDD 21's licensed-soundtrack exclusion is untouched.
 */

/** One second of white noise, shared by the scrub, wind, intake, and pop buses. */
function noiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  // Presentation randomness only. It never reaches a tick, so it cannot make a
  // run irreproducible; law 2 constrains the simulation, not the speaker.
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  return buffer;
}

function noiseSource(context: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start();
  return source;
}

/**
 * Asymmetric soft-saturation curve for exhaust pulses.
 * Combines hyperbolic tangent compression with subtle even-harmonic warmth,
 * producing metallic rasp and bite without DC offset at rest.
 */
function exhaustCurve(samples = 2048): Float32Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    const y = Math.tanh(2.2 * x) + 0.15 * Math.sin(Math.PI * x);
    curve[i] = y * 0.72;
  }
  return curve;
}

export interface CarAudio {
  readonly context: AudioContext;
  /** Music is mixed here so one master fader governs everything. */
  readonly musicBus: GainNode;
  update(vehicle: VehicleState, input: Input, active: boolean): void;
  setLevels(levels: Partial<AudioLevels>): void;
  levels(): AudioLevels;
  dispose(): void;
}

export function createCarAudio(context: AudioContext, initial: AudioLevels = DEFAULT_LEVELS): CarAudio {
  let levels: AudioLevels = { ...initial };
  const master = context.createGain();
  master.gain.value = levels.master;
  master.connect(context.destination);

  const musicBus = context.createGain();
  musicBus.gain.value = levels.music;
  musicBus.connect(master);

  const carBus = context.createGain();
  carBus.gain.value = levels.engine;
  carBus.connect(master);

  // Common noise buffer for wind, tire scrub, intake suction, and decel pops
  const buffer = noiseBuffer(context);

  // --------------------------------------------------------------------------
  // Combustion Pulse Generator: Inline-4 with Crank Subharmonic & Partials
  // --------------------------------------------------------------------------
  const pulseBus = context.createGain();
  pulseBus.gain.value = 0.55;

  const partials = [
    // Crank subharmonic (0.5x ratio): 1st engine order, crank rotation asymmetry & thump
    { node: context.createOscillator(), type: "square" as const, ratio: 0.5, detune: -5, gain: 0.18 },
    // Firing fundamental (1.0x ratio): 2nd engine order, main cylinder combustion
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 1.0, detune: 0, gain: 0.45 },
    // 2nd firing harmonic (2.0x ratio): 4th engine order, exhaust valve events
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 2.0, detune: 5, gain: 0.28 },
    // 3rd firing harmonic (3.0x ratio): 6th engine order, manifold resonance
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 3.0, detune: -3, gain: 0.18 },
    // 4th firing harmonic (4.0x ratio): 8th engine order, high-RPM metallic sizzle
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 4.0, detune: 7, gain: 0.12 },
  ];

  for (const partial of partials) {
    partial.node.type = partial.type;
    partial.node.detune.value = partial.detune;
    const gainNode = context.createGain();
    gainNode.gain.value = partial.gain;
    partial.node.connect(gainNode).connect(pulseBus);
    partial.node.start();
  }

  // Idle cam lope: subtle subharmonic wobble on fundamental and crank order
  const idleLfo = context.createOscillator();
  idleLfo.type = "sine";
  idleLfo.frequency.value = 4.5;
  const idleLfoGain = context.createGain();
  idleLfoGain.gain.value = 0;
  idleLfo.connect(idleLfoGain);
  idleLfoGain.connect(partials[0].node.detune);
  idleLfoGain.connect(partials[1].node.detune);
  idleLfo.start();

  // --------------------------------------------------------------------------
  // Exhaust Signal Path: Waveshaper Saturation + Formant Resonators
  // --------------------------------------------------------------------------
  const exhaustDriveGain = context.createGain();
  exhaustDriveGain.gain.value = 0.6;
  pulseBus.connect(exhaustDriveGain);

  const exhaustShaper = context.createWaveShaper();
  exhaustShaper.curve = exhaustCurve();
  exhaustShaper.oversample = "4x";
  exhaustDriveGain.connect(exhaustShaper);

  // Formant 1: Body / Chassis Thump (~140 Hz)
  const exhaustFormant1 = context.createBiquadFilter();
  exhaustFormant1.type = "bandpass";
  exhaustFormant1.frequency.value = 140;
  exhaustFormant1.Q.value = 2.2;
  const formant1Gain = context.createGain();
  formant1Gain.gain.value = 0.55;
  exhaustShaper.connect(exhaustFormant1).connect(formant1Gain);

  // Formant 2: Collector / Header Throat (~580 Hz)
  const exhaustFormant2 = context.createBiquadFilter();
  exhaustFormant2.type = "bandpass";
  exhaustFormant2.frequency.value = 580;
  exhaustFormant2.Q.value = 2.0;
  const formant2Gain = context.createGain();
  formant2Gain.gain.value = 0.50;
  exhaustShaper.connect(exhaustFormant2).connect(formant2Gain);

  // Formant 3: High-Cam Screamer / Metallic Ring (~2200 Hz)
  const exhaustFormant3 = context.createBiquadFilter();
  exhaustFormant3.type = "peaking";
  exhaustFormant3.frequency.value = 2200;
  exhaustFormant3.Q.value = 2.6;
  exhaustFormant3.gain.value = 0;
  const formant3Gain = context.createGain();
  formant3Gain.gain.value = 0.35;
  exhaustShaper.connect(exhaustFormant3).connect(formant3Gain);

  // Master exhaust tone lowpass filter
  const exhaustToneFilter = context.createBiquadFilter();
  exhaustToneFilter.type = "lowpass";
  exhaustToneFilter.Q.value = 1.0;
  exhaustToneFilter.frequency.value = 1200;

  formant1Gain.connect(exhaustToneFilter);
  formant2Gain.connect(exhaustToneFilter);
  formant3Gain.connect(exhaustToneFilter);

  const exhaustMasterGain = context.createGain();
  exhaustMasterGain.gain.value = 0;
  exhaustToneFilter.connect(exhaustMasterGain);

  // --------------------------------------------------------------------------
  // Intake / Induction Roar: Throttle Honk + Suction Texture
  // --------------------------------------------------------------------------
  const intakeFilter = context.createBiquadFilter();
  intakeFilter.type = "bandpass";
  intakeFilter.frequency.value = 260;
  intakeFilter.Q.value = 3.2;
  pulseBus.connect(intakeFilter);

  const intakeRoarGain = context.createGain();
  intakeRoarGain.gain.value = 0;
  intakeFilter.connect(intakeRoarGain);

  const intakeNoise = noiseSource(context, buffer);
  const intakeNoiseFilter = context.createBiquadFilter();
  intakeNoiseFilter.type = "bandpass";
  intakeNoiseFilter.frequency.value = 1400;
  intakeNoiseFilter.Q.value = 2.8;
  const intakeNoiseGain = context.createGain();
  intakeNoiseGain.gain.value = 0;
  intakeNoise.connect(intakeNoiseFilter).connect(intakeNoiseGain).connect(intakeRoarGain);

  // --------------------------------------------------------------------------
  // Engine Bus & Rev Limiter Gate
  // --------------------------------------------------------------------------
  const limiterGate = context.createGain();
  limiterGate.gain.value = 1.0;
  exhaustMasterGain.connect(limiterGate);
  intakeRoarGain.connect(limiterGate);
  limiterGate.connect(carBus);

  // --------------------------------------------------------------------------
  // Decel Overrun Pops & Burbles
  // --------------------------------------------------------------------------
  const popNoise = noiseSource(context, buffer);
  const popFilter = context.createBiquadFilter();
  popFilter.type = "bandpass";
  popFilter.frequency.value = 950;
  popFilter.Q.value = 3.6;
  const popGain = context.createGain();
  popGain.gain.value = 0;
  popNoise.connect(popFilter).connect(popGain).connect(carBus);

  // --------------------------------------------------------------------------
  // Transmission / Straight-Cut Gear Whine
  // --------------------------------------------------------------------------
  const whineOsc = context.createOscillator();
  whineOsc.type = "triangle";
  const whineFilter = context.createBiquadFilter();
  whineFilter.type = "bandpass";
  whineFilter.frequency.value = 1600;
  whineFilter.Q.value = 2.4;
  const whineGain = context.createGain();
  whineGain.gain.value = 0;
  whineOsc.connect(whineFilter).connect(whineGain).connect(carBus);
  whineOsc.start();

  // --------------------------------------------------------------------------
  // Road & Environment: Tyre Scrub and Wind Roar
  // --------------------------------------------------------------------------
  const scrubFilter = context.createBiquadFilter();
  scrubFilter.type = "bandpass";
  scrubFilter.Q.value = 6.5;
  scrubFilter.frequency.value = 1400;
  const scrubGain = context.createGain();
  scrubGain.gain.value = 0;
  const scrub = noiseSource(context, buffer);
  scrub.connect(scrubFilter).connect(scrubGain).connect(carBus);

  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 420;
  const windGain = context.createGain();
  windGain.gain.value = 0;
  const wind = noiseSource(context, buffer);
  wind.connect(windFilter).connect(windGain).connect(carBus);

  // Ramp rather than assign: stepping a gain or a frequency once per frame
  // clicks audibly, and the note has to glide between gears anyway.
  const glide = (param: AudioParam, value: number, seconds: number) => {
    param.setTargetAtTime(value, context.currentTime, seconds);
  };

  let nextPopTime = 0;
  let nextLimiterCutTime = 0;

  return {
    context,
    musicBus,
    update(vehicle, input, active) {
      if (!active) {
        glide(exhaustMasterGain.gain, 0, .08);
        glide(intakeRoarGain.gain, 0, .05);
        glide(popGain.gain, 0, .03);
        glide(whineGain.gain, 0, .06);
        glide(scrubGain.gain, 0, .05);
        glide(windGain.gain, 0, .08);
        return;
      }
      const tone = engineTone(vehicle, input);

      // Partials pitch glide
      for (const partial of partials) {
        glide(partial.node.frequency, Math.max(20, tone.frequency * partial.ratio), .035);
      }

      // Cam lope at idle (< 1400 RPM)
      if (tone.rpm < 1400) {
        const idleLurch = Math.max(0, 1 - (tone.rpm - IDLE_RPM) / 500);
        glide(idleLfoGain.gain, idleLurch * 18, .05);
      } else {
        glide(idleLfoGain.gain, 0, .05);
      }

      // Exhaust drive, formants, and master level
      glide(exhaustDriveGain.gain, 0.6 + tone.exhaustDrive * 1.6, .04);
      glide(exhaustFormant3.gain, tone.screamer * 12, .04);
      glide(formant3Gain.gain, 0.35 + tone.screamer * 0.45, .04);
      glide(exhaustToneFilter.frequency, 1200 + tone.brightness * 6200, .04);
      glide(exhaustMasterGain.gain, tone.gain * 0.55, .04);

      // Intake roar: sharp throttle response and Helmholtz frequency shift
      glide(intakeFilter.frequency, 220 + (tone.rpm / REDLINE_RPM) * 220, .04);
      glide(intakeRoarGain.gain, tone.intake * 0.60, .025);
      glide(intakeNoiseGain.gain, tone.intake * 0.12, .025);

      // Rev limiter stutter (ignition cut oscillation when bouncing at redline)
      if (tone.limiter) {
        const now = context.currentTime;
        if (now >= nextLimiterCutTime) {
          limiterGate.gain.cancelScheduledValues(now);
          limiterGate.gain.setValueAtTime(0.12, now);
          limiterGate.gain.setValueAtTime(1.0, now + 0.018);
          nextLimiterCutTime = now + 0.045;
        }
      } else {
        glide(limiterGate.gain, 1.0, .03);
        nextLimiterCutTime = 0;
      }

      // Decel overrun pops & crackles
      if (tone.overrun > 0.25) {
        const now = context.currentTime;
        if (now >= nextPopTime) {
          if (Math.random() < tone.overrun * 0.75) {
            const popAmp = (0.08 + Math.random() * 0.20) * tone.overrun;
            popGain.gain.cancelScheduledValues(now);
            popGain.gain.setValueAtTime(popAmp, now);
            popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018 + Math.random() * 0.025);
          }
          nextPopTime = now + 0.05 + Math.random() * 0.08;
        }
      } else {
        popGain.gain.cancelScheduledValues(context.currentTime);
        popGain.gain.setValueAtTime(0, context.currentTime);
        nextPopTime = 0;
      }

      // Transmission straight-cut whine
      glide(whineOsc.frequency, 160 + Math.abs(vehicle.forwardSpeed) * 52, .04);
      glide(whineFilter.frequency, 260 + Math.abs(vehicle.forwardSpeed) * 58, .04);
      glide(whineGain.gain, tone.whine * 0.055, .04);

      // Tyre scrub and wind roar
      const scrubbing = tyreScrub(vehicle);
      glide(scrubGain.gain, scrubbing * .34, .03);
      glide(scrubFilter.frequency, 1150 + scrubbing * 900, .05);

      glide(windGain.gain, windLevel(vehicle) * .3, .08);
    },
    setLevels(update) {
      levels = { ...levels, ...update };
      glide(master.gain, levels.master, .02);
      glide(carBus.gain, levels.engine, .02);
      glide(musicBus.gain, levels.music, .02);
    },
    levels: () => ({ ...levels }),
    dispose() {
      for (const partial of partials) partial.node.stop();
      idleLfo.stop();
      intakeNoise.stop();
      popNoise.stop();
      whineOsc.stop();
      scrub.stop();
      wind.stop();
      master.disconnect();
    },
  };
}
