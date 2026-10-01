# Transitions: fewer loading screens, and seamless ones

Status: measured 2026-09-27; a plan, nothing built. Shawn asked how far the PC can be pushed toward MCLA's seamless
starts and GTA V's character switch before the Android port.

## What a load costs today

Every change of what is being driven goes through `loadDrive` in `src/main.ts`, which ends in
`location.href = url`: a race start, the race list, a restart, a venue gate. That is a full page reload. The page then
downloads and parses the city's data (a 34.7 MB JavaScript chunk, since `alder-data.json` is imported, 36 MB on
disk), builds the simulation's world and traffic network, builds every city mesh, and compiles its shaders.

`pnpm profile:load` (scripts/profile-load.mjs) serves the production build and loads it in headless Chromium on the
GPU, once cold (a first launch) and once warm (a reload in the same tab, which is what every transition is), at full
speed and with the CPU throttled four times. Shawn's machine: Ryzen 9 3950X, 64 GB, RX 6800 XT.

| Scenario | Cold launch | Warm reload (a transition) | Warm reload, CPU x4 |
|---|---|---|---|
| Free roam (`?scene=track`) | 18.2 s | 11.8 s | 66.5 s |
| Authored sprint (`?race=sprint-jackson-mercer`) | 14.6 s | 14.0 s | 67.1 s |
| Generated race (`?race=gen-stray-5`) | 14.1 s | 14.1 s | 66.5 s |
| The stadium (`?venue=stadium`) | 3.6 s | 2.3 s | 8.9 s |

The stadium downloads the same chunk but builds no city, so the city costs about ten seconds of every transition on
this machine. The chunk's download is under a second and its parse about 0.3 s: the data's size is not the problem,
what is done with it on every load is. The JS heap after load is about 165 MB with the city, 116 MB in the stadium.

A CPU profile of a warm free-roam reload (unminified build, `--profile`) puts the ten seconds in two places, about
half each:

- **Traffic's junction network, 5.2 s** (`buildStreetTrafficNetwork`, reached from `createSim`): the reservation map
  of every movement through every junction, built from scratch each load; most of it is testing movements' swept
  boxes against each other pair by pair (`sweptBoxesOverlap`).
- **The city's meshes, 5.3 s** (`addAlder`): road surfaces and strips sample the terrain height vertex by vertex
  (`alderHeight` from `surface` and `strip`, 1.8 s of the 2.8 s that function takes, which is three hills of
  arithmetic called tens of millions of times), road markings 0.8 s, the fronts 0.6 s, chunking 0.4 s.
  *Since 2026-10-01 not the arithmetic:* it was a V8 deopt loop on the JSON's hill objects, and with the hills in a
  typed array `alderHeight`'s self time in the same profile fell from 2,435 ms to 140 (headless Chromium, no GPU;
  `design/FIELD_NOTES.md`, "The hills on a retired hidden class"). Re-run `pnpm profile:load` on Shawn's machine for
  the table above.
- Smaller: junction dressing 0.7 s, re-validating frontage access 0.4 s, shader compilation about 0.3 s.

All of it is a function of data that does not change between loads. None of it is the handling, and none of it
needs a better GPU.

On the phone. Four times slower is a stress case, not a forecast: a Snapdragon 8 Elite's single core may be as fast
as this 3950X's (a guess from published benchmarks, not measured), but a WebView under thermal limits is another
matter. Whatever the factor, a minute of building a city that never changes is the port's first problem.

## The plan

Each phase stands on its own and keeps the two laws: the sim stays one ordered thread and deterministic, and
nothing here touches the handling. A cache or a bake of something the sim builds is only allowed if a test proves it
equal, bit for bit, to what the sim builds itself.

1. **One world a session: transitions in place.** Build the city, its traffic network and its meshes once, and
   swap only what a drive is made of: the sim's vehicles and race, the rival, the HUD. `loadDrive` becomes a session
   change, and the URL stays the record of the state (`history.replaceState`), so deep links, saves and replays mean
   what they mean now; a reload stays the fallback. MCLA's flash-to-countdown on the spot, and back to free roam where
   the race ended.
   - The test that holds it: a race started in place and the same race started by URL are the same run, state
     hashed after a scripted drive. Recordings replay in Node and do not notice.
   - Cost (inference): `main.ts` builds everything as module constants around one race-or-free-roam decision, so
     the session has to become an object. The physics world must be rebuilt or reset per session (`reset` already
     reconstructs its caches) and nothing may leak across sessions: measure the heap after twenty.
   - What it buys (inference): a race start goes from about 14 s to the race's own setup, the rival's route and
     line: about 2 s if it is the difference between a race's reload and free roam's, which is all that has been
     measured of it.
2. **Draw races before they are asked for.** A rival in flashing range has its course and line drawn in a Worker
   while the player drives, so the flash starts the race at once. The draw is sim code run by the same engine, so a
   worker's result is the main thread's (inference, and testable the same way).
3. **Keep the stadium.** Build it in idle time after the city, and a gate becomes a camera move through the gate.
   Measured cheap: its whole page loads warm in 2.3 s, with 116 MB of heap to the city's 165.
4. **The flash sequence** (Shawn, 2026-09-27). Three parts, the first two for a street challenge, the third for a
   race started from a menu.
   - **Race to the start** (Midnight Club's, which Shawn raised to make transitions less necessary). Flash a rival and
     it leads you to a start the generator chose, a few hundred metres off: a straight or a junction with room for
     two cars, not wherever the flash happened (today's `race-start.ts` snaps the flash pose to the nearest lane, so a
     start can land mid-block). The race is prepared in a Worker while you drive there (2), so the drive is the
     loading, and it is play. The start is marked in cyan, which is a destination in this city's colours; the rival
     drives there its own way, so how it drives says who it is before the flag; drifting too far from it for too long
     calls the challenge off, as in MC. Only the first attempt drives: a restart puts both cars on the line (1). A
     stored course keeps its start, so saved stages and recordings mean what they did.
     In MC the drive tied into police proximity, which is why it made more sense there (Shawn; our research notes do
     not record how). Without police it has to earn its time, so it stays short; when police come (a deferred LA
     idea, not a decision), it is where proximity would matter.
   - **The countdown cuts.** Through the countdown the camera cuts between the racers and hands back the chase
     camera half a second before the flag, so the player launches seeing the road. The countdown is 180 ticks, 3 s,
     and it is the sim's: the launch charge and every rival's launch are timed on it, so lengthening it changes races
     and their recordings. The cuts fit in those 3 s (about three shots) or play as a pre-roll before tick 0, while
     the sim has not started and nothing it decides can move. Camera only: they need neither 1 nor 2 and can come
     first. *Built 2026-09-27* (`countdownShot` in `src/render/camera.ts`, `?cuts=0` to compare): by ticks left,
     over 120 your car from low at the front, 60 to 120 the rival's, 30 to 60 both from behind and above, the last
     30 the chase camera, which eases to its place underneath the whole time; with no racing rival your car holds to
     75 and then from behind. Each shot stands on its car's side away from the other car, on the road, and pushes
     in slowly; the cuts are hard. Only the drawn camera moves, so the sim, the golden master and every recording
     are as they were. Tuning left: solo's last shot is plain (a side angle may serve it better).
   - **The aerial** (GTA V's switch was the picture), for a race started from the race list or the Blacklist, where
     there is no drive to hide behind: the camera rises over the city while the race is prepared and comes down onto
     the start. It moves smoothly only with the preparation off the main thread, so it needs 1 and 2; the swap to the
     race session happens at its top, where traffic moving to the race's own seed reads as nothing (inference).
     Undecided: drawing the course over the city from it (MCLA shows the route), and whether a button skips it.
5. **Stop rebuilding what never changes.** For the first launch, and for the phone above all.
   - Now: build traffic's network in a Worker while the main thread builds the meshes; about half the wait.
   - Then bake both at build time (a Vite plugin writing typed arrays), keyed to `ALDER_VERSION`, the traffic
     revision and a fingerprint of the code that builds them; the load checks the key, and a test compares the bake
     with a fresh build. A stale bake would change traffic silently, so the test is the whole of the safety.
   - Cheap on the way: the surfaces sample the terrain once per shared vertex, not once per triangle corner.
     *Tried 2026-10-01 and dropped:* once the deopt was fixed, sampling 302 K distinct vertices instead of 1.82 M
     saved nothing measurable.
6. **Use the PC.** Quality settings the phone reads down: render scale, how many 512 m chunks draw, shadows,
   anti-aliasing, haze. WebGPU (three.js has it) waits on knowing whether Android's WebView offers it on the
   RedMagic's GPU: a guess today either way.

Order: the countdown cuts whenever, since they stand alone; 1 first of the rest, because it removes the loading
screen from play (every race, restart and gate): arriving at a start and then waiting through a reload would be worse
than today. Then 2 with the race to the start, which is where the preparation hides, and the aerial for menu-started
races; 5 when the port starts or the first launch starts to grate; 3 once 1 exists. Measure with `pnpm profile:load`
before and after each.
