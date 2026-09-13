# The Blacklist

Design note, 2026-09-12. The GDD wins where they disagree; this is the longer
form of GDD §5's Blacklist: who the ten names are, where they race, what they
drive and what each one teaches.

**Status.** A sketch. None of the career is implemented. Four of the ten
exist as characters with portraits and cars: Moth, Rivet and Sable are in the
game as rivals, and Tally has a portrait and a car but no encounter. The other
six are names on this page and nothing else. Every placement, mistake and car
below is a proposal until Shawn says otherwise.

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
| 9 | Stray | Alder Center alleys | Boxy hot hatch | FWD | acid green | Unordered checkpoints |
| 8 | Rivet | Harbor Quarter | Hammer | RWD | cream / black | Drag |
| 7 | Bollard | Elliott Avenue waterfront | Compact 4x4 ute | AWD | safety yellow | Rival duel |
| 6 | Deuce | Belltown, Broadcast Tower loop | Light fastback | RWD | hot magenta | Sprint |
| 5 | Sable | South Wharf drift yard | NS-01 | RWD | red / black | Drift |
| 4 | Plumb | Madrona Ridge | Four-door sport sedan | AWD | silver | Circuit |
| 3 | Crest | Queen Anne climb | Lightweight coupe | FWD | cobalt blue | Uphill sprint |
| 2 | Wake | Capitol Hill | Long-hood GT | AWD | white | Rival duel |
| 1 | Tally | The whole city | Vesper | RWD | violet | Citywide open checkpoint |

Race types are GDD §7's. Moth's is the flash as it exists today: a generated
race whose variant (sprint, circuit or unordered) comes from the seed.

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
unordered checkpoints, so the order is a route decision too. Not created.

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
never weight or grip. Not created.

### #6 Deuce

Thirties. *Silhouette:* a tall, hard-edged pompadour. *Mistake:* he takes the
risky line even when he is leading, and half his races end in a wall.
*Teaches:* the generator's rule that every shortcut has a cost, as a person;
the player beats him by staying clean and letting the gamble fail. His turf is
the Broadcast Tower loop and its open plaza. Not created.

### #5 Sable

Mid thirties; runs the South Wharf drift yard in the red NS-01. *Mistake:* he
chases angle over line and drops his chain at transitions. *Arc:* in the
opening he beat the player for the NS-01, and beating him returns it as his
guaranteed car, partway up the list while there is still racing to use it
in. Exists: `design/reference/characters/sable/`, `SABLE` in
`src/sim/drift-yard.ts`.

### #4 Plumb

Fifties, a former rally co-driver; optionally Moth's, which gives the list a
second old friendship. *Silhouette:* a race engineer's headset with a boom mic.
*Mistake:* she never leaves the arterials: no alleys, no crashes, no surprises.
*Teaches:* parallel routes. Madrona Ridge's broad scenic loop is hers, and its
inner parallel streets are where she loses. Not created.

### #3 Crest

Late twenties, the hill racer. *Silhouette:* a hard-edged topknot. *Mistake:*
he takes blind crests flat and lands wide. *Teaches:* grade, crests and blind
corners, the risk factors the route-choice model already prices. His race
climbs Queen Anne towards Kerry Overlook. Not created.

### #2 Wake

Mid thirties, the former #1. Tally took the list from him, and he has spent
every night since driving her lines, and driving them better than she does.
*Silhouette:* a low-crowned, wide-brimmed hat. *Mistake:* he only drives Tally's
lines, so he is beaten exactly where she is: off her map. *Teaches:* the last
lesson, in his words: "I drove every line she drives. It's not enough." Not
created.

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
  rim. Each needs the measurement violet got in Tally's round one (hue and
  coverage, counted from the render) before it is trusted.
- **Every body shares one wheelbase, track and mass.** `blender-car.ts` rejects
  wheels off (±0.92, 0.40, ±1.48), and `HANDLING.mass` is one number. There is
  no kei van for Stray and no full-size truck for Bollard; car variety lives in
  overhangs, height and silhouette, and character lives in driving behaviour.
- **Drivetrains balance at four AWD, four RWD and two FWD.** Stray and Crest
  would be the first FWD bodies anyone drives, although `createSim` already
  defaults to FWD.
- **An accent is only real in the game's own light.** Vesper's first body
  counted 123 violet pixels in its in-game rear capture against 2,567 in the
  studio. Every new car passes an in-game count, not a studio render.

## Open

- Every placement, name and mistake above, until Shawn confirms them.
- Whether Plumb was Moth's co-driver.
- Where the player's shots come from for each name (GDD §5 proposes wins on
  that name's home turf).
- Whether the player has a portrait in the opening's dialogue (GDD §5).
