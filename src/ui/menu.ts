import type { MenuCommand } from "../input/input.ts";
import type { CarCustomization, CustomizationCategory } from "../customization/customization.ts";
import { isDrivetrain, type Drivetrain } from "../sim/sim.ts";
import {
  createInitialMenuState,
  transitionMenu,
  type MenuEvent,
  type MenuScreen,
  type MenuState,
} from "./menu-state.ts";

interface MenuCallbacks {
  startTrack(): void;
  restartRun(): void;
  returnToMain(): void;
  resumeRun(): void;
  getDrivetrain(): Drivetrain;
  getCustomization(): CarCustomization;
  selectDrivetrain(drivetrain: Drivetrain): void;
  customize(category: CustomizationCategory, optionId: string): void;
  screenChanged(screen: MenuScreen): void;
}

export interface MenuController {
  handleCommands(commands: readonly MenuCommand[]): void;
  isGameplayActive(): boolean;
  isGarageActive(): boolean;
  pause(): void;
}

const actionEvents: Record<string, MenuEvent> = {
  "track-select": "open-track-select",
  garage: "open-garage",
  start: "start-track",
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

  function renderDrivetrain(): void {
    root.querySelectorAll<HTMLButtonElement>("[data-drivetrain]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.drivetrain === callbacks.getDrivetrain()));
    });
  }

  function visibleItems(): HTMLButtonElement[] {
    const screen = screens.get(state.screen);
    return screen
      ? Array.from(screen.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
      : [];
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
    renderDrivetrain();
    renderCustomization();
    document.body.dataset.gameScreen = state.screen;
    root.hidden = state.screen === "playing";
    root.setAttribute("aria-hidden", String(state.screen === "playing"));
    root.dataset.screen = state.screen;
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

  function dispatch(event: MenuEvent): void {
    const previous = state;
    const next = transitionMenu(state, event);
    if (next.screen === previous.screen && next.returnTo === previous.returnTo) return;

    if (event === "start-track") callbacks.startTrack();
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
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : (current + direction + items.length) % items.length;
    items[next].focus();
  }

  function confirmFocused(): void {
    const items = visibleItems();
    const focused = document.activeElement;
    const target = items.includes(focused as HTMLButtonElement) ? focused : items[0];
    (target as HTMLButtonElement | undefined)?.click();
  }

  function handleCommands(commands: readonly MenuCommand[]): void {
    for (const command of commands) {
      if (command === "pause") {
        dispatch("pause-toggle");
      } else if (state.screen !== "playing" && (command === "up" || command === "left")) {
        moveFocus(-1);
      } else if (state.screen !== "playing" && (command === "down" || command === "right")) {
        moveFocus(1);
      } else if (state.screen !== "playing" && command === "confirm") {
        confirmFocused();
      } else if (state.screen !== "playing" && command === "back") {
        dispatch("back");
      }
    }
  }

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const drivetrainButton = event.target.closest<HTMLButtonElement>("[data-drivetrain]");
    if (drivetrainButton) {
      const drivetrain = drivetrainButton.dataset.drivetrain;
      if (isDrivetrain(drivetrain)) {
        callbacks.selectDrivetrain(drivetrain);
        renderDrivetrain();
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
    const menuEvent = actionEvents[button.dataset.menuAction ?? ""];
    if (menuEvent) dispatch(menuEvent);
  });

  renderState();

  return {
    handleCommands,
    isGameplayActive: () => state.screen === "playing",
    isGarageActive: () => state.screen === "garage",
    pause: () => {
      if (state.screen === "playing") dispatch("pause-toggle");
    },
  };
}
