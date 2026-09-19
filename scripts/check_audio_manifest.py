#!/usr/bin/env python3
"""Check Assets/audio/manifest.json against what is actually on disk.

The runtime reads clip paths straight out of the manifest, so a reference with no file
behind it is a 404 per shot in the live sim, and a clip with no reference is dead weight
nobody plays. Neither shows up in a diff review.

Some categories are declared but not yet recorded - grenades, aircraft, tank cannon and
impacts. Those live in .manifest-placeholders.txt so they are an explicit, reviewable list
rather than a number someone has to remember. Dropping a file in means deleting its line;
this check insists on that, so the list cannot rot into a blanket excuse.
"""

import json
import os
import sys

ROOT = 'Assets/audio'
PLACEHOLDERS = os.path.join(ROOT, '.manifest-placeholders.txt')
# Directories whose clips are wired up through the manifest. voices/ is validated by
# scripts/validate_voice_manifest.py instead, which understands the callout event map.
MANAGED = ('weapons', 'vehicles', 'ambience', 'grenades', 'aircraft')


def load_placeholders():
    if not os.path.isfile(PLACEHOLDERS):
        return set()
    with open(PLACEHOLDERS, encoding='utf-8') as fh:
        return {line.strip() for line in fh
                if line.strip() and not line.startswith('#')}


def main():
    manifest = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))
    referenced = {path
                  for groups in manifest['categories'].values()
                  for paths in groups.values()
                  for path in paths}
    placeholders = load_placeholders()
    errors = []

    for path in sorted(referenced):
        if path.startswith('/') or '..' in path.split('/'):
            errors.append(f'manifest path escapes the audio root: {path}')
            continue
        local = os.path.join(ROOT, path)
        if os.path.isfile(local):
            if os.path.getsize(local) == 0:
                errors.append(f'referenced clip is empty: {path}')
            elif path in placeholders:
                errors.append(f'{path} exists now - remove it from '
                              f'{os.path.basename(PLACEHOLDERS)}')
        elif path not in placeholders:
            errors.append(f'manifest references a missing clip: {path} '
                          f'(add the file, or declare it in '
                          f'{os.path.basename(PLACEHOLDERS)})')

    for path in sorted(placeholders - referenced):
        errors.append(f'{os.path.basename(PLACEHOLDERS)} lists {path}, '
                      f'which the manifest no longer references')

    on_disk = {os.path.relpath(os.path.join(base, name), ROOT)
               for folder in MANAGED
               for base, _, names in os.walk(os.path.join(ROOT, folder))
               for name in names if name.endswith('.mp3')}
    for path in sorted(on_disk - referenced):
        errors.append(f'clip is committed but no manifest entry plays it: {path}')

    if errors:
        print('Audio manifest check failed:', file=sys.stderr)
        for error in errors:
            print(f' - {error}', file=sys.stderr)
        return 1

    print(f'Audio manifest OK: {len(referenced - placeholders)} clips referenced and '
          f'present, {len(placeholders)} declared not-yet-recorded')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
