import { isPlayerCarId, PLAYER_CAR_IDS, type PlayerCarId } from "../customization/cars.ts";
import {
  createDefaultCustomization, CUSTOMIZATION_OPTIONS, CUSTOMIZATION_CATEGORIES,
  type CarCustomization, type CustomizationCategory,
} from "../customization/customization.ts";
import { DEFAULT_LEVELS, isLevel, type AudioLevels } from "../audio/audio-mix.ts";

export const SETTINGS_KEY = "nightshift.settings";
/**
 * 3 adds the selected car; 4 (2026-09-24) gives every car its own customization. Earlier saves retain their
 * appearance, audio and car: the one customization they had is every car's, so nothing looks different until changed.
 */
export const SETTINGS_VERSION = 4;
export interface PlayerSettings {
  car: PlayerCarId;
  /** The selected car's own customization: `cars[car]`, or its factory look when it has none. */
  customization: CarCustomization;
  /** Each car's own paint, wheels, stance and parts. A car that has none is as it left the factory. */
  cars: Partial<Record<PlayerCarId, CarCustomization>>;
  audio: AudioLevels;
}
export interface SettingsPatch {
  car?: PlayerCarId;
  /** Changes to one car's customization: `forCar`'s, else the car this patch selects, else the selected car's. */
  customization?: Partial<CarCustomization>;
  forCar?: PlayerCarId;
  audio?: Partial<AudioLevels>;
}
export type SettingsStatus = "ready" | "saved" | "recovered" | "unavailable";
export type SettingsUrlKey = "car" | CustomizationCategory;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
const options = CUSTOMIZATION_OPTIONS;
const categories = CUSTOMIZATION_CATEGORIES;

const channels: (keyof AudioLevels)[] = ["master", "engine", "music"];

/** Bodies that left the garage, and what a save naming one becomes. */
const RETIRED_CARS: Record<string, PlayerCarId> = { blender: "cinder" };

export function defaultSettings(): PlayerSettings {
  return {
    car: "cinder",
    customization: createDefaultCustomization(),
    cars: {},
    audio: { ...DEFAULT_LEVELS },
  };
}

/** A car's own customization in `cars`, or its factory look; always a copy. */
export function customizationOf(cars: PlayerSettings["cars"], car: PlayerCarId): CarCustomization {
  return { ...(cars[car] ?? createDefaultCustomization()) };
}

function copyCars(cars: PlayerSettings["cars"]): PlayerSettings["cars"] {
  return Object.fromEntries(Object.entries(cars).map(([car, look]) => [car, { ...look }]));
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One car's stored customization, each category on its own: a bad one falls back and reports recovery. */
function decodeCustomization(value: Record<string, unknown>): { look: CarCustomization; recovered: boolean } {
  const look = createDefaultCustomization();
  let recovered = false;
  for (const category of categories) {
    const option = value[category];
    // Additive visual slots: old saves and career slots retain factory parts.
    if (option === undefined && category !== "paint" && category !== "wheels" && category !== "stance") continue;
    if (typeof option === "string" && options[category].some(candidate => candidate.id === option)) look[category] = option;
    else recovered = true;
  }
  return { look, recovered };
}

/** Storage is untrusted input. Restore valid fields, reject unknown schemas. */
export function decodeSettings(raw: string | null): { settings: PlayerSettings; status: SettingsStatus } {
  const settings = defaultSettings();
  if (raw === null) return { settings, status: "ready" };
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || ![SETTINGS_VERSION, 3, 2, 1].includes(data.version as number)) {
      return { settings, status: "recovered" };
    }
    let recovered = false;
    if (data.version === SETTINGS_VERSION || data.version === 3) {
      // A retired body is migrated, not recovered. Recovery would leave the
      // status short of "saved", and decodeSaves throws on that -- discarding
      // every slot, not just the one that still names an old car.
      const car = typeof data.car === "string" && data.car in RETIRED_CARS ? RETIRED_CARS[data.car]! : data.car;
      if (isPlayerCarId(car)) settings.car = car;
      else recovered = true;
    }
    // A stored drivetrain from before it became a property of the car is
    // ignored, not recovered: recovery would make decodeSaves discard the slot.
    if (data.version === SETTINGS_VERSION && data.cars !== undefined) {
      if (!record(data.cars)) recovered = true;
      else for (const [id, value] of Object.entries(data.cars)) {
        const car = id in RETIRED_CARS ? RETIRED_CARS[id]! : id;
        if (!isPlayerCarId(car) || !record(value)) { recovered = true; continue; }
        const decoded = decodeCustomization(value);
        settings.cars[car] = decoded.look;
        recovered ||= decoded.recovered;
      }
    }
    // One customization with no car to it: an older save's, which every car wore, so every car keeps it; or a save
    // slot's build (saves.ts decodes one as this version), which is its own car's.
    if (data.version !== SETTINGS_VERSION || data.customization !== undefined) {
      const decoded = decodeCustomization(record(data.customization) ? data.customization : {});
      recovered ||= decoded.recovered;
      if (data.version === SETTINGS_VERSION) settings.cars[settings.car] = decoded.look;
      else for (const car of PLAYER_CAR_IDS) settings.cars[car] = { ...decoded.look };
    }
    settings.customization = customizationOf(settings.cars, settings.car);
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
      cars: copyCars(settings.cars),
      audio: { ...settings.audio },
    }),
    /** Any car's own customization, the selected one's or not. */
    customizationOf: (car: PlayerCarId): CarCustomization => customizationOf(settings.cars, car),
    status: (): SettingsStatus => status,
    // applyDeepLink uses the real callbacks, but previewing must neither save
    // nor change the stored base that the next deliberate menu edit merges into.
    preview<T>(action: () => T): T {
      previewDepth++;
      try { return action(); } finally { previewDepth--; }
    },
    update(patch: SettingsPatch): boolean {
      if (previewDepth > 0) return false;
      for (const car of [patch.car, patch.forCar]) {
        if (car !== undefined && !isPlayerCarId(car)) throw new RangeError(`Unknown car: ${car}`);
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
      const car = patch.car ?? base.car, cars = copyCars(base.cars);
      if (patch.customization) {
        const target = patch.forCar ?? car, look = customizationOf(cars, target);
        for (const category of categories) {
          const value = patch.customization[category];
          if (value !== undefined) look[category] = value;
        }
        cars[target] = look;
      }
      settings = { car, customization: customizationOf(cars, car), cars, audio: { ...base.audio } };
      for (const channel of channels) {
        const value = patch.audio?.[channel];
        if (value !== undefined) settings.audio[channel] = value;
      }
      try {
        // The selected car's customization is read from `cars`, so it is not written twice.
        const { customization: _, ...stored } = settings;
        storage().setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...stored }));
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
