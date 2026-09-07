/**
 * Custom soundtrack: the player supplies the music.
 *
 * GDD 21 rules out a licensed soundtrack, which is a shipping-rights problem.
 * Playing files the player already owns is a different thing entirely, and it
 * is how a street racer gets a soundtrack without licensing one. Nothing here
 * downloads, bundles or ships audio.
 *
 * A browser cannot list a served directory, so `public/assets/music/` carries a
 * manifest that `pnpm music:scan` writes. Drop files in, run the scan, drive.
 */

export const MUSIC_MANIFEST_PATH = "assets/music/manifest.json";
export const MUSIC_MANIFEST_VERSION = 1;

export interface MusicTrack {
  file: string;
  title: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The manifest is user-authored, so treat it as untrusted. Keep the entries
 * that make sense and ignore the rest rather than refusing to play anything.
 * A path is a bare filename: no directory traversal, no absolute URLs.
 */
export function decodeManifest(data: unknown): MusicTrack[] {
  if (!record(data) || data.version !== MUSIC_MANIFEST_VERSION || !Array.isArray(data.tracks)) return [];
  const tracks: MusicTrack[] = [];
  for (const entry of data.tracks) {
    if (!record(entry)) continue;
    const file = entry.file;
    if (typeof file !== "string" || !file || file.includes("/") || file.includes("\\") || file.includes("..")) continue;
    const title = typeof entry.title === "string" && entry.title ? entry.title : file.replace(/\.[^.]+$/, "");
    tracks.push({ file, title });
  }
  return tracks;
}

/** Deterministic given `pick`; the caller decides how random the order is. */
export function shuffleOrder(count: number, pick: () => number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const other = Math.floor(pick() * (index + 1));
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return order;
}

export interface Soundtrack {
  tracks(): readonly MusicTrack[];
  nowPlaying(): MusicTrack | null;
  isPlaying(): boolean;
  toggle(): void;
  next(): void;
  previous(): void;
  stop(): void;
  /** Fires whenever the track or play state changes, for the menu label. */
  onChange(listener: () => void): void;
}

export async function loadSoundtrack(
  context: AudioContext,
  destination: AudioNode,
  base = document.baseURI,
): Promise<Soundtrack> {
  let tracks: MusicTrack[] = [];
  try {
    const response = await fetch(new URL(MUSIC_MANIFEST_PATH, base).href);
    // No manifest is the ordinary state, not a failure: most people will never
    // add music, and an empty music folder must not look like a broken game.
    if (response.ok) tracks = decodeManifest(await response.json());
  } catch {
    tracks = [];
  }

  const element = new Audio();
  element.preload = "none";
  const source = context.createMediaElementSource(element);
  source.connect(destination);

  let order = shuffleOrder(tracks.length, Math.random);
  let position = 0;
  let playing = false;
  const listeners: (() => void)[] = [];
  const changed = () => { for (const listener of listeners) listener(); };

  const current = (): MusicTrack | null =>
    tracks.length ? tracks[order[position % order.length]!] ?? null : null;

  function load(autoplay: boolean): void {
    const track = current();
    if (!track) return;
    element.src = new URL(`assets/music/${encodeURIComponent(track.file)}`, base).href;
    if (autoplay) void element.play().catch(() => { playing = false; changed(); });
    changed();
  }

  element.addEventListener("ended", () => { position++; load(true); });
  // A file that will not decode should skip, not silently end the soundtrack.
  element.addEventListener("error", () => { if (playing && tracks.length > 1) { position++; load(true); } });

  return {
    tracks: () => tracks,
    nowPlaying: () => (playing ? current() : null),
    isPlaying: () => playing,
    toggle() {
      if (!tracks.length) return;
      playing = !playing;
      if (playing) {
        if (!element.src) load(true);
        else void element.play().catch(() => { playing = false; changed(); });
      } else element.pause();
      changed();
    },
    next() { if (!tracks.length) return; position++; load(playing); },
    previous() { if (!tracks.length) return; position = (position - 1 + order.length) % order.length; load(playing); },
    stop() { playing = false; element.pause(); changed(); },
    onChange(listener) { listeners.push(listener); },
  };
}
