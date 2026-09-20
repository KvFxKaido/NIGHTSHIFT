/** Presentation time only; a shot never advances or relocates the simulation. */
export interface GarageCutscene {
  kind: "enter" | "exit";
  elapsed: number;
  duration: number;
  roll: boolean;
}

export function createGarageCutscene(kind: GarageCutscene["kind"], roll = false): GarageCutscene {
  return { kind, elapsed: 0, duration: kind === "enter" ? 1.8 : 2.6, roll };
}

export function shotProgress(shot: GarageCutscene): number {
  return Math.max(0, Math.min(1, shot.elapsed / shot.duration));
}

export function easeShot(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

export function advanceGarageCutscene(shot: GarageCutscene, delta: number): boolean {
  shot.elapsed = Math.min(shot.duration, shot.elapsed + Math.max(0, delta));
  return shot.elapsed >= shot.duration;
}
