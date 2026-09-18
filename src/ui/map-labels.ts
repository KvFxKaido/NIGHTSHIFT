/**
 * Map text and markers that stay readable at any zoom.
 *
 * The maps draw in game metres, so a label's size is metres too: at whole-city
 * zoom a 30 m label on a map a few hundred pixels wide was three pixels tall,
 * and every neighbourhood's name was a smudge. A node marked `readable(min, base)`
 * is never drawn smaller on screen than `min` pixels, and never smaller than its
 * `base` size in metres, so zooming in still grows it the way a map should.
 * Text scales its font, a circle its radius, anything else a scale on the
 * transform it was drawn with.
 */

/** Attributes marking a node to keep readable: at least `minPx` on screen, `base` metres at the least. */
export function readable(minPx: number, base: number): Record<string, number> {
  return { "data-min-px": minPx, "data-base": base };
}

/** Resize every marked node for the map's current zoom. A map not on screen is left alone. */
export function keepReadable(svg: SVGSVGElement): void {
  const box = svg.viewBox.baseVal;
  const { width, height } = svg.getBoundingClientRect();
  if (!box || !box.width || !width || !height) return;
  // Metres per screen pixel under the default "meet" fit, which uses the tighter axis.
  const metresPerPx = Math.max(box.width / width, box.height / height);
  for (const node of svg.querySelectorAll<SVGElement>("[data-min-px]")) {
    const base = Number(node.dataset.base), min = Number(node.dataset.minPx);
    const size = Math.max(base, min * metresPerPx);
    if (node.tagName === "text") node.setAttribute("font-size", String(size));
    else if (node.tagName === "circle") node.setAttribute("r", String(size));
    else {
      node.dataset.transform ??= node.getAttribute("transform") ?? "";
      node.setAttribute("transform", `${node.dataset.transform} scale(${size / base})`);
    }
  }
}
