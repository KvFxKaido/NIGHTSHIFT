// A track's title and artist from its own tags, so the soundtrack names a song
// the way the player's music player does rather than by whatever the file is
// called. ID3v2.2-2.4, with ID3v1 as the fallback; other formats keep their
// filename. Runs on every `pnpm dev`, so it reads the tag and nothing else.
import { open } from 'node:fs/promises';

const TITLE = new Set(['TIT2', 'TT2']);
const ARTIST = new Set(['TPE1', 'TP1']);

const syncsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];

/** Undo ID3 unsynchronisation: every 0xFF 0x00 in the tag was a bare 0xFF. */
function resync(b) {
  const out = Buffer.alloc(b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    out[n++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, n);
}

function utf16(data, bigEndian) {
  const even = Buffer.from(data.subarray(0, data.length & ~1));
  return (bigEndian ? even.swap16() : even).toString('utf16le');
}

/** A text frame's value. Several values (ID3v2.4 separates them with NUL) are joined. */
function frameText(body) {
  const encoding = body[0], data = body.subarray(1);
  let text;
  if (encoding === 1) text = utf16(data, data[0] === 0xfe && data[1] === 0xff);
  else if (encoding === 2) text = utf16(data, true);
  else text = data.toString(encoding === 3 ? 'utf8' : 'latin1');
  return text.split('\0').map(part => part.replace(/[﻿￾]/g, '').trim()).filter(Boolean).join(', ');
}

/** Title and artist from an ID3v2 tag at the start of `b`; {} if there is none. */
export function parseId3v2(b) {
  if (b.length < 10 || b.toString('latin1', 0, 3) !== 'ID3') return {};
  const version = b[3], flags = b[5];
  if (version < 2 || version > 4 || (version === 2 && flags & 0x40)) return {};   // v2.2 compression: unreadable
  let body = b.subarray(10, 10 + syncsafe(b, 6));
  // v2.2 and v2.3 unsynchronise the whole tag; v2.4 marks it on each frame.
  if (flags & 0x80 && version < 4) body = resync(body);
  let p = 0;
  if (flags & 0x40 && version === 3) p = 4 + body.readUInt32BE(0);
  if (flags & 0x40 && version === 4) p = syncsafe(body, 0);
  const idLength = version === 2 ? 3 : 4, headerLength = version === 2 ? 6 : 10;
  const tags = {};
  while (p + headerLength <= body.length && !(tags.title && tags.artist)) {
    const id = body.toString('latin1', p, p + idLength);
    if (!/^[A-Z0-9]+$/.test(id)) break;   // padding
    const size = version === 2 ? body.readUIntBE(p + 3, 3) : version === 4 ? syncsafe(body, p + 4) : body.readUInt32BE(p + 4);
    let data = body.subarray(p + headerLength, p + headerLength + size);
    p += headerLength + size;
    if (!TITLE.has(id) && !ARTIST.has(id)) continue;
    const format = version === 2 ? 0 : body[p - size - 1];
    if (version === 3) {
      if (format & 0xc0) continue;              // compressed or encrypted
      if (format & 0x20) data = data.subarray(1);   // group id
    }
    if (version === 4) {
      if (format & 0x0c) continue;              // compressed or encrypted
      if (format & 0x40) data = data.subarray(1);   // group id
      if (format & 0x02 || flags & 0x80) data = resync(data.subarray(format & 0x01 ? 4 : 0));
      else if (format & 0x01) data = data.subarray(4);   // data length indicator
    }
    const text = data.length > 1 ? frameText(data) : '';
    if (text) tags[TITLE.has(id) ? 'title' : 'artist'] = text;
  }
  return tags;
}

/** Title and artist from an ID3v1 tag, the last 128 bytes of the file. */
export function parseId3v1(b) {
  if (b.length !== 128 || b.toString('latin1', 0, 3) !== 'TAG') return {};
  const field = (from, to) => b.toString('latin1', from, to).replace(/\0.*$/s, '').trim();
  const tags = {}, title = field(3, 33), artist = field(33, 63);
  if (title) tags.title = title;
  if (artist) tags.artist = artist;
  return tags;
}

/** Reads only the tags: the ID3v2 tag at the front and, for mp3, the ID3v1 at the end. */
export async function readTrackTags(path) {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const head = Buffer.alloc(Math.min(10, size));
    await file.read(head, 0, head.length, 0);
    let tags = {};
    if (head.length === 10 && head.toString('latin1', 0, 3) === 'ID3') {
      const tag = Buffer.alloc(Math.min(size, 10 + syncsafe(head, 6)));
      await file.read(tag, 0, tag.length, 0);
      tags = parseId3v2(tag);
    }
    if ((!tags.title || !tags.artist) && /\.mp3$/i.test(path) && size >= 128) {
      const tail = Buffer.alloc(128);
      await file.read(tail, 0, 128, size - 128);
      tags = { ...parseId3v1(tail), ...tags };
    }
    return tags;
  } catch {
    return {};   // an unreadable tag is a filename title, not a failed scan
  } finally {
    await file.close();
  }
}

/** "Artist - Title" from the tags where they have both, as the filenames used to
 *  say; whatever they do have otherwise; the filename when they have nothing. */
export function scannedTitle(file, tags = {}) {
  const name = file.replace(/\.[^.]+$/, '');
  if (tags.title && tags.artist) return `${tags.artist} - ${tags.title}`;
  if (tags.title) return tags.title;
  if (tags.artist) return name.startsWith(`${tags.artist} - `) ? name : `${tags.artist} - ${name}`;
  return name;
}

/**
 * The title a player typed into the manifest, which a rescan keeps; null when
 * the entry holds only what a scan wrote. Each entry records the title the scan
 * gave it (`scanned`), so an edit is any title that differs from that. A
 * manifest from before tags were read has no `scanned`: its titles were the
 * filenames, so there an edit is any title that is not the filename.
 */
export function editedTitle(entry, file) {
  if (typeof entry?.title !== 'string') return null;
  const scanned = typeof entry.scanned === 'string' ? entry.scanned : file.replace(/\.[^.]+$/, '');
  return entry.title !== scanned ? entry.title : null;
}
