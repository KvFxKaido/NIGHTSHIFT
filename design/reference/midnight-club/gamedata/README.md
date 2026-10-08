# MC3 game data

Tables derived from Midnight Club 3: DUB Edition Remix's own tuning files, read
off the USA disc (`ASSETS.DAT`, an Angel Studios "Dave" archive) on 2026-10-07.
Everything in `../data/` comes from fan wikis, FAQs and a guide; this comes from
the game. On the workbook's scale it is **A (game data)**, with one limit: it is
the REMIX disc. Where the original MC3 differs, nothing here says so.

`../gamedata.py` writes every csv here from the archive (`../dave.py` reads it):

    python design/reference/midnight-club/gamedata.py <ASSETS.DAT>

Copy `ASSETS.DAT` off your own disc (7-Zip opens the .iso). Do not hand-edit the
csv files, and do not commit the archive or anything extracted from it: the
tables hold the values and structure the files give, not the designers' comments.
This README is written by hand.

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
