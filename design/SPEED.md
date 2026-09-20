# Sense of speed

Where the chase camera stands against GDD §14, measured, and what might be done
about it. One thing here is built (Standard B). Nothing here is decided: the
proposals are an assistant's, written down on 2026-09-20 so they are not lost in
a chat log, and each is Shawn's call.

Facts are marked as measured. The reasoning about what *feels* fast is inference
from how optic flow works, not something a test can hold. Pad feel outranks all
of it.

## What the Standard camera does (measured 2026-09-20)

Full throttle down Ridge Circuit's straight, one sim tick and one
`renderFrame(DT)` a step, so the follow behaves as it does at 60 fps.

| mph | camera behind car | look-ahead | fov |
|---|---|---|---|
| 0 | 7.2 m | 2.6 m | 62° |
| 75 | 13.1 m | 1.9 m | 70° |
| 140 | 18.6 m | 1.3 m | 77° |

`CHASE_CAMERAS.standard` authors 9.9 m behind and 7.4 m of look-ahead at top
speed. The rest is the follow itself: the camera only eases toward its place
(`scene.ts`, rates 6.8 for position and 9.5 for the look target), and an eased
follower trails a moving target by about speed / rate. That is 8.7 m of distance
and 6.1 m off the look-ahead at 140 mph, predicted and measured to the
centimetre.

So:

- Look-ahead *shrinks* with speed, the opposite of what the table asks for.
- The car is about 3.2 times smaller on screen at 140 mph than at rest. The table
  alone would make it 1.8 times smaller.
- `distanceAtSpeed` and `lookAheadAtSpeed` control a minority of what is on
  screen. Tuning them turns a knob that is a third of the effect.
- The camera also *rises* with speed, 3.15 m to 4.2 m.
- `__ns.shot()` and `?freeze=1` settle the camera before capturing, so a
  screenshot at speed shows Standard 8.7 m closer than the player ever sees it.

Also measured, for what the eye has to work with:

- FOV is vertical in three.js. 77° vertical is about 110° horizontal at 16:9 and
  about 121° at 20:9. It is already a wide camera, at rest too (62° is 94°).
- Lane dashes are 14 cm wide and come every 10 m (`render/alder.ts`). From 4 m up
  and 18 m back, whether they register at night has not been looked at.
- Lamp pools are unlit decals (`MeshBasicMaterial`). A car passing under a lamp
  does not change at all.
- Wind already rises with speed (`windLevel`, speed to the power 1.5).

## Why that probably costs speed (inference)

Speed is read from things streaming across the screen near the car, and from
change. How fast the road streams scales with speed divided by camera height.

- The trailing is a constant wide shot. An acceleration pullback works because it
  is a change; a lag tied to speed keeps the camera far back the whole time, and
  the eye adapts to a steady state within seconds. The transient is the cue and
  the steady state is its cost, and today the cost is paid permanently.
- Rising a third of its height removes about a quarter of the road's streaming at
  exactly the speeds where it is wanted.
- A small car far away has slow-moving world around it. Close cameras feel fast
  because what streams past, streams past next to the car.

## Built: Standard B

`?camera=standardB`, or one press of change-camera from Standard. Standard's
framing to the digit, pinned by a test, so the follow is the only difference
(`ChaseFollow` in `src/render/camera.ts`).

- Each frame the camera is first carried by the car's drawn movement over the
  ground; the existing easing settles only the framing turning and the distance
  and height changing. Height is never carried, so bumps stay as soft.
- What the trailing used to say about a change of speed is authored instead:
  0.16 m back per m/s² gained (up to 2 m), 0.075 m in per m/s² lost (up to 1.5 m,
  reached only at full braking, about 20 m/s²).
- Measured, same run: 10.0 m behind and 7.4 m of look-ahead at 140 mph. A launch
  pulls it back 1.5 m in the first second. In a 62 mph corner the view ends 11.0°
  off the car's heading against Standard's 12.0°, so the swing survives; the
  camera sits 2.1 m to the side against 3.4 m, because it is closer.
- Its settled screenshot is its live framing.

To judge on the pad, then promote into Standard or delete; a saved choice of it
falls back to Standard when it goes.

- It is stiffer over a long acceleration. Standard lets the car recede about 9 m
  across a run to top speed; B gives 1.5 m at launch and the table's 2.7 m. If
  that feels dead, the knobs are `pullback` and `carried` below 1: at 0.7 it keeps
  about 2.6 m of the old trailing at 140 mph.
- `lookAheadAtSpeed: 4.8` was tuned while the lag ate most of it. 7.4 m of real
  look-ahead may be more than is wanted.

## Proposed, in the order they would be tried

1. **Drive the Near camera first; it costs nothing.** Same street, 100 mph and
   over, `?camera=near` (1.6 m rising to 2.0 m). If it feels clearly faster, height
   is the main lever and Standard should sink a little with speed instead of
   rising. The cost is that a lower camera lets the car hide more of the road
   ahead, which real look-ahead offsets by putting the car lower in frame.
2. **Make the lag authored.** Built, above. It comes first among the code changes
   because it also fixes look-ahead, and no other camera value can be tuned
   reliably while the follow adds distance of its own.
3. **Reshape the FOV curve rather than widen it.** Wider goes fisheye and shrinks
   the car further. The ramp is linear, so half of it is spent by 75 mph; an
   ease-in would save the widening for the last 40 mph, where it would read as a
   different regime. A modest gain.
4. **Speed-scaled camera vibration.** Rotational, under a tenth of a degree,
   scaling with speed squared, with kicks on contact and on the pavement-to-grass
   change (physics v6). Render-only, and it should respect reduced motion as the
   facade menu does. GDD §14's own limit applies: the camera must not interfere
   with steering precision.
5. **Let the lamps light the car.** A common night-racing cue is streetlights
   sweeping over the paint. A warm pulse on the cel bands, driven by lamp
   proximity, would come from data rather than a painted texture and fits
   `design/LOOK.md` ("warm is the city"). It may count as a new rule for the cars,
   which is LOOK.md's first question. How hard it is inside `cel.ts` is a guess.

## Saved for Surge

`design/LOOK.md` excludes bloom as atmosphere and says nothing of blur; GDD §14
allows peripheral blur used sparingly. Blur, light streaks and a FOV punch are
still better kept for Surge (GDD §3.6, not implemented). If ordinary driving at
140 mph already uses them, Surge has nothing left to add. Ordinary driving gets
the camera changes above instead.
