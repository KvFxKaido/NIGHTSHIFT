import stats from "../customization/car-stats.json";
import { isPlayerCarId } from "../customization/cars.ts";

// Fixed empty/full endpoints, linearly mapped and clamped to 0–100%. Faster
// 0–60 fills more (8–2 s); top speed spans 100–180 mph, leaving room above the
// planned 165 mph car; lateral grip spans 8–18 m/s². No roster normalisation or
// blended score: the number beside each bar is exactly the measure driving it.
const SCALES = {
  acceleration: [8, 2],
  topSpeed: [100, 180],
  handling: [8, 18],
} as const;

export function renderCarStats(root: HTMLElement, car: string): void {
  root.hidden = !isPlayerCarId(car);
  if (!isPlayerCarId(car)) return;
  const card = stats[car].card;
  const rows = [
    { key: "acceleration", label: "Acceleration", value: card.zeroToSixty, text: `0–60 ${card.zeroToSixty.toFixed(1)} s` },
    { key: "topSpeed", label: "Top Speed", value: card.topSpeed, text: `${Math.round(card.topSpeed)} mph` },
    { key: "handling", label: "Handling", value: card.peakLateral, text: `${card.peakLateral.toFixed(1)} m/s²` },
  ] as const;
  root.replaceChildren(...rows.map(row => {
    const [empty, full] = SCALES[row.key];
    const percent = Math.max(0, Math.min(100, (row.value - empty) / (full - empty) * 100));
    const line = document.createElement("div");
    line.className = "car-stat";
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "car-stat-value";
    value.textContent = row.text;
    const bar = document.createElement("span");
    bar.className = "car-stat-bar";
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-label", row.label);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", percent.toFixed(1));
    bar.setAttribute("aria-valuetext", row.text);
    bar.style.setProperty("--stat-fill", `${percent}%`);
    line.append(label, value, bar);
    return line;
  }));
}
