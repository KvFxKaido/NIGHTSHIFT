# PROJECT NIGHTSHIFT

Game Design Document

Status: Playable PC browser prototype; career/progression remain design targets
Direction updated: 2026-09-10
Working Title: Project Nightshift
Genre: Arcade street racer
Prototype Platform: PC web browser
Target Hardware: RedMagic 10 Pro (Android), after the PC prototype
Android Packaging: Deferred; Capacitor remains an option
Technology: TypeScript, Vite, Three.js, Rapier
Target Session Length: 5 to 20 minutes

---

## 1. High Concept

Project Nightshift is a compact arcade street-racing game centered on illegal nighttime racing, car customization, rival progression, and mastery of a dense fictional city district.

The primary reference is **Midnight Club 3: DUB Edition**: open racing,
route discovery, city familiarity and ownership through customization.
Midnight Club: Los Angeles can supply selected ideas when useful, including
police as a possible later feature. Other racing references inform particular
visual or driving choices without replacing that direction.

Players build one car into a personal street-racing machine, challenge recognizable rivals, discover shortcuts, and climb through a local racing scene.

The world is a fictionalized, compressed Port Alder built for racing. Start with a useful connected slice and expand naturally when driving and route choices justify it. MC3 San Diego is a reference for the eventual sense of scale, not a requirement to recreate San Diego or match an exact map area.

The original SoDo–Belltown area forms the southwest (bottom-left) corner of the
map. The authorized 10 km² expansion now reaches a 12.6 km² street-network
footprint with Queen Anne, Capitol Hill, the Central District and Madrona Ridge.
Keep the original long, straight roads as part of the driving mix. Future
additions should be more compact where practical, favoring shorter blocks,
varied street geometry and useful connections to the north and east. See
`PORT_ALDER.md` for the expansion direction agreed on September 11, 2026.

### 1.1 Current Direction

- **Format:** MC3-inspired open-checkpoint racing. “No unnecessary barriers,
  no wrong ways, just slower ways.” The required checkpoints define the event;
  the player chooses the streets between them.
- **World:** Port Alder is the sole playable demo map. Blackglass is retired from
  the demo and retained as offline regression/reference material.
- **Look:** approximately MC3 played at higher resolution on an emulator:
  readable silhouettes, simple geometry, strong lighting and authored detail.
- **Hardware and sequence:** preserve the nearly-right handling in the PC
  prototype first. RedMagic 10 Pro is the eventual hardware target; its port
  and on-device testing can follow. There is no current engine migration.
- **Customization:** body parts, paint and a few understandable performance
  upgrades. The player should not need mechanical expertise.
- **Scope:** grow one city from play feedback. Police and other LA-inspired
  features are possible later additions, not commitments for the current slice.

The rest of this document includes unimplemented career, rival and Surge
proposals. The current playable features are listed in §6.4 and
[PORT_ALDER.md](PORT_ALDER.md); a design paragraph is not evidence that it exists.

Shortcuts should have readable tradeoffs: a narrow gap, a difficult turn,
traffic exposure, or a longer but faster road. A missed turn should create
another decision rather than an artificial wrong-way failure.

---

## 2. Design Thesis

«A small city can feel enormous when the player is still learning how to race through it.»

Project Nightshift should not compete through map size, vehicle count, or cinematic spectacle. It should compete through handling feel, environmental mastery, customization, atmosphere, and replayable route design.

The player should gradually stop seeing the city as a collection of roads and begin seeing it as a network of possibilities.

A parking structure becomes a shortcut.
A gas station becomes a corner-cutting opportunity.
A loading dock becomes a jump.
An alley that looked decorative becomes the difference between winning and losing.

---

## 3. Core Pillars

### 3.1 The Car Must Feel Good Immediately

Driving is the central verb. Acceleration, braking, steering, drifting, collision response, camera movement, and speed presentation must feel satisfying before additional content is produced.

The physics should support expressive arcade driving rather than realistic vehicle simulation.

The player should feel capable within seconds, but still discover faster techniques over time.

### 3.2 The City Is a Track the Player Learns

The environment is designed as a dense collection of intersecting race lines rather than a realistic urban simulation.

Players should recognize landmarks at high speed and use environmental knowledge to make meaningful route decisions.

Shortcuts must be visually readable without requiring the player to slow down and inspect them.

### 3.3 Rivals Are Driving Personalities

Rivals are not generic opponents with different difficulty values. Each rival represents a recognizable racing philosophy.

Players should learn how specific rivals behave, where they are likely to take risks, and how to counter their habits.

### 3.4 Customization Creates Ownership

The player should become attached to their car.

Visual and performance upgrades should make the vehicle feel increasingly personal while preserving its underlying handling identity.

Favor a small roster with meaningful visual choices. Body parts, paint and a few readable performance upgrades establish ownership without requiring deep mechanical tuning.

### 3.5 Style Is Part of Progression

Reputation is expressed through cars, rivals, locations, music, UI treatment, and how the city responds to the player.

The game should feel like entering a local scene rather than advancing through a conventional sports championship.

### 3.6 Speed Is Spent, Not Refilled

Surge is nitrous, and it is finite. A car carries a small number of tanks, every
event starts full, and nothing refills mid-race. Capacity is bought in the
garage; the fills themselves are free.

The decision belongs inside the race rather than in an economy layer: this
corner or the next straight, the pass now or the exit speed later. A boost that
recharges on its own is a button held down until it works, and that is the
failure this pillar exists to prevent.

---

## 4. Target Experience

The desired emotional rhythm is:

1. Enter the garage.
2. Inspect or modify the car.
3. Drive into the district.
4. Locate an event or rival.
5. Challenge them by flashing the headlights.
6. Follow them to the starting location.
7. Race through a familiar but newly configured part of the city.
8. Earn cash, reputation, parts, or information.
9. Return to the garage or continue exploring.

The player should regularly experience three distinct pleasures:

- The immediate physical pleasure of driving
- The strategic pleasure of recognizing a better route
- The expressive pleasure of changing the car

---

## 5. Game Structure

Project Nightshift uses a chapter-based career structure.

Each chapter introduces:

- A new rival
- New race layouts
- Additional upgrade tiers
- A new section or layer of the district
- A mechanical or environmental complication

Progress is a **Blacklist** (2026-09-12), after Need for Speed: Most Wanted
(2005): ten named racers ranked #10 to #1, climbed one name at a time. It
replaced, the same day, a Midnight Club 3-style ladder whose rungs were groups
of racers. The list is always visible: who is above the player, what they
drive, and what earns the next shot. The Blacklist gates the career.
Reputation does not.

**The opening** is a short rendered cutscene with text dialogue and character
portraits, not a playable race. In it the player loses the red NS-01, the
original hero car, and the loss is honest: no sabotage. The player then starts
from a garage body. The cutscene is presentation only (§17.2); the sim never
models the opening race, so there is no outcome in which the player wins it.

The NS-01 is not the summit of the list the way Most Wanted's BMW was, and #1
does not hold it. Sable keeps it, as today (`design/CHARACTERS.md`,
`src/sim/drift-yard.ts`).

**Beating a name** means earning a shot, then winning their challenge. Every
name's signature car is the player's when they are beaten, guaranteed. Ten
names therefore account for half of the internal target of 20 drivable cars,
rivals included.

**#1 Tally's signature car is Vesper** (2026-09-12): an original NSX-inspired,
cab-forward charcoal coupe with a short nose, long engine deck, closed pop-up
pods and fixed driving lamps. A self-lit violet tail band and her ten-stroke
flank marks carry her identity. Shawn chose RWD; the mid-engine layout is
visual only, with no handling tuning. The source and runtime asset exist;
her encounter and reward unlock do not. The rejected notchback is preserved
as an unregistered source body for a later decision.

Open, and unresolved in these documents:

- **Whether the player has a portrait** in the opening's dialogue.

Proposed, not decided:

- Tally's characteristic mistake (§10): she is the fastest driver on every
  line she knows and never takes a line she has not driven, so the way past
  her is a route she does not know. Rivals learn only from races the player
  wins, so each such route works once.
- A shot at the next name arrives as a text from Tally, and the opening's last
  line is Tally writing the player's name onto the list.
- The player loses the NS-01 to Sable in the opening, which is also the story
  of why it left the garage, and wins it back as Sable's guaranteed signature
  car. That returns the car partway up the list, while there is still racing
  to use it in, rather than after the last race.
- A shot is earned by racing, not by police heat (§21): wins on that name's
  home turf, so the player has learned their streets before racing them there.
- A name's challenge can be their discipline, such as Rivet's drag or Sable's
  drift.
- Chapters open at list positions, opening who races in a district rather than
  which streets can be driven (§6.3).
- Beaten names stay in the city as rivals to flash, having learned from the
  races the player won against them (`design/PROCEDURAL_RACES.md`).
- Moth, who already cruises by the garage, is #10.
- The full list, #10 to #1, with turf, car, accent, challenge and each name's
  characteristic mistake: `design/BLACKLIST.md` (a sketch; six of the ten are
  not created).

Reputation unlocks performance parts (§5.1). Players earn it from results:

- Winning races
- Defeating rivals
- Discovering shortcuts
- Completing optional challenges
- Winning while using lower-tier equipment

Style earns no reputation. None of this is implemented.

### 5.1 Garage Economy

Race payouts are cash. Cash buys performance parts and Surge capacity, and there
is no second race-time currency to track.

Reputation is a non-spendable record. Crossing its thresholds unlocks
performance parts for purchase; cash still buys them, and nothing spends
reputation down. Because the Blacklist gates the career and reputation does
not, grinding generated races earns parts, never a way past a name on the list:
a player stuck on one can build the car up and try again.

Lifetime style is a separate record. It earns no reputation and converts into
nothing: not speed, not parts, not access. When reputation began unlocking
parts (2026-09-12), style stopped counting toward it so that this stayed true.

Base event payouts must guarantee forward progress even for weaker players.
There are no repair bills or other loss spirals in the first slice.

Live Cred, a style-to-speed economy, was the proposed hook until 2026-09-12. It
was dropped as an elaborate answer to a single question -- whether nitrous
becomes a crutch -- that finite tanks answer directly. The retired design and
its reasoning are kept in [`LIVE_CRED.md`](LIVE_CRED.md). Neither system is
implemented.

---

## 6. World Structure

### 6.1 The District

The current game takes place in Port Alder at night: a fictional port city adapted from Seattle's street structure, named its own on September 11, 2026 once it was clear the map would never be made to feel like Seattle itself. Its connected zones borrow real street structure, with compressed distances, wider roads, softened grades and authored connections. Additional neighborhoods should follow useful driving routes rather than a predetermined whole-city build.

Possible zones beyond the first Port Alder blockout include:

- Neon commercial strip
- Industrial shipping yard
- Elevated freeway
- Downtown office blocks
- Parking structures
- Rail corridor
- Construction site
- Storm-drain channel
- Hillside residential roads

Each zone should have a distinct driving identity.

The commercial strip favors traffic weaving and wide turns.
The industrial zone favors shortcuts, jumps, and blind corners.
The parking structures favor elevation changes and tight navigation.
The freeway favors speed, drafting, and high-risk exits.

### 6.2 Hub Philosophy

The district is lightly explorable between events, but it is not a full simulation.

The hub exists to provide:

- Atmosphere
- Rival encounters
- Event selection
- Car ownership fantasy
- Route familiarity
- Optional challenges
- A sense of place

The hub does not initially require:

- Pedestrians
- Police systems
- Dynamic weather
- A full day and night cycle
- Simulated businesses
- Complex civilian traffic schedules
- Enterable interiors outside key locations

### 6.3 Open Racing

Events reuse the freely drivable street network. Checkpoints, traffic and
visual cues can change the race, but unnecessary temporary walls and
wrong-way penalties must not force one route between gates. Existing
buildings, seawalls and other believable obstacles can constrain movement;
keep their visible and collision geometry consistent.

An alternate road may be slower, awkward, or risky. It remains a valid choice
if the player reaches the checkpoints in order. Circuit and sprint variants
should preserve this principle.

### 6.4 Current Port Alder Demo

Port Alder is the only playable map and opens at the base URL. The expanded slice
contains about 83.5 km of streets, 318 street-graph edges, 1,730 generated building
masses plus Wharf Garage and the Broadcast Tower, a fictional waterfront bypass,
and softened hills across a 12.6 km² street-network footprint. Belltown connects
downtown to Alder Center; Queen Anne, Capitol Hill, Central District and
Madrona Ridge extend north and east. Surveyed terrain remains future work.
City of Seattle/SDOT centerlines supply the original southwest structure;
the new hill districts, buildings and elevation are authored game adaptations.
See [PORT_ALDER.md](PORT_ALDER.md)
and the [source notes](../assets/maps/alder/README.md).

Free roam starts outside **Wharf Garage** in SoDo. Stop at its marked entrance
and press E/Enter or Cross/A to enter. Customization uses the same car mesh;
the camera stays fixed while right stick rotates the car/platform. Driving
out returns to the forecourt. Races use a separate street start and disable
garage entry. **Sound to Sky** is a four-checkpoint race with free route choice.
Traffic, reset and browser-local car/customization settings exist. The garage
offers Cinder and Bulwark; both share the current handling and visual setup.
In-game replay and the recorded-input ghost have been removed. Sound to Sky now
has one AI rival in the other garage car, with an authored preferred route,
corner/traffic braking, basic recovery and shared-world collisions. The player
retains open route choice. In free roam the other car waits near Wharf Garage:
approach and flash headlights to enter Sound to Sky. This is an authored encounter
and race; generated routes and moving challenge encounters remain future work.
See [PORT_ALDER.md](PORT_ALDER.md).
Career progression, purchased upgrades, police and opponent personalities do not.

The map board is `alder.html`; `editor.html` edits Port Alder building
placements. Validated saves feed both rendering and Rapier. The garage,
forecourt and roads are protected. See [EDITOR.md](EDITOR.md).

Blackglass world links migrate to Port Alder and `district.html` redirects to
its map board. Blackglass's district/course renderers and its Rivergate GLB
are excluded from the playable demo build. Legacy source and tests remain
for regression coverage, not as an alternate playable map.

---

## 7. Race Types

Open checkpoint (§7.3) is the primary event and the one the district is tuned
for. The others are variations on it — a circuit is an open checkpoint race
whose checkpoints repeat, a sprint is a point-to-point checkpoint sequence — and none of them is built before open checkpoint works.

A race is a sequence of checkpoints, and route choice should be judged per
leg. Compare a direct route with plausible alternatives by driving them:
distance alone misses corner speed, grades, traffic and difficult entries.
The old Blackglass study used a 10–25% detour-cost heuristic; that is historical
analysis, not a validated Port Alder balance target. `pnpm district:critique`
still analyzes the retired Blackglass data and must not be used to report
Port Alder measurements. Sound to Sky needs continued human route testing.

### 7.1 Circuit

Multiple laps through a defined route.

Circuit events emphasize consistency, cornering, and learning how opponents behave over repeated sections.

### 7.2 Sprint

A point-to-point race through the district.

Sprint events emphasize speed, traffic reading, and adapting to unfamiliar transitions between zones.

### 7.3 Open Checkpoint

Players must pass through a set of checkpoints, but the route between them is not fixed.

This is the strongest Midnight Club-inspired mode.

Open checkpoint events reward:

- City knowledge
- Shortcut discovery
- Risk assessment
- Vehicle-specific route choices
- Improvisation after mistakes

**Generated, not authored (2026-09-10).** Flashing a rival draws a new race
from the city every time: three to five gates at junctions, each leg chosen
for the choice it offers. The rule "every shortcut has a cost" — between two
gates, the faster way should be the riskier way — is measured per leg from
the map data (`pnpm alder:critique`) and is the constraint the generator
refuses to violate rather than a paragraph to remember. The seed is the
race's identity: the same seed draws the same gates and the same rival line,
which with its variant (sprint, circuit, unordered) and the start pose the
flash was made from is all a saved playlist or a ghost needs to carry. A race repeats only
if the player keeps it. Rivals biasing the draw towards their own streets,
and rivals learning the player's lines per street from races the player won
against them (never from the player's losses), are the next two steps;
`design/PROCEDURAL_RACES.md` is the long form and the order of work.

### 7.4 Drag

A short, highly directed race focused on shifting, traffic timing, and lane selection.

Drag events should be visually intense but mechanically compact.

### 7.5 Drift

Players earn points through controlled slides, speed, angle, chaining, and proximity to environmental hazards.

Drift physics may use additional assists beyond normal race handling.

### 7.6 Rival Duel

A one-on-one event designed around a specific rival's personality.

Rival duels may include special rules, unusual routes, heavier traffic, or environmental hazards associated with that character.

---

## 8. Vehicle Handling

### 8.1 Handling Goal

The driving model should feel responsive, exaggerated, and readable.

The target is not simulation accuracy. The target is giving the player enough control to intentionally drive close to danger.

Current browser prototype: a force-based four-wheel model supplies independent
tire forces to Rapier at a fixed 60 Hz. Steering angles the front tires; chassis yaw
is the result of those forces and collisions, not a commanded rotation. Each
tire shares finite grip between cornering, propulsion and braking. ABS-style
allocation prioritizes steering grip, so braking while turning remains useful
but costs stopping distance. Mild longitudinal and lateral load transfer change
individual tire loads; load sensitivity makes heavily loaded tires less efficient.

Service braking retains its progressive, immediate analog response and pedal
overlap cuts engine drive. The handbrake cuts drive and reduces rear lateral
stiffness/grip while applying rear braking: it creates extra rotation with a
speed cost. Automatic countersteering has been removed for the current handling
comparison: the player owns steering during and after a slide. Ordinary turn-in
retains input smoothing and the speed-dependent steering envelope. Unwinding is
quicker, and explicit countersteering gets faster response and extra manual range
as slip builds. The stick still chooses direction and proportion of wheel angle;
no slip-derived steering is added, and neutral input targets straight wheels.
Weak/late corrections and prolonged high-speed handbrake holds can still leave
the car broadside; these remain limitations, not automatic recoveries. Gas/brake remain
analog and steering retains the 5% center deadzone. This is approachable
sim-cade, not a requirement for the player to understand mechanical tuning.

### 8.2 Vehicle Model

Implemented in the browser prototype:

- A planar rigid chassis integrated by Rapier, including contact response
- Four virtual tire contact points with independent point velocity, slip and combined grip limits
- Speed-dependent front steering with inside/outside Ackermann angles, not a yaw-rate command
- Drive split is a property of the car: the Cinder is RWD (100% rear) and the Bulwark AWD (45% front / 55% rear), while FWD (100% front) remains the simulation default the regression fixtures measure; equal left/right axle drive torque and traction limiting
- Progressive front-biased service brakes, limited by each tire's own remaining grip
- Mild longitudinal/lateral load transfer, tire load sensitivity and low-speed force stabilization
- A rear-axle handbrake and shared brake/reverse control
- Authored road-height/pitch constraint and grade acceleration
- Individual visual wheel angles and free-rolling distance drawn from simulation state

The drivetrain belongs to the body rather than to a menu: choosing a car in the
garage chooses its drive split, and that starts a fresh run. It is still not a
purchased drivetrain swap or garage upgrade — further adjustments to these bases
are what will give each car a personality. `?drivetrain=` and `__ns.drivetrain()`
remain developer comparison controls and do not persist. Physics revision and
drivetrain identify the simulation setup; ordinary restart retains that layout.

There are no suspension raycasts, wheel inertia/spin/lockup simulation, downforce
or airborne tire contact detection yet. Ride height customization remains visual.
Wheel lift, kerb impacts and suspension are possible next refinements, not part
of this planar four-wheel handling pass. See `design/HANDLING.md` for tuning,
replay boundaries and regression coverage.

### 8.3 Driving States

The controller should support several overlapping states:

- Normal grip
- Braking
- Power slide
- Handbrake turn
- Airborne
- Collision recovery
- Drafting
- Boost or nitrous

Transitions between states should be predictable and forgiving.

### 8.4 Surge

Surge is the player-controlled nitrous verb.

- Input target: keyboard Shift and standard-gamepad Circle/B.
- A car carries a small number of tanks. Holding Surge drains the current tank;
  releasing stops the drain immediately and keeps what is left of it.
- Every event starts with a full set. Nothing refills during a race, and there
  is no passive recharge.
- Capacity is the garage purchase; refilling is free. Tanks are not ammunition
  to hoard, so spending one costs nothing and a restart cannot farm them.
- The starter car has a baseline tank so the verb exists from the first race.
  Upgrades change capacity, delivery and efficiency rather than unlocking it.

The first implementation should use a linear drain. Tiered power and variable
burn rates add tuning complexity before the basic decision is proven.

### 8.5 Car Personalities

Cars should have distinct base characteristics.

Example starter vehicles:

Balanced Tuner
Responsive steering, moderate grip, forgiving recovery.

Front-Wheel Launcher
Strong acceleration, stable under power, more understeer.

Rear-Wheel Street Car
Higher rotation potential, more demanding throttle control, stronger drift capability.

Upgrades should bend these identities rather than flattening every car into the same optimal build.

---

## 9. Customization

### 9.1 Visual Customization

The target is paint and modular body parts such as bumpers, side skirts,
hoods and spoilers. Keep the set small enough to author coherent cars.
Current implementation offers paint, wheel finish and visual ride height;
body-part swapping is still planned. Vinyls, elaborate lighting and interior
accessories are optional future scope, not a required launch checklist.

### 9.2 Performance Customization

Plan a few upgrades with clear effects: acceleration, top speed, grip or
braking. They should change how the car feels without asking the player to
understand transmissions, differentials or detailed engine builds. Purchased
performance upgrades are not implemented yet.

The proposed economy unlocks these parts with reputation and buys them with
cash (§5.1). Base event payouts must keep progress moving on their own; there is
no style bonus accelerating them, because style earns no reputation and buys
nothing. This is an economy design target rather than current behavior.

### 9.3 Tuning

Developer handling controls remain centralized in `HANDLING` for measured
iteration. They are not a player-facing mechanical tuning requirement.
If player tuning is introduced later, use a few understandable choices and
immediate driving feedback. Preserve the current handling baseline while
building the city and garage.

---

## 10. Rivals

Each rival should have:

- A signature car
- A recognizable visual identity
- A driving philosophy
- Preferred routes
- Characteristic mistakes
- A home territory
- A unique reward
- A short narrative arc

Example Rival Archetypes

The Technician
Uses clean lines and reliable routes. Rarely crashes but avoids unconventional shortcuts.

The Local
Knows every alley and service road. Slower in open sections but difficult to follow through the city.

The Bully
Uses contact, blocks exits, and pressures the player toward traffic.

The Gambler
Takes dangerous shortcuts and can either dominate or destroy their own race.

The Ghost
Appears late in the career and drives with minimal visible error. The player must combine speed with everything learned about the city.

Narrative delivery should remain brief and stylish. Text messages, garage conversations, race introductions, and environmental appearances are preferable to long cutscenes.

---

## 11. Opponent AI

Opponent AI should follow authored driving lines but support local decision-making.

Each rival may evaluate:

- Current route
- Nearby shortcut opportunities
- Traffic density
- Player position
- Collision risk
- Rival personality
- Current race state

AI should not rely on obvious rubber-banding.

Limited recovery assistance is acceptable. A stuck opponent may reset at rest
on nearby clear road after a timeout, preserving its race clock and checkpoints.
Placement follows its own route progress; it must not teleport forward to catch
the player after a major mistake.

Difficulty should come from better route selection, cleaner driving, greater aggression, and stronger cars.

---

## 12. Traffic

Traffic should be sparse, readable, and meaningful.

The goal is not urban density. The goal is creating moving hazards that influence racing decisions.

Traffic types may include:

- Sedans
- Delivery vans
- Buses
- Box trucks
- Taxis
- Construction vehicles

Traffic behavior should remain predictable enough for skilled players to anticipate.

Cross traffic should be signaled through headlights, engine sound, intersection lighting, or environmental cues.

Large vehicles can temporarily change available routes by blocking lanes or shortcuts.

---

## 13. Challenge Interaction

Rivals can be challenged by approaching them in the hub and flashing the player's headlights.

The rival then accelerates toward an event starting point.

The player must follow them through traffic without losing contact.

This sequence serves several purposes:

- Integrates event selection into the world
- Introduces the rival's driving personality
- Builds anticipation
- Teaches routes organically
- Adds social texture without complex dialogue systems

Players may also access previously completed events through the garage or map interface for convenience.

---

## 14. Camera and Sense of Speed

The chase camera is a major part of vehicle feel.

Camera behavior should include:

- Speed-based field of view
- Acceleration pullback
- Braking compression
- Controlled lateral lag
- Drift framing
- Impact shake
- Landing response
- Right-stick orbit with automatic driving recenter
- Persistent stopped-car inspection angle and explicit camera reset
- Garage inspection turns the car on a platform beneath a fixed camera
- Look-back control
- Optional hood or bumper view

Effects supporting speed may include:

- Road-surface motion
- Passing light streaks
- Environmental particles
- Subtle camera vibration
- Tire smoke
- Sparks
- Wind noise
- Engine pitch
- Peripheral blur used sparingly

The camera should enhance speed without interfering with steering precision.

---

## 15. Presentation

### 15.1 Visual Direction

The graphics target is approximately MC3 upscaled on an emulator: simple, readable geometry and materials presented cleanly at modern resolution. Use nighttime lighting, silhouettes and selected authored details to carry Port Alder’s identity. This is not a photorealism or expensive-reflection target.

Potential characteristics:

- Wet pavement
- Dense pools of colored light
- Industrial haze
- Sodium-vapor streetlights
- Fluorescent signage
- Reflective vehicle paint
- Bold garage lighting
- Stylized UI overlays
- Strong silhouettes
- Minimal daylight assets

Night-only presentation reduces environmental scope while strengthening the game's identity.

### 15.2 User Interface

The UI should feel embedded in the racing scene rather than resembling a generic modern dashboard.

Possible motifs include:

- Aftermarket digital displays
- Scanner frequencies
- Pager or early mobile-phone messages
- Printed event flyers
- Garage receipts
- Hand-marked city maps
- Graffiti-style race symbols

The HUD should remain readable and restrained during races.

Core HUD information:

- Speed
- Gear
- Position
- Lap or checkpoint progress
- Surge tanks remaining, and the drain while one is burning
- Minimap or directional indicator
- Rival status

---

## 16. Audio Direction

Audio is essential to the sense of ownership and speed.

Key audio priorities:

- Distinct engine layers
- Turbo and intake sounds
- Transmission shifts
- Tire slip
- Suspension impacts
- Road-surface variation
- Tunnel reverb
- Traffic horns and engines
- Nitrous activation
- Environmental music bleed near social spaces

The soundtrack should emphasize underground energy without depending on expensive licensed music.

A combination of original tracks, independent artists, and procedural radio presentation could create identity without requiring a major licensing budget.

---

## 17. Technical Architecture

### 17.1 Core Stack

- TypeScript
- Vite
- Three.js
- Rapier
- glTF or GLB assets
- Web Audio API
- HTML and CSS interface layers
- IndexedDB or local file-backed saves
- Android packaging to be evaluated later; Capacitor is a candidate

Three.js and Rapier remain the active stack. The separate Godot workshop is
an editor-workflow experiment, not the chosen port or production engine.

### 17.2 Architectural Principle

Three.js should render the game, not contain the game's core logic.

Major systems should remain renderer-independent:

- Vehicle state
- Race rules
- Rival behavior
- Progression
- Inventory
- Customization data
- Save data
- Traffic logic
- Input mapping
- Event scripting

The Three.js layer should translate simulation state into:

- Mesh transforms
- Animation
- Lighting
- Particles
- Camera behavior
- Visual effects

This separation protects the project from becoming inseparable from scene objects and allows systems to be tested without rendering the entire game.

### 17.3 World Authoring

Roads and race routes should use explicit metadata.

Useful authoring data includes:

- Road splines
- AI racing lines
- Traffic lanes
- Shortcut connections
- Checkpoint volumes
- Collision proxies
- Spawn points
- Camera triggers
- Zone identifiers
- Surface types
- Event boundaries

Port Alder street geometry is generated offline from a checked-in SDOT extract, then adapted for racing. The runtime needs no GIS service. The existing browser workshop edits shared building placements and supports Three.js scene export/import; it does not author roads or execute imported scripts. Blender remains available for cars and authored assets. See [EDITOR.md](EDITOR.md) and [PORT_ALDER.md](PORT_ALDER.md) for actual workflows.

Rendering and collision consume the same resolved geometry. General projection, footprint and traffic helpers must stay independent of retired map data; the build rejects reintroducing Blackglass district/course modules into the demo.

---

## 18. Performance Targets

Initial targets:

- 60 frames per second on a midrange desktop
- A later RedMagic 10 Pro performance target, provisionally 30–60 fps until measured
- Fast event restarts
- Minimal loading between garage and district
- Stable controller input
- Support for adjustable visual quality

Scalable features may include:

- Shadow quality
- Reflection resolution
- Traffic density
- Particle density
- Draw distance
- Environmental prop density
- Post-processing quality

Build and judge the playable PC prototype first. On-device testing and Android packaging can follow; early phone testing is not a prerequisite for current work. Keep geometry, draw calls, lights and effects measurable so the eventual RedMagic 10 Pro pass has useful quality controls. Neither desktop nor phone frame-rate targets are certified by unit tests alone.

---

## 19. Vertical Slice

The first playable vertical slice should include:

- One car
- One garage
- One rival
- One explorable district section
- One open-checkpoint event; circuit/sprint variants can follow once it works
- Basic traffic
- Headlight challenge interaction
- Basic performance upgrades
- Paint and wheel customization
- Cash and reputation rewards
- Surge with finite tanks and no mid-race refill
- One performance-part purchase
- Save and load
- Controller support
- A complete race restart loop

The slice is successful when:

1. Driving feels satisfying without progression.
2. The player can recognize and intentionally use a shortcut.
3. The rival has a noticeable driving personality.
4. Upgrades create a perceptible handling difference.
5. Moving between garage, hub, challenge, race, and rewards feels coherent.
6. The district remains interesting after multiple races.
7. Players think about when to spend a Surge tank, and sometimes finish a race
   with one still unused.

---

## 20. Initial Production Order

Phase 1: Handling Prototype

- Flat test environment
- One placeholder car
- Acceleration, braking, and steering
- Drift behavior
- Camera
- Controller input
- Collision recovery
- Speed effects

Phase 2: Race Prototype

- Checkpoints
- Lap and route validation
- Race start and finish
- Restart flow
- Basic opponent
- Timing and position tracking
- Surge tank prototype

Phase 3: District Prototype

- One small urban route network
- Road metadata
- Traffic lanes
- Shortcuts
- Lighting
- Performance profiling

*Current checkpoint (2026-09-10): Port Alder free roam, traffic, Sound to Sky,
the mapped garage and building workshop exist. Blackglass has been retired
from the demo. Preserve the handling, improve route choice and neighborhood
readability through play, and grow the map when useful. Rival behavior,
career rewards, purchased upgrades and Surge remain future work.
Android testing follows the PC prototype.*

Phase 4: Game Loop

- Garage
- Rival challenge
- Event selection
- Rewards
- Upgrades
- Garage purchase flow
- Save system

Phase 5: Vertical Slice Polish

- Finalized rival
- Customization
- Audio
- UI treatment
- Particles and effects
- Mobile testing
- Difficulty tuning

---

## 21. Scope Boundaries

The following are outside the current playable slice:

- Recreating all of Port Alder or expanding several cities at once
- Police chases (a possible later LA-inspired feature)
- Pedestrians
- Motorcycles
- Licensed vehicle roster
- Licensed soundtrack
- Online multiplayer
- Dynamic weather
- Full day and night cycle
- Vehicle damage simulation
- Detailed interiors
- More than one city
- Dozens of cars
- Realistic mechanical simulation
- Procedurally generated roads
- User-generated tracks
- Complex cinematic storytelling

These features may be reconsidered as the core racing loop matures. Expanding the Port Alder map naturally is allowed; adding a second playable city or an unrelated system requires a new scope decision. Offline adaptation of real street data is allowed and is distinct from runtime procedural road generation.

---

## 22. Primary Risks

Vehicle Feel

Poor handling cannot be rescued by more content. The handling prototype must remain the first major quality gate.

Environment Authoring Cost

The city requires roads, collision, traffic routes, race lines, shortcuts, landmarks, lighting, and optimization. Reuse must be built into the map design from the beginning.

Scope Expansion

Street-racing games naturally invite additional cars, body parts, districts, events, music, and narrative content. The project must prioritize depth within a small feature set.

Mobile Performance

Reflections, shadows, traffic, post-processing, and transparent effects can become expensive quickly. Mobile constraints should shape the visual style rather than merely reducing it later.

Opponent Navigation

Open-checkpoint racing creates more interesting decisions but substantially increases AI complexity. Early rivals may use authored route choices before more flexible navigation is attempted.

Surge as a Crutch or a Tax

Finite tanks answer the crutch directly: a boost that cannot refill mid-race
cannot paper over a whole lap. The remaining risks are the opposite ones. Price
capacity as a necessity and buying it becomes a tax rather than a choice; hand
out too many tanks and the decision of when to spend one disappears. Capacity
should be cheap enough to own and small enough to matter.

---

## 23. Success Criteria

Project Nightshift succeeds when players say:

- "The car feels good."
- "I found a faster way through that section."
- "I knew that rival was going to take the alley."
- "This is my car."
- "I had one tank left and I saved it for the last corner."
- "I want to run that race again."

The project does not need the largest city, the most vehicles, or the most realistic physics.

It needs one car worth caring about, one district worth learning, and one more race worth starting.
