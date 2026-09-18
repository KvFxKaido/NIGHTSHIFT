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
}

/** Shuffle is on until the player turns it off; the soundtrack always shuffled before. */
export const DEFAULT_MUSIC: MusicPreference = { shuffle: true };

/** Anything unreadable falls back to the default rather than blocking boot. */
export function decodeMusicPreference(raw: string | null): MusicPreference {
  if (raw === null) return { ...DEFAULT_MUSIC };
  try {
    const data = JSON.parse(raw);
    return data?.version === 1 && typeof data.shuffle === "boolean" ? { shuffle: data.shuffle } : { ...DEFAULT_MUSIC };
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
    storage().setItem(MUSIC_KEY, JSON.stringify({ version: 1, shuffle: preference.shuffle }));
    return true;
  } catch {
    return false;
  }
}
