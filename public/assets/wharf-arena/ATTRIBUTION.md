# Wharf arena shell

Adapted from **Tron Light cycle Arena** by **ImWillows (jcreadingtutor)**.

- Source: https://sketchfab.com/3d-models/tron-light-cycle-arena-e2b41a64314341c1984c6e3bb78f4528
- Creator: https://sketchfab.com/jcreadingtutor
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License terms: https://creativecommons.org/licenses/by/4.0/
- License verified against Sketchfab's public model API on September 23, 2026.

NIGHTSHIFT modifications: removed grid floors, textures, light strips, long
outlier tail and interior ramp; independently scaled the horizontal axes;
applied neutral grey materials; cut north and east entrances; baked world
transforms and generated collision. This adaptation is not endorsed by the
original creator. The original title identifies the source asset only.

`shell.glb` is the optimized runtime mesh. Its collision counterpart is
`assets/wharf-arena/collision.json`, under the same attribution and license.
Rebuild with `node scripts/inspect-yard-shell.mjs` followed by
`node scripts/build-yard-arena.mjs` when the source is installed in the ignored
`inspiration/tron-light-cycle-arena/` folder.
