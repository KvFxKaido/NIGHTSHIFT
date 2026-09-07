// Writes public/assets/music/manifest.json from whatever audio sits beside it.
// A browser cannot list a served directory, so the manifest is how the game
// learns what the player dropped in. Neither the audio nor this manifest is
// committed; see public/assets/music/README.md.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = new Set(['.mp3', '.ogg', '.m4a', '.aac', '.flac', '.wav', '.opus']);
const VERSION = 1;
const folder = new URL('../public/assets/music/', import.meta.url);
const manifestPath = new URL('manifest.json', folder);

// Titles the player edited by hand survive a rescan; only the file list is
// authoritative here.
let existing = new Map();
try {
  const previous = JSON.parse(await readFile(fileURLToPath(manifestPath), 'utf8'));
  if (Array.isArray(previous?.tracks)) {
    existing = new Map(previous.tracks
      .filter(track => typeof track?.file === 'string')
      .map(track => [track.file, track.title]));
  }
} catch { /* no manifest yet, or unreadable: rebuild it from scratch */ }

// Runs as part of `pnpm dev`, so a missing folder is normal, not a failure.
let entries = [];
try {
  entries = await readdir(fileURLToPath(folder), { withFileTypes: true });
} catch {
  console.log('Soundtrack: public/assets/music/ does not exist yet; nothing to scan.');
  process.exit(0);
}
const tracks = entries
  .filter(entry => entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b))
  .map(file => ({ file, title: existing.get(file) ?? file.replace(/\.[^.]+$/, '') }));

await writeFile(fileURLToPath(manifestPath), `${JSON.stringify({ version: VERSION, tracks }, null, 2)}\n`);
console.log(tracks.length
  ? `Soundtrack: ${tracks.length} track${tracks.length === 1 ? '' : 's'}\n${tracks.map(t => `  ${t.title}`).join('\n')}`
  : 'Soundtrack: no audio files found in public/assets/music/. Drop some in and rerun.');
