import type { Input, VehicleState } from "../sim/sim.ts";
import {
  DEFAULT_LEVELS, engineTone, tyreScrub, windLevel, type AudioLevels,
} from "./audio-mix.ts";

/**
 * The WebAudio half of the car's voice. All decisions live in audio-mix.ts;
 * this only builds the graph and follows. Every source is synthesised, so no
 * audio asset ships and GDD 21's licensed-soundtrack exclusion is untouched.
 */

/** One second of white noise, shared by the scrub and wind buses. */
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

  // Engine: a saw at the firing fundamental, a detuned octave for thickness,
  // and a half-frequency square for the lump you feel more than hear.
  const engineFilter = context.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.Q.value = 1.4;
  const engineGain = context.createGain();
  engineGain.gain.value = 0;
  engineFilter.connect(engineGain).connect(carBus);
  const partials = [
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 1, detune: 0, gain: .55 },
    { node: context.createOscillator(), type: "sawtooth" as const, ratio: 2, detune: 7, gain: .22 },
    { node: context.createOscillator(), type: "square" as const, ratio: .5, detune: -5, gain: .3 },
  ];
  for (const partial of partials) {
    partial.node.type = partial.type;
    partial.node.detune.value = partial.detune;
    const gain = context.createGain();
    gain.gain.value = partial.gain;
    partial.node.connect(gain).connect(engineFilter);
    partial.node.start();
  }

  const buffer = noiseBuffer(context);
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

  return {
    context,
    musicBus,
    update(vehicle, input, active) {
      if (!active) {
        glide(engineGain.gain, 0, .08);
        glide(scrubGain.gain, 0, .05);
        glide(windGain.gain, 0, .08);
        return;
      }
      const tone = engineTone(vehicle, input);
      for (const partial of partials) {
        glide(partial.node.frequency, Math.max(20, tone.frequency * partial.ratio), .035);
      }
      glide(engineFilter.frequency, 320 + tone.brightness * 4400, .05);
      glide(engineGain.gain, tone.gain * .5, .05);

      const scrubbing = tyreScrub(vehicle);
      glide(scrubGain.gain, scrubbing * .34, .03);
      // Rising pitch as the tyre goes further past its budget: a slide that is
      // getting worse should sound like it is getting worse.
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
      scrub.stop();
      wind.stop();
      master.disconnect();
    },
  };
}
