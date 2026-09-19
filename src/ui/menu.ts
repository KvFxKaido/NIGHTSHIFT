import type { MenuCommand } from "../input/input.ts";
import type { CarCustomization, CustomizationCategory } from "../customization/customization.ts";
import type { AudioLevels } from "../audio/audio-mix.ts";
import {
  createInitialMenuState,
  transitionMenu,
  type MenuEvent,
  type MenuScreen,
  type MenuState,
} from "./menu-state.ts";

type MenuItem = HTMLButtonElement | HTMLInputElement;

/**
 * Everything a player can land on with a pad or the arrow keys. Exported so a
 * test can hold it against the real markup: a control the menu cannot focus is
 * not merely unreachable, it makes navigation skip past onto something else.
 */
export const MENU_ITEM_SELECTOR =
  "button:not([disabled]):not([hidden]), input[type=\"range\"]:not([disabled]):not([hidden]), input[type=\"text\"]:not([disabled]):not([hidden])";

interface MenuCallbacks {
  startTrack(fresh: boolean): void;
  restartRun(): void;
  returnToMain(): void;
  openSaves(mode: "load" | "save"): void;
  resumeRun(): void;
  getCustomization(): CarCustomization;
  customize(category: CustomizationCategory, optionId: string): void;
  screenChanged(screen: MenuScreen): void;
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
    root.querySelectorAll<HTMLButtonElement>("[data-customization]").forEach(button => {
      const category = button.dataset.customization as CustomizationCategory;
      button.setAttribute("aria-pressed", String(button.dataset.option === customization[category]));
    });
  }

  function focusFirstItem(): void {
    requestAnimationFrame(() => visibleItems()[0]?.focus());
  }

  function renderState(previousScreen?: MenuScreen): void {
    renderCustomization();
    renderAudio();
    document.body.dataset.gameScreen = state.screen;
    root.hidden = state.screen === "playing";
    root.setAttribute("aria-hidden", String(state.screen === "playing"));
    root.dataset.screen = state.screen;
    const garageBack = root.querySelector('[data-menu-screen="garage"] [data-menu-action="back"]');
    if (garageBack) garageBack.textContent = state.returnTo === "playing" ? "Return to street" : "Back";
    screens.forEach((element, screen) => {
      element.hidden = screen !== state.screen;
    });
    callbacks.screenChanged(state.screen);

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
    items[next]!.focus();
  }

  function confirmFocused(): void {
    // Confirming on a slider must do nothing. Falling through to items[0] here
    // would resume the run from under a player who was only setting a volume.
    if (focusedSlider()) return;
    if (state.screen === "garage" && document.activeElement?.closest("[data-car-selector]")) {
      root.querySelector<HTMLButtonElement>("[data-equip-car]")?.click();
      return;
    }
    const items = visibleItems();
    const focused = document.activeElement;
    const target = items.includes(focused as MenuItem) ? focused : items[0];
    if (target instanceof HTMLButtonElement) target.click();
  }

  function handleCommands(commands: readonly MenuCommand[]): void {
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
        // On a slider, sideways is the value; everywhere else it still moves.
        const direction = command === "left" ? -1 : 1;
        const slider = focusedSlider();
        if (slider) adjustSlider(slider, direction);
        else if (state.screen === "garage" && document.activeElement?.closest("[data-car-selector]")) {
          root.querySelector<HTMLButtonElement>(`[data-car-cycle="${direction}"]`)?.click();
        } else moveFocus(direction);
      } else if (state.screen !== "playing" && command === "confirm") {
        confirmFocused();
      } else if (state.screen !== "playing" && command === "back") {
        dispatch("back");
      }
    }
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
    const button = event.target.closest<HTMLButtonElement>("[data-menu-action]");
    const customizationButton = event.target.closest<HTMLButtonElement>("[data-customization]");
    if (customizationButton) {
      const category = customizationButton.dataset.customization as CustomizationCategory;
      const optionId = customizationButton.dataset.option;
      if (!optionId) return;
      callbacks.customize(category, optionId);
      renderCustomization();
      return;
    }
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
    enterGarage: () => { if (state.screen === "playing") dispatch("open-garage"); },
    isGameplayActive: () => state.screen === "playing",
    isGarageActive: () => state.screen === "garage",
    pause: () => {
      if (state.screen === "playing") dispatch("pause-toggle");
    },
  };
}
