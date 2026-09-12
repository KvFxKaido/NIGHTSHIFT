export const LIVERY_KEY = "nightshift.liveries.v1";
export const PANELS = ["hood", "roof", "left", "right", "rear"] as const;
export const GRAPHICS = ["stripe", "number", "chevron", "bolt", "label"] as const;
export const FINISHES = ["gloss", "satin", "matte"] as const;
export type Panel = typeof PANELS[number];
export interface LiveryLayer {
  id: number; panel: Panel; graphic: typeof GRAPHICS[number]; color: string;
  text: string; x: number; y: number; scale: number; rotation: number; mirror: boolean;
}
export interface Livery {
  enabled: boolean; base: string; finish: typeof FINISHES[number]; layers: LiveryLayer[];
}
export const MAX_LAYERS = 12;
export function defaultLivery(): Livery { return { enabled: false, base: "#a80d2f", finish: "gloss", layers: [] }; }
export function copyLivery(value: Livery): Livery { return { ...value, layers: value.layers.map(layer => ({ ...layer })) }; }
const color = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const bounded = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
/** Reject damaged designs as a whole; never allocate arbitrary textures or layer counts. */
export function decodeLivery(raw: string | null): { design: Livery; recovered: boolean } {
  if (!raw) return { design: defaultLivery(), recovered: false };
  try {
    const data = JSON.parse(raw);
    const d = data.design;
    if (data.version !== 1 || !d || typeof d.enabled !== "boolean" || !color(d.base) || !FINISHES.includes(d.finish)
      || !Array.isArray(d.layers) || d.layers.length > MAX_LAYERS) throw Error();
    const ids = new Set<number>();
    for (const l of d.layers) {
      if (!l || !Number.isSafeInteger(l.id) || l.id < 0 || ids.has(l.id) || !PANELS.includes(l.panel) || !GRAPHICS.includes(l.graphic)
        || !color(l.color) || typeof l.text !== "string" || !/^[A-Z0-9 .-]{0,18}$/.test(l.text)
        || !bounded(l.x, -1, 1) || !bounded(l.y, -1, 1) || !bounded(l.scale, .2, 1.5)
        || !bounded(l.rotation, -180, 180) || typeof l.mirror !== "boolean") throw Error();
      ids.add(l.id);
    }
    return { design: copyLivery(d), recovered: false };
  } catch { return { design: defaultLivery(), recovered: true }; }
}

export function newLayer(design: Livery, graphic: LiveryLayer["graphic"], panel: Panel): LiveryLayer {
  return { id: Math.max(-1, ...design.layers.map(l => l.id)) + 1, graphic, panel, color: "#f2eee3",
    text: graphic === "number" ? "07" : "NIGHTSHIFT", x: 0, y: 0, scale: .8, rotation: 0, mirror: panel === "left" || panel === "right" };
}

/** History is per editing session; persistence contains only the current design. */
export class LiveryHistory {
  private past: Livery[] = [];
  private future: Livery[] = [];
  current: Livery;
  constructor(current: Livery) { this.current = copyLivery(current); }
  commit(next: Livery): boolean {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return false;
    this.past.push(copyLivery(this.current));
    if (this.past.length > 40) this.past.shift();
    this.current = copyLivery(next); this.future = []; return true;
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  undo() { const d = this.past.pop(); if (d) { this.future.push(copyLivery(this.current)); this.current = d; } }
  redo() { const d = this.future.pop(); if (d) { this.past.push(copyLivery(this.current)); this.current = d; } }
}
