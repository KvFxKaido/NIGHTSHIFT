# Car reference set

Every car in the game, rendered by the game: the garage's fixed camera and
lighting, the turntable at the livery editor's "hood" and "rear" angles, one
capture each way. Made so that anyone designing around a car — a rival
portrait, a livery, a brief for an image model — works from the same
pictures.

| File | Body | Who drives it |
| --- | --- | --- |
| `blender-*.png` | NS-01 coupe | The player's default; the rival in Sound to Sky when the player takes the Bulwark |
| `bulwark-*.png` | Bulwark pickup | The garage's other body; the rival in Sound to Sky by default |
| `kestrel-*.png` | Kestrel rally hatch | The rival cruising the freight block by the garage |
| `hammer-*.png` | Hammer | Rivet, at the Harbor Quarter drag strip |

Each body carries its **authored colours**. The player's paint is not
applied: the NS-01 and Bulwark are shown as a rival presents them, not as
the garage would paint them for the player (the default paint there is
"signal" red).

## Regenerating

`scripts/capture-cars.js` is the source; the PNGs are its output. With the
dev server up:

```bash
playwright-cli -s=cars open http://localhost:5173/
playwright-cli -s=cars run-code "$(cat scripts/capture-cars.js)"
playwright-cli -s=cars close
```

It loads the garage once, swaps each body onto the turntable through the
app's own modules (`loadBlenderCar`, `setPlayerCar`), sets `garageYaw` to
−π/4 for the front three-quarter and 3π/4 for the rear, hides every overlay,
and clips the 1024×640 viewport to the turntable (660×440 from 40,120),
because the garage frames the car left of centre to leave room for its menu.
Re-run it whenever a body or the garage's lighting changes, and commit the
result with that change.
