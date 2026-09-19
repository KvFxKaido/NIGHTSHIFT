import { trackPath } from "./soundtrack.ts";

export interface ThemeConfig {
  file: string;
  title: string;
  volume: number;
  start: number;
  loopStart: number | null;
  loopEnd: number | null;
}

export function decodeTheme(value: unknown): ThemeConfig | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.file !== "string" || !data.file || /[/\\]|\.\./.test(data.file)) return null;
  const seconds = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const start = seconds(data.start) ?? 0;
  const loopStart = seconds(data.loopStart);
  const end = seconds(data.loopEnd);
  return {
    file: data.file,
    title: typeof data.title === "string" && data.title.trim() ? data.title : "Menu theme",
    volume: typeof data.volume === "number" && Number.isFinite(data.volume) ? Math.max(0, Math.min(1, data.volume)) : 1,
    start,
    loopStart,
    loopEnd: end !== null && end > Math.max(start, loopStart ?? start) ? end : null,
  };
}

export interface MenuTheme {
  setActive(active: boolean): void;
  update(): void;
  retry(): void;
  status(): { title: string | null; playing: boolean; time: number; failed: boolean };
}

/** Seconds the theme takes to fade in on a menu, or out into a drive. */
export const THEME_FADE = .8;

/** A local override wins, including an explicit { file: null } to disable it. */
export async function loadMenuTheme(context: AudioContext, destination: AudioNode, base = document.baseURI): Promise<MenuTheme> {
  let config: ThemeConfig | null = null;
  for (const name of ["theme.local.json", "theme.json"]) {
    try {
      const response = await fetch(new URL(`assets/menu-theme/${name}`, base));
      if (!response.ok) continue;
      config = decodeTheme(await response.json());
      break;
    } catch { /* An absent local override is normal. */ }
  }
  return createMenuTheme(context, destination, config, base);
}

/**
 * The theme plays from a decoded buffer, and the loop is the buffer source's
 * own: sample accurate, so a bar-exact loop comes round without a seam. It was
 * a media element seeking itself back at `loopEnd`, which cost about 20 ms of
 * silence every time round (measured 2026-09-19 on a 76-bar loop at 152 BPM,
 * where a sixteenth is 98 ms). The file's whole intro plays first, once.
 */
export function createMenuTheme(context: AudioContext, destination: AudioNode, config: ThemeConfig | null, base: string): MenuTheme {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let active = false;
  let failed = false;
  /** Where the theme stands while nothing is playing; a menu resumes from here. */
  let held = config?.start ?? 0;
  /** The live source's start: when it began, and where in the file it began. */
  let startedAt = 0;
  let startedFrom = held;
  let stopAt = Infinity;

  /** The loop's points, inside the file however the config is written. */
  function bounds(): { from: number; to: number } {
    const duration = buffer?.duration ?? 0;
    const to = Math.min(config?.loopEnd ?? duration, duration);
    const from = Math.max(0, Math.min(config?.loopStart ?? config?.start ?? 0, Math.max(0, to - .05)));
    return { from, to };
  }

  /** Where in the file the theme is now, carried round the loop. */
  function position(): number {
    if (!source || !buffer) return held;
    const { from, to } = bounds();
    const played = startedFrom + (context.currentTime - startedAt);
    if (played < to) return played;
    const span = to - from;
    return span > 0 ? from + (played - to) % span : from;
  }

  function stop(): void {
    if (!source) return;
    try { source.stop(); } catch { /* a source that never started */ }
    source.disconnect();
    source = null;
  }

  function begin(at: number): void {
    if (!buffer || failed) return;
    stop();
    const { from, to } = bounds();
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.loop = to > from;
    node.loopStart = from;
    node.loopEnd = to;
    node.connect(gain);
    startedFrom = Math.max(0, Math.min(at, Math.max(0, buffer.duration - .01)));
    startedAt = context.currentTime;
    node.start(0, startedFrom);
    source = node;
  }

  if (config) {
    // Decoded once, up front: the menu is where the game waits anyway, and a
    // decoded buffer is what makes the loop seamless.
    void (async () => {
      try {
        const response = await fetch(new URL(`assets/menu-theme/${trackPath(config.file)}`, base).href);
        if (!response.ok) throw new Error(String(response.status));
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (active && !source) begin(held);
      } catch {
        failed = true;
      }
    })();
  }

  return {
    setActive(next) {
      if (active === next) return;
      active = next;
      const now = context.currentTime;
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(active ? config?.volume ?? 0 : 0, now + THEME_FADE);
      if (active) {
        stopAt = Infinity;
        if (!source) begin(held);
      } else {
        stopAt = now + THEME_FADE;
      }
    },
    update() {
      // Faded out: hold where the music stood, then let the source go.
      if (!active && source && context.currentTime >= stopAt) {
        held = position();
        stop();
        stopAt = Infinity;
      }
    },
    retry() {
      if (failed) return;
      // A context the browser refused to start until a gesture; main.ts resumes
      // it too, and the source picks up where the theme was held.
      if (context.state === "suspended") void context.resume().catch(() => { /* still refused */ });
      if (active && !source) begin(held);
    },
    status: () => ({ title: config?.title ?? null, playing: active && !!source && !failed, time: position(), failed }),
  };
}
