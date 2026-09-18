// Writes public/assets/music/manifest.json from whatever audio sits beside it.
// A browser cannot list a served directory, so the manifest is how the game
// learns what the player dropped in. Neither the audio nor this manifest is
// committed; see public/assets/music/README.md.
//
// `node scripts/scan-music.mjs [folder]` scans another folder, which is how the
// tests run it without touching anyone's music.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editedTitle, readTrackTags, scannedTitle } from './music-tags.mjs';

const EXTENSIONS = new Set(['.mp3', '.ogg', '.m4a', '.aac', '.flac', '.wav', '.opus']);
const VERSION = 1;
const folder = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../public/assets/music/', import.meta.url));
const manifestPath = join(folder, 'manifest.json');

// Titles the player edited by hand survive a rescan; only the file list and
// the tags are authoritative here.
let existing = new Map();
try {
  const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (Array.isArray(previous?.tracks)) {
    existing = new Map(previous.tracks
      .filter(track => typeof track?.file === 'string')
      .map(track => [track.file, track]));
  }
} catch { /* no manifest yet, or unreadable: rebuild it from scratch */ }

// Runs as part of `pnpm dev`, so a missing folder is normal, not a failure.
let entries = [];
try {
  entries = await readdir(folder, { withFileTypes: true });
} catch {
  console.log(`Soundtrack: ${folder} does not exist yet; nothing to scan.`);
  process.exit(0);
}
const files = entries
  .filter(entry => entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b));
const tracks = [];
for (const file of files) {
  // Named from the file's own tags, "Artist - Title", or its filename without them.
  const scanned = scannedTitle(file, await readTrackTags(join(folder, file)));
  tracks.push({ file, title: editedTitle(existing.get(file), file) ?? scanned, scanned });
}

// Spoken clips for between songs live in dj/ beside the music, so they never
// shuffle in as songs. A name with an `id` word in it is a station ident.
let dj = [];
try {
  dj = (await readdir(join(folder, 'dj'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map(file => ({ file }));
} catch { /* no dj folder: the soundtrack plays songs back to back */ }

await writeFile(manifestPath, `${JSON.stringify({ version: VERSION, tracks, dj }, null, 2)}\n`);
// The one thing a filename can do that no URL encoding gets past the dev server.
const unservable = [...files, ...dj.map(clip => `dj/${clip.file}`)].filter(file => /[#?]/.test(file));
if (unservable.length) {
  console.log(`Soundtrack: the dev server cannot serve a # or ? in a filename; rename these or they will be skipped:\n${unservable.map(file => `  ${file}`).join('\n')}`);
}
const dropped = [...existing.keys()].filter(file => !files.includes(file)).length;
console.log(tracks.length
  ? `Soundtrack: ${tracks.length} track${tracks.length === 1 ? '' : 's'}${dj.length ? `, ${dj.length} DJ clip${dj.length === 1 ? '' : 's'}` : ''}${dropped ? ` (${dropped} no longer in the folder, dropped)` : ''}\n${tracks.map(t => `  ${t.title}`).join('\n')}`
  : 'Soundtrack: no audio files found in the music folder. Drop some in and rerun.');
