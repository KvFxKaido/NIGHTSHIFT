import { isPlayerCarId, type PlayerCarId } from "../customization/cars.ts";
import {
  createDefaultCustomization, PAINT_OPTIONS, WHEEL_OPTIONS, STANCE_OPTIONS,
  type CarCustomization, type CustomizationCategory,
} from "../customization/customization.ts";
import { DEFAULT_LEVELS, isLevel, type AudioLevels } from "../audio/audio-mix.ts";

export const SETTINGS_KEY = "nightshift.settings";
/** 3 adds the selected car. Earlier saves retain their handling, appearance and audio. */
export const SETTINGS_VERSION = 3;
export interface PlayerSettings {
  car: PlayerCarId;
  customization: CarCustomization;
  audio: AudioLevels;
}
export interface SettingsPatch {
  car?: PlayerCarId;
  customization?: Partial<CarCustomization>;
  audio?: Partial<AudioLevels>;
}
export type SettingsStatus = "ready" | "saved" | "recovered" | "unavailable";
export type SettingsUrlKey = "car" | CustomizationCategory;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
const options = { paint: PAINT_OPTIONS, wheels: WHEEL_OPTIONS, stance: STANCE_OPTIONS };
const categories: CustomizationCategory[] = ["paint", "wheels", "stance"];

const channels: (keyof AudioLevels)[] = ["master", "engine", "music"];

/** Bodies that left the garage, and what a save naming one becomes. */
const RETIRED_CARS: Record<string, PlayerCarId> = { blender: "cinder" };

export function defaultSettings(): PlayerSettings {
  return {
    car: "cinder",
    customization: createDefaultCustomization(),
    audio: { ...DEFAULT_LEVELS },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Storage is untrusted input. Restore valid fields, reject unknown schemas. */
export function decodeSettings(raw: string | null): { settings: PlayerSettings; status: SettingsStatus } {
  const settings = defaultSettings();
  if (raw === null) return { settings, status: "ready" };
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || (data.version !== SETTINGS_VERSION && data.version !== 2 && data.version !== 1)) {
      return { settings, status: "recovered" };
    }
    let recovered = false;
    if (data.version === SETTINGS_VERSION) {
      // A retired body is migrated, not recovered. Recovery would leave the
      // status short of "saved", and decodeSaves throws on that -- discarding
      // every slot, not just the one that still names an old car.
      const car = typeof data.car === "string" && data.car in RETIRED_CARS ? RETIRED_CARS[data.car]! : data.car;
      if (isPlayerCarId(car)) settings.car = car;
      else recovered = true;
    }
    // A stored drivetrain from before it became a property of the car is
    // ignored, not recovered: recovery would make decodeSaves discard the slot.
    const customization = record(data.customization) ? data.customization : {};
    for (const category of categories) {
      const value = customization[category];
      if (typeof value === "string" && options[category].some(option => option.id === value)) {
        settings.customization[category] = value;
      } else recovered = true;
    }
    // A version 1 save predates audio, so defaulting those levels is a
    // migration and not a loss. Only a malformed level counts as recovery.
    if (data.version !== 1) {
      const audio = record(data.audio) ? data.audio : {};
      for (const channel of channels) {
        const value = audio[channel];
        if (isLevel(value)) settings.audio[channel] = value;
        else recovered = true;
      }
    }
    return { settings, status: recovered ? "recovered" : "saved" };
  } catch {
    return { settings, status: "recovered" };
  }
}

/** Outside the sim: load at boot and write only deliberate menu changes. */
export function createSettingsStore(storage: () => SettingsStorage) {
  let settings = defaultSettings();
  let status: SettingsStatus = "ready";
  let previewDepth = 0;
  try {
    ({ settings, status } = decodeSettings(storage().getItem(SETTINGS_KEY)));
  } catch {
    status = "unavailable";
  }

  return {
    get: (): PlayerSettings => ({
      ...settings,
      customization: { ...settings.customization },
      audio: { ...settings.audio },
    }),
    status: (): SettingsStatus => status,
    // applyDeepLink uses the real callbacks, but previewing must neither save
    // nor change the stored base that the next deliberate menu edit merges into.
    preview<T>(action: () => T): T {
      previewDepth++;
      try { return action(); } finally { previewDepth--; }
    },
    update(patch: SettingsPatch): boolean {
      if (previewDepth > 0) return false;
      if (patch.car !== undefined && !isPlayerCarId(patch.car)) {
        throw new RangeError(`Unknown car: ${patch.car}`);
      }
      for (const category of categories) {
        const value = patch.customization?.[category];
        if (value !== undefined && !options[category].some(option => option.id === value)) {
          throw new RangeError(`Unknown ${category}: ${value}`);
        }
      }
      for (const channel of channels) {
        const value = patch.audio?.[channel];
        if (value !== undefined && !isLevel(value)) {
          throw new RangeError(`Audio ${channel} must be between 0 and 1: ${value}`);
        }
      }
      // Rebase this field-level edit on the latest save so an older open tab
      // changing paint does not overwrite the car chosen in another tab.
      let base = settings;
      try {
        const raw = storage().getItem(SETTINGS_KEY);
        if (raw !== null) base = decodeSettings(raw).settings;
      } catch { /* Keep session choices if storage cannot be read. */ }
      settings = {
        car: patch.car ?? base.car,
        customization: { ...base.customization },
        audio: { ...base.audio },
      };
      for (const category of categories) {
        const value = patch.customization?.[category];
        if (value !== undefined) settings.customization[category] = value;
      }
      for (const channel of channels) {
        const value = patch.audio?.[channel];
        if (value !== undefined) settings.audio[channel] = value;
      }
      try {
        storage().setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...settings }));
        status = "saved";
      } catch {
        status = "unavailable";
      }
      return true;
    },
  };
}

export function withoutSettingsOverrides(href: string, keys: readonly SettingsUrlKey[]): string {
  const url = new URL(href);
  for (const key of keys) url.searchParams.delete(key);
  return url.href;
}

export function settingsStatusMessage(status: SettingsStatus, search: string): string {
  if (status === "unavailable") return "Saving unavailable — choices last for this session only.";
  if (status === "recovered") return "Some saved settings could not be restored. Choose an option to save again.";
  const params = new URLSearchParams(search);
  if (["car", ...categories].some(key => params.has(key))) {
    return "Preview link — choose an option to save it on this browser.";
  }
  return status === "saved" ? "Saved on this browser." : "Garage choices save automatically on this browser.";
}
