# The Blacklist

Design note, 2026-09-12. The GDD wins where they disagree; this is the longer
form of GDD §5's Blacklist: who the ten names are, where they race, what they
drive and what each one teaches.

**Status.** A sketch. None of the career is implemented. All ten names have
portraits (`design/reference/characters/<id>/`). Four have cars: Moth, Rivet
and Sable are in the game as rivals, and Tally has Vesper but no encounter.
Stray, Bollard, Deuce, Plumb, Crest and Wake have a portrait and a car
inspiration below, and nothing else. Every placement, mistake and car is a
proposal until Shawn says otherwise.

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
  (GDD §5): ten of the internal target of 20 drivable cars.

## The ten

| # | Name | Turf | Car | Drive | Accent | Challenge |
|---|---|---|---|---|---|---|
| 10 | Moth | SoDo freight block | Kestrel rally hatch | AWD | teal / cream | Generated race |
| 9 | Stray | Alder Center alleys | Sport liftback | FWD | acid green | Unordered checkpoints |
| 8 | Rivet | Harbor Quarter | Hammer muscle notchback | RWD | cream / black | Drag |
| 7 | Bollard | Elliott Avenue waterfront | Boxy 4x4 off-roader | AWD | safety yellow | Rival duel |
| 6 | Deuce | Belltown, Broadcast Tower loop | Rotary sports car | RWD | hot magenta | Sprint |
| 5 | Sable | South Wharf drift yard | NS-01 drift coupe | RWD | red / black | Drift |
| 4 | Plumb | Madrona Ridge | Fast wagon | AWD | silver | Circuit |
| 3 | Crest | Queen Anne climb | Hardtop roadster | FWD | cobalt blue | Uphill sprint |
| 2 | Wake | Capitol Hill | AWD legend coupe | AWD | white | Rival duel |
| 1 | Tally | The whole city | Vesper mid-engine coupe | RWD | violet | Citywide open checkpoint |

Race types are GDD §7's. Moth's is the flash as it exists today: a generated
race whose variant (sprint, circuit or unordered) comes from the seed.

## The cars (2026-09-12)

**Body type is a rival's identity, so the list mixes types.** Every body shares
one mass, wheelbase and handling model; only the drivetrain differs. A rival is
mostly seen from behind at chase-camera distance, where six '90s Japanese
coupes would blur together and a truck, a wagon and a roadster do not. MC3's
roster made the same point by mixing tuners with muscle, luxury and trucks.
'90s JDM is one flavour on the list, not the list. Two rules follow:

1. **No two rivals share a body type.**
2. **No rival shares a body type with a player garage car.** The Cinder is a
   four-door sedan and the Bulwark's garage render reads as a pickup, so
   neither type goes to a rival: a rival should never look like the player's
   own car in the mirror.

The six still to build, each inspired by a real car, never a replica (the
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
`design/reference/characters/stray/`; no car, no encounter.

### #8 Rivet

Late twenties; runs the Harbor Quarter quarter-mile in the Hammer.
*Mistake:* she launches too hard when she is behind at the start. *Teaches:*
the gearbox and the launch. Her mistake should come from what her drag AI
actually does rather than from this sentence. Exists:
`design/reference/characters/rivet/`, `RIVET` in `src/sim/drag-event.ts`.

### #7 Bollard

Forties, a crane operator on the waterfront. *Silhouette:* ear defenders and a
hi-vis collar. *Mistake:* she commits to a block early, so a feint one way
opens the other. *Teaches:* racing through traffic and through contact. Every
body shares one mass (`HANDLING.mass`), so her menace is aggression and line,
never weight or grip. Portrait: `design/reference/characters/bollard/`; no
car, no encounter.

### #6 Deuce

Thirties. *Silhouette:* a tall, hard-edged pompadour. *Mistake:* he takes the
risky line even when he is leading, and half his races end in a wall.
*Teaches:* the generator's rule that every shortcut has a cost, as a person;
the player beats him by staying clean and letting the gamble fail. His turf is
the Broadcast Tower loop and its open plaza. Portrait:
`design/reference/characters/deuce/`; no car, no encounter.

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
`design/reference/characters/plumb/`; no car, no encounter.

### #3 Crest

Late twenties, the hill racer. *Silhouette:* a hard-edged topknot. *Mistake:*
he takes blind crests flat and lands wide. *Teaches:* grade, crests and blind
corners, the risk factors the route-choice model already prices. His race
climbs Queen Anne towards Kerry Overlook. Portrait:
`design/reference/characters/crest/`; no car, no encounter.

### #2 Wake

Mid thirties, the former #1. Tally took the list from him, and he has spent
every night since driving her lines, and driving them better than she does.
*Silhouette:* a low-crowned, wide-brimmed hat. *Mistake:* he only drives Tally's
lines, so he is beaten exactly where she is: off her map. *Teaches:* the last
lesson, in his words: "I drove every line she drives. It's not enough."
Portrait: `design/reference/characters/wake/`; no car, no encounter.

### #1 Tally

Early twenties, Moth's student, the one who keeps the list. Fastest on every
line she has driven; never takes one she has not. Rivals learn only from races
the player wins (`design/PROCEDURAL_RACES.md`), so each route that beats her
works once. Exists: `design/reference/characters/tally/`, Vesper in
`assets/cars/ns-vesper-01.blend`; no encounter.

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
  characters' READMEs have the numbers); every car still needs its own
  in-game count.
- **Every body shares one wheelbase, track and mass.** `blender-car.ts` rejects
  wheels off (±0.92, 0.40, ±1.48), a 2.96 m wheelbase, and `HANDLING.mass` is
  one number. Every inspiration above has a shorter real wheelbase (roughly
  2.4–2.7 m, from memory), so each body is stretched as Vesper's was, the
  RX-7 most. Car variety lives in overhangs, height and silhouette, and
  character lives in driving behaviour.
- **Drivetrains balance at four AWD, four RWD and two FWD.** Stray and Crest
  would be the first FWD bodies anyone drives, although `createSim` already
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
- Where the player's shots come from for each name (GDD §5 proposes wins on
  that name's home turf).
- Whether the player has a portrait in the opening's dialogue (GDD §5).
