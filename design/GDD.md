# PROJECT NIGHTSHIFT

Game Design Document

Status: Early Concept
Working Title: Project Nightshift
Genre: Arcade street racer
Primary Platform: PC web browser
Secondary Platform: Android via Capacitor
Technology: TypeScript, Vite, Three.js, Rapier
Target Session Length: 5 to 20 minutes

---

## 1. High Concept

Project Nightshift is a compact arcade street-racing game centered on illegal nighttime racing, car customization, rival progression, and mastery of a dense fictional city district.

The game combines:

- The focused career structure and presentation of Need for Speed: Underground
- The route freedom and city knowledge of Midnight Club
- A small amount of the street-level lifestyle fantasy from Need for Speed: Underground 2

Players build one car into a personal street-racing machine, challenge recognizable rivals, discover shortcuts, and climb through a local racing scene.

The city is not intended to be a large open world. It is a carefully designed racing space where every alley, parking garage, overpass, and construction gap has a gameplay purpose.

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

The game should favor a small number of deeply customizable cars over a large catalog of disposable ones.

### 3.5 Style Is Part of Progression

Reputation is expressed through cars, rivals, locations, music, UI treatment, and how the city responds to the player.

The game should feel like entering a local scene rather than advancing through a conventional sports championship.

### 3.6 Style Becomes Speed

Expressive driving produces Live Cred during a race. The player may burn that
Cred on nitrous to improve the current result or carry it across the finish line
as permanent upgrade currency.

The hook is not merely scoring stylish actions. It is deciding when today's
reputation is worth more as speed and when it is worth more as tomorrow's part.

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
8. Earn Cred, reputation, parts, or information.
9. Return to the garage or continue exploring.

The player should regularly experience three distinct pleasures:

- The immediate physical pleasure of driving
- The strategic pleasure of recognizing a better route
- The expressive pleasure of changing the car
- The tactical pleasure of turning style into speed

---

## 5. Game Structure

Project Nightshift uses a chapter-based career structure.

Each chapter introduces:

- A new rival
- New race layouts
- Additional upgrade tiers
- A new section or layer of the district
- A mechanical or environmental complication

Progress is driven by reputation rather than a traditional tournament bracket.

Players earn reputation by:

- Winning races
- Defeating rivals
- Discovering shortcuts
- Completing optional challenges
- Performing clean or stylish driving
- Winning while using lower-tier equipment

Major rivals act as chapter bosses. Defeating one unlocks the next level of the local racing scene.

### 5.1 Live Cred Economy

Cred is the first vertical slice's performance-parts currency. It exists in
three forms during a race:

- Chain Cred is provisional style value that can be lost through a collision.
- Live Cred is secured during the current event and can fuel nitrous.
- Banked Cred is permanent garage currency and cannot be consumed mid-race.

Remaining Live Cred and the event's position payout are committed to Banked
Cred only when the event finishes. Restarting or abandoning an attempt commits
nothing. Replays reproduce the driving but never settle the economy.

Reputation and lifetime style remain non-spendable progression records. For the
first slice, a separate cash currency should not duplicate Cred without a
distinct design purpose.

The complete proposed rules, safeguards, interface requirements, and prototype
plan live in [`LIVE_CRED.md`](LIVE_CRED.md). This system is not implemented yet.

---

## 6. World Structure

### 6.1 The District

The initial game takes place in one fictional nighttime district composed of several connected zones.

Possible zones include:

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

### 6.3 Race Boundaries

Events reuse parts of the explorable district but can apply temporary boundaries, barriers, traffic configurations, shortcuts, ramps, and visual dressing.

This allows the same environment to support both open navigation and tightly authored races.

---

## 7. Race Types

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

### 8.2 Proposed Vehicle Model

The vehicle uses:

- A rigid chassis body
- Ground-detection raycasts
- Artificial lateral grip
- Speed-dependent steering
- Tunable acceleration curves
- Assisted countersteering
- Controlled weight transfer
- Downforce at high speed
- Separate visual wheel animation
- Simplified suspension presentation
- Custom collision recovery

The system may use Rapier for collision detection and rigid-body behavior while applying custom forces for most vehicle handling.

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

### 8.4 Live Cred and Surge

Useful and expressive racing actions build a style chain. Cleanly completing
the chain secures Live Cred; a collision can destroy only the unbanked portion.
Valid sources include controlled slides, drafting, clean apex sequences,
proximity driving, overtakes, shortcuts, and authored Nightlines.

Holding Surge consumes Live Cred to provide nitrous acceleration. Surge cannot
draw from the player's permanent Banked Cred and cannot generate enough style
to sustain itself. The starter car should have access to this verb immediately;
upgrades tune its delivery and efficiency rather than withholding the core hook.

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

Potential visual categories include:

- Paint
- Vinyls
- Decals
- Wheels
- Ride height
- Window tint
- Headlights
- Taillights
- Front bumper
- Rear bumper
- Side skirts
- Hood
- Spoiler
- Exhaust
- License plate
- Interior accent lighting

The first release does not need every category. Paint, wheels, ride height, vinyls, spoiler, and lighting can establish the fantasy.

### 9.2 Performance Customization

Performance upgrades may include:

- Engine
- Transmission
- Tires
- Suspension
- Brakes
- Weight reduction
- Nitrous
- Forced induction
- Differential tuning

Each upgrade should change both numbers and perceived behavior.

Performance parts are purchased with Banked Cred in the first vertical slice.
Style should accelerate access to parts without becoming the only source of
forward progress; base event payouts must keep weaker players moving.

Examples:

- Tire upgrades increase grip but may make drifting less forgiving.
- Transmission upgrades improve acceleration but require more frequent shifting.
- Suspension upgrades improve response but make collisions less stable.
- Engine upgrades increase speed while exposing weaknesses in braking and handling.

### 9.3 Tuning

Advanced tuning should be introduced gradually.

Initial tuning options may include:

- Steering response
- Grip versus drift bias
- Gear ratio bias
- Suspension stiffness
- Brake balance
- Nitrous duration versus power

Tuning should use understandable language and immediate visual feedback.

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

Limited recovery assistance is acceptable, but opponents should not teleport back into contention after major mistakes.

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

The visual style should favor a heightened interpretation of early-2000s street-racing culture rather than strict realism.

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
- Current style chain and multiplier
- Live Cred and Surge state
- Optional tracked-part price and projected post-race balance
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
- Capacitor for Android packaging

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

Blender can serve as the primary environment authoring tool, with exported metadata or companion JSON files used by the runtime.

A custom browser editor should not be built until manual authoring becomes a demonstrated production bottleneck.

---

## 18. Performance Targets

Initial targets:

- 60 frames per second on a midrange desktop
- 30 to 60 frames per second on capable Android devices
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

Performance should be tested on mobile hardware early rather than postponed until the city is complete.

---

## 19. Vertical Slice

The first playable vertical slice should include:

- One car
- One garage
- One rival
- One explorable district section
- One circuit event
- One sprint event
- One open-checkpoint event
- Basic traffic
- Headlight challenge interaction
- Basic performance upgrades
- Paint and wheel customization
- Live Cred and reputation rewards
- Style-chain-to-Surge race loop
- One Banked Cred performance-part purchase
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
7. Players sometimes burn Live Cred to improve a result and sometimes preserve
   it for a part.

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
- Style chain, Live Cred, and Surge prototype

Phase 3: District Prototype

- One small urban route network
- Road metadata
- Traffic lanes
- Shortcuts
- Lighting
- Performance profiling

Phase 4: Game Loop

- Garage
- Rival challenge
- Event selection
- Rewards
- Upgrades
- Banked Cred settlement and purchase flow
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

## 21. Explicitly Out of Scope for the First Release

- Large open world
- Police chases
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

These features may be reconsidered after the core racing and progression loop has proven itself.

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

Live Cred Hoarding

If spending Cred is always optimal, there is no meaningful decision. If saving
is always optimal, players avoid the game's signature mechanic. Position
payouts, Surge cost, base earnings, and part prices must produce legible cases
for both choices without creating an economic death spiral.

---

## 23. Success Criteria

Project Nightshift succeeds when players say:

- "The car feels good."
- "I found a faster way through that section."
- "I knew that rival was going to take the alley."
- "This is my car."
- "I wanted to hit the nitrous, but I was saving for that part."
- "I want to run that race again."

The project does not need the largest city, the most vehicles, or the most realistic physics.

It needs one car worth caring about, one district worth learning, and one more race worth starting.
