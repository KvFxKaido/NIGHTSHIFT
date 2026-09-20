# The Blacklist

Design note, 2026-09-12. The GDD wins where they disagree; this is the longer
form of GDD §5's Blacklist: who the ten names are, where they race, what they
drive and what each one teaches.

**Status.** Since 2026-09-15 the whole list is a career (`src/settings/blacklist.ts`,
`src/settings/progress.ts`): ten names climbed from #10, three stages each, two
wins then a pink slip for the name's car, after which the name leaves free roam.
Moth keeps her first meeting, rematch and pink slip. Every name is on the map:
Moth cruises her freight block, Rivet and Sable wait at their strip and yard, and
the other seven cruise loops in their turfs (`src/sim/alder-cruisers.ts`). The
Bulwark costs $1,500 in the garage. Cash, stages, race descriptors and ownership
autosave across drive slots. All ten names have portraits and authored car
assets, and each car is a saved garage car once won. Latch, Breakwater, Wager, Meridian, Skim and Reign implement
the body directions below with the declared drivetrains. Placements, mistakes
and the career structure remain proposals. The new car names are Codex's
working names for Shawn's review (2026-09-13).

## How the list is built

- **It climbs the map.** The low names race the released southwest corner;
  the high names race the newer districts to the north and east. That is
  GDD §5's proposal that chapters open at list positions, and the map growing
  the way `design/PORT_ALDER.md` says it should.
- **It is a curriculum for #1.** Tally is the fastest driver on every line she
  has driven and never takes a line she has not (GDD §5), so the way past her
  is a route she does not know. Each name below teaches something that final
  race needs, and most of them are beaten by a route, not by pace.
- **Every name keeps the portrait rules** (`design/CHARACTERS.md`): one
  silhouette at 96 px, one accent colour, and it is their car's.
- **Every name's car is guaranteed** to the player when that name is beaten
  (GDD §5): ten reward cars within an initial 20-car roster, with room to grow
  toward 30 through starter/shop cars.

## Career cadence (2026-09-15)

The adopted structure is two wins to unlock a pink-slip race, then a third win
to take the car and retire the rival from the map. Losses retry the current
stage. Repeating an earlier win never advances or pays again. Defeated rivals'
races stay in the race list rather than remaining street encounters.

Moth was the first slice: generated sprint, circuit rematch, then unordered
checkpoints for the pink slip. Each stage draws once when first accepted; its
seed, kind, start and generator/world identity are retained even after winning,
and won stages are listed in the race list. Incompatible or unversioned courses are rejected;
an unfinished stage can be explicitly replaced in the garage without losing
wins, cash or cars. Completed history keeps its original identity.

### The chain (phase 2, 2026-09-15)

Shawn's calls: the next name opens as soon as the one below is beaten; every name's
three stages are its signature race; stage pay rises with rank; and a simple
Blacklist screen (title or Pause) shows where the career stands.

- **One name at a time.** Only the lowest unbeaten name races for a stage. Flash
  anyone higher and they race you anyway, their race from where you are, for
  nothing: the card says "no stakes yet". A stored career with a win or a course
  above an unbeaten name does not load.
- **Stages.** Moth: sprint, circuit, unordered. Rivet: three drags on the Harbor
  Quarter strip. Sable: her yard at 3,000, then 3,600, then 4,200 points
  (`SABLE_DRIFTS`, `sable-yard-drift[-2|-3]`). Everyone else: their cruising race
  type three times, sprint for Bollard, Deuce, Crest and Wake, unordered for Stray
  and Tally, circuit for Plumb. Drag and drift stages store no course; a win of the
  current stage's event pays, which also means a direct `?race=` link to that event
  counts, as reopening an accepted course's link always has.
- **Pay.** A stage win pays $750 at #10 and $250 more per place up; the pink slip
  pays double. A name is worth four stage wins: $3,000 for Moth (what she always
  paid), $12,000 for Tally, $75,000 for the list.
- **Cars.** Each name's car is a `PlayerCarId` and `ownsCar` grants it on that
  name's third win. Sable's is `ns01`, since the NS-01's old id `blender` migrates
  to the Cinder (`RETIRED_CARS`). The garage lists all twelve bodies, each unwon
  one labelled with whose pink slip it is.
- **Storage.** Schema 4 keeps a `names` record, `{wins, races}` per id. Schema 1-3
  profiles become Moth's record, and the `mothBeaten`/`mothWins`/`mothRaces` fields
  still read for code that asks about her.

## The ten

| # | Name | Turf | Car | Drive | Accent | Challenge |
|---|---|---|---|---|---|---|
| 10 | Moth | SoDo freight block | Kestrel rally hatch | AWD | teal / cream | Generated race |
| 9 | Stray | Alder Center alleys | Latch sport liftback | FWD | acid green | Unordered checkpoints |
| 8 | Rivet | Harbor Quarter | Hammer muscle notchback | RWD | cream / black | Drag |
| 7 | Bollard | Elliott Avenue waterfront | Breakwater off-roader | AWD | safety yellow | Rival duel |
| 6 | Deuce | Belltown, Broadcast Tower loop | Wager rotary sports car | RWD | hot magenta | Sprint |
| 5 | Sable | South Wharf drift yard | NS-01 drift coupe | RWD | red / black | Drift |
| 4 | Plumb | Madrona Ridge | Meridian fast wagon | AWD | silver | Circuit |
| 3 | Crest | Queen Anne climb | Skim hardtop roadster | FWD | cobalt blue | Uphill sprint |
| 2 | Wake | Capitol Hill | Reign upright coupe | AWD | white | Rival duel |
| 1 | Tally | The whole city | Vesper mid-engine coupe | RWD | violet | Citywide open checkpoint |

Race types are GDD §7's. The challenges without a race type of their own yet
(rival duel, uphill sprint, citywide open checkpoint) race the nearest that exists,
listed under "The chain" above. Every turf but Tally's is a centre and radius on
the map (`src/sim/alder-turf.ts`, 2026-09-15), and a name's generated races lean
toward it.

## The cars (2026-09-12)

**Body type is a rival's identity, so the list mixes types.** Every body shares
one wheelbase and one handling model; since 2026-09-19 each drives its own tune
of it and has its own mass (`design/HANDLING.md`, "Cars"). A rival is
mostly seen from behind at chase-camera distance, where six '90s Japanese
coupes would blur together and a truck, a wagon and a roadster do not. MC3's
roster made the same point by mixing tuners with muscle, luxury and trucks.
'90s JDM is one flavour on the list, not the list. Two rules follow:

1. **No two rivals share a body type.**
2. **No rival shares a body type with a player garage car.** The Cinder is a
   four-door sedan and the Bulwark's garage render reads as a pickup, so
   neither type goes to a rival: a rival should never look like the player's
   own car in the mirror.

The six added on 2026-09-13, each inspired by a real car, never a replica (the
Vesper rule: proportions and signature ideas, no badges, no exact shapes):

| # | Name | Type | Inspiration | Why |
|---|---|---|---|---|
| 9 | Stray | Sport liftback | Mitsubishi Eclipse, second generation ('95–'99), FWD | Shawn's pick. The kid's first tuner; it was a starter-eligible Class D tuner in MC3 and a prize car in MC:LA (`design/reference/midnight-club/`). |
| 7 | Bollard | Boxy 4x4 off-roader | Toyota Land Cruiser 70 or Mitsubishi Pajero type, spare wheel on the tailgate | The spare wheel identifies her from behind, and a tall body blocks the player's view of the road, which is the bully's job. A Hilux-type pickup was the first idea and would have matched the Bulwark. |
| 6 | Deuce | Rotary sports car | Mazda RX-7 (FD), RWD | The rotary is the bet: brilliant or blown, like his races. A '60s American fastback suits his pompadour but would be a second muscle car beside Rivet's Hammer. |
| 4 | Plumb | Fast wagon | Audi RS2 Avant type, AWD, silver | Precise, understated and German, like her redesign. An Evo-type sedan was the first idea and would have matched the Cinder. |
| 3 | Crest | Hardtop roadster | Lotus Elan (M100), a rare FWD roadster | Light, and a shape nothing else on the list has. The hardtop stays on: an open car needs a visible interior and driver, and detailed interiors are out of scope (GDD §21). An Integra-type coupe was the first idea and would have twinned Stray's Eclipse. |
| 2 | Wake | AWD legend coupe | Nissan Skyline GT-R (R32) | The old champion's car for the old champion. It is a coupe like Sable's NS-01; its boxy, upright stance should separate them, but that is a prediction until the built car's silhouette is checked. The fallback is a long-hood grand tourer of the BMW 8 Series (E31) kind. |

With the four that exist, the list is ten body types: rally hatch, sport
liftback, muscle notchback, off-roader, rotary sports car, drift coupe, wagon,
roadster, AWD legend coupe and mid-engine exotic. The cultures mix without
being forced: Japanese, German, British and American.

### #10 Moth

Mid forties; she has circled the freight block by Wharf Garage for twenty
years and taught half the docks to drive, Tally included. The first rival
anyone meets. *Mistake:* she races the city as it was twenty years ago and
does not use the newer cut-throughs. *Teaches:* flashing, following and open
racing, and the first hint that knowing the city now beats having known it.
Exists: `design/reference/characters/moth/`, `MOTH` in `src/sim/encounter.ts`.

### #9 Stray

Nineteen, grew up in the downtown service lanes. *Silhouette:* a cap worn
backwards. *Mistake:* he takes the alley even where the avenue is faster.
*Teaches:* that alleys exist, and that one is not always worth it. His race is
unordered checkpoints, so the order is a route decision too. Portrait:
`design/reference/characters/stray/`; car asset built; cruises its turf; three stages of its race type.

### #8 Rivet

Late twenties; runs the Harbor Quarter quarter-mile in the Hammer.
*Mistake:* she launches too hard when she is behind at the start. *Teaches:*
the gearbox and the launch. Her mistake should come from what her drag AI
actually does rather than from this sentence. Exists:
`design/reference/characters/rivet/`, `RIVET` in `src/sim/drag-event.ts`.

### #7 Bollard

Forties, a crane operator on the waterfront. *Silhouette:* ear defenders and a
hi-vis collar. *Mistake:* she commits to a block early, so a feint one way
opens the other. *Teaches:* racing through traffic and through contact. Mass
became each car's own on 2026-09-19 and is felt only in contact
(`design/HANDLING.md`, "Cars"), so how heavy the Breakwater is decides how much of
her menace is weight rather than aggression and line; that is the roster tune's
call. Grip is the car's, never an AI's. Portrait: `design/reference/characters/bollard/`; car asset built; cruises its turf; three stages of its race type.

### #6 Deuce

Thirties. *Silhouette:* a tall, hard-edged pompadour. *Mistake:* he takes the
risky line even when he is leading, and half his races end in a wall.
*Teaches:* the generator's rule that every shortcut has a cost, as a person;
the player beats him by staying clean and letting the gamble fail. His turf is
the Broadcast Tower loop and its open plaza. Portrait:
`design/reference/characters/deuce/`; car asset built; cruises its turf; three stages of its race type.

### #5 Sable

Mid thirties; runs the South Wharf drift yard in the red NS-01. *Mistake:* he
chases angle over line and drops his chain at transitions. *Arc:* in the
opening he beat the player for the NS-01, and beating him returns it as his
guaranteed car, partway up the list while there is still racing to use it
in. Exists: `design/reference/characters/sable/`, `SABLE` in
`src/sim/drift-yard.ts`.

### #4 Plumb

Fifties, a former rally co-driver; optionally Moth's, which gives the list a
second old friendship. *Silhouette:* a straight-cut silver bob with a
microphone arm across the cheek; she was redrawn once, because her first
version read as an older Moth and her headset as Bollard's ear defenders.
*Mistake:* she never leaves the arterials: no alleys, no crashes, no surprises.
*Teaches:* parallel routes. Madrona Ridge's broad scenic loop is hers, and its
inner parallel streets are where she loses. Portrait:
`design/reference/characters/plumb/`; car asset built; cruises its turf; three stages of its race type.

### #3 Crest

Late twenties, the hill racer. *Silhouette:* a hard-edged topknot. *Mistake:*
he takes blind crests flat and lands wide. *Teaches:* grade, crests and blind
corners, the risk factors the route-choice model already prices. His race
climbs Queen Anne towards Kerry Overlook. Portrait:
`design/reference/characters/crest/`; car asset built; cruises its turf; three stages of its race type.

### #2 Wake

Mid thirties, the former #1. Tally took the list from him, and he has spent
every night since driving her lines, and driving them better than she does.
*Silhouette:* a low-crowned, wide-brimmed hat. *Mistake:* he only drives Tally's
lines, so he is beaten exactly where she is: off her map. *Teaches:* the last
lesson, in his words: "I drove every line she drives. It's not enough."
Portrait: `design/reference/characters/wake/`; car asset built; cruises its turf; three stages of its race type.

### #1 Tally

Early twenties, Moth's student, the one who keeps the list. Fastest on every
line she has driven; never takes one she has not. Rivals learn only from races
the player wins (`design/PROCEDURAL_RACES.md`), so each route that beats her
works once. Exists: `design/reference/characters/tally/`, Vesper in
`assets/cars/ns-vesper-01.blend`; cruises the city's middle; three unordered stages for the Vesper.

*Proposed:* Vesper is the one car on the list without the 140 mph cap (see
"The 140 mph cap" below). If she cannot be caught on a straight, a route she
has not driven is the only way past her, which is the lesson the list has been
teaching; on an equal car the last race could be won by driving cleaner.

## The 140 mph cap (proposed 2026-09-13; direction agreed 2026-09-19)

No car goes past about 140 mph (`HANDLING.topSpeed` in `src/sim/sim.ts`); a
car's tune may lower its own governor, and none yet raises it. Shawn thinks of that as
a beginner cap: it holds while per-car handling models are worked out and it is
decided which cars should be faster than which. The first car to lose it would
be #1's Vesper.

- **It is allowed.** GDD §11 has difficulty come from "better route selection,
  cleaner driving, greater aggression, and stronger cars". A faster car is a
  stronger car, not an AI advantage; the rival rules forbid catch-up,
  rubber-banding and grip changes, and none of those is a car's top speed.
  Vesper is also Tally's guaranteed reward, so the player ends the list with
  the uncapped car.
- **It is handling work, not a constant.** Per-car handling exists since
  2026-09-19 (`src/sim/car-handling.ts`, the `topSpeed` knob), and Shawn's call
  that day was that strength climbs gently up the list with the Vesper the one
  outlier. Lifting her cap is still Phase 1 work: its own commit with
  `design/HANDLING.md`, under the determinism rules.
- **Where the ceiling is** (measured 2026-09-19, `design/HANDLING.md`, "The
  ceiling"). Stock power runs out at about 152 mph, so a governor up to about 150
  needs no other knob; the tyres cannot push past 161 (146 front-drive) however
  much power a car has. A Vesper at 165 needs less drag as well as a higher
  governor and top end: `drag` is the knob for it, and a slippery wedge is a fair
  reading of her car.
- **It changes the pace model.** Route choice and the race generator price
  shortcuts at one assumed speed (`design/PROCEDURAL_RACES.md`); a much faster
  car can make a priced alley not worth taking. Measure before tuning.
- **The HUD is ready for it.** The speedometer is a fixed 0-250 mph face for
  every car, as Midnight Club 3's appears to be (a mid-class Esprit shows the
  full 250 face; no second car has been checked), so a faster car reads as
  more needle rather than a rescaled dial.

## Top speeds and pace, per car (outline, 2026-09-19)

The targets the per-car tunes aim at (`src/sim/car-handling.ts`,
`design/HANDLING.md` "Cars"). Shawn's call: strength climbs gently up the list
with the Vesper the one outlier, and mass is each car's own. Only the Cinder and
the Bulwark are tuned; every other row is a target until its car's own commit.

Two measures, because they do different jobs. **Top speed** is identity: what a
player compares and the dial shows, so it follows the car's character and does
not rank the list (Rivet's muscle car outruns Crest's roadster). It barely
decides a race: Shawn's 31 valid Cinder laps spend about 45% of the time under
70 mph and only 1.3–2.9% above 130. **Pace** is what climbs: the AI lap, the
rival's own planner driving the car round Ridge Circuit and Uptown
(`pnpm cars --laps`), as a share faster (−) or slower (+) than the Cinder with the
same driver. Relative only, never a lap time (`design/HANDLING.md`, "AI laps").

| # | Name | Car | Drive | Top mph | Knobs for that speed | Character | AI lap vs Cinder |
|---|---|---|---|---|---|---|---|
| — | starter | Cinder | RWD | 140 | stock | the anchor, never retuned for another car | 0 |
| — | for sale | Bulwark (r2, done) | AWD | 126 | governor | city truck: launch and grass, heavy | −1.5% streets, +2% circuits |
| 10 | Moth | Kestrel (r2, done) | AWD | 130 | governor | rally hatch, geared short: launches, runs out of top | −0.4 to −0.8% circuits, −2.5% streets |
| 9 | Stray | Latch (r2, done) | FWD | 138 | governor | the kid's first tuner, just under the Cinder | −0.2 to −0.8% |
| 8 | Rivet | Hammer (r2, done) | RWD | 150 | governor | muscle: fast in a line, poor in corners | her race is the drag strip: 12.97 s, a clean Cinder 12.95; laps +0.5 to +1.0% circuits, level streets |
| 7 | Bollard | Breakwater (r2, done) | AWD | 125 | `drag` 1.4, no governor needed | a brick: slowest, heaviest, wins the shoving; all its pace is the launch | −0.62% streets, +1 to +2% circuits |
| 6 | Deuce | Wager (r2, done) | RWD | 148 | governor | rotary: revs, a strong top end, the best tyres in a bend | −2.48% streets, −2.1 to −2.9% circuits |
| 5 | Sable | NS-01 (r2, done) | RWD | 142 | governor | drift car: rotation, not speed; swings furthest and is caught from all of it | her yard: 6,340 against the Cinder's 4,929, 9 links to 6; pace −0.8 to −0.94% |
| 4 | Plumb | Meridian (r2, done) | AWD | 146 | governor | fast wagon, built for the highway | −4.0% Uptown (her ground), −1.6 to −2.0% Ridge, −4.06% streets |
| 3 | Crest | Skim (r2, done) | FWD | 138 | governor | light corner car: the best tyres, and the traction to use them | −4.95% streets, −5.0 to −5.5% circuits |
| 2 | Wake | Reign | AWD | 152 | governor (`topEnd` for a stronger 60–100) | the old champion: good at everything | −4% |
| 1 | Tally | Vesper | RWD | 165 | governor 1.18, `topEnd` 1.4, `drag` 0.9 | the outlier: slippery, pulls hardest past 100 | −6% |

- **Every top speed here is reachable**, checked with `pnpm cars <car> --try`:
  150, 148 and 152 on the governor alone, the Vesper at 165.0 with the three
  knobs, the Breakwater brick at 127 with `drag` 1.4 (and 139 at 1.2). Stock
  power runs out at about 152, the tyres at 161 (146 front-drive), and past that
  only less drag helps (`design/HANDLING.md`, "The ceiling").
- **Pace is the real tuning, and AWD is where it starts.** On the shared numbers
  every AWD car laps 4–8% faster than the Cinder; Moth's Kestrel was one of the
  fastest cars on the list until its tune (r2, 2026-09-19). Like the Bulwark and
  the Kestrel, the other AWD cars will need less low-end power to land near their
  pace.
- **Two cars sit below the Cinder on purpose.** Moth, so the first race is not
  won by a faster car; Bollard, so her threat is weight rather than speed.
- **Each tune is its own commit** with `design/HANDLING.md` and a
  `RIVAL_REVISION` bump, measured before and after. Order: the Kestrel first,
  once Shawn has said how hard the opener should be, then up the list; the Vesper
  last, with `pnpm alder:critique` before and after, since route choice prices
  shortcuts at one assumed pace.

## An ending worth keeping

If #1 keeps the list, beating Tally means the player keeps it. The last thing
the career gives the player is the pen.

## Constraints

- **The accent palette is nearly spent.** Sodium orange and cyan are the
  portrait lighting; red, teal, cream and violet are taken. Only yellow, green,
  blue and magenta are clearly left, which is why Plumb is silver and Wake is
  white. The risky pairs are Wake's white against Rivet's and Moth's cream,
  magenta between Sable's red and Tally's violet, and cobalt against the cyan
  rim. Those pairs were measured on the portraits and pass (the new
  characters' READMEs have the numbers); the six new cars have their own
  in-game counts in `reference/cars/BLACKLIST_CARS.md`.
- **Every body shares one wheelbase and track.** `blender-car.ts` rejects
  wheels off (±0.92, 0.40, ±1.48), a 2.96 m wheelbase. (Mass has been each car's
  own since 2026-09-19, and is felt only in contact.) Every inspiration above has a shorter real wheelbase (roughly
  2.4–2.7 m, from memory), so each body is stretched as Vesper's was, the
  RX-7 most. Car variety lives in overhangs, height and silhouette, and
  character lives in driving behaviour.
- **Drivetrains balance at four AWD, four RWD and two FWD.** Stray and Crest
  are the first authored FWD bodies (not yet unlockable), although `createSim` already
  defaults to FWD.
- **An accent is only real in the game's own light.** Vesper's first body
  counted 123 violet pixels in its in-game rear capture against 2,567 in the
  studio. Every new car passes an in-game count, not a studio render.

## Open

- Every placement, name and mistake above, until Shawn confirms them.
- Whether Plumb was Moth's co-driver.
- Crest's inspiration: the Elan keeps him FWD; a Mazda MX-5 is the famous
  roadster but RWD, which would leave Stray as the only FWD car.
- Whether Wake's GT-R reads as a different silhouette from Sable's NS-01 once
  built.
- Which cars sit above the 140 mph cap, and by how much; whether it lifts for
  the player's own car through upgrades or only through won cars.
- Where the player's shots come from for each name (GDD §5 proposes wins on
  that name's home turf).
- Whether the player has a portrait in the opening's dialogue (GDD §5).
