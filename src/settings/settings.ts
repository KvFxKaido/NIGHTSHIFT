import {
  createDefaultCustomization, PAINT_OPTIONS, WHEEL_OPTIONS, STANCE_OPTIONS,
  type CarCustomization, type CustomizationCategory,
} from "../customization/customization.ts";
import { DEFAULT_DRIVETRAIN, isDrivetrain, type Drivetrain } from "../sim/sim.ts";

export const SETTINGS_KEY = "nightshift.settings";
export const SETTINGS_VERSION = 1;
export interface PlayerSettings {
  drivetrain: Drivetrain;
  customization: CarCustomization;
}
export interface SettingsPatch {
  drivetrain?: Drivetrain;
  customization?: Partial<CarCustomization>;
}
export type SettingsStatus = "ready" | "saved" | "recovered" | "unavailable";
export type SettingsUrlKey = "drivetrain" | CustomizationCategory;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
const options = { paint: PAINT_OPTIONS, wheels: WHEEL_OPTIONS, stance: STANCE_OPTIONS };
const categories: CustomizationCategory[] = ["paint", "wheels", "stance"];

export function defaultSettings(): PlayerSettings {
  return { drivetrain: DEFAULT_DRIVETRAIN, customization: createDefaultCustomization() };
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
    if (!record(data) || data.version !== SETTINGS_VERSION) return { settings, status: "recovered" };
    let recovered = false;
    if (isDrivetrain(data.drivetrain)) settings.drivetrain = data.drivetrain;
    else recovered = true;
    const customization = record(data.customization) ? data.customization : {};
    for (const category of categories) {
      const value = customization[category];
      if (typeof value === "string" && options[category].some(option => option.id === value)) {
        settings.customization[category] = value;
      } else recovered = true;
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
    get: (): PlayerSettings => ({ ...settings, customization: { ...settings.customization } }),
    status: (): SettingsStatus => status,
    // applyDeepLink uses the real callbacks, but previewing must neither save
    // nor change the stored base that the next deliberate menu edit merges into.
    preview<T>(action: () => T): T {
      previewDepth++;
      try { return action(); } finally { previewDepth--; }
    },
    update(patch: SettingsPatch): boolean {
      if (previewDepth > 0) return false;
      if (patch.drivetrain !== undefined && !isDrivetrain(patch.drivetrain)) {
        throw new RangeError(`Unknown drivetrain: ${patch.drivetrain}`);
      }
      for (const category of categories) {
        const value = patch.customization?.[category];
        if (value !== undefined && !options[category].some(option => option.id === value)) {
          throw new RangeError(`Unknown ${category}: ${value}`);
        }
      }
      // Rebase this field-level edit on the latest save so an older open tab
      // changing paint does not overwrite another tab's drivetrain preference.
      let base = settings;
      try {
        const raw = storage().getItem(SETTINGS_KEY);
        if (raw !== null) base = decodeSettings(raw).settings;
      } catch { /* Keep session choices if storage cannot be read. */ }
      settings = {
        drivetrain: patch.drivetrain ?? base.drivetrain,
        customization: { ...base.customization },
      };
      for (const category of categories) {
        const value = patch.customization?.[category];
        if (value !== undefined) settings.customization[category] = value;
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
  if (["drivetrain", ...categories].some(key => params.has(key))) {
    return "Preview link — choose an option to save it on this browser.";
  }
  return status === "saved" ? "Saved on this browser." : "Drivetrain and garage choices save automatically on this browser.";
}
