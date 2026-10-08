"""Read Midnight Club: Los Angeles's RPF3 archives, from the 360 disc image.

    python design/reference/midnight-club/rpf3.py list <disc.iso|archive.rpf> <keyfile> [names.txt]

Bring your own disc: this reads your own copy, and nothing it reads belongs in
this repository. mcla_gamedata.py uses it to derive the tables in gamedata/.

The archive's table of contents is AES-256 encrypted with a key the game
carries in its executable. The key is not here, only its SHA-1 (KEY_SHA1): pass
a file holding the 32 bytes, raw or as hex. CodeX.Games.MCLA publishes it
(RPF3/Rpf3Crypto.cs); it can also be read out of the decrypted default.xex.

Format (MCLA Complete Edition, USA disc, 2026-10-07; the layout follows
CodeX.Games.MCLA's reader):

- The disc is XDVDFS: the volume descriptor "MICROSOFT*XBOX*MEDIA" sits 0x10000
  into the game partition, and directories are binary trees of entries.
- RPF3 header: "RPF3", then little-endian u32 TOC size, entry count, unused,
  encryption flag. The TOC starts at 0x800 and, when the flag is set, is
  AES-256-ECB decrypted sixteen times over its whole 16-byte blocks.
- Each entry is 16 bytes. A folder: name hash, flags, first child index
  (top bit set), child count. A file: name hash, size, offset, flags; flags
  with both top bits set mark a resource (not read here), bit 30 a
  raw-deflate file whose packed size is the flags without that bit.
- Names are not stored, only the Jenkins one-at-a-time hash of each bare,
  lower-case name. names.txt (one name a line) resolves them; anything else is
  0x<hash>. Callers walking a known path need no list (Archive.find).
"""

import hashlib
import struct
import sys
import zlib

KEY_SHA1 = "599fa713e05085d9b884949139ba1f95ba2071a7"
PARTITIONS = (0, 0xFD90000, 0x2080000, 0x18300000)


def joaat(name):
    h = 0
    for c in name.lower().encode("latin-1"):
        h = (h + c) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF
    h ^= h >> 11
    return (h + (h << 15)) & 0xFFFFFFFF


def read_key(path):
    with open(path, "rb") as f:
        raw = f.read().strip()
    key = raw if len(raw) == 32 else bytes.fromhex(raw.decode("ascii"))
    if hashlib.sha1(key).hexdigest() != KEY_SHA1:
        raise ValueError(f"{path}: not the MCLA RPF3 key (SHA-1 mismatch)")
    return key


def disc_files(f):
    """{path: (offset, size)} for every file on an XDVDFS disc image."""
    for base in PARTITIONS:
        f.seek(base + 0x10000)
        if f.read(20) == b"MICROSOFT*XBOX*MEDIA":
            root, root_size = struct.unpack("<II", f.read(8))
            break
    else:
        raise ValueError("not an Xbox 360 disc image")
    files = {}

    def directory(sector, size, prefix):
        f.seek(base + sector * 2048)
        data = f.read(size)
        stack = [0]
        while stack:
            at = stack.pop() * 4
            if at >= len(data):
                continue
            left, right, start, length, attributes, name_length = struct.unpack_from("<HHIIBB", data, at)
            if left == 0xFFFF:
                continue
            name = data[at + 14:at + 14 + name_length].decode("latin-1")
            if attributes & 0x10:
                directory(start, length, prefix + name + "/")
            else:
                files[prefix + name] = (base + start * 2048, length)
            stack += [n for n in (left, right) if n]

    directory(root, root_size, "")
    return files


class Archive:
    def __init__(self, path, key, member="xarchive_cache.rpf"):
        self.file = open(path, "rb")
        self.base = 0
        if self.file.read(4) != b"RPF3":
            self.base = disc_files(self.file)[member][0]
        self.file.seek(self.base)
        magic, toc_size, count, _, encrypted = struct.unpack("<4sIIIi", self.file.read(20))
        if magic != b"RPF3":
            raise ValueError(f"{path}: no RPF3 archive")
        self.file.seek(self.base + 0x800)
        toc = self.file.read(toc_size)
        if encrypted:
            toc = decrypt(key, toc)
        self.entries = [struct.unpack_from("<IiII", toc, 16 * i) for i in range(count)]

    def children(self, index=0):
        """{name hash: entry index} under a folder."""
        _, _, first, count = self.entries[index]
        first &= 0x7FFFFFFF
        return {self.entries[i][0]: i for i in range(first, first + (count & 0x0FFFFFFF))}

    def is_folder(self, index):
        return index == 0 or (self.entries[index][2] & 0x80000000 and self.entries[index][1] == 0)

    def find(self, path):
        index = 0
        for part in path.strip("/").split("/"):
            index = self.children(index)[joaat(part)]
        return index

    def files(self, index=0, names=None, prefix=""):
        """(path, entry index) for every file under a folder, names resolved where known."""
        for h, child in self.children(index).items():
            name = (names or {}).get(h, f"0x{h:08x}")
            if self.is_folder(child):
                yield from self.files(child, names, prefix + name + "/")
            else:
                yield prefix + name, child

    def read(self, index):
        _, size, offset, flags = self.entries[index]
        if flags & 0xC0000000 == 0xC0000000:
            raise ValueError("resource entries are not read")
        packed = flags & 0xBFFFFFFF
        compressed = bool(flags & 0x40000000)
        self.file.seek(self.base + (offset & 0x7FFFFFFF))
        data = self.file.read(packed if compressed else size)
        data = zlib.decompress(data, -15) if compressed else data
        if len(data) != size:
            raise ValueError(f"entry {index}: {len(data)} bytes, directory says {size}")
        return data


def decrypt(key, data):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    whole = len(data) & ~15
    for _ in range(16):
        data = Cipher(algorithms.AES(key), modes.ECB()).decryptor().update(data[:whole]) + data[whole:]
    return data


def main(args):
    if len(args) in (3, 4) and args[0] == "list":
        names = {}
        if len(args) == 4:
            for line in open(args[3], encoding="utf-8", errors="replace"):
                names.setdefault(joaat(line.strip()), line.strip())
        archive = Archive(args[1], read_key(args[2]))
        for path, index in archive.files(names=names):
            print(f"{archive.entries[index][1]}\t{path}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
