import { decodeSettings, SETTINGS_VERSION, type PlayerSettings } from "./settings.ts";

export const SAVES_KEY = "nightshift.saves";
export const SAVE_IDS = ["slot-1", "slot-2", "slot-3"] as const;
export type SaveId = typeof SAVE_IDS[number];
export interface DriveSave {
  id: SaveId;
  name: string;
  savedAt: number;
  world: string;
  build: Omit<PlayerSettings, "audio">;
  position: { x: number; z: number; heading: number } | null;
}
type Disk = Pick<Storage, "getItem" | "setItem">;
export function isSaveId(value: unknown): value is SaveId { return SAVE_IDS.includes(value as SaveId); }

export function decodeSaves(raw: string | null): DriveSave[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.slots)) throw Error("Unsupported saves");
    const result: DriveSave[] = [];
    for (const slot of data.slots) {
      if (!slot || !isSaveId(slot.id) || result.some(s => s.id === slot.id)) throw Error("Invalid slot");
      if (typeof slot.name !== "string" || !slot.name.trim() || slot.name.length > 32
        || !Number.isFinite(slot.savedAt) || slot.savedAt < 0 || typeof slot.world !== "string") throw Error("Invalid save");
      const decoded = decodeSettings(JSON.stringify({ ...slot.build, version: SETTINGS_VERSION, audio: { master: 1, engine: 1, music: 1 } }));
      if (decoded.status !== "saved") throw Error("Invalid build");
      const p = slot.position;
      if (p !== null && (!p || ![p.x, p.z, p.heading].every(Number.isFinite)
        || Math.abs(p.x) > 100000 || Math.abs(p.z) > 100000 || Math.abs(p.heading) > Math.PI * 2)) throw Error("Invalid position");
      const { audio: _, ...build } = decoded.settings;
      result.push({ id: slot.id, name: slot.name.trim(), savedAt: slot.savedAt, world: slot.world,
        build, position: p === null ? null : { x: p.x, z: p.z, heading: p.heading } });
    }
    return result;
  } catch { throw Error("Saved games could not be read. Existing data has been left untouched."); }
}

/** Manual slots: saving one rebases on disk and never erases the other two. */
export function createSaveStore(storage: () => Disk) {
  return {
    list: () => decodeSaves(storage().getItem(SAVES_KEY)),
    write(save: DriveSave): void {
      const validated = decodeSaves(JSON.stringify({ version: 1, slots: [save] }))[0]!;
      const slots = decodeSaves(storage().getItem(SAVES_KEY)).filter(s => s.id !== save.id);
      slots.push(validated);
      storage().setItem(SAVES_KEY, JSON.stringify({ version: 1, slots }));
    },
  };
}

export function loadSaveUrl(href: string, id: SaveId): string {
  const url = new URL(href);
  url.search = "";
  url.searchParams.set("world", "alder");
  url.searchParams.set("scene", "track");
  url.searchParams.set("save", id);
  return url.href;
}
