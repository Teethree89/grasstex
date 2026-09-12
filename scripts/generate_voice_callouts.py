#!/usr/bin/env python3
"""Generate neutral/base battle-sim voice callouts from manifest v3 via ElevenLabs TTS.

The game derives pitch variants during deployment. This script intentionally generates only
files explicitly listed in callouts.<faction>.generation and never .pitch-* derivatives.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO, "Assets/audio/manifest.json")
API_KEY = os.environ.get("ELEVENLABS_API_KEY")
MODEL_ID = "eleven_v3"

VOICE_IDS = {
    "us": "TxWZERZ5Hc6h9dGxVmXa",  # Jeffrey B.
    "ge": "Z2yQ1EdlDmcIgh9Pn4Lw",  # Commander Blake
}

VOICE_SETTINGS = {
    "stability": 0.4,
    "similarity_boost": 0.7,
    "style": 0.9,
    "use_speaker_boost": True,
}

TAG_PREFIX = "[shouting][hoarse][panicked] "


def tts(voice_id, text):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = json.dumps({
        "text": TAG_PREFIX + text,
        "model_id": MODEL_ID,
        "voice_settings": VOICE_SETTINGS,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST", headers={
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code == 429 and attempt < 3:
                wait = 2 ** (attempt + 1)
                print(f"  429 rate limited, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
    raise RuntimeError("exhausted retries")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="regenerate files that already exist")
    parser.add_argument("--faction", choices=("us", "ge"), help="generate only one faction")
    return parser.parse_args()


def main():
    args = parse_args()
    if not API_KEY:
        sys.exit("ELEVENLABS_API_KEY is not set. Export it before running this script; never commit it.")

    with open(MANIFEST_PATH, encoding="utf-8") as fh:
        manifest = json.load(fh)
    if int(manifest.get("version", 0)) < 3:
        sys.exit("manifest v3+ is required")

    base = os.path.join(REPO, manifest["base"])
    jobs = []
    for faction, data in manifest["callouts"].items():
        if args.faction and faction != args.faction:
            continue
        if faction not in VOICE_IDS:
            sys.exit(f"No ElevenLabs voice configured for faction {faction!r}")
        for record in data.get("generation", []):
            event = record.get("event")
            rel_path = record.get("file")
            text = record.get("text")
            if not event or not rel_path or not text:
                sys.exit(f"Invalid generation record for {faction}: {record!r}")
            if ".pitch-" in rel_path:
                sys.exit(f"Pitch derivative must not appear in generation[]: {rel_path}")
            out_path = os.path.join(base, rel_path)
            if not args.force and os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
                continue
            jobs.append((faction, event, text, rel_path, out_path))

    if not jobs:
        print("No missing neutral voice files. Use --force to regenerate existing clips.")
        return

    print(f"Generating {len(jobs)} neutral/base lines...")
    ok, failed = 0, []
    for index, (faction, event, text, rel_path, out_path) in enumerate(jobs, 1):
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        print(f"[{index}/{len(jobs)}] {faction}/{event}: {text!r} -> {rel_path}")
        try:
            audio = tts(VOICE_IDS[faction], text)
            with open(out_path, "wb") as fh:
                fh.write(audio)
            ok += 1
        except Exception as exc:
            print(f"  FAILED: {exc}", file=sys.stderr)
            failed.append((faction, event, rel_path, str(exc)))
        time.sleep(0.3)

    print(f"\nDone. {ok} succeeded, {len(failed)} failed.")
    if failed:
        for faction, event, rel_path, err in failed:
            print(f"  {faction}/{event} ({rel_path}): {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
