import type { MenuCommand } from "../input/input.ts";
import { customizationOption, bodyPresetIsMixed, CUSTOMIZATION_OPTIONS, type CarCustomization, type CustomizationCategory } from "../customization/customization.ts";
import type { AudioLevels } from "../audio/audio-mix.ts";
import {
  createInitialMenuState,
  transitionMenu,
  type MenuEvent,
  type MenuScreen,
  type MenuState,
} from "./menu-state.ts";
import { createOptionRow, rowAt } from "./menu-rows.ts";

type MenuItem = HTMLElement;

/**
 * Everything a player can land on with a pad or the arrow keys. Exported so a
 * test can hold it against the real markup: a control the menu cannot focus is
 * not merely unreachable, it makes navigation skip past onto something else.
 *
 * `data-pointer-only` controls are for a pointer or a finger and are never stops,
 * because each one repeats something the pad already has a button for: a row's
 * ‹ › (left / right), a section tab (the shoulders), a hint (its face button).
 *
 * `data-menu-item` is an entry (design/MENUS.md): a thing in a list, a race or a
 * name, focusable so a pad can reach and scroll to it, acted on only through the
 * screen's hints, which it names in `data-can`. One with no `data-can` is read,
 * not acted on.
 */
export const MENU_ITEM_SELECTOR =
  "button:not([disabled]):not([hidden]):not([data-pointer-only]), input[type=\"range\"]:not([disabled]):not([hidden]), input[type=\"text\"]:not([disabled]):not([hidden]), [data-menu-item]:not([hidden])";

/** The face actions an entry offers, from its `data-can`; none for anything that is not an entry. */
export function entryActions(element: Element | null): string[] {
  return element?.closest<HTMLElement>("[data-menu-item]")?.dataset.can?.split(" ").filter(Boolean) ?? [];
}

/**
 * Whether a hint is off: another section's, "change" with nothing to change, or an entry's action the focused entry
 * cannot take (Remove on an authored race, Race on a Blacklist name). Pure, so the rule that keeps a pad from pressing
 * the wrong thing is tested without a page.
 */
export function hintOff(hint: { name: string; section?: string; entry: boolean },
  focus: { section: string | null; changing: boolean; can: readonly string[] }): boolean {
  return (hint.section !== undefined && hint.section !== focus.section)
    || (hint.name === "change" && !focus.changing)
    || (hint.entry && !focus.can.includes(hint.name));
}

/**
 * Where to land on a screen you are coming back to: the item you left, or, when the screen was drawn again since and
 * that element is gone, the item drawn in its place, found by its entry key (`data-entry-key`). The race list and the
 * Blacklist draw their entries anew each time they open, so the element remembered was always detached, and both came
 * back at the top or the current name (Codex review, #14).
 */
export function rememberedItem<T extends { dataset: DOMStringMap }>(items: readonly T[], remembered: T | undefined,
  key: string | undefined): T | undefined {
  if (remembered && items.includes(remembered)) return remembered;
  return key === undefined ? undefined : items.find(item => item.dataset.entryKey === key);
}

/** What each customization row is called (design/MENUS.md: one setting, one row). */
const CUSTOMIZATION_LABELS: Record<CustomizationCategory, string> = {
  paint: "Paint", wheels: "Wheel finish", stance: "Ride height", bodyKit: "Kit", wheelDesign: "Wheel design",
  front: "Front lip", skirts: "Side skirts", rear: "Rear valance", spoiler: "Spoiler", tint: "Window tint",
};

/** The hint whose face button a command presses, for the commands a hint bar can carry. */
const HINT_COMMANDS: Partial<Record<MenuCommand, string>> = { "action-x": "action-x", "action-y": "action-y" };

interface MenuCallbacks {
  enterMenu(): void;
  startTrack(fresh: boolean): void;
  restartRun(): void;
  returnToMain(): void;
  openSaves(mode: "load" | "save"): void;
  resumeRun(): void;
  getCustomization(): CarCustomization;
  customize(category: CustomizationCategory, optionId: string): void;
  screenChanged(screen: MenuScreen, state: MenuState): void;
  getAudioLevels(): AudioLevels;
  setAudioLevel(channel: keyof AudioLevels, value: number): void;
  /** What the soundtrack row should say: track title, or why there is none. */
  soundtrackLabel(): { note: string; playing: boolean; enabled: boolean; shuffle: boolean; dj: boolean; hasDj: boolean };
  soundtrack(command: "toggle" | "next" | "previous" | "shuffle" | "dj"): void;
}

export interface MenuController {
  handleCommands(commands: readonly MenuCommand[]): void;
  /** Called when the soundtrack advances on its own, so the label keeps up. */
  refreshAudio(): void;
  isGameplayActive(): boolean;
  isGarageActive(): boolean;
  pause(): void;
  enterGarage(): void;
  finishRace(title: string, detail: string): void;
  /** Focus where the player last was on this screen and section, or its first stop. */
  restoreFocus(): void;
}

const actionEvents: Record<string, MenuEvent> = {
  garage: "open-garage",
  controls: "open-controls",
  options: "open-options",
  saves: "open-saves",
  races: "open-races",
  blacklist: "open-blacklist",
  map: "map-toggle",
  start: "start-track",
  "new-drive": "start-track",
  resume: "resume",
  restart: "restart",
  "main-menu": "main-menu",
  back: "back",
};

export function createMenuController(callbacks: MenuCallbacks): MenuController {
  const root = document.getElementById("menu-root") as HTMLElement;
  const canvas = document.getElementById("view") as HTMLCanvasElement;
  const screens = new Map<MenuScreen, HTMLElement>();
  document.querySelectorAll<HTMLElement>("[data-menu-screen]").forEach((element) => {
    screens.set(element.dataset.menuScreen as MenuScreen, element);
  });

  let state: MenuState = createInitialMenuState();
  const intro = document.getElementById("start-screen")!;
  const startButton = document.getElementById("enter-menu") as HTMLButtonElement;
  // A deep link has already said where it is going, so it does not wait at the
  // title. `?race=<id>` counts as one (2026-09-20): it was documented as a way
  // to reach a race before this screen existed, and without this the race and
  // its car load and then sit behind the splash. The scene router sends it to
  // the track (debug.ts, applyDeepLink).
  const deepLink = new URLSearchParams(location.search);
  let awaitingStart = !deepLink.has("scene") && !deepLink.has("race");
  intro.hidden = !awaitingStart;
  root.inert = awaitingStart;
  document.body.dataset.intro = awaitingStart ? "waiting" : "entered";

  function enterMenu(): void {
    if (!awaitingStart) return;
    awaitingStart = false;
    intro.hidden = true;
    root.inert = false;
    document.body.dataset.intro = "entered";
    root.classList.add("menu-entering");
    callbacks.enterMenu();
    focusFirstItem();
  }
  startButton.addEventListener("click", enterMenu);

  function renderAudio(): void {
    const levels = callbacks.getAudioLevels();
    root.querySelectorAll<HTMLInputElement>("[data-audio-level]").forEach((slider) => {
      const channel = slider.dataset.audioLevel as keyof AudioLevels;
      const value = levels[channel];
      if (value !== undefined) slider.value = String(value);
    });
    const { note, playing, enabled, shuffle, dj, hasDj } = callbacks.soundtrackLabel();
    root.querySelectorAll<HTMLElement>("[data-soundtrack-note]").forEach((element) => {
      element.textContent = note;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-soundtrack]").forEach((button) => {
      button.disabled = !enabled;
      if (button.dataset.soundtrack === "toggle") button.textContent = playing ? "Pause" : "Play";
      if (button.dataset.soundtrack === "shuffle") {
        button.textContent = shuffle ? "Shuffle on" : "Shuffle off";
        button.setAttribute("aria-pressed", String(shuffle));
      }
      if (button.dataset.soundtrack === "dj") {
        // Nothing to switch without clips in dj/.
        button.disabled = !enabled || !hasDj;
        button.textContent = dj ? "DJ on" : "DJ off";
        button.setAttribute("aria-pressed", String(dj));
      }
    });
  }

  // Sliders are menu items too. Leaving them out of this list made them
  // unreachable by keyboard or pad, and worse, a player hunting for the audio
  // controls would cycle onto Track Select and get thrown out of their run.
  function visibleItems(): MenuItem[] {
    const screen = screens.get(state.screen);
    return screen
      ? Array.from(screen.querySelectorAll<MenuItem>(MENU_ITEM_SELECTOR)).filter(item => !item.closest("[hidden]"))
      : [];
  }

  // Sections (design/MENUS.md): a screen with more than a screenful is split into
  // panels the shoulders page through, each short enough not to scroll.
  const activeSections = new Map<MenuScreen, string>();
  function sectionsOf(screen: MenuScreen): HTMLElement | null {
    return screens.get(screen)?.querySelector<HTMLElement>("[data-menu-sections]") ?? null;
  }
  function sectionNames(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[data-section]")).map(panel => panel.dataset.section!);
  }
  function activeSection(): string | null {
    const container = sectionsOf(state.screen);
    return container ? activeSections.get(state.screen) ?? sectionNames(container)[0] ?? null : null;
  }
  function showSection(screen: MenuScreen, name: string): void {
    const container = sectionsOf(screen);
    if (!container) return;
    activeSections.set(screen, name);
    container.querySelectorAll<HTMLElement>("[data-section]").forEach(panel => { panel.hidden = panel.dataset.section !== name; });
    container.querySelectorAll<HTMLElement>("[data-section-tab]").forEach(tab => {
      tab.setAttribute("aria-selected", String(tab.dataset.sectionTab === name));
    });
  }
  function stepSection(direction: -1 | 1): void {
    const container = sectionsOf(state.screen);
    // A sub-panel over the sections (the livery editor over the garage build)
    // hides them; the shoulders do nothing there rather than page underneath it.
    if (!container || container.closest("[hidden]")) return;
    const names = sectionNames(container);
    const current = names.indexOf(activeSection() ?? "");
    showSection(state.screen, names[(current + direction + names.length) % names.length]!);
    restoreFocus();
    renderHints();
  }

  // Where the player was, per screen and per section, so backing out of a screen
  // or paging away and back lands where they left rather than at the top.
  const lastFocus = new Map<string, MenuItem>();
  // And an entry's key, since a list drawn again replaces the element (rememberedItem).
  const lastKey = new Map<string, string>();
  const focusKey = () => `${state.screen}:${activeSection() ?? ""}`;
  function focused(item: MenuItem): void {
    if (visibleItems().includes(item)) {
      lastFocus.set(focusKey(), item);
      if (item.dataset.entryKey !== undefined) lastKey.set(focusKey(), item.dataset.entryKey);
      else lastKey.delete(focusKey());
    }
    // Cheap, and it keeps rows honest about values changed elsewhere (the
    // livery editor's own switch, a body's own design after browsing cars).
    renderCustomization();
    renderHints();
  }
  /** The menu's own moves: recorded here and not only by `focusin`, which an
   *  unfocused window never fires, and a hint bar must not wait for one. */
  function focusItem(item: MenuItem | undefined): void {
    if (!item) return;
    item.focus();
    focused(item);
  }
  // A pointer or a finger moves focus too, and that arrives only as the event.
  root.addEventListener("focusin", event => focused(event.target as MenuItem));
  // Pointer-only controls are not stops, so pressing one must not take focus:
  // it would leave the pad on nothing, and it hid the "change" hint on the press,
  // which reflowed the hint bar and slid Drive out from under the pointer before
  // the release, so the click landed on the bar and nothing happened.
  root.addEventListener("mousedown", event => {
    if ((event.target as Element).closest?.("[data-pointer-only]")) event.preventDefault();
  });
  function restoreFocus(): void {
    const items = visibleItems();
    const remembered = rememberedItem(items, lastFocus.get(focusKey()), lastKey.get(focusKey()));
    // A section with nothing to land on (every row locked on a car that is not
    // yours) must not leave focus on the page before it: left and right would
    // go on changing a row the player can no longer see.
    if (items.length === 0 && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    // With nowhere remembered, a screen may say where to start: the Blacklist opens
    // on the name you are on, not on #1 at the top.
    focusItem(remembered ?? items.find(item => item.hasAttribute("data-focus-first")) ?? items[0]);
    renderHints();
  }

  // Each screen's hint bar names what its buttons do, in the pad's own labels
  // (ui/prompts.ts fills the glyphs). Some hints belong to one section, and
  // "change" only shows while something with a value to change has focus.
  function hints(): HTMLElement | null {
    return screens.get(state.screen)?.querySelector<HTMLElement>("[data-menu-hints]") ?? null;
  }
  function renderHints(): void {
    const bar = hints();
    if (!bar) return;
    const section = activeSection();
    const changing = !!rowAt(document.activeElement) || !!focusedSlider();
    // An entry's hints show only on an entry that can take them: Remove on a kept
    // race, not on an authored one.
    const can = entryActions(document.activeElement);
    bar.querySelectorAll<HTMLElement>("[data-hint]").forEach(hint => {
      hint.toggleAttribute("data-hint-off", hintOff({ name: hint.dataset.hint!, section: hint.dataset.hintSection,
        entry: hint.hasAttribute("data-hint-entry") }, { section, changing, can }));
    });
  }
  /** The hint a face button presses on this screen, if it is showing and can act. */
  function liveHint(command: string): HTMLButtonElement | null {
    // Read the bar as it stands for what has focus now, not as it was last drawn:
    // a panel moves focus itself (after a removal) and that need not have redrawn it.
    renderHints();
    const hint = hints()?.querySelector<HTMLButtonElement>(`button[data-hint="${command}"]:not([data-hint-off]):not([disabled])`);
    return hint && !hint.closest("[hidden]") ? hint : null;
  }

  // The garage's customization rows, built from the catalog rather than kept as
  // a second copy of it in the markup.
  root.querySelectorAll<HTMLElement>("[data-customization-rows]").forEach(list => {
    for (const category of list.dataset.customizationRows!.split(" ") as CustomizationCategory[]) {
      const row = createOptionRow({
        id: category, label: CUSTOMIZATION_LABELS[category],
        options: () => CUSTOMIZATION_OPTIONS[category].map(option => ({ id: option.id, label: option.name,
          swatch: "color" in option && category === "paint" ? `#${option.color.toString(16).padStart(6, "0")}` : undefined })),
        value: () => {
          const customization = callbacks.getCustomization();
          return category === "bodyKit" && bodyPresetIsMixed(customization) ? "mixed" : customizationOption(customization, category);
        },
        valueLabel: () => "Custom mix",
        choose: id => { callbacks.customize(category, id); renderCustomization(); },
      });
      // main.ts disables these while a car that is not yours is on the platform.
      row.element.querySelectorAll("button").forEach(button => { button.dataset.customization = category; });
      list.append(row.element);
    }
  });

  function focusedSlider(): HTMLInputElement | null {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && active.type === "range" ? active : null;
  }

  function adjustSlider(slider: HTMLInputElement, direction: -1 | 1): void {
    const step = Number(slider.step) || .05;
    const value = Number(slider.value);
    const next = Math.min(Number(slider.max) || 1,
      Math.max(Number(slider.min) || 0, value + direction * step));
    if (next === value) return;
    slider.value = String(next);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function renderCustomization(): void {
    const customization = callbacks.getCustomization();
    // Every row, the ones main.ts builds (the car, the livery) included: a paint
    // change turns the livery off, and a kit rewrites four other rows.
    root.querySelectorAll("[data-row]").forEach(element => rowAt(element)?.render());
    const note = root.querySelector<HTMLElement>("[data-body-preset-note]");
    if (note) note.textContent = bodyPresetIsMixed(customization) ? "Custom mix · choose a kit to match all bodywork." : "Kits match front, sides, rear and spoiler.";
  }

  function focusFirstItem(): void {
    requestAnimationFrame(() => awaitingStart ? startButton.focus() : restoreFocus());
  }

  function renderState(previousScreen?: MenuScreen): void {
    renderCustomization();
    renderAudio();
    document.body.dataset.gameScreen = state.screen;
    root.hidden = state.screen === "playing";
    root.setAttribute("aria-hidden", String(state.screen === "playing"));
    root.dataset.screen = state.screen;
    const garageBack = root.querySelector('[data-menu-screen="garage"] [data-menu-action="back"] [data-hint-label]');
    if (garageBack) garageBack.textContent = state.returnTo === "playing" ? "Return to street" : "Back";
    screens.forEach((element, screen) => {
      element.hidden = screen !== state.screen;
    });
    const section = activeSection();
    if (section) showSection(state.screen, section);
    renderHints();
    callbacks.screenChanged(state.screen, state);

    if (state.screen === "playing") {
      canvas.focus({ preventScroll: true });
    } else if (state.screen !== previousScreen) {
      focusFirstItem();
    }
  }

  function dispatch(event: MenuEvent, fresh = false): void {
    if (event === "start-track" && state.screen === "garage" && state.returnTo === "playing") event = "resume";
    const previous = state;
    const next = transitionMenu(state, event);
    if (next.screen === previous.screen && next.returnTo === previous.returnTo) return;

    if (event === "start-track") callbacks.startTrack(fresh);
    if (event === "restart") callbacks.restartRun();
    if (event === "main-menu") callbacks.returnToMain();
    if (
      next.screen === "playing" &&
      event !== "start-track" &&
      event !== "restart"
    ) {
      callbacks.resumeRun();
    }

    state = next;
    renderState(previous.screen);
  }

  function moveFocus(direction: -1 | 1): void {
    const items = visibleItems();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as MenuItem);
    const next = current < 0 ? 0 : (current + direction + items.length) % items.length;
    focusItem(items[next]);
  }

  function confirmFocused(): void {
    // Confirming on a slider must do nothing. Falling through to items[0] here
    // would resume the run from under a player who was only setting a volume.
    if (focusedSlider()) return;
    // On a row, confirm is the screen's confirm hint where the row defers to it
    // (the car row: drive this car), and otherwise moves the row on one. Either
    // way it never falls through to another item.
    const row = rowAt(document.activeElement);
    if (row) {
      if (row.spec.confirm === "hint") liveHint("confirm")?.click();
      else row.step(1);
      return;
    }
    // An entry is acted on through its hints: confirm is its A hint, when it has
    // one (a race: Race), and nothing when it has none (a name on the Blacklist).
    if (document.activeElement?.closest("[data-menu-item]")) {
      if (entryActions(document.activeElement).includes("confirm")) liveHint("confirm")?.click();
      return;
    }
    const items = visibleItems();
    const focused = document.activeElement;
    const target = items.includes(focused as MenuItem) ? focused : items[0];
    if (target instanceof HTMLButtonElement) target.click();
  }

  function handleCommands(commands: readonly MenuCommand[]): void {
    if (awaitingStart) {
      if (commands.includes("confirm") || commands.includes("pause")) enterMenu();
      return;
    }
    for (const command of commands) {
      // Editing a slot name must not turn arrow keys into menu navigation.
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === "text") {
        if (command === "confirm" || command === "down") moveFocus(1);
        else if (command === "up") moveFocus(-1);
        else if (command === "back" || command === "pause") dispatch("back");
        continue;
      }
      if (command === "map") {
        dispatch("map-toggle");
      } else if (command === "pause") {
        dispatch("pause-toggle");
      } else if (state.screen !== "playing" && command === "up") {
        moveFocus(-1);
      } else if (state.screen !== "playing" && command === "down") {
        moveFocus(1);
      } else if (state.screen !== "playing" && (command === "left" || command === "right")) {
        // On a row or a slider, sideways is the value; everywhere else it still moves.
        const direction = command === "left" ? -1 : 1;
        const slider = focusedSlider();
        const row = rowAt(document.activeElement);
        if (slider) adjustSlider(slider, direction);
        else if (row) row.step(direction);
        else moveFocus(direction);
      } else if (state.screen !== "playing" && (command === "section-prev" || command === "section-next")) {
        stepSection(command === "section-prev" ? -1 : 1);
      } else if (state.screen !== "playing" && HINT_COMMANDS[command]) {
        liveHint(HINT_COMMANDS[command]!)?.click();
      } else if (state.screen !== "playing" && command === "confirm") {
        confirmFocused();
      } else if (state.screen !== "playing" && command === "back") {
        dispatch("back");
      }
    }
    // A command may have moved focus by way of a panel (a removed race hands it to
    // the next one) rather than through the menu; the bar follows either way.
    if (commands.length && state.screen !== "playing") renderHints();
  }

  root.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const channel = event.target.dataset.audioLevel as keyof AudioLevels | undefined;
    if (!channel) return;
    callbacks.setAudioLevel(channel, Number(event.target.value));
  });

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const soundtrackButton = event.target.closest<HTMLButtonElement>("[data-soundtrack]");
    if (soundtrackButton) {
      const command = soundtrackButton.dataset.soundtrack;
      if (command === "toggle" || command === "next" || command === "previous" || command === "shuffle" || command === "dj") {
        callbacks.soundtrack(command);
        renderAudio();
      }
      return;
    }
    const sectionControl = event.target.closest<HTMLButtonElement>("[data-section-tab], [data-section-step]");
    if (sectionControl) {
      if (sectionControl.dataset.sectionStep) stepSection(Number(sectionControl.dataset.sectionStep) as -1 | 1);
      else { showSection(state.screen, sectionControl.dataset.sectionTab!); restoreFocus(); renderHints(); }
      return;
    }
    const button = event.target.closest<HTMLButtonElement>("[data-menu-action]");
    if (!button) return;
    if (button.dataset.menuAction === "saves") callbacks.openSaves(button.dataset.saveMode === "save" ? "save" : "load");
    const menuEvent = actionEvents[button.dataset.menuAction ?? ""];
    if (menuEvent) dispatch(menuEvent, button.dataset.menuAction === "new-drive");
  });

  renderState();

  return {
    handleCommands,
    finishRace: (title, detail) => {
      root.querySelector<HTMLElement>("[data-result-title]")!.textContent = title;
      root.querySelector<HTMLElement>("[data-result-detail]")!.textContent = detail;
      dispatch("race-finished");
    },
    refreshAudio: renderAudio,
    restoreFocus,
    enterGarage: () => { if (state.screen === "playing") dispatch("open-garage"); },
    isGameplayActive: () => state.screen === "playing",
    isGarageActive: () => state.screen === "garage",
    pause: () => {
      if (state.screen === "playing") dispatch("pause-toggle");
    },
  };
}
