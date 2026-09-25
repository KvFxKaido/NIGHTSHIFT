# How others overtake: racing games and robot drivers

Research about other systems, gathered 2026-09-25 before a round of work on the pass planner
(`src/sim/traffic-pass.ts`, `design/PORT_ALDER.md`, "What a committed pass costs"). It is not NIGHTSHIFT
design: nothing here is decided, and the constraints that make this game's rival what it is (no grip or
power it has not got, no information the player lacks, deterministic ticks) are ours and not theirs.

Public material on commercial racing games is thin. The useful sources are open-source racing robots,
three Game AI Pro chapters, and autonomous driving and racing planners. Tags: **[checked]** means read in
the source itself for this note; the rest is from two research passes that read the sources, paraphrased.

## Games

- **Driver: San Francisco** (Jenner and Ocio, *Game AI Pro 3* ch. 17,
  <http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter17_The_AI_of_Driver_San_Francisco.pdf>). The
  closest problem to ours: an open city, dense traffic, the player's physics, and **[checked]** no extra
  power or grip for the AI. Every vehicle publishes a path of its next couple of seconds (traffic from its
  splines, the player dead-reckoned), extended at the far end so the part being driven never changes. A
  mid-level search over a lattice about 100 m long, a node per lane, scores proximity to other cars'
  predicted positions, lane changes and oncoming lanes, and carries a maximum speed back from each node. The
  five best go to a low-level optimiser that drives each in a simplified 2D model sharing the game's tyre
  code and path follower, and keeps the path the car actually managed. Speed is what the follower achieves,
  so there is no separate plan-time speed to disagree with a later read. Their traffic splines never
  interact, which keeps their traffic simpler than ours. **[checked]** Distant vehicles also leave the
  physics engine and are placed along their paths, much as ours are kinematic until a racer is near.
- **Midtown Madness 2 / Midnight Club** ("AI Madness", Joe Adzima,
  <https://www.gamedeveloper.com/programming/ai-madness-using-ai-to-bring-open-city-racing-to-life>).
  Angel Studios, later Rockstar San Diego, who made MC3: the nearest public ancestor of MC3's AI. Opponents
  branch two extra routes around each obstacle and take the one that is unblocked, on the road and
  straightest. The article does not describe predicting moving obstacles. Nothing technical is public on
  MC2, MC3 or MCLA.
- **Tomlinson and Melder**, *Game AI Pro* ch. 38 (architecture,
  <https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter38_An_Architecture_Overview_for_AI_in_Racing_Games.pdf>)
  and ch. 39 (track representation,
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter39_Representing_and_Driving_a_Race_Track_for_AI_Controlled_Vehicles.pdf>).
  The track frame is accurate only near its nodes, so vehicle-to-vehicle avoidance belongs in world
  coordinates (our Traps are the long form of that). Braking predicts speed against the limit at every node
  ahead and is recomputed every few frames; kinks in a line give corner speeds that are too low. Overtaking
  is a utility-scored state with hysteresis, re-checked during the pass, and an aborted pass cannot restart
  for a few seconds. It also raises the AI's skill while overtaking, which our rules forbid.
- **Heat Vision** (Melder, *Game AI Pro* ch. 41,
  <http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter41_The_Heat_Vision_System_for_Racing_AI.pdf>).
  Planning a pass per target made its AI pull out, return and pull out again. Instead every car within
  about 50 m writes heat into a 1-D line across the track, smoothed, and a ball with momentum and friction
  rolls to the target offset. Suits defined tracks, not streets.
- **berniw**, a TORCS robot (`src/drivers/berniw/pathfinder.cpp`; read from the mirror
  <https://github.com/JoostvDoorn/TORCS>). The most detailed open overtaking code. It overtakes only when it
  will catch the car within 3 s with no radius under 100 m in the next 250 m, and writes a spline into its
  path buffer from its own lateral offset and heading, 4 m beside the opponent a third of the way, back to
  the racing line matching its slope. It aborts if a sample leaves the track, then recomputes speeds from
  the new path's curvature: **[checked]** from two 3-point radii, keeping the larger, to reduce noise
  (line 774), and after re-aligning the point before the join so the speed there comes out right (lines
  1203, 1365). Obstacles become speed caps written into the path, except the car being overtaken.
- **simplix**, a Speed Dreams robot (`unitopponent.cpp`, `unitdriver.cpp`; mirror
  <https://github.com/argos-research/speed-dreams>). Three precomputed lines (free, avoid left, avoid right)
  blended by one scalar. Catch time includes the opponent's acceleration; its lateral position then is
  extrapolated. Any car within 250 m that is slow (under 15, TORCS units) or yawed over 30 degrees is flagged
  dangerous for 2 s and looked for much further ahead (v^2 / 30 against the usual 50 m cap). Avoid decisions
  latch for 2 s on straights, 1 s in curves.
- **TORCS tutorial robot** (Wymann, ch. 7, same TORCS mirror): the reactive baseline. Only slower cars
  ahead count, catch distance assumes constant speeds, an opponent's width grows with its yaw.
- **SuperTuxKart** (`skidding_ai.cpp`, `checkCrashes`): probes along its own velocity ray, extrapolates
  karts linearly, latches the avoidance side. A straight probe misses a car standing beside a curving path.
- **GT Sophy** (Wurman et al., *Nature* 2022,
  <https://www.cs.utexas.edu/~pstone/Papers/bib2html-links/nature22.pdf>). Raising the general collision
  penalty made its agents timid; the fix was narrow, targeted penalties. Agents trained against themselves
  did not expect humans to brake early.
- Nothing usable found for Burnout, NFS, Forza, PGR, Split/Second or GTA; Assetto Corsa and rFactor only
  expose corridor parameters; VDrift's steer-away call is commented out.

## Robot drivers

- **Werling et al. 2010**, "Optimal Trajectory Generation for Dynamic Street Scenarios in a Frenet Frame"
  (<https://d17h27t6h515a5.cloudfront.net/topher/2017/July/595fd482_werling-optimal-trajectory-generation-for-dynamic-street-scenarios-in-a-frenet-frame/werling-optimal-trajectory-generation-for-dynamic-street-scenarios-in-a-frenet-frame.pdf>).
  Each replan starts from the previous plan's state, not the measured one, and end times are sampled in
  absolute time so last cycle's best plan is still a candidate. Collision is a yes/no footprint test whose
  margin grows slightly toward the horizon. The reactive layer looks 3 s ahead and is said not to replace a
  far-sighted behaviour layer. Keeping speed, following and stopping at a line are planned in parallel and
  the most conservative wins.
- **TUM, Indy Autonomous Challenge** (Betz et al. 2022, <https://arxiv.org/pdf/2205.15979>). The measured
  state is projected onto the previous plan to start the next one, so plans do not jump between cycles.
  Hard collision checks only inside the horizon where prediction is confident; soft costs beyond. Every
  cycle also carries an emergency plan: full braking along the current path.
- **Stahl et al. 2019**, graph-based planner for race cars (<https://arxiv.org/abs/2005.08664>). Three
  actions, straight (stay behind, the lead handled in the speed profile), left and right; the speed profile
  starts from the planned speed at the predicted position. Stays behind where a curve offers no pass.
- **Apollo** (Baidu). The trajectory stitcher starts each plan from the previous plan's point one cycle on,
  and replans from the measured state only past 0.5 m sideways or 2.5 m along
  (<https://github.com/ApolloAuto/apollo>, `modules/planning/planning_base/common/trajectory_stitcher.cc`).
  The EM planner (<https://arxiv.org/pdf/1807.08048>) puts static, slow and oncoming obstacles into the
  lateral plan as nudges; static means under 0.5 m/s. **[checked]** The blocking analyzer
  (`obstacle_blocking_analyzer.cc`) will not go round a car within 20 m of a signal or stop sign, treats a
  stopped car with another within 15 m ahead of it as queued, and does not treat a stopped car far ahead as
  immovable because it cannot be sure of it.
- **Autoware** static obstacle avoidance
  (<https://autowarefoundation.github.io/autoware_universe/main/planning/behavior_path_planner/autoware_behavior_path_static_obstacle_avoidance_module/>).
  A car stopped at a light or crosswalk that does not look parked is never passed; parked is judged by how
  far it sits toward the kerb. A car counts as moving only above a speed held for a time. Margins 0.3 m soft,
  0.2 m hard, 0.7 m hard for parked cars. The swerve's length comes from the speed and a maximum lateral
  jerk.
- **MOBIL** (Kesting, Treiber, Helbing, <https://www.mtreiber.de/publications/MOBIL_TRB.pdf>). Change lanes
  when own gain in acceleration plus politeness times others' gain exceeds a threshold, and only if the new
  follower need not brake harder than a safe limit. Accelerations from IDM car following.
- **RSS** (Mobileye, <https://arxiv.org/pdf/1708.06374>). Closed-form longitudinal and lateral safe
  distances from bounded acceleration and a response time; the same bound gives a stopped car's reach,
  at most a t^2 / 2 forward.
- **ForzaETH** F1TENTH stack (<https://arxiv.org/pdf/2403.11784>). Free, Trailing, Overtake: overtake only
  from Trailing with a valid plan, back to Trailing when it goes invalid. Side: rule out one without room,
  else the one nearer the racing line; passing offset is the opponent's plus both half widths plus a margin,
  and the overtake's length grows with speed.
- **Esterle et al.** (<https://arxiv.org/pdf/2207.04418>): a cost counting obstacles whose pass side or
  order changed since the last cycle, against oscillation. The optimiser around it is too heavy for us.
- Too heavy for one rival in a tick: game-theoretic racing planners (Liniger and Lygeros,
  <https://arxiv.org/pdf/1712.03913>), MPC and control-barrier stacks, Apollo's DP+QP, TUM's
  spatiotemporal search.

## What the pass planner already shares with them

- The pass is stored in absolute stations along the route (`from`, `out`, `back`, `to`), so a re-read
  scores the same plan, as Werling, TUM and Apollo arrange by construction.
- Traffic publishes its future (`forecastTrafficPath`) and racers are read as straight lines, like Driver
  SF's vehicle paths and dead reckoning.
- The car being passed does not brake the pass while holding out clears it (2026-09-20), as berniw exempts it.
- The rejoin's length grows with speed (`pass-v4`), as Autoware's swerve and ForzaETH's overtake do.
- A chosen side persists through the pass, as simplix and SuperTuxKart latch theirs.

## What they suggest for our open problems (undecided)

- **Planned slower than every re-read** (gen-81: 35 mph at the commit, 86+ from 0.2 s later). Where commit
  and re-check disagree, they are scoring different things. Ours share the plan but not the first sample:
  the first curvature sample in `evaluatePass` sits at the car and reads a point 6 m behind it. berniw
  treats exactly that join point specially. Measured the same day: it was that, fixed in `pass-v5`, and the rest
  of gen-81's loss was the in-pass emergency check reading the car's yawed body frame (`PORT_ALDER.md`).
- **A car standing at a bar just off the line.** Apollo, Autoware and simplix all give a stopped car its own
  class: one that may move (queued, or at a signal), looked for further ahead, with a wider hard margin. Ours
  will move, after `STOP_DWELL`, and the player can see the sign and its indicators. The pass planner's
  lead filter takes only cars over 1 m/s, so a standing car is never a pass target and is left to the
  reactive driver, which is where the misread is.
- **A committed pass too cautious far ahead** (gen-24, a taxi 224 m on). TUM checks hard only inside the
  window where prediction is confident; Werling's reactive layer looks 3 s ahead against our 6 s plus 2
  settling. GT Sophy is the warning the other way: broad caution made its agents timid. In gen-24 the read
  was right and the reactive driver got past on luck with 4 m in it, so this is a taste question about how
  reckless an MC3 rival is, not a bug.
- Driver SF's optimiser, driving candidates through the real tyre code, is the most interesting idea here
  and a project of its own.
