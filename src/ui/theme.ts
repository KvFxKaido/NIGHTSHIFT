/** Read semantic colors from the same palette used by the DOM surfaces. */
const colors = new Map<string, string>();
export function uiColor(role: "navigation" | "objective" | "rival"): string {
  let color = colors.get(role);
  if (!color) {
    color = getComputedStyle(document.documentElement).getPropertyValue(`--ui-${role}`).trim();
    colors.set(role, color);
  }
  return color;
}
