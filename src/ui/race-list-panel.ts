import { raceListItems, type RaceLaunch, type RaceListItem } from "./race-list.ts";
import type { createPlaylistStore } from "../settings/playlist.ts";
import type { CareerProgress } from "../settings/progress.ts";
import type { RaceBuild } from "../settings/race-build.ts";

export interface RaceListPanelOptions {
  playlist: ReturnType<typeof createPlaylistStore>;
  career(): CareerProgress;
  build: RaceBuild;
  launch(race: RaceLaunch): void;
  /** Why a new race cannot be drawn from here, or null when it can. */
  drawBlocked(): string | null;
  /** Draws and loads a race, or returns why none draws from here. */
  draw(): string | null;
}

const GROUP_TITLES: Record<RaceListItem["group"], string> = { authored: "Courses", moth: "Moth", kept: "Kept races" };

/** The race list screen: rebuilt each time it opens, and after a removal. */
export function createRaceListPanel(options: RaceListPanelOptions) {
  const root = document.querySelector<HTMLElement>('[data-menu-screen="races"]')!;
  const list = root.querySelector<HTMLElement>("[data-race-list]")!;
  const status = root.querySelector<HTMLElement>("[data-race-list-status]")!;
  const drawButton = root.querySelector<HTMLButtonElement>("[data-draw-race]")!;
  const drawNote = root.querySelector<HTMLElement>("[data-draw-note]")!;

  const action = (label: string, aria: string, onClick: () => void) => {
    const button = document.createElement("button");
    button.className = "menu-button";
    button.textContent = label;
    button.setAttribute("aria-label", aria);
    button.onclick = onClick;
    return button;
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
      const row = document.createElement("div");
      row.className = "race-row";
      row.dataset.playable = String(item.race !== null);
      const text = document.createElement("div"), title = document.createElement("strong"), detail = document.createElement("span");
      title.textContent = item.title;
      detail.textContent = item.detail;
      text.append(title, detail);
      const actions = document.createElement("div");
      actions.className = "race-row-actions";
      if (item.race) actions.append(action("Race", `Race ${item.title} against the rival`, () => options.launch(item.race!)));
      if (item.solo) actions.append(action("Solo", `Race ${item.title} solo`, () => options.launch(item.solo!)));
      if (item.removable) {
        const race = item.removable;
        const remove = action("Remove", `Remove ${item.title} from the race list`, () => {
          // Keep the player's place: focus lands where the removed row was, not back at the top of a long list.
          const place = [...list.querySelectorAll("button")].indexOf(remove);
          const outcome = options.playlist.remove(race);
          render();
          status.textContent = outcome === "removed" ? `Removed “${race.name}”.`
            : outcome === "missing" ? "That race was already gone." : "Could not remove it. The list has been left untouched.";
          const buttons = [...list.querySelectorAll<HTMLButtonElement>("button")];
          (buttons[Math.min(place, buttons.length - 1)] ?? drawButton).focus();
        });
        actions.append(remove);
      }
      row.append(text, actions);
      list.append(row);
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
