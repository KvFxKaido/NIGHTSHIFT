# Your soundtrack

Drop audio files in this folder, then run:

```
pnpm music:scan
```

That writes `manifest.json` next to them, and the game picks them up on the next
reload. Shuffle, skip and pause live in the pause menu under **Audio**.

Supported: `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.wav`, `.opus` — whatever
the browser will decode. Filenames become track titles unless you edit the
`title` field in the manifest yourself; the scan preserves titles you have
already edited, so renaming a track by hand survives a rescan.

## Nothing here is committed

`.gitignore` excludes this folder's contents, including `manifest.json`. Your
music stays on your machine and so does the list of it. Only this README is
tracked, so a fresh clone gets an empty folder and a silent soundtrack.

GDD §21 rules out a *licensed* soundtrack, which is a shipping-rights problem.
Playing files you already own is a different thing, and it is why this exists
instead of a bundled playlist. Do not add music to the repository.

## No music is the normal state

A missing or empty manifest is not an error. Engine, tyre and wind audio are
synthesised at runtime and do not depend on any file being here.
