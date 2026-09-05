export type MenuScreen = "main" | "track-select" | "garage" | "pause" | "playing";

export interface MenuState {
  screen: MenuScreen;
  returnTo: "main" | "pause";
}

export type MenuEvent =
  | "open-track-select"
  | "open-garage"
  | "start-track"
  | "pause-toggle"
  | "back"
  | "resume"
  | "restart"
  | "main-menu";

export function createInitialMenuState(): MenuState {
  return { screen: "main", returnTo: "main" };
}

export function transitionMenu(state: MenuState, event: MenuEvent): MenuState {
  switch (event) {
    case "open-track-select":
      return {
        screen: "track-select",
        returnTo: state.screen === "pause" ? "pause" : "main",
      };
    case "open-garage":
      return { screen: "garage", returnTo: "main" };
    case "start-track":
    case "resume":
    case "restart":
      return { screen: "playing", returnTo: "main" };
    case "main-menu":
      return createInitialMenuState();
    case "pause-toggle":
      if (state.screen === "playing") return { screen: "pause", returnTo: "pause" };
      if (state.screen === "pause") return { screen: "playing", returnTo: "main" };
      if (state.screen === "track-select" || state.screen === "garage") {
        return { screen: state.returnTo, returnTo: state.returnTo };
      }
      return state;
    case "back":
      if (state.screen === "pause") return { screen: "playing", returnTo: "main" };
      if (state.screen === "track-select" || state.screen === "garage") {
        return { screen: state.returnTo, returnTo: state.returnTo };
      }
      return state;
  }
}
