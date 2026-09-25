# Menus

Design note, 2026-09-24. Shawn asked for the garage menu, and menus in general,
to be far more controller friendly, and banned tiled options outright. This page
is to menus what `design/LOOK.md` is to the city: the rules, the check anything
new passes first, and what is built.

## Why

The garage laid its choices out as tiles: paint five across, every part three
across, the livery editor's swatches six across. Every direction on the pad moved
focus one step through every focusable element in document order (`menu.ts`), so
a grid was walked one tile at a time in all four directions. Measured on the
Cinder (2026-09-24): 38 focus stops in one list, Livery to Back 37 presses, in a
panel 1,552 px tall in a 667 px window. A mouse never noticed. A pad did.

## Rules

1. **Rows, not tiles.** One setting is one row: its label and its current value.
   Left / right changes it in place and wraps, and the car shows it at once;
   up / down moves between rows. A choice that seems to want a grid (colours,
   parts) is a row with a preview chip. No swatch grids, no blocks of peer buttons.
2. **Sections on the shoulders.** A screen with more than a screenful is split into
   sections that LB / RB page (Q / E on a keyboard), each short enough not to scroll
   at 1280 × 720. The tabs show where you are; they are not stops.
3. **A row is one stop.** Actions on a thing go on face buttons, named in the hint
   bar, never as extra buttons inside the row.
4. **A hint bar on every screen**, in the pad's own glyphs (✕ ○ □ △ L1 R1 on a
   PlayStation pad, A B X Y LB RB otherwise, keys with no pad). A hint is clickable,
   so a mouse or a finger has every action a pad has; it is not a stop.
5. **Holding a direction repeats**: once on the press, then after 380 ms every
   95 ms (`MENU_REPEAT`). A held arrow key repeats at the keyboard's own rate.
   Only a direction pressed in a menu: the stick and the arrows steer, so one still
   held from driving when a menu comes up (pausing mid-corner, pulling into the
   garage) counts once it has been let go (`setMenuActive` in `input/input.ts`).
6. **Back lands where you left.** Focus is remembered per screen and per section.
7. **Nothing needs a keyboard.** No typed values a pad cannot enter, no required
   text fields.

The pad's menu buttons are fixed, like A and B always were: X and Y are a screen's
own actions, LB and RB its sections (`MENU_PAD_BUTTONS`, `MENU_KEYS` in
`input/bindings.ts`). Driving bindings may share them, because the two never run on
the same screen; E is both Enter Wharf Garage on the street and next section in a
menu, and the street takes it first.

## How it is built

- `ui/menu-rows.ts`: the row. `createOptionRow(spec)` builds it; its value is the one
  focus stop, and its ‹ › are `data-pointer-only`. `stepOption` is the pure step.
- `ui/menu.ts`: sections (`[data-menu-sections]`, `[data-section]`,
  `[data-section-tab]`), the hint bar (`[data-menu-hints]`, `[data-hint]`), focus
  memory, and the commands. `MENU_ITEM_SELECTOR` excludes pointer-only controls, and
  `tests/menu.test.ts` allows those only where the pad has the same action.
- `ui/prompts.ts`: `padGlyph`, `hintGlyph`, and `body[data-input-device]`, which hides
  pad-only hints on a keyboard.
- The garage's customization rows are built from `CUSTOMIZATION_OPTIONS`, not written
  into the markup a second time; `index.html` holds only their slots.

## Status

**Phase 1, built (2026-09-24):** the foundation above, and the garage as four
sections of rows:

| Section | Rows | Face buttons |
|---|---|---|
| Car | Car (browse) | A Drive this car, Y Buy (when they can act) |
| Paint | Paint, Wheel finish, Window tint | |
| Body | Kit, Front lip, Side skirts, Rear valance, Spoiler, Wheel design, Ride height | |
| Livery | Design (on / off); Edit livery | |

X drives out, B backs out, the right stick turns the car. Cinder-only rows hide on
other bodies. On a car you do not own every customization row is locked, the
Livery's Design switch with them; a browsed car's rows show its own saved look
(each car keeps its own since 2026-09-24), and a
section with nothing to land on drops focus rather than leave it on a hidden row.
On a screen 560 px or shorter (a phone held to race is 390) the heading goes, rows
tighten, and the hint bar stays pinned in view.

**Phase 2, next:** every other screen. Options (the soundtrack's five buttons become
rows), Controls (only the active device's column), the race list (one stop per race,
race / solo / remove on face buttons), saves (named automatically, renaming optional),
the Blacklist, and hint bars on all of them.

The map binding toggles in menus and on the street, so it cannot share a menu
button: since phase 1 it is kept off X, Y and the shoulders as it always was off A and
B (`bindings.ts`). A controls save that already had it there moves the map to a free
button; with all five it may take in use (the default layout fills them), it stays
put and shares the button, because refusing the save would throw away every remap.
The keyboard's map is kept off Q, E, X and Y the same way, and a save with it there
moves it to M, or the first free letter; a keyboard always has one.

**Phase 3:** the livery editor with no keyboard. Colours as a palette row plus hue and
brightness rows instead of hex; panels, graphics and layers as rows; placement on the
sticks, which needs its own design because the right stick turns the car.
