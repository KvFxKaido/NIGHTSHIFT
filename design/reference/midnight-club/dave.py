"""Read the "Dave" archives on the Midnight Club 3 disc (ASSETS.DAT and friends).

    python design/reference/midnight-club/dave.py list <ASSETS.DAT>
    python design/reference/midnight-club/dave.py extract <ASSETS.DAT> <out-dir> [prefix]

Bring your own disc: this reads a file you extracted from your own copy, and
nothing it extracts belongs in this repository. mc3_gamedata.py uses it to derive
the tables in gamedata/ straight from the archive, without extracting anything.

Format (worked out on the MC3 DUB Edition Remix USA disc, 2026-10-07; every
entry's name decodes and every decompressed size matches the directory):

- Header: "Dave", then little-endian u32 entry count, directory size, names size.
- Directory at 0x800: 16 bytes per entry, u32 name offset, data offset, size,
  compressed size. Size 0 is a folder (name ends in /) or an empty file; both
  are skipped. Entries are sorted by full path.
- Names follow the directory: 6-bit codes packed four to three bytes, low bits
  first, over CHARSET; code 0 ends a name. A code of 56 or more copies a prefix
  of the previous entry's name: length ((next code - 32) << 3) | (code - 56).
  Every 32nd name is written out in full.
- Data is raw deflate when the compressed size is below the size, else stored.
"""

import struct
import sys
import zlib
from pathlib import Path

MAGIC = b"Dave"
DIRECTORY = 0x800
CHARSET = "\0 #$()-./?0123456789_abcdefghijklmnopqrstuvwxyz~"


class Archive:
    def __init__(self, path):
        self.file = open(path, "rb")
        magic, count, dir_size, names_size = struct.unpack("<4s3I", self.file.read(16))
        if magic != MAGIC:
            raise ValueError(f"{path}: not a Dave archive ({magic!r})")
        self.file.seek(DIRECTORY)
        directory = self.file.read(dir_size)
        names = self.file.read(names_size)
        rows = [struct.unpack_from("<4I", directory, 16 * i) for i in range(count)]
        self.entries = {}  # path -> (offset, size, compressed size), files only
        previous = ""
        for name_offset, offset, size, packed in rows:
            name = decode_name(names, name_offset, previous)
            if size:
                self.entries[name] = (offset, size, packed)
            previous = name

    def read(self, path):
        offset, size, packed = self.entries[path]
        self.file.seek(offset)
        data = self.file.read(packed)
        if packed < size:
            data = zlib.decompress(data, -15)
        if len(data) != size:
            raise ValueError(f"{path}: {len(data)} bytes, directory says {size}")
        return data

    def text(self, path):
        return self.read(path).decode("cp1252")


def decode_name(names, offset, previous):
    codes = []
    while not codes or codes[-1]:
        word = int.from_bytes(names[offset:offset + 3], "little")
        codes += [(word >> (6 * k)) & 63 for k in range(4)]
        offset += 3
    codes = codes[:codes.index(0)]
    name, i = "", 0
    while i < len(codes):
        if codes[i] >= 56:
            length = ((codes[i + 1] - 32) << 3) | (codes[i] - 56)
            if length > len(previous):
                raise ValueError(f"prefix of {length} from {previous!r}")
            name += previous[:length]
            i += 2
        else:
            name += CHARSET[codes[i]]
            i += 1
    return name


def main(args):
    if len(args) >= 2 and args[0] == "list":
        archive = Archive(args[1])
        for path, (_, size, _) in archive.entries.items():
            print(f"{size}\t{path}")
    elif len(args) in (3, 4) and args[0] == "extract":
        archive = Archive(args[1])
        prefix = args[3] if len(args) == 4 else ""
        out = Path(args[2])
        count = 0
        for path in archive.entries:
            if path.startswith(prefix):
                target = out.joinpath(*path.split("/"))
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(path))
                count += 1
        print(f"{count} files")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
