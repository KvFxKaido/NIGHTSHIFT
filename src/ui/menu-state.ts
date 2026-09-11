export type MenuScreen = "main" | "garage" | "pause" | "results" | "options" | "saves" | "controls" | "map" | "playing";

export interface MenuState {
  screen: MenuScreen;
  returnTo: "main" | "pause" | "playing";
  submenu?: "options";
}

export type MenuEvent =
  | "race-finished"
  | "map-toggle"
  | "open-controls"
  | "open-options"
  | "open-saves"
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
  // Results require an explicit destination; pause/back must not resume a finished race.
  if (state.screen === "results") return state;
  switch (event) {
    case "race-finished":
      return state.screen === "playing" || state.screen === "pause" ? { screen: "results", returnTo: "main" } : state;
    case "map-toggle":
      if (state.screen === "map") return { screen: state.returnTo, returnTo: state.returnTo };
      if (state.screen === "playing" || state.screen === "pause" || state.screen === "main") {
        return { screen: "map", returnTo: state.screen };
      }
      return state;
    case "open-controls":
      if (state.screen === "options") return { screen: "controls", returnTo: state.returnTo, submenu: "options" };
      return { screen: "controls", returnTo: state.screen === "pause" ? "pause" : "main" };
    case "open-options":
    case "open-saves":
      return { screen: event === "open-options" ? "options" : "saves", returnTo: state.screen === "pause" ? "pause" : "main" };
    case "open-garage":
      return { screen: "garage", returnTo: state.screen === "playing" ? "playing" : state.screen === "pause" ? "pause" : "main" };
    case "start-track":
    case "resume":
    case "restart":
      return { screen: "playing", returnTo: "main" };
    case "main-menu":
      return createInitialMenuState();
    case "pause-toggle":
      if (state.submenu === "options") return { screen: "options", returnTo: state.returnTo };
      if (state.screen === "playing") return { screen: "pause", returnTo: "pause" };
      if (state.screen === "pause") return { screen: "playing", returnTo: "main" };
      if (["garage", "controls", "map", "options", "saves"].includes(state.screen)) return { screen: state.returnTo, returnTo: state.returnTo };
      return state;
    case "back":
      if (state.submenu === "options") return { screen: "options", returnTo: state.returnTo };
      if (state.screen === "pause") return { screen: "playing", returnTo: "main" };
      if (["garage", "controls", "map", "options", "saves"].includes(state.screen)) return { screen: state.returnTo, returnTo: state.returnTo };
      return state;
  }
}
