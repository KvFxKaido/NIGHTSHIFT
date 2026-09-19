/**
 * How the player likes the soundtrack played. It saves under its own key, like
 * the chase camera (camera-preference.ts), rather than in `nightshift.settings`:
 * it is a way of listening, not part of a build, so a save slot never carries
 * it and the settings decoder that save slots depend on is untouched.
 */
export const MUSIC_KEY = "nightshift.music";
type Disk = Pick<Storage, "getItem" | "setItem">;

export interface MusicPreference {
  /** A fresh order each time the list comes round; off plays it in name order. */
  shuffle: boolean;
  /** The station's clips between songs (audio/soundtrack.ts); off plays songs back to back. */
  dj: boolean;
}

/** Both on until the player turns them off, as the soundtrack played before either could be. */
export const DEFAULT_MUSIC: MusicPreference = { shuffle: true, dj: true };

/** Anything unreadable falls back to the default rather than blocking boot. */
export function decodeMusicPreference(raw: string | null): MusicPreference {
  if (raw === null) return { ...DEFAULT_MUSIC };
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || typeof data.shuffle !== "boolean") return { ...DEFAULT_MUSIC };
    // A save from before the DJ toggle has no `dj`, and keeps the DJ on.
    return { shuffle: data.shuffle, dj: typeof data.dj === "boolean" ? data.dj : DEFAULT_MUSIC.dj };
  } catch {
    return { ...DEFAULT_MUSIC };
  }
}

export function loadMusicPreference(storage: () => Disk): MusicPreference {
  try {
    return decodeMusicPreference(storage().getItem(MUSIC_KEY));
  } catch {
    return { ...DEFAULT_MUSIC };
  }
}

/** False when storage is blocked; the choice still holds for the session. */
export function saveMusicPreference(storage: () => Disk, preference: MusicPreference): boolean {
  try {
    storage().setItem(MUSIC_KEY, JSON.stringify({ version: 1, shuffle: preference.shuffle, dj: preference.dj }));
    return true;
  } catch {
    return false;
  }
}
