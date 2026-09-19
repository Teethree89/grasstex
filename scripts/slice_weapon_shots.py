#!/usr/bin/env python3
"""Cut individual shots out of long field recordings and encode them as game assets.

The Sonniss WW2 weapon packs ship one long take per weapon - a minute of range work
holding a handful of shots, with the mic left running between them. The battle sim wants
short one-shot files it can pool and round-robin, so this finds each report by its
transient, trims to just before the crack, lets the tail decay naturally, and writes mono
48 kHz MP3s named for the weapon.

Loudness is deliberately left alone here: `scripts/normalize_audio.sh` owns the mastering
targets in Assets/audio/MASTERING.md and runs over the tree afterwards.
"""

import argparse
import json
import os
import subprocess
import sys

try:
    import numpy as np
except ImportError:  # --check-only validates a recipe and touches no audio
    np = None

SAMPLE_RATE = 48000


def decode(path):
    """Decode to mono float32 at the project sample rate."""
    if np is None:
        raise SystemExit('slicing audio needs numpy: pip install numpy')
    proc = subprocess.run(
        ['ffmpeg', '-nostdin', '-v', 'error', '-i', path,
         '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 'f32le', '-'],
        capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode()[:400])
    return np.frombuffer(proc.stdout, dtype='<f4')


def envelope(samples, window):
    """Peak envelope over non-overlapping windows."""
    usable = len(samples) - (len(samples) % window)
    frames = np.abs(samples[:usable]).reshape(-1, window)
    return frames.max(axis=1)


def find_shots(samples, min_gap_s, tail_drop_db, max_len_s):
    """Locate each report: a transient well above the noise floor, followed by its decay."""
    hop = SAMPLE_RATE // 200                       # 5 ms resolution
    env = envelope(samples, hop)
    if not len(env) or env.max() <= 0:
        return []

    floor = max(np.median(env), env.max() * 1e-4)  # room tone between shots
    # A shot is far above room tone - but on a file that is one shot and a long decaying
    # tail, the "room tone" median is the tail itself, and a purely floor-derived threshold
    # climbs above the peak and finds nothing. Cap it against the peak so that can't happen.
    onset = max(min(floor * 12, env.max() * 0.5), env.max() * 0.12)
    tail = max(floor * 2.5, env.max() * (10 ** (-tail_drop_db / 20.0)))

    min_gap = int(min_gap_s * 200)
    max_len = int(max_len_s * 200)
    shots, i = [], 0
    while i < len(env):
        if env[i] < onset:
            i += 1
            continue
        peak = i
        end = i
        quiet = 0
        while end < len(env) and end - peak < max_len:
            if env[end] > env[peak]:
                peak = end
            quiet = quiet + 1 if env[end] < tail else 0
            if quiet >= 30 and end - peak > 20:    # 150 ms below the tail threshold
                break
            end += 1
        start_sample = max(0, (i - 6) * hop)       # 30 ms of pre-roll before the crack
        end_sample = min(len(samples), (end + 4) * hop)
        shots.append((start_sample, end_sample, float(env[peak])))
        i = end + min_gap
    return shots


def write_mp3(samples, dest):
    peak = np.abs(samples).max()
    if peak > 0:
        samples = samples * (0.89 / peak)          # headroom for the mastering pass
    fade = min(int(0.012 * SAMPLE_RATE), len(samples) // 4)
    if fade > 0:
        samples[:fade] *= np.linspace(0, 1, fade)
        samples[-fade:] *= np.linspace(1, 0, fade)

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    proc = subprocess.run(
        ['ffmpeg', '-nostdin', '-v', 'error', '-y',
         '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', '-',
         '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '128k', dest],
        input=samples.astype('<f4').tobytes(), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode()[:400])


def cut_segments(source, dest_stem, segments, start_index=1):
    """Continuous material (engines, servos) has no transient to find, so take the
    windows an ear picked out of the level profile instead."""
    samples = decode(source)
    written = []
    for n, (start_s, end_s) in enumerate(segments, start=start_index):
        start, end = int(start_s * SAMPLE_RATE), int(end_s * SAMPLE_RATE)
        chunk = samples[start:min(end, len(samples))].copy()
        if not len(chunk):
            continue
        dest = f'{dest_stem}-{n:02d}.mp3'
        write_mp3(chunk, dest)
        written.append((dest, len(chunk) / SAMPLE_RATE))
        print(f'  {dest}  {len(chunk) / SAMPLE_RATE:.2f}s')
    return written


def process(source, dest_stem, count, min_gap_s, tail_drop_db, max_len_s, min_len_s,
            start_index=1):
    samples = decode(source)
    shots = find_shots(samples, min_gap_s, tail_drop_db, max_len_s)
    shots = [s for s in shots if (s[1] - s[0]) / SAMPLE_RATE >= min_len_s]
    if not shots:
        print(f'  !! no shots detected in {os.path.basename(source)}', file=sys.stderr)
        return []

    # Loudest first: on a range take the cleanest shots are the ones that peak highest,
    # and the quiet ones are usually a neighbouring bay or a distant echo.
    shots.sort(key=lambda s: -s[2])
    written = []
    for n, (start, end, _) in enumerate(shots[:count], start=start_index):
        dest = f'{dest_stem}-{n:02d}.mp3'
        write_mp3(samples[start:end].copy(), dest)
        written.append((dest, (end - start) / SAMPLE_RATE))
        print(f'  {dest}  {(end - start) / SAMPLE_RATE:.2f}s')
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('recipe', help='JSON list of {source, dest, count, ...} entries')
    ap.add_argument('--src-dir', default='.runtime/sonniss-ww2')
    ap.add_argument('--out-dir', default='Assets/audio')
    ap.add_argument('--check-only', action='store_true',
                    help='validate the recipe and exit, without touching any audio')
    args = ap.parse_args()

    recipe = json.load(open(args.recipe))

    # Two entries writing the same file silently overwrite each other, and which one
    # survives depends on recipe order - a real bug this recipe already had once. Sharing a
    # stem is fine and intended (the Garand's two takes come from different recordists);
    # overlapping the numbering under one is not, so compare the index ranges.
    claimed = {}
    for item in recipe:
        first = item.get('startIndex', 1)
        span = len(item['segments']) if item.get('segments') else item.get('count', 3)
        for n in range(first, first + span):
            key = f'{item["dest"]}-{n:02d}.mp3'
            if key in claimed:
                raise SystemExit(f'{args.recipe}: {key} is written by both '
                                 f'{claimed[key]} and {item["source"]}')
            claimed[key] = item['source']

    if args.check_only:
        print(f'{args.recipe}: {len(recipe)} entries, {len(claimed)} distinct outputs, '
              f'no collisions')
        return

    total = []
    for item in recipe:
        source = os.path.join(args.src_dir, item['source'])
        if not os.path.exists(source):
            print(f'  !! missing {item["source"]}', file=sys.stderr)
            continue
        print(f'{item["dest"]}  <-  {item["source"]}')
        if item.get('segments'):
            total += cut_segments(source,
                                  os.path.join(args.out_dir, item['dest']),
                                  item['segments'],
                                  item.get('startIndex', 1))
            continue
        total += process(
            source,
            os.path.join(args.out_dir, item['dest']),
            item.get('count', 3),
            item.get('minGapSeconds', 0.35),
            item.get('tailDropDb', 34.0),
            item.get('maxLengthSeconds', 2.0),
            item.get('minLengthSeconds', 0.12),
            # Lets a second source continue one weapon's numbering rather than
            # colliding on -01: the Garand's two takes come from different people.
            item.get('startIndex', 1),
        )
    print(f'\n{len(total)} clips written')


if __name__ == '__main__':
    main()
