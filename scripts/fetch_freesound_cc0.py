#!/usr/bin/env python3
"""Fetch public-domain (CC0) sounds from Freesound by id.

Nine years of Sonniss GDC bundles contain no M1 Garand - the one weapon the sim's rifle
stats are actually named after - so it comes from Freesound instead.

Downloading the original file needs an OAuth token, but the site serves a high-quality MP3
preview openly, which is ample for a one-shot that ships at 128 kbps mono anyway.

Every sound is checked for a CC0 dedication before anything is written, and the check is a
refusal rather than a warning: CC-BY needs attribution this repo would have to carry, and
CC-BY-NC could not ship at all. Titles, authors and licence URLs are recorded alongside the
audio so provenance survives the download.
"""

import argparse
import json
import os
import re
import subprocess
import sys

CC0 = 'creativecommons.org/publicdomain/zero'
PAGE = 'https://freesound.org/s/{id}/'


def curl(url, binary=False, retries=4):
    for attempt in range(retries):
        res = subprocess.run(['curl', '-sSL', '--max-time', '180', url], capture_output=True)
        if res.returncode == 0 and res.stdout:
            return res.stdout if binary else res.stdout.decode('utf-8', 'replace')
        if attempt < retries - 1:
            import time
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError(f'fetch failed: {url}')


def describe(sound_id):
    html = curl(PAGE.format(id=sound_id))

    licences = re.findall(r'creativecommons\.org/[a-z/0-9.-]+', html)
    if not licences:
        raise RuntimeError(f'{sound_id}: no licence found on the page')
    licence = licences[0]
    if CC0 not in licence:
        raise RuntimeError(f'{sound_id}: licence is {licence}, not CC0 - refusing')

    title = re.search(r'<title>\s*Freesound\s*-\s*(.*?)\s*by\s*(\S+?)\s*</title>', html, re.S)
    preview = re.search(r'https://cdn\.freesound\.org/previews/[^"\']+-hq\.mp3', html)
    if not preview:
        raise RuntimeError(f'{sound_id}: no high-quality preview available')

    return {
        'id': str(sound_id),
        'title': title.group(1).strip() if title else f'freesound {sound_id}',
        'author': title.group(2).strip() if title else 'unknown',
        'licence': 'CC0 1.0',
        'licence_url': f'https://{licence}',
        'page': PAGE.format(id=sound_id),
        'preview': preview.group(0),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ids', nargs='+', help='Freesound sound ids')
    ap.add_argument('--out', default='.runtime/freesound-cc0')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    credits, failed = [], []

    for sound_id in args.ids:
        try:
            info = describe(sound_id)
        except RuntimeError as exc:
            print(f'  !! {exc}', file=sys.stderr)
            failed.append(str(sound_id))
            continue
        dest = os.path.join(args.out, f'{info["id"]}.mp3')
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            with open(dest, 'wb') as fh:
                fh.write(curl(info['preview'], binary=True))
        size = os.path.getsize(dest)
        print(f'  {info["id"]:>8}  {size / 1000:7.1f} kB  CC0  {info["title"]} ({info["author"]})')
        credits.append(info)

    path = os.path.join(args.out, 'credits.json')
    json.dump(credits, open(path, 'w'), indent=2, ensure_ascii=False)
    print(f'\n{len(credits)} sound(s) in {args.out}; provenance in {path}')
    if failed:
        print(f'refused or unavailable: {", ".join(failed)}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
