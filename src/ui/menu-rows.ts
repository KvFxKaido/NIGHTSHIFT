/**
 * One setting, one row (design/MENUS.md): its label, its current value, and
 * left / right to change it in place. The rule that replaced tiles of options
 * (2026-09-24): a grid asks a pad for two-dimensional navigation it does not
 * have, and the garage's grids made the pad walk 38 stops through a panel 2.3
 * screens tall.
 *
 * The value is the row's one focus stop. The ‹ and › either side of it are for a
 * pointer or a finger and are not stops (`data-pointer-only`); a pad reaches the
 * same change with left and right.
 */

export interface RowOption {
  readonly id: string;
  readonly label: string;
  /** A colour chip beside the label, as CSS. */
  readonly swatch?: string;
}

export interface RowSpec {
  /** Names the row in the markup, `data-row`. */
  readonly id: string;
  readonly label: string;
  options(): readonly RowOption[];
  /** The current option's id. An id that is not among the options is a state of
   *  its own, like a kit mixed from parts, and reads as `valueLabel()`. */
  value(): string;
  valueLabel?(): string;
  choose(id: string): void;
  /** What confirm does on the row. `step` moves on one, as a tap on the value
   *  does; `hint` leaves it to the screen's confirm action in the hint bar. */
  readonly confirm?: "step" | "hint";
}

export interface OptionRow {
  readonly spec: RowSpec;
  readonly element: HTMLElement;
  readonly value: HTMLButtonElement;
  /** Moves to the next or previous option, wrapping. False when the row cannot change. */
  step(direction: -1 | 1): boolean;
  render(): void;
}

/** The option `direction` away from `current`, wrapping. From a value that is not
 *  among the options, the first option forward and the last one back. */
export function stepOption(options: readonly RowOption[], current: string, direction: -1 | 1): RowOption | null {
  if (options.length === 0) return null;
  const index = options.findIndex(option => option.id === current);
  if (index < 0) return direction > 0 ? options[0]! : options.at(-1)!;
  return options[(index + direction + options.length) % options.length]!;
}

const rows = new WeakMap<Element, OptionRow>();

/** The row an element belongs to, if it is part of one. */
export function rowAt(element: Element | null): OptionRow | null {
  const root = element?.closest("[data-row]");
  return root ? rows.get(root) ?? null : null;
}

export function createOptionRow(spec: RowSpec, doc: Document = document): OptionRow {
  const element = doc.createElement("div");
  element.className = "menu-row";
  element.dataset.row = spec.id;
  const label = doc.createElement("span");
  label.className = "menu-row-label";
  label.textContent = spec.label;
  const stepper = (direction: -1 | 1) => {
    const button = doc.createElement("button");
    button.className = "menu-row-step";
    button.type = "button";
    button.dataset.rowStep = String(direction);
    button.dataset.pointerOnly = "";
    button.tabIndex = -1;
    button.textContent = direction < 0 ? "‹" : "›";
    button.setAttribute("aria-label", `${direction < 0 ? "Previous" : "Next"} ${spec.label.toLowerCase()}`);
    return button;
  };
  const value = doc.createElement("button");
  value.className = "menu-row-value";
  value.type = "button";
  value.dataset.rowValue = "";
  const swatch = doc.createElement("i");
  swatch.className = "menu-row-swatch";
  swatch.setAttribute("aria-hidden", "true");
  const text = doc.createElement("span");
  value.append(swatch, text);
  element.append(label, stepper(-1), value, stepper(1));

  const row: OptionRow = {
    spec, element, value,
    step(direction) {
      if (value.disabled) return false;
      const next = stepOption(spec.options(), spec.value(), direction);
      if (!next || next.id === spec.value()) return false;
      spec.choose(next.id);
      row.render();
      return true;
    },
    render() {
      const current = spec.value();
      const option = spec.options().find(candidate => candidate.id === current);
      const shown = option?.label ?? spec.valueLabel?.() ?? current;
      element.dataset.value = current;
      text.textContent = shown;
      swatch.hidden = !option?.swatch;
      if (option?.swatch) swatch.style.setProperty("--swatch", option.swatch);
      value.setAttribute("aria-label", `${spec.label}: ${shown}. Left and right to change.`);
    },
  };
  element.addEventListener("click", event => {
    const target = (event.target as Element).closest<HTMLButtonElement>("[data-row-step], [data-row-value]");
    if (!target || target.disabled) return;
    // A tap on the value moves on one, like confirm; the arrows go their way.
    if (target.dataset.rowStep) row.step(Number(target.dataset.rowStep) as -1 | 1);
    else if (spec.confirm !== "hint") row.step(1);
    value.focus({ preventScroll: true });
  });
  rows.set(element, row);
  row.render();
  return row;
}
