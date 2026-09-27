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
4. **The switch camera.** GTA V's pull-up: up over Port Alder, across, down to where the drive begins, for the long
   jumps: a race-list race across town, the garage to a far start, a gate. On the PC the city is resident and it is
   theatre that covers a session change; on the phone it is the cover for streaming what the destination needs.
5. **Stop rebuilding what never changes.** For the first launch, and for the phone above all.
   - Now: build traffic's network in a Worker while the main thread builds the meshes; about half the wait.
   - Then bake both at build time (a Vite plugin writing typed arrays), keyed to `ALDER_VERSION`, the traffic
     revision and a fingerprint of the code that builds them; the load checks the key, and a test compares the bake
     with a fresh build. A stale bake would change traffic silently, so the test is the whole of the safety.
   - Cheap on the way: the surfaces sample the terrain once per shared vertex, not once per triangle corner.
6. **Use the PC.** Quality settings the phone reads down: render scale, how many 512 m chunks draw, shadows,
   anti-aliasing, haze. WebGPU (three.js has it) waits on knowing whether Android's WebView offers it on the
   RedMagic's GPU: a guess today either way.

Order: 1 first, because it removes the loading screen from play (every race, restart and gate), then 2, which makes
the flash instant; 5 when the port starts or the first launch starts to grate; 3 and 4 once 1 exists, since both are
transitions between sessions. Measure with `pnpm profile:load` before and after each.
