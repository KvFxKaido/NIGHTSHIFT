export interface FrameSample { frameMs: number; simMs: number; renderMs: number }

/** Last two seconds of animation-frame intervals, independent of clamped sim dt. */
export function createFrameMetrics() {
  let previous: number | null = null;
  let elapsed = 0;
  const samples: FrameSample[] = [];
  return {
    reset() { previous = null; elapsed = 0; samples.length = 0; },
    record(timestamp: number, simMs: number, renderMs: number) {
      const frameMs = previous === null ? 0 : timestamp - previous;
      previous = timestamp;
      if (!Number.isFinite(frameMs) || frameMs <= 0) return;
      samples.push({ frameMs, simMs, renderMs }); elapsed += frameMs;
      // Retain a long stall rather than trimming away the only sample of it.
      while (samples.length > 1 && elapsed - samples[0]!.frameMs >= 2000) elapsed -= samples.shift()!.frameMs;
    },
    read() {
      if (!samples.length) return null;
      const sorted = samples.map(s => s.frameMs).sort((a, b) => a - b);
      return {
        fps: samples.length * 1000 / elapsed,
        frameMs: elapsed / samples.length,
        p95Ms: sorted[Math.ceil(sorted.length * .95) - 1]!,
        simMs: samples.reduce((sum, s) => sum + s.simMs, 0) / samples.length,
        renderMs: samples.reduce((sum, s) => sum + s.renderMs, 0) / samples.length,
      };
    },
  };
}
