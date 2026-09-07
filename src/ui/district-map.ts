import { DISTRICT_BLOCKS, DISTRICT_JUNCTIONS, DISTRICT_ROUTES, DISTRICT_STREETS,
  getDistrictRoute, pathLength, routePoints, type DistrictRoute } from "../sim/district.ts";
import { createInputController } from "../input/input.ts";

const svg = document.getElementById("district-map")!;
function element(tag: string, attributes: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
// North is -Z; SVG coordinates directly match the actual driving geometry.
// The frame is derived from the streets rather than fixed, so the board keeps
// fitting as the blockout grows. It was authored around a 500 m loop and the
// belts ran straight off the edge into the sidebar.
const framed = [...DISTRICT_STREETS.flatMap(street => street.points),
  ...DISTRICT_BLOCKS.map(block => ({ x: block.x, z: block.z }))];
const mapBounds = {
  minX: Math.min(...framed.map(point => point.x)) - 46,
  maxX: Math.max(...framed.map(point => point.x)) + 46,
  minZ: Math.min(...framed.map(point => point.z)) - 46,
  maxZ: Math.max(...framed.map(point => point.z)) + 58,
};
svg.setAttribute("viewBox",
  `${mapBounds.minX} ${mapBounds.minZ} ${mapBounds.maxX - mapBounds.minX} ${mapBounds.maxZ - mapBounds.minZ}`);
svg.append(element("path", { d: "M -300 238 Q 0 250 340 227", stroke: "#315667", "stroke-width": 62, fill: "none" }));
svg.append(element("text", { x: 90, y: 253, class: "map-label" }, "Rivergate waterfront"));
for (const block of DISTRICT_BLOCKS) svg.append(element("rect", { x: block.x - block.width / 2,
  y: block.z - block.depth / 2, width: block.width, height: block.depth, class: "map-block" }));
const path = (points: readonly { x: number; z: number }[]) => points.map((p, i) =>
  `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" ");
for (const street of DISTRICT_STREETS) svg.append(element("path", { d: path(street.points),
  "stroke-width": street.added ? 11 : 12, class: `street-line${street.added ? " added" : ""}` }));
const highlight = element("path", { class: "route-line" }); svg.append(highlight);
const directionMarks = element("g", { fill: "#19333e" }); svg.append(directionMarks);
for (const junction of DISTRICT_JUNCTIONS) svg.append(element("circle", { cx: junction.point.x,
  cy: junction.point.z, r: 5, fill: "#19333e", stroke: "#dce4dd", "stroke-width": 1.5 }));
const labels: [number, number, string, boolean?][] = [
  [-64, -223, "Neon Boulevard"], [264, -48, "Blackglass"], [264, -34, "Tunnel"],
  [18, 159, "Rivergate Bridge"], [-310, -6, "Freight S"], [-188, -92, "Civic rise"],
  [-293, -218, "Hotel Hairpin"], [65, -110, "Market Avenue", true], [-16, 11, "Market Square", true],
  [-100, -28, "Civic Link", true], [-184, 63, "Market Avenue West", true],
];
for (const [x, y, text, added] of labels) svg.append(element("text", { x, y,
  class: `map-label${added ? " new-label" : ""}` }, text));
const compassX = mapBounds.maxX - 30, compassY = mapBounds.minZ + 44;
svg.append(element("path", { fill: "none", stroke: "#a1b5b9",
  d: `M ${compassX} ${compassY} L ${compassX} ${compassY - 26} M ${compassX - 5} ${compassY - 18} L ${compassX} ${compassY - 26} L ${compassX + 5} ${compassY - 18}` }));
svg.append(element("text", { x: compassX - 4, y: compassY - 35, class: "map-label" }, "N"));
const scaleX = mapBounds.minX + 18, scaleY = mapBounds.maxZ - 30;
svg.append(element("path", { fill: "none", stroke: "#a1b5b9",
  d: `M ${scaleX} ${scaleY} v 5 h 200 v -5` }));
svg.append(element("text", { x: scaleX + 78, y: scaleY + 22, class: "map-label" }, "200 m"));
const start = element("circle", { r: 7, fill: "#63d6df", stroke: "#142833", "stroke-width": 2 });
const finish = element("rect", { width: 12, height: 12, fill: "#efb968", stroke: "#142833", "stroke-width": 2 });
svg.append(start, finish);

function select(route: DistrictRoute): void {
  const points = routePoints(route);
  document.documentElement.style.setProperty("--route", route.color);
  highlight.setAttribute("d", path(points));
  directionMarks.replaceChildren();
  // One arrow per street leg keeps direction legible without covering the map.
  for (const leg of route.legs) {
    const street = DISTRICT_STREETS.find(s => s.id === leg.street)!;
    const index = Math.floor(street.points.length * 0.5);
    const a = street.points[index]!, b = street.points[index + 1]!;
    const angle = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI + (leg.reverse ? 180 : 0);
    directionMarks.append(element("path", { d: "M 4 0 L -4 -3 L -4 3 Z", transform: `translate(${a.x} ${a.z}) rotate(${angle})` }));
  }
  start.setAttribute("cx", String(points[0]!.x)); start.setAttribute("cy", String(points[0]!.z));
  finish.style.display = route.kind === "sprint" ? "" : "none";
  finish.setAttribute("x", String(points.at(-1)!.x - 6)); finish.setAttribute("y", String(points.at(-1)!.z - 6));
  document.getElementById("route-title")!.textContent = route.name;
  document.getElementById("route-description")!.textContent = route.description;
  const heights = points.map(p => p.y);
  document.getElementById("route-stats")!.textContent = `${(pathLength(points) / 1000).toFixed(2)} km / ${route.kind} / ${Math.round(Math.max(...heights) - Math.min(...heights))} m elevation range`;
  (document.getElementById("drive-route") as HTMLAnchorElement).href = `./?world=district&route=${route.id}&scene=track`;
  document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.route === route.id));
  });
  history.replaceState(null, "", `?route=${route.id}`);
}
for (const route of DISTRICT_ROUTES) {
  const button = document.createElement("button"); button.className = "route-option";
  button.dataset.route = route.id; button.style.setProperty("--swatch", route.color);
  button.textContent = route.name;
  const distance = document.createElement("small"); distance.textContent = `${(pathLength(routePoints(route)) / 1000).toFixed(2)} km`;
  button.append(distance); button.addEventListener("click", () => select(route));
  document.getElementById("routes")!.append(button);
}
try { select(getDistrictRoute(new URLSearchParams(location.search).get("route") ?? "market-loop")); }
catch (error) {
  document.getElementById("route-title")!.textContent = "Unknown route";
  document.getElementById("route-description")!.textContent = `${String(error)}. Select a route above.`;
  document.getElementById("drive-route")!.hidden = true;
  document.getElementById("routes")!.addEventListener("click", () => { document.getElementById("drive-route")!.hidden = false; }, { once: true });
}

const input = createInputController();
function frame(): void {
  input.update();
  for (const command of input.consumeMenuCommands()) {
    const controls = [...document.querySelectorAll<HTMLElement>("button, a[href]:not([hidden])")];
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (["down", "right", "up", "left"].includes(command)) {
      const direction = command === "down" || command === "right" ? 1 : -1;
      controls[(current + direction + controls.length) % controls.length]!.focus();
    } else if (command === "confirm") (controls[current] ?? controls[1])?.click();
    else if (command === "back" || command === "pause") location.href = "./?scene=pause";
  }
  requestAnimationFrame(frame);
}
document.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
requestAnimationFrame(frame);
