# Midnight Club reference data

A text export of `Midnight_Club_Reference_DB_v0.2.xlsx`, the MC3 / REMIX and
Midnight Club: Los Angeles progression research built for NIGHTSHIFT
(sources checked 2026-09-11 and 2026-09-12). All of the workbook's data is
here (not its charts or styling); nobody needs Excel to use it. It is research about other games, not
NIGHTSHIFT design: GDD §5 is where decisions live.

- `data/*.csv`: one file per workbook table, every row, values rather than
  formulas. MC3 source URLs are replaced with the workbook's own ids (`S1`
  to `S7`); MCLA rows already cite `LA01` to `LA23`.
- `digest.md`: the narrative tables (progression, pattern notes, conflicts)
  and the Dashboard / Cross-game summary sheets as markdown. Read this first.
- `export.py`: regenerates both from a newer workbook
  (`python design/reference/midnight-club/export.py <file.xlsx>`, needs
  openpyxl). It fails if the workbook gains or loses a table. Do not hand-edit
  the csv or digest; fix the workbook and export again.

## Rules the workbook sets

- **Confidence**: A official or game data; B independent community sources
  agree; C one structured source; D unresolved conflict or unverified.
- **Blank means not verified or not applicable, never zero.**
- **Stat bars are in-game ratings, not units.** Never compare raw MC3 bars with
  another game; compare class percentile or tier placement instead. MCLA's
  official bars carry no numbers, and none were digitized.
- Money is in-game dollars. Prize share of a roster is coverage, not how often
  rewards arrive, and MCLA reward row order is not chronology.
- All sources are fan wikis, FAQs and one official guide sample. Nothing was
  checked on an emulator or console. Conflicts are kept, not resolved:
  `mcla-conflicts.csv`, and the D rows in `mc3-unlocks.csv`.

## Files

| File | One row per | Look here for |
|---|---|---|
| `mc3-vehicles.csv` | MC3 / REMIX vehicle (94) | category, class, price, stock and max stat bars, how it is acquired |
| `mc3-unlocks.csv` | unlock (60) | class licences, tournament / club / rival prize cars, rims, paint, upgrade-level order |
| `mc3-progression.csv` | career phase (10) | the city-by-city arc and what each phase is for |
| `mc3-nightshift-notes.csv` | pattern (9) | MC3 patterns phrased as NIGHTSHIFT questions |
| `mcla-vehicles.csv` | MCLA vehicle or variant (67) | purchase group, REP gate, price, quoted full-tune cost, prize route |
| `mcla-ranks.csv` | career rank (13) | REP thresholds and what each rank unlocks |
| `mcla-other-unlocks.csv` | unlock track step (18) | cosmetic parts by participation, retired online unlocks, collectibles |
| `mcla-rewards.csv` | named prize car (18) | opponent, event type (pink slip, time trial, tournament), requirement |
| `mcla-tune-groups.csv` | purchase group (4) | REP gates and tune-cost quotes per group |
| `mcla-economy.csv` | observation (12) | tune and cosmetic costs, garage capacity, the $1,000,000 endgame |
| `mcla-rep-payouts.csv` | class, subrank, difficulty (80) | estimated REP for a first-place finish |
| `mcla-design-notes.csv` | pattern (10) | MCLA patterns phrased as NIGHTSHIFT experiments |
| `mcla-sources.csv`, `mcla-conflicts.csv` | source, conflict | provenance and the disagreements behind a value |

The workbook computes some `mc3-vehicles.csv` columns; the csv holds its
results. **Stock / Max Composite** is the unweighted mean of the three bars,
**Composite Gain** is max minus stock, **Gain %** is that gain over stock as a
fraction, and **Max Speed Percentile (Class)** is the share of the car's class
whose max top speed is at or below its own (blank for Specialty). In
`mcla-vehicles.csv`, **Price + quoted tune** is left blank for DUB variants,
police cars and D-confidence tune quotes.

## What bears on NIGHTSHIFT now

GDD §5 adopted Rep that unlocks performance parts on 2026-09-12, and a
ten-name Blacklist in place of an MC3-style ladder. The rows most relevant to
that:

- **MC3 gates tiers by racing, not money** (B): classes C, B and A open after
  winning 11 street races in San Diego, Atlanta and Detroit respectively. Rim
  sets mostly unlock as named rivals are beaten (set 4 is finishing Atlanta);
  upgrade levels unlock on a point system whose thresholds no source gives (C).
- **MCLA runs two gates** (A, official guide): REP grants access and cash pays.
  Its first twelve ranks sit 800 to 3,400 REP apart and each unlocks either a
  vehicle group (4 ranks) or a parts level for a group (8 ranks); the
  thirteenth is 7,340 further and also needs story progression and $1,000,000.
- **MCLA's REP payouts follow one rule.** Every row of
  `mcla-rep-payouts.csv` equals 80 + 50 per opponent class above D + 10 per
  subrank above 1 + a difficulty step (Green 0, Yellow 20, Orange 30, Red 50),
  checked against all 80 rows on 2026-09-12. The rows are the guide's
  estimates for first place only.
- *Inference:* at those numbers a rank costs roughly 5 to 10 D-class wins early
  and 11 to 15 A-class wins late, so MCLA keeps wins per unlock fairly flat by
  scaling payouts and thresholds together. The data does not say which
  opponents a player faces at which rank, so treat this as a shape, not a
  measurement.
