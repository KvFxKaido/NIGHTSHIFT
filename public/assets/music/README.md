# Your soundtrack

Drop audio files in this folder, then run:

```
pnpm music:scan
```

That writes `manifest.json` next to them, and the game picks them up on the next
reload. Shuffle, skip and pause live in the pause menu under **Audio**; D-pad
Left / Right skip while driving. Shuffle is on until you turn it off, and the
choice saves on this browser (`nightshift.music`): on, each time the list comes
round it is shuffled again, never opening on the song that just ended; off, it
plays in name order, which is the manifest's.

Supported: `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.wav`, `.opus` — whatever
the browser will decode. A track is named from its own tags, "Artist - Title",
where it has them (ID3, so mp3s; any tag editor writes them), and from its
filename where it does not. Edit the `title` field in the manifest to call a
track something else: each entry also records the title the scan gave it
(`scanned`), and a title that differs from that is yours, so it survives a
rescan while untouched titles follow the tags.

## The DJ

Spoken clips go in `dj/` inside this folder, never beside the songs, where
they would shuffle in as tracks. After every two or three songs the soundtrack
plays one before the next song: a station ident half the time, the host talking
the rest, and never the same clip twice running. A clip whose name has an `id`
word in it (`kald-id-tower.wav`) is an ident; any other name is talk. Skipping
during a break goes on to the next song; going back returns to the song before
it. With no `dj/` folder the songs play back to back, as they always did, and
**DJ on / off** beside Shuffle does the same with clips in place; it saves with
shuffle in `nightshift.music`, and a clip already on air plays out.

### KALD's voice

The station is KALD 91.3, broadcasting overnight from the booth in the Broadcast
Tower's base (the lit corner over Broad St). Its host was made on 2026-09-18 in
Google AI Studio's speech playground with **Gemini 2.5 Flash Preview TTS**
(`gemini-2.5-flash-preview-tts`), which generated for free with no API key; the
3.1 preview model refused with a 403 until billing is topped up. Use the same
direction word for word and new lines sound like the same man at the same desk.

- **Voice:** Algenib (gravelly, lower pitch).
- **Audio Profile:** "Overnight radio host on a small port-city station, 3 a.m.
  Unhurried, low and warm with a dry edge. Talks to people working nights like
  he knows them. Never shouts, never hypes."
- **Scene:** "A small radio booth at the base of a broadcast tower in a port
  city, 3 a.m. The overnight host is unhurried, low and warm with a dry edge,
  talking to people working nights and driving empty streets."
- **Pace** left at its default; no expressive tags (whether this model reads
  `[chuckles]` as a direction or says the word was never tested).
- **Output:** WAV, mono, 24 kHz, 16-bit, 4 to 8 seconds a line. Name it
  `kald-<what>.wav`, with `id` in the name for an ident.

On air now: the tower ident ("Broadcasting from the tower, all night"), "Still
up? So are we", "The night shift's station", the crane crews at the docks, the
cleaners up on twelve in Alder Center, dry roads and orange lamps, Harbor Way
busy tonight ("careful on the Climb"), somebody working up a list of ten names,
and "More music, less talking".

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
