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

export function createMenuTheme(context: AudioContext, destination: AudioNode, config: ThemeConfig | null, base: string): MenuTheme {
  const element = new Audio();
  element.preload = "metadata";
  const gain = context.createGain();
  gain.gain.value = 0;
  context.createMediaElementSource(element).connect(gain);
  gain.connect(destination);
  let active = false;
  let failed = false;
  let blocked = false;
  let pauseAt = Infinity;

  function play(): void {
    if (!active || !config || failed) return;
    blocked = false;
    void element.play().catch((error: unknown) => {
      const name = (error as { name?: string })?.name;
      if (name === "NotAllowedError") blocked = true;
      else if (name !== "AbortError") failed = true;
    });
  }

  // Bad timing values never strand the player beyond the end of the file.
  function boundedTime(time: number): number {
    return Number.isFinite(element.duration) && time < element.duration ? time : 0;
  }
  function repeat(): void {
    if (!config || !active) return;
    element.currentTime = boundedTime(config.loopStart ?? config.start);
    play();
  }
  element.addEventListener("loadedmetadata", () => {
    element.currentTime = boundedTime(config?.start ?? 0);
  });
  element.addEventListener("ended", repeat);
  element.addEventListener("error", () => { failed = true; });
  if (config) element.src = new URL(`assets/menu-theme/${trackPath(config.file)}`, base).href;

  return {
    setActive(next) {
      if (active === next) return;
      active = next;
      const now = context.currentTime;
      gain.gain.cancelAndHoldAtTime(now);
      gain.gain.linearRampToValueAtTime(active ? config?.volume ?? 0 : 0, now + .8);
      pauseAt = active ? Infinity : now + .8;
      if (active) {
        if (element.ended) element.currentTime = boundedTime(config?.loopStart ?? config?.start ?? 0);
        play();
      }
    },
    update() {
      if (!active && context.currentTime >= pauseAt) { element.pause(); pauseAt = Infinity; }
      if (active && config?.loopEnd !== null && config?.loopEnd !== undefined && element.currentTime >= config.loopEnd) repeat();
    },
    retry() { if (blocked) play(); },
    status: () => ({ title: config?.title ?? null, playing: active && !element.paused && !failed, time: element.currentTime, failed }),
  };
}
