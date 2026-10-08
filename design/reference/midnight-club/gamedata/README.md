# Game data

Tables derived from the games' own files, read off Shawn's discs on 2026-10-07:
Midnight Club 3: DUB Edition Remix (`mc3-gd-*`) and Midnight Club: Los Angeles
Complete Edition (`mcla-gd-*`, [below](#mcla)). Everything in `../data/` comes from
fan wikis, FAQs and a guide; this comes from the games. On the workbook's scale
it is **A (game data)**, with one limit each: the MC3 tables are the REMIX disc,
and where the original MC3 differs nothing here says so; the MCLA tables are the
Complete Edition, with South Central's files beside the base game's.

Do not hand-edit the csv files, and do not commit a disc, an archive, a key or
anything extracted: the tables hold the values and structure the files give, not
the designers' comments. This README is written by hand.

# MC3

`../mc3_gamedata.py` writes the `mc3-gd-*` files from `ASSETS.DAT` (an Angel
Studios "Dave" archive, read by `../dave.py`), copied off your own disc (7-Zip
opens the .iso):

    python design/reference/midnight-club/mc3_gamedata.py <ASSETS.DAT>

## Files

| File | One row per | From |
|---|---|---|
| `mc3-gd-unlock-rules.csv` | unlock rule (483) | `tune/progress/unlockingrules.csv`, the whole unlock graph |
| `mc3-gd-rivals.csv` | rival encounter (26) | the `Hookman` blocks in `tune/race/<city>.loc`, names from `tune/hud/hookmanimagemap.txt` |
| `mc3-gd-career-order.csv` | career race (225) | the `CareerOrder` block in each `.loc`; designer comments reduced to flags |
| `mc3-gd-money.csv` | money set band (9) | `MoneyRewards` in `definitions.rewards` |
| `mc3-gd-money-rounding.csv` | rounding step (10) | `Rounding` in the same file |
| `mc3-gd-prizes.csv` | reward item (138) | `IndividualRewards` in the same file: prize cars' cash value and config |
| `mc3-gd-rubber-banding.csv` | rubber-band field (120) | `definitions.rubberbanding`, four flows by career order |
| `mc3-gd-races-available.csv` | city band (32) | `RacesAvailable` in `tune/progress/<city>.progress` |
| `mc3-gd-parameters.csv` | tuning value (235) | the small key/value files: knowledge base, flow, dynamic difficulty, side quests, filler races, race setup, time of day, mediators |

## Reading the unlock rules

A rule is a reward and up to ten conditions; *inference*, all of them must hold
(the Murciélago's one row lists all seven championship encounters). The reward types used here: `VP` a player vehicle, `VAI` an
AI vehicle, `H` a rival encounter, `C` a city, `PERF` / `VISUAL` an upgrade
level for a group (`a 2` is group a, level 2), `MONEY` a prize money set
(`mc3-gd-money.csv`), `SQ` a side quest (a club, by class), `RACE_C` a race in
the career, `GENERIC` a named rule the code checks, plus tasks such as `Movie`
and `Tournament`. Conditions: `H x` rival x beaten, `H x n` its n-th race
beaten, `H x 0` it only has to be unlocked; `C` a city open; `CO_MIN` career
order reached; `CPC_MIN` / `TCPC_MIN` career / Tokyo percent complete; `SQ c n`
n races of club c; `LOGO n` Rockstar logos collected; `FILLER city n` filler
races beaten there; a task name means that task is done.

*Inference:* several rows with the same reward are alternatives, any one
enough. Detroit has two rows (Roy's first rematch with Cheng, or with Naomi),
and the wiki independently says "Cheng or Naomi"; nothing in the files states it.

*Inference, strong:* the vehicle and upgrade groups `a` to `d` are the
workbook's classes D to A. Group a holds the starters at `CO_MIN 1`, and the
game's upgrade steps in career order (a2 70, b1 80, a3 88, b2 115, c1 135,
b3 140, c2 165, c3 180, d1 185, d2 198, d3 240) are, but for the last, exactly
the sequence `mc3-unlocks.csv` lists: D2, C1, D3 tires, C2, B1, C3 tires, B2, B3
tires, A1, A2. The workbook has no A3 row; the game puts it at 240.

**Career order** (CO) is a race's place in the career: every career race in
`mc3-gd-career-order.csv` has one, San Diego 1 to 180, Atlanta 80 to 150,
Detroit 130 to 200. Vehicle groups open at CO 50, 105 and 175 and upgrades at
the values above. *Not known:* how the player's CO advances (by races beaten,
by the highest CO beaten, or otherwise). That lives in the code, not these
files, so the workbook's "win 11 street races" for a class licence is neither
confirmed nor contradicted.

## What it settles in `../data/mc3-unlocks.csv`

| Workbook row | Workbook says | Game data | Verdict |
|---|---|---|---|
| Performance progression (10 rows) | "point threshold not specified" | `PERF` at CO 70 to 240, above | Thresholds found, in career order |
| San Diego Cop (D) | Wiki: beat Vanessa rematch | `C Atlanta`; Atlanta opens on Vanessa's second encounter (`Culture_1_part_2`) | Wiki right, one step removed |
| Atlanta Cop (D) | Wiki: Cheng or Naomi plus Roy's first rematch | `C Detroit`; Detroit opens on Roy 2 with Cheng, or Roy 2 with Naomi | Wiki right, one step removed |
| Detroit Cop | Beat all Detroit racers | Championship's first encounter unlocked: Ceasar 2 and Angel beaten, which needs every Detroit rival | Agrees |
| Tokyo Cop | All Tokyo tournaments | `TCPC_MIN 100`, 100% Tokyo complete | Close: the game asks for 100%, which may be more than the tournaments |
| Police 1000 | Both bike clubs | `SQ chopper 15`, `SQ sportbike 14` | Agrees |
| Tournament, club, rival and completion prizes (29) | routes and values | every route matches; 24 cash values match to the dollar | The 300C, SL55, Escalade EXT, Magnum and Charger SRT8 prizes are their DUB configs, worth $60,145, $154,725, $81,740, $52,000 and $55,995 against the workbook's $32,995, $135,000, $53,240, $32,070 and $35,995 |
| Club prizes | "Complete" the club | club length: culture 13, luxury 14, sport bike 14, SUV 15, muscle 15, chopper 15, performance 16 races | Agrees; lengths are new |
| Pearlescent, Color Shift paint | Vanessa 2nd, Roy 1st | `Culture_1_part_2`, `Muscle_2_part_1` | Agrees |
| Rim sets 1 to 8 | counts of rivals beaten, "complete Atlanta" | 1 Vanessa; 2 Bishop or Carlos; 3 Dre or Lamont; 4 Roy 2; 5 Roy 3; 6 Ceasar 1; 7 Angel; 8 Ceasar 2 | Specific rivals, not counts; set 3 (Lamont, not Roy) and set 4 (Roy 2, not all of Atlanta) differ |
| Flag vinyls, plates, starters as riders | 12, 24, 36 logos | `LOGO 12`, `24`, `36` (the cop rider at 36 too) | Agrees |
| Class licences | win 11 street races per city | groups at CO 50, 105, 175 | Open: see career order above |

The workbook keeps its own rows and confidence; this table is the evidence for
changing them when the workbook is next revised and exported.

## What bears on NIGHTSHIFT

- **Prize money is set by career order, not by race.** Each `MONEY` set covers
  a band, starting at $500 to $750 at CO 1 and reaching $12,000 to $20,000 at CO 200 once the
  championship is beaten, and the career moves to the next set only at named milestones
  (first tournament, first Atlanta event, first Detroit event, the championship).
  Second place pays 30% of the prize, third 12.5%, fourth and below nothing
  (`tune.rewards`), which also has `ReductionPer100COLower 0.40`: by its name, 40%
  less for a race 100 CO below the player's level. *Inference*; the code applies it.
- **Rubber-banding is tuned by career order.** Main flow, side quests, filler
  races and follow-to-start each have sets at CO 1, 30 and 200 (some only 1 and
  200): a throttle limit, distances to hold ahead and behind by race position, a
  minimum speed, and a penalty for AI running fast outside the traffic bubble.
  NIGHTSHIFT's rival takes none of this (CLAUDE.md: no rubber-banding); it is
  here as what MC3 chose, not a proposal.
- **Difficulty follows retries.** `dynamicdifficulty.progress` targets about one
  retry a race at the start of the career and 2.5 at the end, multiplies AI skill
  by 1.35 with no retries and 0.85 at twice the target (`SkillMultiplierRetryCap` 3);
  its fade-in values (0 to 7) are in units the file does not name.
- **The career paces itself.** `flow.progress` aims at 12 races in a career-order
  window, keeps up to 10 races delayed, and sets a rivals-done target per city:
  0.85 for San Diego and Atlanta, 1.0 for Detroit. `races-available` sets how many races
  are on the map at once, 5 to 8 by career order.

<a id="mcla"></a>
# MCLA

`../mcla_gamedata.py` writes the `mcla-gd-*` files straight from the 360 disc
image (or `xarchive_cache.rpf` copied off it), read by `../rpf3.py`:

    python design/reference/midnight-club/mcla_gamedata.py <disc.iso> <keyfile>

The archive's table of contents is AES-encrypted; `rpf3.py` says where the key
comes from and checks it against a SHA-1, and the key itself is never committed.
RPF3 stores only hashes of names, so the tools find files by hashing the paths
they expect; nothing needs CodeX's name list.

## Files

| File | One row per | From |
|---|---|---|
| `mcla-gd-experience.csv` | threshold reward (179) | `tune/career/experiencesystem_0.lst` (base) and `_1.lst` (South Central): every experience system, its cap, each threshold's percent of it, and what it gives |
| `mcla-gd-event-rewards.csv` | event, difficulty, reward (65) | `tune/career/rewards_0.lst` and `_1.lst`: hangout series, tournaments, deliveries |
| `mcla-gd-missions.csv` | mission (166) | every `tune/career/missions/**/*.xml`: district, rival, prerequisites, objectives, the missions it starts, cars it gives |
| `mcla-gd-rubber-banding.csv` | field per tuning (231) | `tune/career/rubberbandtune00.xml` to `10.xml` |

Conditions and rewards in the missions table are written `Type(field=value)`
with the files' Hungarian prefixes (`sz`, `n`, `b`) taken off.

## Two experience systems, one cap

The base career has a **Progression** system and an **Unlocking** system, both
capped at 33,500 in steps of 100, alongside small per-ability (Zone, Agro, Roar,
Pulse, 40 each) and per-type (Tuner, Muscle, Luxury, Exotic 45, SportBike 36;
South Central adds SUV and LowRider) systems that unlock parts and ability levels.
Progression's thresholds start missions (`Mission` rewards) and show tips.
Unlocking's give the performance levels: `D1` at 4%, `C0` at 10%, then D2, C1, B0,
C2, B1, A0, B2, A1, A2 up to 84%. 33,500 is the guide's Idol threshold (`../data/mcla-ranks.csv`).
`rewards_0.lst` pays `be_payback` in Unlocking experience by name, so the two are
separate totals. *Not known:* which events feed which, beyond that one. The amounts
are `DynamicMoney` / `DynamicExperience`, computed in code; the guide's payout rule
(`../README.md`) is still the only evidence for them.

**The guide's ranks are these thresholds, through a curve.** Read `C0` as "group
2 vehicles" and `D1` as "group 1, level 1", and the eleven Unlocking rewards come in
exactly the order of ranks 2 to 12 in `mcla-ranks.csv`. Their REP is not the
percent of 33,500, though:

| Rank | Guide REP | Game | Percent | Percent x 33,500 |
|---|---|---|---|---|
| Navigator | 800 | D1 | 0.04 | 1,340 |
| Student Driver | 2,000 | C0 | 0.10 | 3,350 |
| Rookie | 3,610 | D2 | 0.17 | 5,695 |
| Driver | 5,600 | C1 | 0.25 | 8,375 |
| Racer | 8,060 | B0 | 0.34 | 11,390 |
| Veteran | 10,760 | C2 | 0.43 | 14,405 |
| Elite Racer | 13,700 | B1 | 0.52 | 17,420 |
| Champion | 16,500 | A0 | 0.60 | 20,100 |
| Legend | 19,540 | B2 | 0.68 | 22,780 |
| Savant | 22,760 | A1 | 0.76 | 25,460 |
| Hero | 26,160 | A2 | 0.84 | 28,140 |
| Idol | 33,500 | (cap) | 1.00 | 33,500 |

*Inference:* the guide's REP is 33,500 x (0.556 p + 0.444 p^2) for percent p, within
31 REP at all twelve points, so the game turns a threshold's percent into REP along a
curve that is gentle early and steep late. The fit is ours; the curve is in the code.
The rank names and the Idol mission are not in these files.

## What it settles in `../data/`

| Workbook | Game data | Verdict |
|---|---|---|
| `mcla-ranks.csv`, 13 ranks, A | the Unlocking thresholds above | Order and unlock content agree; REP agrees through the fitted curve |
| `mcla-rewards.csv`, time trials (LR-004, 009, 010, 011, 017) | `TIMETRIAL_*C` missions give the Eclipse GSX, Boss 302, 3000GT, Miura and (South Central) Impala | Agree |
| best of 3, rival race (LR-001, 002, 003) | `BESTOF_GH_04` the Camaro SS 69, `BESTOF_GH_05` the Focus, `BEAT_SH_02_DCLASS` the 280Z | Agree; the 280Z as a rival prize, as `mcla-conflicts.csv` decided |
| DUB tournaments (LR-012 to 015), "win on Hard" | `hw_`, `hl_`, `be_`, `dt_tournament1` give the Camaro Concept, Challenger Concept, S600 and Murciélago Roadster DUB on **Hard**; Easy, Medium and Impossible pay money only | Agree, and new: Impossible does not give the car. The workbook's "Valley" is the files' Hills |
| Ballerz tournament (LR-018) | `sc_tournament1` on Hard gives `SC_tournament_vpd_lr_sport_08` | Agrees |
| pink slips (LR-005, 006, 007, 016), Jin's 350Z (LR-008) | no reward entry | *Inference:* the car comes from the opponent, in code |
| (not in the workbook) | `BEAT_GH_05_TUNER` gives a 1983 Golf, `BEAT_GH_04_MUSCLE` a 1970 Challenger | New; both in Hollywood against `SH_01` |

## What bears on NIGHTSHIFT

- **Eleven rubber-band tunings in a straight ladder.** `rubberbandtune00` to `10`
  raise the AI's throttle ceiling from 0.75 to 1.0 and floor from 0.15 to 0.5,
  let it go flat out when behind from step 5, and start its unlimited nitro from
  550 m behind the player down to 200. Which tuning a race uses is not in these
  files. NIGHTSHIFT's rival takes none of it (CLAUDE.md); it is what MCLA chose.
- **Experience starts the next missions, not just parts.** The base Progression
  system's 36 thresholds (South Central's adds 7) start missions at given shares of
  the cap: the Hollywood tournament at 15%, the five class championships together
  at 50%. Missions mostly wait on other missions; only two name an experience
  condition themselves.
