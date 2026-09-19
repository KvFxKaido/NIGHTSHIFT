# Menu theme

The theme plays from the beginning after **Press to start**, carries across the
main menu and its pages, and fades out on entering a drive. Pause, results, and
the garage visited from the street keep the radio. Returning to the main menu
resumes the theme where it left off; reloading gives it its full opening again.
Master and Music volume affect both theme and radio.

For your personal theme, put `FWU.mp3` here and create `theme.local.json`:

```json
{
  "file": "FWU.mp3",
  "title": "Don Toliver - FWU",
  "volume": 0.8,
  "start": 0,
  "loopStart": null,
  "loopEnd": null
}
```

Reload the game. No music scan is needed. To swap songs, drop the new file here
and change `file` (a filename, not a path) and `title`. Browser-supported audio
such as MP3, OGG, or WAV works. The local config and audio are ignored by Git.
Vite copies public files into builds, so remove personal audio and the local
config before making a build for distribution.

Times are seconds. `start: 0` preserves the whole intro. With null loop values,
the entire song repeats. Set `loopStart` to skip the intro on subsequent loops;
optionally set `loopEnd` to turn round before the track ends. Keep loopEnd later
than both start and loopStart. Out-of-range starting positions fall back to the
beginning.

The loop is the audio buffer's own (2026-09-19), so it comes round without a
seam: no seek, nothing lost at the turn. It was a media element seeking itself
back, which cost about 20 ms of silence each time; a sixteenth note at 152 BPM
is 98 ms, so it was audible. WAV and OGG loop where the numbers say. MP3 is the
exception: the encoder pads the start, so a decoded MP3 sits a few milliseconds
late and a bar-exact loop drifts against the beat.

For a bar-exact loop, render from the bar line at the project's tempo and work
the seconds out from the tempo: one bar in 4/4 is `4 * 60 / BPM` seconds, so at
152 BPM a bar is 1.5789 s and a four-bar intro puts `loopStart` at 6.3158.
Mind the reverb and delay tails at the render's end; the usual trick is to
render two passes of the loop and fold the tail back onto the start.

`theme.local.json` overrides the tracked `theme.json`. An explicit `file: null`
disables the theme. The tracked default is silent; missing or unreadable audio
never blocks the menus. A future bundled theme can use the tracked config.
Scene preview URLs (`?scene=...`) skip the start screen; normal launches show it.
