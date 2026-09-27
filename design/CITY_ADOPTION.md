# Adopt a piece of Port Alder

Status: routine prepared; cadence undecided; no scheduled automation enabled.

## Purpose

On each invocation, adopt one small, connected part of the playable city and
make it feel like a place with a purpose, occupants, and ongoing activity.
Deliver a bounded, playable improvement and evidence from the driver's view.
An adoption remains part of the city's history and can be revisited.
Scout shortcut and jump opportunities as part of every adoption.

## Run the routine

1. Read the current repository instructions, `design/GDD.md`,
   `design/PORT_ALDER.md`, relevant field notes, and the adoption record below.
   Inspect current code and work in progress. Port Alder is the target;
   historical Blackglass plans are reference material, not current map facts.
   Every adoption must use a dedicated isolated Git worktree and a branch under
   the running agent's prefix (`codex/`, `claude/`). Create them before making implementation changes, or resume the
   existing adoption worktree and branch for unfinished work. Verify the
   worktree path and branch before editing. Preserve existing changes and carry
   unfinished adoption work forward before starting another competing version
   of it. Check existing adoption PRs to avoid duplicating pending work.
2. Pick one block, intersection, frontage, alley, or short connected street.
   Favor places the player encounters and connections to existing authored
   places. Compare up to three candidates briefly, then choose one. Record its
   actual map identifiers or coordinates, boundaries, and approach route.
3. Write a short place brief: what happens here, who uses it, why it belongs
   beside its neighbors, and what the driver should recognize. Choose one
   defining feature and one observable sign of ongoing activity. Keep a small
   budget of supporting details; each should support the same place story.
   Scout nearby alleys, service passages, yards, elevation changes, loading
   ramps, and gaps for shortcuts or jumps that fit the place. Record promising
   candidates and their entry/exit connections, driving payoff, and risks.
   A shortcut should offer a useful alternate line with a legible tradeoff;
   a jump should have a readable approach, takeoff, landing, and recovery route.
   Record "no suitable opportunity" when appropriate; do not force a ramp or
   passage into every location. Implement a candidate when it fits the bounded
   slice and existing systems; otherwise retain it as a future opportunity.
   After scouting, decide whether the place needs a custom asset. Use Blender
   when a distinctive structure or shape warrants it, such as a landmark
   building, parking structure, pedestrian bridge, or shaped loading ramp.
   Prefer existing geometry and placement systems for ordinary street work;
   Blender is optional, not a requirement for every adoption.
4. Implement one coherent slice using existing systems where possible.
   Connect buildings to their street with believable doors, access, loading,
   parking, lighting, and ground treatment as appropriate. Activity might use
   existing traffic, a localized light sequence, or spatial ambience; select
   what the runtime can support without inventing a citywide simulation.
   Distinguish implemented behavior from static evidence of occupation.
   Prototype jumps with simple geometry and drive the approach, takeoff, and
   landing before detailed asset modeling. Once the driving works, refine the
   structure in Blender if needed. Keep visual geometry and collision aligned,
   preserve the validated driving surfaces, and repeat driving checks after
   importing the finished asset.
5. Check the result from normal driving height, both on approach and passing
   through. Compare before/after views at the same location. Check free roam
   and any affected race route, access clearance, collision, sightlines, and
   performance. For implemented shortcuts, drive both the normal and alternate
   lines and check travel time, clearance, re-entry, and race checkpoint rules.
   For implemented jumps, test plausible approach speeds, takeoff collision,
   airborne clearance, landing stability, and recovery from short or long
   landings with the current handling. Label untested candidates as proposals.
   Run applicable focused checks, `pnpm test`, `pnpm build`, and
   `git diff --check` for implementation changes. Report unavailable checks
   honestly; mark the slice awaiting validation if driving inspection is blocked.
6. Update the adoption record with the result, evidence paths, changed files,
   limitations, and a specific future revisit opportunity. Report the place,
   what now happens there, how to drive to it, and what was verified.
7. Commit the adoption changes, push its branch, and open a pull request against
   the repository's intended integration branch. This routine authorizes those
   actions. Update the existing adoption PR when resuming unfinished work.
   Describe the place, implemented activity, shortcut/jump findings, driving
   directions, before/after evidence, validation results, and any limitations.
   Attach the PR to the current task and include its URL in the final report.
   Leave the PR open for review; merging requires a separate user instruction.
   If validation is incomplete, open a draft PR and mark the adoption awaiting
   validation. If pushing or opening the PR is blocked, report the exact blocker
   and retain the worktree and branch; do not claim the adoption is complete.

## Boundaries and quality

- One bounded place per invocation. Finish or repair an incomplete adoption
  before accumulating more unfinished locations.
- Completion requires a dedicated worktree, completed validation, and an open
  PR containing the pushed changes. A local diff alone is not completion.
- Preserve established driving routes and intentional mode distinctions.
  Make local geometry changes for shortcuts or jumps deliberately, with shared
  rendering/collision data and driving validation. Preserve garage access,
  race readability, and traffic clearance.
- Follow shared geometry/collision definitions. The renderer draws; the sim
  decides. Behavior that affects gameplay belongs in deterministic simulation.
  Follow `design/COUPLINGS.md` when a changed system affects measured results.
- If a place needs a new feature outside the approved game scope, record the
  dependency and complete a useful slice within scope. A city adoption does not
  silently authorize pedestrians, police, economies, or new game modes.
- A successful slice has a readable identity, a believable connection to its
  surroundings, and at least one implemented sign of activity. Static dressing
  alone is an intermediate step, and should be labeled as such.
- Revisit prior places when driving feedback or adjacent development exposes
  a concrete improvement. Preserve recognizable landmarks and local identity.

## Repository traps

Added 2026-09-27 (Claude, at Shawn's request) from traps the repository has
already paid for. `CLAUDE.md` holds each in full; read the ones a slice touches.

- **Dressing by default; street changes are expensive and announced.** A new or
  changed street, alley, shortcut or drivable surface changes the world's
  identity: the generator draws other courses, stored Blacklist stages become
  incompatible and must be replaced in the garage, generated-race recordings are
  refused, and the rival gate's baseline must be re-saved (`pnpm rival:gate
  --save`). Prefer buildings, frontage, lighting, props and activity. When a slice
  does change the street network, put that in the PR title, run
  `pnpm alder:critique` before and after (and `--try=` to price an alley before
  drawing it), bump what `CLAUDE.md` says the change bumps (`ALDER_VERSION`, the
  generator revisions), and follow the alley recipe: append the road to the data
  and rebuild `--surfaces-only`, never a full `build-alder.py`, and retire what
  its carriageway, shoulder and sidewalk cross in `alder-clearance.json`.
- **`design/LOOK.md` is the check anything new passes first.** Signs name what a
  place is, never a brand. Neon is an accent in violet, magenta, green or indigo
  only, on ground floors facing a street a driver uses. Cyan belongs to the race
  and is never decoration; red is cars. Dry streets, no rain.
- **Performance.** New merged scenery must be listed in `CHUNKED_SCENERY`
  (`src/render/city-chunks.ts`) or it is drawn from everywhere on the map. Do not
  add to `src/sim/alder-data.json` casually (24 MB, a phone load-time question).
  Buildings measure from `base`; night dressing is built in the building's frame.
  Placements go through the editor: read `design/EDITOR.md` first.
- **Jumps wait for a decision.** `design/JUMPS_AND_DRIFT.md` is an undecided
  proposal and the car is a planar model. Record jump candidates in the adoption
  record; do not build one until Shawn decides on jumps.
- **Not for adoption:** the empty lots by Wharf Garage (the start ground, kept for
  the event venue) and the stadium venue.
- **Traffic has its own revision.** Activity that changes how traffic drives, or
  which junctions are dressed, is a `TRAFFIC_REVISION` bump. A parked rival is a
  racer traffic yields to: within `RACER_IN_LANE` (2.6 m) of a lane's line and
  facing along it, it stops that lane for good. Park rivals, and place anything
  solid, off the carriageway.
- **Show the plan.** Shawn wants area work drawn before it is built. Put a
  top-down sketch of the chosen bounds and the approach route in the PR beside the
  before/after views.
- **Checks beyond the suite.** A slice that touches the world also runs
  `pnpm golden` (its free-roam run sees traffic and the world), and one that
  touches a race route runs `pnpm laps --verify` before and after.

## Adoption record

### 1. Holgate Cold Store, 1st Ave S, SoDo (2026-09-27, Claude, run by hand)

- **Place.** The warehouse `plot--44.000-617.000` (27 x 24 m, 13 m to the roof, base 2 m, unrotated), second in the
  freight row on the west side of 1st Ave S north of S Holgate St, after SOUTH HARBOR FREIGHT on the corner. Its
  street wall is x = -30.5 from z 605 to 629. The slice is that building, its roof and its 3.35 m apron: outside the
  start ground Wharf Garage keeps (east of 1st Ave S, Holgate to the garage), nowhere near the stadium.
- **Approach.** Out of Wharf Garage, north up 1st Ave S through the S Holgate St junction; it is the second building
  on the left, about 300 m from the shutter. Southbound from Alder Center it is on the right, before Holgate.
- **Candidates.** (A) this building; (B) the Western Ave S-bend in Alder Center, on 13 of the gate's 82 courses but a
  street-geometry place, the expensive kind; (C) SOUTH HARBOR FREIGHT on the Holgate corner, which faces the start
  ground. A: it is on the first drive out of the garage and it is all dressing.
- **Purpose.** A cold store for the port: the night shift receives into dock 01 (CHILLED) while dock 02 (FROZEN) is
  shut. Its painted name was ALDER COLD STORAGE, one of the generator's twelve stock identities and painted on eight
  other buildings in the city; it is HOLGATE COLD STORE now, named for its corner, and the test holds it unique.
- **Defining feature.** The refrigeration plant on the roof: four evaporative condensers on a skid 1.35 m back from
  the street edge, two fan stacks each, the lagged header and its runs back to a machine room with a work light and
  an exhaust stack: a silhouette over the roofline with a lit side, not a lamp. It reads southbound and at the kerb.
  Northbound, the way out of the garage, the 17 m SOUTH HARBOR FREIGHT on the corner hides this 13 m roof, and what
  a driver sees from 90 m is the lit dock (view A).
- **Implemented activity.** Dock 01 stands open on its strip-lit inside with loaded racking, and a forklift works it:
  across, a stop, a turn in place, back, on a 12 s round, its amber beacon flashing at 1.4 Hz and throwing its light
  on the apron. Drawn from the sim's clock (`state.tick / 60`) in the renderer, as the junction flashers are: a
  frozen or paused game stands still with it, and the sim reads nothing back. Static evidence of occupation: the
  open lit dock, its white spill on the apron, the machine room's work light.
- **Custom asset.** None. Boxes, cylinders and flat shapes in the fronts' vertex-coloured materials, the plant banded
  like the roofs under `cel-city`. Blender is for a landmark; this is a working building.
- **Status.** Implemented; PR #20 open for review, not merged.
- **Files.** `src/render/cold-storage.ts` (the place), `src/render/place-activity.ts` (each place's activity, run from
  `render()`), `src/render/building-fronts.ts` (an open shutter), `src/sim/building-fronts.ts` and
  `frontage-document.ts` (`open`, shutters only), `src/sim/alder-frontages.json` (the entry: renamed, docks named,
  dock 01 open, hand edited and locked), `src/editor/frontages.ts` and `editor.html` (a Dock door control),
  `src/render/alder.ts`, `src/render/scene.ts`, `tests/cold-storage.test.ts`, `design/LOOK.md`. Worktree
  `C:\dev\NIGHTSHIFT-adopt-cold-storage`, branch `claude/adopt-alder-cold-storage`.
- **PR.** https://github.com/KvFxKaido/NIGHTSHIFT/pull/20
- **Evidence.** `design/adoptions/holgate-cold-store/`: `sketch.svg` (the bounds, both approaches, capture points
  A, C and D), `dock-before-after.jpg` (C, stopped at the kerb facing the dock), `southbound-before-after.jpg` (D, 45 m
  short of it southbound), `approach-before-after.jpg` (A, 90 m short northbound), `forklift-round.jpg` (four
  moments of the round). Driving height, the Standard chase camera settled, `?scene=track` on dev servers of `main`
  and of this branch, the same poses.
- **Shortcuts and jumps.** The row's 8 m gaps run from 1st Ave S back to open ground with no street behind it, so
  a gap leads into a field, not between two roads: rejected as a shortcut until a service road is drawn behind the
  row, when every gap becomes one. The slice has no ramp, deck or change of level: no jump candidate, and jumps wait
  for Shawn's decision anyway.
- **Checks.** `pnpm test` 825 of 825 on the final tree, six of them `tests/cold-storage.test.ts` (saved state and
  unique name, `open` refused off a shutter, every plant vertex on the roof and set back from the edge, no lights,
  under 2,500 triangles, the forklift inside the doorway every tenth of its round and never jumping a tick, one
  activity per place). `pnpm build`. `git diff --check`. `pnpm golden` 14 of 14 bit-identical to a baseline pinned
  at the base commit (4d0e70a). `ALDER_DATA.version` the same string on `main` and here: no stored course,
  recording or gate baseline moves. The editor's Dock door read back and round-tripped in the browser (apply, read,
  undo; nothing saved). Not run: `pnpm laps --verify` (no race route touched), the rival gate (no sim change). Not
  driven with a pad.
- **Limitations.** The plant is hidden northbound (above), which is the drive most players make past it. The
  forklift and the racking are flat in the doorway's plane, as the district's open docks are: from far along the
  street it is a shape on a lit panel. The activity runs on the sim clock, so the garage and a frozen page hold it
  still. No sound. Nothing visits: no truck backs onto dock 02, no car parks at the office. Captures are staged poses
  of a stopped car, not a driven pass.
- **Next revisit.** Make the place read northbound: light the apron (the district's freight docks have floodlights;
  this front's single bar light is the kit's), or give the corner building a lower roof if its own adoption allows.
  A reefer trailer on dock 02 (solid, so sim-side: an obstacle off the carriageway, with its own
  collision and a `COUPLINGS.md` look at the rival and traffic), the plant's hum when passing, and the service road
  behind the row that would turn its gaps into shortcuts.

For each adoption record: place name; map IDs/bounds; approach route; purpose;
defining feature; implemented activity; custom asset decision and any Blender
source/export paths; status; files/worktree/branch; PR URL;
before/after
evidence; shortcut/jump candidates and their implemented, proposed, or rejected
status with reasons; checks performed; limitations; next revisit opportunity.

## Scheduling

Run manually with: "Run the city adoption routine in design/CITY_ADOPTION.md."

When Shawn chooses a cadence, create a scheduled follow-up in this task using
the automation tool. Its durable prompt should tell each run to execute this
routine, require a dedicated worktree and an open PR for completed work, read
and update the adoption record, and continue unfinished work before selecting
another location. Notify on a completed slice, meaningful
change, failure, or required user decision; stay quiet when nothing actionable
has changed. Do not infer a daily or weekly schedule from this document.
