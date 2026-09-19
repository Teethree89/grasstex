#!/usr/bin/env python3
"""Pull individual members out of the Sonniss GDC bundle zips over HTTP range requests.

The GDC bundles are distributed as 3-4 GB zip parts. Every part is a standalone zip
(its own central directory, License.pdf and Readme.txt), and both sonniss.com and the
archive.org mirror honour byte ranges. A zip keeps its index at the end of the file, so
reading the last megabyte gives the full member list, and each member can then be pulled
by its own byte range. That turns "download 90 GB to get 500 MB of gunshots" into a few
hundred megabytes of targeted reads.

  index   list the members of a part
  fetch   extract the members whose path matches a pattern
  scan    index several parts at once and report the matches per part

Ranges are issued through curl so the session proxy and CA bundle are picked up.
"""

import argparse
import os
import re
import struct
import subprocess
import sys
import zlib

ARCHIVE = 'https://archive.org/download/sonniss.com-gdc-game-audio-bundles'

# Parts of each year's bundle that actually carry World War II weapon packs, found by
# indexing every part once. Kept here so a re-run does not have to rediscover them.
WW2_PARTS = {
    '2016': [2, 4],
    '2019': [1, 2, 3, 4, 5, 6, 7, 8],
    '2020': [4, 6, 7, 8, 9, 13],
}

WW2_PATTERNS = [
    # Pole Position's World War II firearm series (GDC 2020)
    'mg 42', 'mp 40', 'karabiner 98', 'mosin-nagant', 'springfield 1903',
    'thompson 1928', 'ppsh-41', 'tt-33', 'walther p38', 'm1911a1',
    # Pole Position / Super Thump / FLYSOUND, spread over 2016 and 2020
    'm1918 browning', 'm1919a4', 'm1928a1', 'm3 submachine', 'grease gun',
    'weapons of world war', 'various gun foley', 'mosin nagant',
    't-34-85', 'world war ii tank',
]


_NAME_CACHE = {}


def part_names(year):
    """Resolve the real zip filenames for a year - the naming is inconsistent
    across bundles ("Part 1of8" in 2019, "Part1of14" in 2020), so ask the mirror
    rather than guessing."""
    if not _NAME_CACHE:
        import json
        meta = json.loads(curl('https://archive.org/metadata/'
                               'sonniss.com-gdc-game-audio-bundles'))
        for entry in meta.get('files', []):
            name = entry['name']
            if not name.lower().endswith('.zip'):
                continue
            m = re.search(r'GDC\s*(\d{4})?', name)
            y = m.group(1) if m and m.group(1) else '2015'
            n = re.search(r'(\d+)of(\d+)', name.replace(' ', ''))
            if n:
                _NAME_CACHE.setdefault(y, {})[int(n.group(1))] = name
    return _NAME_CACHE.get(year, {})


def part_url(year, part, total=None):
    from urllib.parse import quote
    name = part_names(year).get(part)
    if not name:
        raise RuntimeError(f'no part {part} in the {year} bundle')
    return f'{ARCHIVE}/{quote(name)}'


def curl(url, start=None, end=None, retries=4):
    cmd = ['curl', '-sSL', '--max-time', '900', '--retry', '3', '--retry-delay', '2']
    if start is not None:
        cmd += ['-H', f'Range: bytes={start}-{end}']
    cmd.append(url)
    for attempt in range(retries):
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode == 0 and res.stdout:
            return res.stdout
        if attempt < retries - 1:
            import time
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f'range read failed: {url} [{start}-{end}]')


def content_length(url):
    out = subprocess.run(['curl', '-sSLI', '--max-time', '120', url],
                         capture_output=True, text=True).stdout
    length = None
    for line in out.splitlines():
        if line.lower().startswith('content-length:'):
            length = int(line.split(':', 1)[1].strip())
    if length is None:
        raise RuntimeError(f'no content-length for {url}')
    return length


def central_directory(url):
    """Read the zip's central directory without downloading the archive."""
    total = content_length(url)
    tail = curl(url, max(0, total - 1_000_000), total - 1)

    eocd = tail.rfind(b'PK\x05\x06')
    if eocd < 0:
        raise RuntimeError('no end-of-central-directory record found')
    cd_size, cd_offset = struct.unpack('<II', tail[eocd + 12:eocd + 20])

    zip64 = tail.rfind(b'PK\x06\x06')
    if zip64 >= 0:  # >4 GB archive, the real values live in the zip64 record
        cd_size, cd_offset = struct.unpack('<QQ', tail[zip64 + 40:zip64 + 56])

    return curl(url, cd_offset, cd_offset + cd_size - 1), total


def members(cd):
    """Yield (name, compress_method, compressed_size, size, local_header_offset)."""
    pos = 0
    while pos < len(cd) and cd[pos:pos + 4] == b'PK\x01\x02':
        method, = struct.unpack('<H', cd[pos + 10:pos + 12])
        csize, usize = struct.unpack('<II', cd[pos + 20:pos + 28])
        name_len, extra_len, comment_len = struct.unpack('<HHH', cd[pos + 28:pos + 34])
        header_offset, = struct.unpack('<I', cd[pos + 42:pos + 46])
        name = cd[pos + 46:pos + 46 + name_len].decode('utf-8', 'replace')
        extra = cd[pos + 46 + name_len:pos + 46 + name_len + extra_len]

        if 0xFFFFFFFF in (csize, usize, header_offset):
            q = 0
            while q + 4 <= len(extra):
                field_id, field_size = struct.unpack('<HH', extra[q:q + 4])
                body, k = extra[q + 4:q + 4 + field_size], 0
                if field_id == 1:
                    if usize == 0xFFFFFFFF:
                        usize, = struct.unpack('<Q', body[k:k + 8]); k += 8
                    if csize == 0xFFFFFFFF:
                        csize, = struct.unpack('<Q', body[k:k + 8]); k += 8
                    if header_offset == 0xFFFFFFFF:
                        header_offset, = struct.unpack('<Q', body[k:k + 8]); k += 8
                q += 4 + field_size

        yield name, method, csize, usize, header_offset
        pos += 46 + name_len + extra_len + comment_len


def extract(url, method, csize, header_offset):
    """Pull one member: its local header tells us where the payload really starts."""
    head = curl(url, header_offset, header_offset + 29)
    name_len, extra_len = struct.unpack('<HH', head[26:30])
    data_at = header_offset + 30 + name_len + extra_len
    raw = curl(url, data_at, data_at + csize - 1)
    if method == 0:
        return raw
    return zlib.decompressobj(-zlib.MAX_WBITS).decompress(raw)


def matches(name, patterns):
    low = name.lower()
    return any(p.lower() in low for p in patterns)


def cmd_index(args):
    cd, total = central_directory(args.url)
    entries = list(members(cd))
    print(f'{total / 1e9:.2f} GB, {len(entries)} members')
    for name, _, csize, usize, _ in entries:
        if not args.pattern or matches(name, args.pattern):
            print(f'  {usize / 1e6:9.2f} MB  ({csize / 1e6:.2f} MB on the wire)  {name}')


def cmd_scan(args):
    parts = args.parts or WW2_PARTS.get(args.year) or sorted(part_names(args.year))
    patterns = args.pattern or WW2_PATTERNS
    for part in parts:
        url = part_url(args.year, part)
        try:
            cd, _ = central_directory(url)
        except Exception as exc:               # a mirror hiccup on one part
            print(f'part {part}: {exc}', file=sys.stderr)
            continue
        hits = [(n, u) for n, _, _, u, _ in members(cd) if u and matches(n, patterns)]
        print(f'--- {args.year} part {part}: {len(hits)} matching files')
        for name, usize in sorted(hits):
            print(f'  {usize / 1e6:9.2f} MB  {name}')


def cmd_fetch(args):
    patterns = args.pattern or WW2_PATTERNS
    parts = args.parts or WW2_PARTS.get(args.year) or sorted(part_names(args.year))
    os.makedirs(args.out, exist_ok=True)
    grabbed = bytes_read = 0

    for part in parts:
        url = part_url(args.year, part)
        cd, _ = central_directory(url)
        wanted = [m for m in members(cd) if m[3] and matches(m[0], patterns)]
        if not wanted:
            continue
        print(f'--- {args.year} part {part}: {len(wanted)} files')
        for name, method, csize, usize, offset in wanted:
            safe = re.sub(r'[^A-Za-z0-9._-]+', '_', name.replace('/', '__')).strip('_')
            dest = os.path.join(args.out, f'{args.year}-p{part}-{safe}')
            if os.path.exists(dest) and os.path.getsize(dest) == usize:
                print(f'    have {os.path.basename(dest)}')
                continue
            print(f'    {usize / 1e6:8.2f} MB  {name}')
            with open(dest, 'wb') as fh:
                fh.write(extract(url, method, csize, offset))
            grabbed += 1
            bytes_read += csize

    print(f'\n{grabbed} files, {bytes_read / 1e6:.0f} MB transferred into {args.out}')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('index', help='list one zip part')
    p.add_argument('url')
    p.add_argument('pattern', nargs='*')
    p.set_defaults(func=cmd_index)

    p = sub.add_parser('scan', help='index several parts of one year')
    p.add_argument('year')
    p.add_argument('--parts', type=int, nargs='*')
    p.add_argument('--pattern', nargs='*')
    p.set_defaults(func=cmd_scan)

    p = sub.add_parser('fetch', help='extract matching members')
    p.add_argument('year')
    p.add_argument('--parts', type=int, nargs='*')
    p.add_argument('--pattern', nargs='*')
    p.add_argument('--out', default='.runtime/sonniss-ww2')
    p.set_defaults(func=cmd_fetch)

    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
