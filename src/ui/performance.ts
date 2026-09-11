import { createFrameMetrics } from "../debug/performance.ts";

const PERFORMANCE_KEY = "nightshift.performance";
interface RenderCounters {
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
}

/** Updates run at most four times per second, only while enabled and the tab is visible. */
export function createPerformanceOverlay() {
  const panel = document.getElementById("performance-metrics")!;
  const button = document.querySelector<HTMLButtonElement>("[data-performance-toggle]")!;
  const note = document.querySelector<HTMLElement>("[data-performance-status]")!;
  const metrics = createFrameMetrics();
  let enabled = false, lastUpdate = -Infinity;
  try { enabled = localStorage.getItem(PERFORMANCE_KEY) === "on"; } catch { /* Session toggle still works. */ }
  function refresh() {
    panel.hidden = !enabled;
    button.textContent = `Performance metrics: ${enabled ? "On" : "Off"}`;
    button.setAttribute("aria-pressed", String(enabled));
    document.body.dataset.performance = enabled ? "on" : "off";
  }
  function reset() {
    metrics.reset(); lastUpdate = -Infinity;
    panel.textContent = "PERFORMANCE\nCollecting frames…";
  }
  button.addEventListener("click", () => {
    enabled = !enabled; reset(); refresh();
    try {
      localStorage.setItem(PERFORMANCE_KEY, enabled ? "on" : "off");
      note.textContent = "Saved on this browser.";
    } catch { note.textContent = "Changed for this session. Browser storage is unavailable."; }
  });
  document.addEventListener("visibilitychange", reset);
  reset(); refresh();
  return {
    enabled: () => enabled && !document.hidden,
    reset,
    record(timestamp: number, simMs: number, renderMs: number, info: RenderCounters, width: number, height: number, state: string) {
      if (!enabled || document.hidden) return;
      metrics.record(timestamp, simMs, renderMs);
      if (timestamp - lastUpdate < 250) return;
      const values = metrics.read();
      if (!values) return;
      lastUpdate = timestamp;
      const count = (n: number) => n.toLocaleString("en-US");
      panel.textContent = `PERFORMANCE / ${state.toUpperCase()}\n`
        + `${values.fps.toFixed(0)} FPS · ${values.frameMs.toFixed(1)} ms avg\n`
        + `Frame p95   ${values.p95Ms.toFixed(1)} ms\n`
        + `Sim CPU     ${values.simMs.toFixed(2)} ms\n`
        + `Render CPU  ${values.renderMs.toFixed(2)} ms\n`
        + `Draw calls  ${count(info.render.calls)}\n`
        + `Triangles   ${count(info.render.triangles)}\n`
        + `Resources   ${count(info.memory.geometries)} geo / ${count(info.memory.textures)} tex\n`
        + `Buffer      ${width} × ${height}`;
    },
  };
}
