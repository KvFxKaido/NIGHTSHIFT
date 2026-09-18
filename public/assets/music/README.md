# Your soundtrack

Drop audio files in this folder, then run:

```
pnpm music:scan
```

That writes `manifest.json` next to them, and the game picks them up on the next
reload. Shuffle, skip and pause live in the pause menu under **Audio**.

Supported: `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.wav`, `.opus` — whatever
the browser will decode. A track is named from its own tags, "Artist - Title",
where it has them (ID3, so mp3s; any tag editor writes them), and from its
filename where it does not. Edit the `title` field in the manifest to call a
track something else: each entry also records the title the scan gave it
(`scanned`), and a title that differs from that is yours, so it survives a
rescan while untouched titles follow the tags.

`pnpm dev` runs the scan as it starts. Rename, add or retag files while it is
running and the game keeps the old list until you run `pnpm music:scan` and
reload; if none of the listed files load, Play stops and the Audio menu says so.

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
