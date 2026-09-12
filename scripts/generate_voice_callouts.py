#!/usr/bin/env python3
"""Generate battle-sim voice callouts via ElevenLabs TTS from Assets/audio/manifest.json.

By default this only fills in missing files (pass --force to regenerate everything,
or --force EVENT to regenerate one event across both factions).
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(REPO, "Assets/audio/manifest.json")
API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    sys.exit("ELEVENLABS_API_KEY is not set. Export it before running this script; "
             "never hardcode it here or commit it.")
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
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code == 429 and attempt < 3:
                wait = 2 ** (attempt + 1)
                print(f"  429 rate limited, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body}") from e
    raise RuntimeError("exhausted retries")

def main():
    force = "--force" in sys.argv
    force_event = next((a for a in sys.argv[1:] if a not in ("--force",)), None)

    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    callouts = manifest["callouts"]
    base = os.path.join(REPO, manifest["base"])  # "Assets/audio/"

    # Each faction's "generation" array is the source-of-truth text/voice script;
    # "events" is a derived lookup table the runtime reads and is not used here.
    jobs = []
    for faction, data in callouts.items():
        for item in data["generation"]:
            event, rel_path, text = item["event"], item["file"], item["text"]
            if force_event and event != force_event:
                continue
            out_path = os.path.join(base, rel_path)
            if os.path.exists(out_path) and not force:
                continue
            jobs.append((faction, event, rel_path, text, out_path))

    if not jobs:
        print("Nothing to generate (all files already present; pass --force to regenerate).")
        return

    print(f"Generating {len(jobs)} lines...")
    ok, failed = 0, []
    for i, (faction, event, rel_path, text, out_path) in enumerate(jobs, 1):
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        print(f"[{i}/{len(jobs)}] {faction}/{event}: {text!r} -> {rel_path}")
        try:
            audio = tts(VOICE_IDS[faction], text)
            with open(out_path, "wb") as f:
                f.write(audio)
            ok += 1
        except Exception as e:
            print(f"  FAILED: {e}", file=sys.stderr)
            failed.append((faction, event, rel_path, str(e)))
        time.sleep(0.3)  # be polite to rate limits

    print(f"\nDone. {ok} succeeded, {len(failed)} failed.")
    if failed:
        for faction, event, rel_path, err in failed:
            print(f"  {faction}/{event} {rel_path}: {err}")
        sys.exit(1)

if __name__ == "__main__":
    main()
