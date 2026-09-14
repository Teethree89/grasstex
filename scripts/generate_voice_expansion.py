#!/usr/bin/env python3
"""Generate the Battle Sim v4 voice expansion locally with ElevenLabs.

This script intentionally reads Assets/audio/voice-expansion-v4.json instead of modifying the
production manifest up front. Generate the missing neutral/base MP3s first, then pass --install to
merge the expansion into Assets/audio/manifest.json and run the normal manifest validator.

You may paste an ElevenLabs API key into LOCAL_ELEVENLABS_API_KEY below for local use. Do not commit
a real key. The ELEVENLABS_API_KEY environment variable or --api-key flag also work.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
EXPANSION_PATH = REPO / "Assets/audio/voice-expansion-v4.json"
CANONICAL_PATH = REPO / "Assets/audio/manifest.json"
AUDIO_ROOT = REPO / "Assets/audio"

# Optional local convenience. Paste your key between the quotes, run the script, then remove it.
# NEVER commit a real ElevenLabs key.
LOCAL_ELEVENLABS_API_KEY = ""

MODEL_ID = "eleven_v3"
OUTPUT_FORMAT = "mp3_44100_128"

# Source: Assets/audio/VOICE_GENERATION.md
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

DELIVERY_PREFIX = {
    "combat": "[shouting][hoarse][panicked]",
    "command": "[shouting][hoarse][authoritative]",
    "observation": "[shouting][urgent][breathless]",
    "ack": "[shouting][breathless]",
    "kill": "[shouting][excited][breathless]",
    "idle": "[quietly][casual][tired]",
    "story": "[conversational][amused][tired]",
    "laugh": "[laughing][amused]",
}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def resolve_api_key(cli_key: str | None) -> str:
    key = (cli_key or "").strip()
    if not key:
        key = LOCAL_ELEVENLABS_API_KEY.strip()
    if not key:
        key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    return key


def synthesize(api_key: str, voice_id: str, text: str, delivery: str) -> bytes:
    prefix = DELIVERY_PREFIX.get(delivery, DELIVERY_PREFIX["combat"])
    spoken = f"{prefix} {text}".strip()
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        f"?output_format={urllib.parse.quote(OUTPUT_FORMAT)}"
    )
    payload = json.dumps(
        {
            "text": spoken,
            "model_id": MODEL_ID,
            "voice_settings": VOICE_SETTINGS,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                audio = resp.read()
                if not audio:
                    raise RuntimeError("ElevenLabs returned an empty audio response")
                return audio
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace")
            if exc.code == 429 and attempt < 4:
                wait = 2 ** (attempt + 1)
                print(f"  rate limited; retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"ElevenLabs HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            if attempt < 4:
                wait = 2 ** attempt
                print(f"  network error; retrying in {wait}s: {exc}", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("exhausted ElevenLabs retries")


def jobs_for(expansion: dict, faction: str | None, events: set[str] | None):
    jobs = []
    for fac, data in expansion.get("callouts", {}).items():
        if faction and fac != faction:
            continue
        expected = VOICE_IDS.get(fac)
        configured = data.get("voiceId")
        if not expected:
            raise SystemExit(f"No local voice ID configured for faction {fac!r}")
        if configured and configured != expected:
            raise SystemExit(
                f"Voice ID mismatch for {fac}: expansion has {configured}, "
                f"VOICE_GENERATION.md/local config expects {expected}"
            )
        for record in data.get("generation", []):
            event = record.get("event")
            if events and event not in events:
                continue
            rel = record.get("file")
            text = record.get("text")
            delivery = record.get("delivery", "combat")
            if not event or not rel or not text:
                raise SystemExit(f"Invalid generation record for {fac}: {record!r}")
            if ".pitch-" in rel:
                raise SystemExit(f"Pitch derivative must not be generated directly: {rel}")
            jobs.append(
                {
                    "faction": fac,
                    "event": event,
                    "text": text,
                    "delivery": delivery,
                    "rel": rel,
                    "path": AUDIO_ROOT / rel,
                    "voice_id": expected,
                }
            )
    return jobs


def all_expansion_files_exist(expansion: dict) -> tuple[bool, list[str]]:
    missing = []
    for fac, data in expansion.get("callouts", {}).items():
        for rels in data.get("events", {}).values():
            for rel in rels:
                p = AUDIO_ROOT / rel
                if not p.is_file() or p.stat().st_size <= 0:
                    missing.append(f"{fac}:{rel}")
    return not missing, missing


def merge_unique(seq, additions):
    out = list(seq or [])
    seen = set(out)
    for item in additions:
        if item not in seen:
            out.append(item)
            seen.add(item)
    return out


def install_into_canonical(expansion: dict) -> None:
    ok, missing = all_expansion_files_exist(expansion)
    if not ok:
        sample = "\n  ".join(missing[:15])
        more = "" if len(missing) <= 15 else f"\n  ... and {len(missing)-15} more"
        raise SystemExit(
            "Refusing --install because expansion audio is still missing:\n  "
            + sample
            + more
        )

    canonical = load_json(CANONICAL_PATH)
    canonical["version"] = max(int(canonical.get("version", 0)), int(expansion.get("version", 4)))
    canonical["voiceSequences"] = expansion.get("sequenceHints", {})

    for fac, extra in expansion.get("callouts", {}).items():
        side = canonical.setdefault("callouts", {}).setdefault(fac, {})
        events = side.setdefault("events", {})
        for event, rels in extra.get("events", {}).items():
            events[event] = merge_unique(events.get(event, []), rels)

        existing_generation = side.setdefault("generation", [])
        existing_files = {
            rec.get("file")
            for rec in existing_generation
            if isinstance(rec, dict) and rec.get("file")
        }
        for rec in extra.get("generation", []):
            if rec.get("file") not in existing_files:
                existing_generation.append(rec)
                existing_files.add(rec.get("file"))

    tmp = CANONICAL_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(canonical, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp.replace(CANONICAL_PATH)

    validator = REPO / "scripts/validate_voice_manifest.py"
    subprocess.run(
        [sys.executable, str(validator), str(CANONICAL_PATH), str(AUDIO_ROOT)],
        cwd=REPO,
        check=True,
    )
    print(f"Installed expansion into {CANONICAL_PATH.relative_to(REPO)} and validation passed.")


def parse_args():
    p = argparse.ArgumentParser(
        description="Generate the staged v4 Battle Sim voice expansion with ElevenLabs."
    )
    p.add_argument("--api-key", help="ElevenLabs key; overrides the local constant/environment")
    p.add_argument("--faction", choices=("us", "ge"))
    p.add_argument(
        "--event",
        action="append",
        dest="events",
        help="Generate only this event; may be supplied more than once",
    )
    p.add_argument("--force", action="store_true", help="regenerate files that already exist")
    p.add_argument("--dry-run", action="store_true", help="list work without calling ElevenLabs")
    p.add_argument(
        "--install",
        action="store_true",
        help="after generation, merge v4 events into Assets/audio/manifest.json",
    )
    return p.parse_args()


def main():
    args = parse_args()
    expansion = load_json(EXPANSION_PATH)
    events = set(args.events or [])
    jobs = jobs_for(expansion, args.faction, events or None)
    pending = [j for j in jobs if args.force or not j["path"].is_file() or j["path"].stat().st_size <= 0]

    print(
        f"Voice expansion v{expansion.get('version', '?')}: "
        f"{len(jobs)} selected, {len(pending)} need generation."
    )
    if not pending:
        print("No selected voice files need generation.")
        if args.install:
            install_into_canonical(expansion)
        return

    for j in pending:
        action = "REGEN" if j["path"].is_file() else "NEW"
        print(
            f"  {action:5} {j['faction']}/{j['event']:<20} "
            f"{j['delivery']:<11} {j['rel']} :: {j['text']}"
        )

    if args.dry_run:
        print("\nDry run only; no ElevenLabs requests were made.")
        return

    api_key = resolve_api_key(args.api_key)
    if not api_key:
        raise SystemExit(
            "\nNo ElevenLabs API key found.\n"
            "Paste it into LOCAL_ELEVENLABS_API_KEY near the top of this script, "
            "set ELEVENLABS_API_KEY, or pass --api-key.\n"
            "Do not commit a real API key."
        )

    failures = []
    for i, j in enumerate(pending, 1):
        j["path"].parent.mkdir(parents=True, exist_ok=True)
        print(
            f"\n[{i}/{len(pending)}] {j['faction']}/{j['event']} "
            f"({j['delivery']}): {j['text']!r}"
        )
        try:
            audio = synthesize(
                api_key=api_key,
                voice_id=j["voice_id"],
                text=j["text"],
                delivery=j["delivery"],
            )
            j["path"].write_bytes(audio)
            print(f"  wrote {j['path'].relative_to(REPO)} ({len(audio):,} bytes)")
        except Exception as exc:
            print(f"  FAILED: {exc}", file=sys.stderr)
            failures.append((j, str(exc)))
        time.sleep(0.25)

    print(f"\nDone: {len(pending)-len(failures)} succeeded, {len(failures)} failed.")
    if failures:
        for j, err in failures:
            print(f"  {j['faction']}/{j['event']} {j['rel']}: {err}", file=sys.stderr)
        raise SystemExit(1)

    if args.install:
        install_into_canonical(expansion)
    else:
        print(
            "\nAll selected base clips are generated. When the full expansion is complete, run:\n"
            "  python3 scripts/generate_voice_expansion.py --install\n"
            "That merges the new events into the canonical manifest only after every referenced "
            "MP3 exists."
        )


if __name__ == "__main__":
    main()
