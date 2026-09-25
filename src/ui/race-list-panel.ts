import { raceListItems, type RaceLaunch, type RaceListItem } from "./race-list.ts";
import type { createPlaylistStore } from "../settings/playlist.ts";
import type { CareerProgress } from "../settings/progress.ts";
import type { RaceBuildFor } from "../settings/race-build.ts";

export interface RaceListPanelOptions {
  playlist: ReturnType<typeof createPlaylistStore>;
  career(): CareerProgress;
  build: RaceBuildFor;
  launch(race: RaceLaunch): void;
  /** Why a new race cannot be drawn from here, or null when it can. */
  drawBlocked(): string | null;
  /** Draws and loads a race, or returns why none draws from here. */
  draw(): string | null;
}

const GROUP_TITLES: Record<RaceListItem["group"], string> = { authored: "Courses", blacklist: "Blacklist", kept: "Kept races" };

/** The face actions a race offers, as `data-can` names them (design/MENUS.md): A races
 *  it against the rival, X solo, Y takes a kept race off the list. */
export function raceActions(item: Pick<RaceListItem, "race" | "solo" | "removable">): string[] {
  return [item.race && "confirm", item.solo && "action-x", item.removable && "action-y"].filter((can): can is string => !!can);
}

/**
 * The race list screen: rebuilt each time it opens, and after a removal.
 *
 * One stop per race (design/MENUS.md). Each row carried up to three buttons until
 * 2026-09-25, Race, Solo and Remove, so a pad walked three stops a race down the
 * list; a race is now an entry acted on by the screen's hints, which show only
 * what the focused race can do. A tap or a click selects a race and never starts
 * one: on a phone, the finger that scrolls the list must not launch the race it
 * lifts off.
 */
export function createRaceListPanel(options: RaceListPanelOptions) {
  const root = document.querySelector<HTMLElement>('[data-menu-screen="races"]')!;
  const list = root.querySelector<HTMLElement>("[data-race-list]")!;
  const status = root.querySelector<HTMLElement>("[data-race-list-status]")!;
  const drawButton = root.querySelector<HTMLButtonElement>("[data-draw-race]")!;
  const drawNote = root.querySelector<HTMLElement>("[data-draw-note]")!;
  const entries = new WeakMap<Element, RaceListItem>();
  const focusedEntry = () => document.activeElement?.closest<HTMLElement>("[data-race-entry]") ?? null;

  const hint = (name: string) => root.querySelector<HTMLButtonElement>(`[data-race-hint="${name}"]`)!;
  hint("race").addEventListener("click", () => { const item = entries.get(focusedEntry()!); if (item?.race) options.launch(item.race); });
  hint("solo").addEventListener("click", () => { const item = entries.get(focusedEntry()!); if (item?.solo) options.launch(item.solo); });
  hint("remove").addEventListener("click", () => {
    const row = focusedEntry(), race = row && entries.get(row)?.removable;
    if (!row || !race) return;
    // Keep the player's place: focus lands where the removed race was, not back at the top of a long list.
    const place = [...list.querySelectorAll("[data-race-entry]")].indexOf(row);
    const outcome = options.playlist.remove(race);
    render();
    status.textContent = outcome === "removed" ? `Removed “${race.name}”.`
      : outcome === "missing" ? "That race was already gone." : "Could not remove it. The list has been left untouched.";
    const rows = [...list.querySelectorAll<HTMLElement>("[data-race-entry]")];
    (rows[Math.min(place, rows.length - 1)] ?? drawButton).focus();
  });

  const entry = (item: RaceListItem) => {
    const row = document.createElement("div");
    row.className = "race-row";
    row.tabIndex = 0;
    row.setAttribute("role", "listitem");
    row.dataset.menuItem = "";
    row.dataset.raceEntry = item.key;
    row.dataset.playable = String(item.race !== null);
    row.dataset.can = raceActions(item).join(" ");
    const title = document.createElement("strong"), detail = document.createElement("span");
    title.textContent = item.title;
    detail.textContent = item.detail;
    row.append(title, detail);
    const offers = [item.race && "race it", item.solo && "race it solo", item.removable && "remove it"].filter(Boolean).join(", ");
    row.setAttribute("aria-label", `${item.title}. ${item.detail}.${offers ? ` You can ${offers}.` : ""}`);
    entries.set(row, item);
    return row;
  };
  const heading = (text: string) => {
    const element = document.createElement("p");
    element.className = "race-group";
    element.textContent = text;
    return element;
  };

  function render(): void {
    list.replaceChildren();
    const kept = options.playlist.list();
    status.textContent = kept === null ? "Your kept races could not be read. They have been left untouched." : "";
    const items = raceListItems(options.career(), kept ?? [], options.build);
    let group: RaceListItem["group"] | null = null;
    for (const item of items) {
      if (item.group !== group) { group = item.group; list.append(heading(GROUP_TITLES[group])); }
      list.append(entry(item));
    }
    if (group !== "kept" && kept !== null) {
      list.append(heading(GROUP_TITLES.kept));
      const empty = document.createElement("p");
      empty.className = "handling-note";
      empty.textContent = "None yet. Finish a generated race and keep it from the results.";
      list.append(empty);
    }
    const blocked = options.drawBlocked();
    drawButton.disabled = blocked !== null;
    drawNote.textContent = blocked ?? "A new race from where you are, against the rival. Keep it afterwards if you like it.";
  }
  drawButton.onclick = () => {
    if (options.drawBlocked() !== null) return;
    const failed = options.draw();
    if (failed) drawNote.textContent = failed;
  };
  return { render };
}
