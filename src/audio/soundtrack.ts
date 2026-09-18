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

/**
 * A filename as one URL path segment. encodeURIComponent also escapes the
 * characters a path carries as they are (& $ + , ; = : @), and Vite's dev
 * server answers those escaped with the game's page instead of the file: every
 * track with an & in its name failed to open. `#` and `?` must stay escaped and
 * still fail there, so the scan warns about them.
 */
export function trackPath(file: string): string {
  return encodeURIComponent(file).replace(/%(24|26|2B|2C|3A|3B|3D|40)/gi, decodeURIComponent);
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
  /** True once every track in turn has failed to load: the files are not where
   *  the manifest says. Play tries them all again. */
  failed(): boolean;
  isShuffled(): boolean;
  /** Shuffle on or off. The track loaded now keeps playing; the order after it changes. */
  setShuffle(on: boolean): void;
  /** Fires whenever the track or play state changes, for the menu label. */
  onChange(listener: () => void): void;
}

export interface SoundtrackOptions {
  /** On by default: the soundtrack always shuffled before it could be turned off. */
  shuffle?: boolean;
  /** The shuffle's randomness; tests pass a seeded one. */
  pick?: () => number;
}

export async function loadSoundtrack(
  context: AudioContext,
  destination: AudioNode,
  base = document.baseURI,
  options: SoundtrackOptions = {},
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

  const pick = options.pick ?? Math.random;
  let shuffle = options.shuffle ?? true;
  /** Name order, which is the manifest's: the scan sorts it. */
  const named = () => tracks.map((_, index) => index);
  /** A fresh shuffle that does not open on `after`, the track that just
   *  played, so a new lap never plays the same song twice running. */
  function shuffled(after?: number): number[] {
    const next = shuffleOrder(tracks.length, pick);
    if (next.length > 1 && next[0] === after) [next[0], next[1]] = [next[1]!, next[0]!];
    return next;
  }
  // One order for the whole session used to repeat, lap after lap.
  let order = shuffle ? shuffled() : named();
  let position = 0;
  let playing = false;
  let failures = 0;
  const listeners: (() => void)[] = [];
  const changed = () => { for (const listener of listeners) listener(); };

  const current = (): MusicTrack | null => tracks[order[position] ?? -1] ?? null;

  /** One track on or back. Past the end of a shuffled lap comes a new shuffle. */
  function advance(step: 1 | -1): void {
    if (!tracks.length) return;
    const played = order[position];
    position += step;
    if (position >= order.length) {
      position = 0;
      if (shuffle) order = shuffled(played);
    } else if (position < 0) position = order.length - 1;
  }

  // Only a refused autoplay stops the soundtrack here. A file that cannot be
  // read rejects play() too, but its error event (below) decides what happens
  // next; and a skip rejects the play() it interrupts. Letting either stop the
  // soundtrack cut off the track that replaced it, so one unreadable file
  // silenced the music instead of being skipped.
  function start(): void {
    void element.play().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name === "NotAllowedError") { playing = false; changed(); }
    });
  }

  function load(autoplay: boolean): void {
    const track = current();
    if (!track) return;
    element.src = new URL(`assets/music/${trackPath(track.file)}`, base).href;
    if (autoplay) start();
    changed();
  }

  element.addEventListener("ended", () => { advance(1); load(true); });
  element.addEventListener("playing", () => { failures = 0; });
  // A file that will not decode should skip, not silently end the soundtrack;
  // but once every track has failed in a row, stop. A manifest older than a
  // rename names files that are not there, and skipping on would request them
  // one after another for as long as the game ran.
  element.addEventListener("error", () => {
    if (!playing) return;
    if (++failures >= tracks.length) { playing = false; changed(); return; }
    advance(1); load(true);
  });

  return {
    tracks: () => tracks,
    nowPlaying: () => (playing ? current() : null),
    isPlaying: () => playing,
    toggle() {
      if (!tracks.length) return;
      playing = !playing;
      if (playing) {
        if (failures >= tracks.length) { failures = 0; advance(1); load(true); }
        else if (!element.src) load(true);
        else start();
      } else element.pause();
      changed();
    },
    next() { if (!tracks.length) return; advance(1); load(playing); },
    previous() { if (!tracks.length) return; advance(-1); load(playing); },
    stop() { playing = false; element.pause(); changed(); },
    failed: () => failures >= tracks.length && tracks.length > 0,
    isShuffled: () => shuffle,
    setShuffle(on) {
      if (on === shuffle) return;
      shuffle = on;
      if (tracks.length) {
        // Whatever is loaded stays where it is: a shuffle starts from it, and
        // name order carries on from its place in the list.
        const now = element.src ? order[position] : undefined;
        order = on ? shuffled() : named();
        if (on && now !== undefined) order = [now, ...order.filter(index => index !== now)];
        position = now === undefined ? 0 : order.indexOf(now);
      }
      changed();
    },
    onChange(listener) { listeners.push(listener); },
  };
}
