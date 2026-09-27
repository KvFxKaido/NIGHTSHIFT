# Adopt a piece of Port Alder

Adoptions: Holgate Cold Store (PR #20); Fifth Ave Laundry (PR #22)
as of 2026-09-27. Cadence undecided; no scheduled automation enabled.

## Purpose

On each invocation, adopt one small, connected part of the playable city and
make it feel like a place with a purpose, occupants, and ongoing activity.
Deliver a bounded, playable improvement and evidence from the driver's view.
An adoption remains part of the city's history and can be revisited.
Scout shortcut and jump opportunities as part of every adoption.

**Adopt, then extract.** Port Alder has about 1,700 buildings, and one place a run
does not make a generic city specific. Each adoption should also leave behind one
reusable piece the rest of the city can use: a frontage option, a roof variant,
an activity the generator or the editor can place elsewhere, sparingly (the first
run left the open dock, now any shutter's option). Say in the record what was
extracted, and what the generator would need to use it.

## Run the routine

1. Read the current repository instructions, `design/GDD.md`,
   `design/PORT_ALDER.md`, relevant field notes, and the adoption record below.
   Inspect current code and work in progress. Port Alder is the target;
   historical Blackglass plans are reference material, not current map facts.
   Every adoption must use a dedicated isolated Git worktree and a branch under
   the running agent's prefix (`codex/`, `claude/`). Create them before making
   implementation changes, or resume the existing adoption worktree and branch
   for unfinished work. Verify the
   worktree path and branch before editing. Preserve existing changes and carry
   unfinished adoption work forward before starting another competing version
   of it. Check existing adoption PRs to avoid duplicating pending work.
2. Pick one block, intersection, frontage, alley, or short connected street.
   Favor places by how much the player sees them: the streets the gate's
   generated courses run through most, the drives out of Wharf Garage, then
   connections to existing authored places. Compare up to three candidates
   briefly, then choose one. Record its actual map identifiers or coordinates,
   boundaries, and approach route. Before designing anything seen from the road,
   check the sightline on the busiest approach: the heights of the buildings
   between it and the place (the first run put a rooftop plant on a 13 m roof
   behind a 17 m corner building). Give the place a name the city does not
   already use: the generator's stock business names repeat (the first run's was
   painted on nine buildings); hold the new one unique with a test, as the
   first run's is.
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
   Build the piece to be extracted (Purpose) as an option of the shared system,
   not inside the place. A change to a shared kit is tested on every variant the
   generator makes, not just the adopted building: the open dock was laid out
   for 4.3 m freight doors and drew racking above the generator's 3.6 m bays,
   which a reviewer found and the run did not.
   Prototype jumps with simple geometry and drive the approach, takeoff, and
   landing before detailed asset modeling. Once the driving works, refine the
   structure in Blender if needed. Keep visual geometry and collision aligned,
   preserve the validated driving surfaces, and repeat driving checks after
   importing the finished asset.
5. Drive past it, both directions, at the speed the street is driven, and judge
   what reads from the live camera's frames (Capturing evidence, below). State
   whether each pass was scripted or driven by hand; a scripted pass shows what
   is on screen at speed, not how it feels. Staged poses of a stopped car are for
   before/after comparison at the same location, never for judging visibility:
   the settled camera sits lower than the live one at speed, and the first run's
   staged view called the plant hidden northbound where the driven pass showed
   it from the Holgate junction on. Check free roam
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
- Two tiers. A dressing-only slice (drawing, frontage, render-only activity,
  nothing solid, no sim state) runs start to finish on its own. A slice that
  touches the sim (anything solid, a parked vehicle, traffic that visits, a
  surface) stops after the brief with a top-down sketch and waits for Shawn's
  approval before building: that is where the richer activity is, and where the
  expensive checks are (`design/COUPLINGS.md`, the rival gate's baseline).
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
  and is never decoration; red is cars. Dry streets for now: wet roads wait on wet
  handling, so no adoption paints one.
- **Performance.** New merged scenery must be listed in `CHUNKED_SCENERY`
  (`src/render/city-chunks.ts`) or it is drawn from everywhere on the map. Do not
  add to `src/sim/alder-data.json` casually (36 MB, a phone load-time question).
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

## Capturing evidence

Write a shot list, `design/adoptions/<place>/shots.json` (the first run's is the
example), and run from the adoption worktree:

```
pnpm adopt:capture design/adoptions/<place>/shots.json --before=<a tree without the change>
```

It serves each tree with that tree's own Vite, drives headless Chromium, and
writes beside the shot list: a before/after pair for each pose, a strip of
driven-pass frames, the moments of the place's activity, and `capture.json`
(each tree's commit and uncommitted files, each pass's speed and lane keeping).
Raw frames go to the git-ignored `artifacts/adoptions/<place>/`. A "before" tree
is a detached worktree of `main` with `pnpm install` run in it; remove it after.
On Windows it draws on the GPU; `--angle=swiftshader` draws as CI does, in
software and far slower.

A pass the script flags as disturbed (knocked a metre off its lane, or slowing
under full throttle) met something: start it past that and run it again, never
use its frames. What the helper does and why, for when it has to change: the
game pauses on blur, so `document.hidden` reads false; on a frozen loop the
garage-exit shot never ends and holds the camera 5.8 m to one side, so it is
cleared; `__ns.shot()` settles the camera 24 frames, not enough after a turn, so a
pose takes four; a live frame is read in the same task as the tick that drew it;
the lane is held by the keyboard's left and right from the offset and heading
error; the servers run in the script's own process, because on Windows a server
in a child outlives the script when it is killed and serves the wrong tree to
the next run.

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
  an exhaust stack: a silhouette over the roofline with a lit side, not a lamp. Southbound it is on the skyline from
  well back. Northbound, the way out of the garage, the 17 m SOUTH HARBOR FREIGHT on the corner hides this 13 m roof
  from 90 m out (view A, staged); from the Holgate junction on, driving, the plant, the sign and the lit dock are in
  the frame together (the driven pass).
- **Implemented activity.** Dock 01 stands open on its strip-lit inside with loaded racking, and a forklift works it:
  across, a stop, a turn in place, back, on a 12 s round, its amber beacon flashing at 1.4 Hz and throwing its light
  on the apron. Drawn from the sim's clock (`state.tick / 60`) in the renderer, as the junction flashers are: a
  frozen or paused game stands still with it, and the sim reads nothing back. Static evidence of occupation: the
  open lit dock, its white spill on the apron, the machine room's work light.
- **Custom asset.** None. Boxes, cylinders and flat shapes in the fronts' vertex-coloured materials, the plant banded
  like the roofs under `cel-city`. Blender is for a landmark; this is a working building.
- **Extracted.** The open dock: any shutter 2.4 m or taller can be saved open, its inside scaled to the opening, with
  a Dock door control in the editor (`FrontModule.open`, `openDockParts`). Not yet extracted: the rooftop plant is
  drawn in the place's own module; as a roof variant the generator would need a rule for which warehouses carry one
  and a check that it stands clear of anything else on the roof.
- **Status.** Implemented, checked by staged views and scripted driven passes both ways; not yet driven by hand.
  PR #20 merged on 2026-09-27 (verified before the second adoption).
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
  moments of the round): the Standard chase camera settled on a stopped car. `driven-pass.jpg`: live frames from two
  driven passes (below), north at 76 mph at the Holgate junction and south at 86 mph 15 m short. Recaptured with
  `pnpm adopt:capture` from `shots.json` (2026-09-27): before at 4d0e70a, after at a0fed5b, both clean, 1440 x 900 on
  the GPU; `capture.json` holds the trees, the world identity and every pass frame's speed and offset across its lane.
  The run's first set was made by hand in the browser pane, the frames the helper's recipe came from.
- **Shortcuts and jumps.** The row's 8 m gaps run from 1st Ave S back to open ground with no street behind it, so
  a gap leads into a field, not between two roads: rejected as a shortcut until a service road is drawn behind the
  row, when every gap becomes one. The slice has no ramp, deck or change of level: no jump candidate, and jumps wait
  for Shawn's decision anyway.
- **Checks.** `pnpm test` on the final tree, all passing, seven of them `tests/cold-storage.test.ts` (saved state and
  unique name, `open` refused off a shutter, an open dock's inside held within its opening from 2.4 to 10 m and the
  document refusing one under 2.4, every plant vertex on the roof and set back from the edge, no lights, under 2,500
  triangles, every drawn vertex of the forklift inside the doorway and moving under 10 cm a tick through its round,
  one activity per place). `pnpm build`. `git diff --check`. `pnpm golden` 14 of 14 bit-identical to a baseline
  pinned at the base commit (4d0e70a). `ALDER_DATA.version` the same string on `main` and here: no stored course,
  recording or gate baseline moves. The editor's Dock door read back and round-tripped in the browser (apply, read,
  undo; nothing saved). Driven passes: from rest to 110 mph up and down 1st Ave S past the store, full throttle at
  assist 1 with a lane-keeping steer on the keyboard's left and right, in the game at driving speed with the live
  chase camera, both held to their lane (x printed -4.0 and -14.0 at every frame, so within 5 cm). A first
  northbound pass from south of Harbor Way met a crossing sedan at that junction, pushed it 100 m and left the road,
  so it was discarded and the pass started past the junction. Not run: `pnpm laps --verify` (no race route touched), the rival gate (no sim change).
- **Limitations.** Northbound the plant is hidden until the Holgate junction (above). The forklift and the racking
  are flat in the doorway's plane, as the district's open docks are: from far along the street it is a shape on a
  lit panel. The activity runs on the sim clock, so the garage and a frozen page hold it still. No sound. Nothing
  visits: no truck backs onto dock 02, no car parks at the office. The driven passes are scripted, not a hand on a
  pad: they show what is on screen at speed, not how it feels to drive past.
- **Next revisit.** Make the place read from further north: light the apron (the district's freight docks have
  floodlights; this front's single bar light is the kit's), or give the corner building a lower roof if its own
  adoption allows.
  A reefer trailer on dock 02 (solid, so sim-side: an obstacle off the carriageway, with its own
  collision and a `COUPLINGS.md` look at the rival and traffic), the plant's hum when passing, and the service road
  behind the row that would turn its gaps into shortcuts.

### 2. Fifth Ave Laundry, 5th Ave N (2026-09-27, Codex, run by request)

- **Place.** Existing shop frontage `plot--567.000--1330.000`, address 745,
  east side of 5th Ave N between Broad St and Mercer St. Building bounds
  x -573 to -555, z -1339 to -1321; base 2 m, roof 32 m above datum.
  Adopted tenant: the northern shop, beside the existing café and residents'
  entrance. Its street wall is x -573; its fitted apron stays 0.95 m deep.
- **Approach.** North from Broad St along 5th Ave N (`sea-north-41`), shop on
  the right; south from Mercer St, shop on the left. The place is at (-564,
  -1330) on the map. `shots.json` records exact approach and passing positions.
- **Candidates.** This existing laundry; the shop at (-341, -1140), whose
  22–25 m apron puts the activity much farther from the road; the three-tenant
  block at (-520, -715), whose angled road produces a deep, uneven setback.
  The selected row has a short apron, a street-facing window and an existing
  laundry use. Neighbors to the north/south are 42/18 m tall but stand beside,
  rather than in front of, the ground-floor sightline. Compare with the prior
  adoption's hidden rooftop plant: this activity belongs at window height.
- **Purpose.** A 24-hour laundry for residents and night workers. A unique
  FIFTH AVE LAUNDRY board and violet 24 HR / LAUNDRY blade mark the tenant.
  Two washer loads tumble at different speeds; two drums stand idle. Cream
  cabinets and dark circular doors give the window a recognizable use.
  Existing doors, canopy, café, upper floors, ground and road remain intact.
- **Custom asset.** None needed. Scripted flat shapes form a shallow window
  tableau between the glass and its mullions, like the established open docks.
  It is not an enterable room. No Blender source or export is required.
- **Extracted.** `FrontModule.display: "laundry"`, exposed as Window display
  in the frontage editor. Any glazing at least 2.4 by 1.8 m can use it; the
  drawing fits the opening, follows its building frame and keeps local bounds.
  Static frontage batching leaves the animated parts intact. The generator
  does not enable it automatically; future use needs sparse tenant-based
  selection for laundry captions and the same minimum-size check.
- **Shortcuts.** The row's 14 m gaps are potential entrances to a future rear
  service route. The inspected block has no rear street connection; turning
  across its unpaved ground is not a useful authored shortcut. Proposed for
  later network planning, not built. Existing street connections stay intact.
- **Jumps.** No suitable jump in this slice: level ground at 2 m, no accessible
  deck or loading ramp with a landing route. No jump built; the planar-car
  decision remains outside this dressing pass.
- **Worktree/branch.** `C:\Users\ishaw\.codex\worktrees\6826\NIGHTSHIFT`,
  `codex/adopt-fifth-avenue-laundry`, based on main at `2b4a275`.
- **Files.** `render/frontage-displays.ts` and the shared frontage renderer,
  frontage module/document types, saved frontage data, editor controls;
  `tests/laundry-display.test.ts`, `scripts/test-laundry-display.mjs`.
- **Evidence.** `design/adoptions/fifth-ave-laundry/sketch.svg` was drawn before
  implementation. `shots.json` specifies matched poses, scripted passes both
  ways and activity moments. `window-before-after.jpg`, the two approach pairs,
  `driven-pass.jpg`, `wash-cycle.jpg` and `capture.json` show the same world on
  main at `2b4a275` and the clean implementation commit recorded in `capture.json`.
  The raw frames are in git-ignored `artifacts/adoptions/fifth-ave-laundry/`. Both driven
  passes held their lane within the reported 0.00 m rounding and were
  undisturbed, topping out at 97/106 mph north/south. Selected frames show
  the shop at 46–58 mph northbound and 75–85 mph southbound. The violet blade
  and bright machine window read briefly at the edge of the driving view;
  individual tumbling loads are a close-pass detail. These are scripted passes.
- **Implementation / PR.** Implemented and validated in PR #22:
  https://github.com/KvFxKaido/NIGHTSHIFT/pull/22
- **Checks.** `pnpm test`: all 831 pass, including five focused display
  tests; `pnpm build` passes with the existing large-chunk warning. All 14
  `pnpm golden` runs are bit-identical to the baseline saved on main before
  editing, including traffic/free roam and generated races. Before/after
  capture reports identical world identities and zero browser errors. The
  editor's plain/laundry save-reload cycle, preview, undo/redo and lock checks
  pass. `node scripts/test-laundry-display.mjs` verifies animation, frozen-time
  stability, visible gameplay and viewport fit at 1440 x 900 and 390 x 844,
  plus the place in generated-race mode. Screenshots were visually inspected;
  `qa.json` records zero browser errors and the measured incremental display
  cost of five draw calls / 370 triangles in each view. This is a local draw
  budget, not a phone frame-rate claim. `git diff --check` passes. No street,
  solid, paving or traffic-rule
  change: no world revision or coupling-ledger recalibration is required.
- **Limitations.** Shallow window graphics, with no sound, pedestrians or
  arrival/departure simulation. Drums are a close-pass detail. Driving captures
  are scripted and do not establish controller feel.
- **Next revisit.** Judge the approach from a hand-driven lap; consider a
  service route behind the row only as a separately scoped world change.

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
