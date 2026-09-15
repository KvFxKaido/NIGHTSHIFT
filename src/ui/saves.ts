import { drivetrainFor } from "../customization/cars.ts";
import { SAVE_IDS, loadSaveUrl, type DriveSave, type SaveId, type createSaveStore } from "../settings/saves.ts";

export function createSavesPanel(store: ReturnType<typeof createSaveStore>, snapshot: () => Omit<DriveSave, "id" | "name" | "savedAt">) {
  const root = document.querySelector<HTMLElement>('[data-menu-screen="saves"]')!;
  const list = root.querySelector<HTMLElement>("[data-save-slots]")!;
  const editor = root.querySelector<HTMLElement>("[data-save-editor]")!;
  const name = root.querySelector<HTMLInputElement>("#save-name")!;
  const status = root.querySelector<HTMLElement>("[data-save-status]")!;
  const write = root.querySelector<HTMLButtonElement>("[data-write-save]")!;
  const continueButton = document.querySelector<HTMLButtonElement>("[data-continue]")!;
  const summary = document.querySelector<HTMLElement>("[data-save-summary]")!;
  let mode: "load" | "save" = "load";
  let selected: SaveId | null = null;
  let expectedTimestamp: number | undefined;
  const CAR_NAMES: Record<string, string> = { cinder: "Cinder", bulwark: "Bulwark", kestrel: "Kestrel" };
  // Falls back to the id rather than to a name: a retired body should read as
  // itself if one ever reaches here, not silently as some other car.
  const carName = (save: DriveSave) => `${CAR_NAMES[save.build.car] ?? save.build.car} / ${drivetrainFor(save.build.car).toUpperCase()}`;
  const date = (save: DriveSave) => new Date(save.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const load = (id: SaveId) => { location.href = loadSaveUrl(location.href, id); };
  function refreshSummary() {
    try {
      const latest = store.list().sort((a, b) => b.savedAt - a.savedAt)[0];
      continueButton.hidden = !latest;
      document.querySelector<HTMLButtonElement>('[data-menu-screen="main"] [data-save-mode="load"]')!.disabled = !latest;
      document.querySelector<HTMLButtonElement>('[data-menu-screen="main"] [data-menu-action="new-drive"]')!.classList.toggle("primary", !latest);
      continueButton.onclick = latest ? () => load(latest.id) : null;
      summary.textContent = latest ? `${latest.name} · ${carName(latest)} · ${date(latest)}` : "Start a new drive. Save your game from the pause menu.";
    } catch {
      continueButton.hidden = true;
      summary.textContent = "Saved games unavailable. You can still start a new drive.";
    }
  }
  function render() {
    list.replaceChildren(); editor.hidden = true; selected = null;
    try {
      const saves = store.list();
      SAVE_IDS.forEach((id, i) => {
        const save = saves.find(s => s.id === id);
        const button = document.createElement("button");
        button.className = "menu-button save-slot";
        button.disabled = mode === "load" && !save;
        const title = document.createElement("strong"), detail = document.createElement("span");
        title.textContent = `${String(i + 1).padStart(2, "0")} / ${save?.name ?? "Empty slot"}`;
        detail.textContent = save ? `${carName(save)} · ${date(save)}` : mode === "save" ? "Save your current drive here" : "No saved game";
        button.append(title, detail);
        button.onclick = () => {
          if (mode === "load") { load(id); return; }
          selected = id; expectedTimestamp = save?.savedAt;
          editor.hidden = false; name.value = save?.name ?? `Port Alder nights ${i + 1}`;
          root.querySelector<HTMLElement>("[data-save-confirmation]")!.textContent = save
            ? `Replace “${save.name}” with your current car and location?` : "Create a saved game in this slot.";
          write.textContent = save ? "Replace save" : "Save game";
          // Default names work entirely by controller; keyboard users can edit above.
          write.focus();
        };
        list.append(button);
      });
    } catch {
      status.textContent = "Could not read saved games. Existing saves have been left untouched.";
    }
  }
  write.onclick = () => {
    if (!selected) return;
    const title = name.value.trim();
    if (!title) { status.textContent = "Give this save a name."; name.focus(); return; }
    try {
      // Another tab must not silently turn an empty slot into an overwrite.
      const current = store.list().find(s => s.id === selected);
      if (current?.savedAt !== expectedTimestamp) {
        render(); status.textContent = "This slot changed in another tab. Select it again to review."; return;
      }
      store.write({ ...snapshot(), id: selected, name: title, savedAt: Date.now() });
      render(); refreshSummary();
      status.textContent = `“${title}” saved on this browser.`;
      list.querySelector("button")?.focus();
    } catch { status.textContent = "Save failed. Existing saves have been left untouched. Check available browser storage and try again."; }
  };
  refreshSummary();
  return {
    refreshSummary,
    open(next: "load" | "save") {
      mode = next; status.textContent = "";
      root.querySelector<HTMLElement>("#saves-title")!.textContent = mode === "load" ? "Load game" : "Save game";
      root.querySelector<HTMLElement>("[data-save-help]")!.textContent = mode === "load"
        ? "Choose a saved drive. Your car returns stationary in free roam."
        : "Three manual slots, stored on this browser. Saves made during a race return to Wharf Garage.";
      render();
    },
  };
}
