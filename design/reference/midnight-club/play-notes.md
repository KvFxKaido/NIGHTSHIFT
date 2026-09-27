# Played, not researched

First-hand notes on Midnight Club from playing it, kept apart from the workbook
export: `export.py` regenerates the csv files and `digest.md` and never touches
this file. Each note says who and when. Nothing here is checked against a
source, so the workbook's confidence letters do not apply.

## MCLA: the posted speed limit and the half-pressed trigger

Shawn, 2026-09-26, from playing, with a screenshot of MCLA's free-roam HUD on
Sunset Blvd.

- The bottom-right cluster shows the posted speed limit of the street you are
  on ("40mph" on Sunset Blvd.) beside the digital speed and the gear, and a
  plate under them names the street.
- Half-pressing the throttle trigger defaults to that limit: the half press
  holds the car at the posted speed.
- It is for when the cops drive by, so you can pass them at the limit.
  *Inference:* speeding near them is what draws a pursuit.

For NIGHTSHIFT: police are a deferred possibility (GDD §21), so none of this is
scheduled. The HUD proposal of 2026-09-26 keeps a slot for the limit beside the
gear, hidden until something reads it. Port Alder's streets carry names
(`ALDER_STREETS[].name`) but no posted limits; a street's class (local,
collector) would be the natural source. A half press that holds a speed is
help on the pedals, which the player has driven without since 2026-09-20
(`design/HANDLING.md`, "The pedals, as a choice"), so building it is a decision
about the pedals as much as about police.

## MCLA: the ability gauge

Shawn, 2026-09-26. The small round gauge at the top right of the same cluster,
above the plate, is the meter for Midnight Club's special abilities, Roar and
Zone among them.

For NIGHTSHIFT: the GDD does not mention special abilities at all. The HUD has
reserved room for them since its MC3 layout ("the meter arcs ... reserved for
nitrous, slipstream and abilities", `src/ui/hud.css`), and the HUD proposal of
2026-09-26 draws the gauge where MCLA has it, as a reserved slot. Building
abilities is a scope decision, like police.
