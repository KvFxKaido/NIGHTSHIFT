import type { Input, VehicleState } from "../sim/sim.ts";
import { engineTone, impliedThrottle, passBy } from "./audio-mix.ts";

/**
 * The other car's voice: the nearest moving named car (the race rival, Moth, a
 * cruiser) heard from the player's seat, swept by Doppler as it goes by
 * (`passBy`). One voice, not one per car: in a race there is one rival, and in
 * free roam two names are rarely in earshot at once. Traffic stays silent.
 *
 * Lighter than the player's engine on purpose: three partials through a soft
 * clipper and a lowpass, no formants, pops or whine. It has to read as a car going
 * past, not compete with the one being driven. Presentation only, like the rest.
 */
export interface OtherCar {
  vehicle: VehicleState;
  /** The rival's logged input when there is one; cruisers are heard from their acceleration. */
  input?: Input;
  topSpeed: number;
}

export interface PassByVoice {
  update(listener: VehicleState, others: readonly OtherCar[], active: boolean): void;
  dispose(): void;
}

const VOICE_LEVEL = .42;

export function createPassByVoice(context: AudioContext, destination: AudioNode): PassByVoice {
  const sum = context.createGain();
  sum.gain.value = .3;
  const partials = [
    { ratio: .5, type: "square" as const, gain: .25 },
    { ratio: 1, type: "sawtooth" as const, gain: .5 },
    { ratio: 2, type: "sawtooth" as const, gain: .22 },
  ].map(spec => {
    const node = context.createOscillator();
    node.type = spec.type;
    node.frequency.value = 60;
    const level = context.createGain();
    level.gain.value = spec.gain;
    node.connect(level).connect(sum);
    node.start();
    return { node, ratio: spec.ratio };
  });

  const shaper = context.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2 * (i * 2 / curve.length - 1));
  shaper.curve = curve;
  const tone = context.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = .8;
  tone.frequency.value = 2000;
  const level = context.createGain();
  level.gain.value = 0;
  const panner = context.createStereoPanner();
  sum.connect(shaper).connect(tone).connect(level).connect(panner).connect(destination);

  const glide = (param: AudioParam, value: number, seconds: number) => {
    param.setTargetAtTime(value, context.currentTime, seconds);
  };

  return {
    update(listener, others, active) {
      let nearest: OtherCar | null = null, best = Infinity;
      for (const other of others) {
        const d = Math.hypot(other.vehicle.x - listener.x, other.vehicle.z - listener.z);
        if (d < best) { best = d; nearest = other; }
      }
      if (!active || !nearest) {
        glide(level.gain, 0, .1);
        return;
      }
      const heard = passBy(listener, nearest.vehicle);
      const input = nearest.input ?? { throttle: impliedThrottle(nearest.vehicle), brake: 0, steer: 0, handbrake: 0 };
      const note = engineTone(nearest.vehicle, input, nearest.topSpeed);
      for (const partial of partials) glide(partial.node.frequency, Math.max(20, note.frequency * partial.ratio * heard.pitch), .03);
      glide(tone.frequency, (900 + note.brightness * 3600) * (1 - heard.muffle * .75), .05);
      glide(level.gain, heard.gain * note.gain * VOICE_LEVEL, .05);
      glide(panner.pan, heard.pan, .05);
    },
    dispose() {
      for (const partial of partials) partial.node.stop();
      panner.disconnect();
    },
  };
}
