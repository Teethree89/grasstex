#!/usr/bin/env python3
import json
import os
import sys

manifest_path = sys.argv[1] if len(sys.argv) > 1 else "Assets/audio/manifest.json"
asset_root = sys.argv[2] if len(sys.argv) > 2 else "Assets/audio"

with open(manifest_path, encoding="utf-8") as fh:
    manifest = json.load(fh)

errors = []
if int(manifest.get("version", 0)) < 3:
    errors.append("voice manifest must be version 3+")

required_directional = {"contactFront", "contactLeft", "contactRight"}
all_runtime_files = set()
all_generation_files = set()

for faction in ("us", "ge"):
    data = manifest.get("callouts", {}).get(faction)
    if not isinstance(data, dict):
        errors.append(f"missing callouts.{faction}")
        continue

    events = data.get("events", {})
    missing_events = sorted(required_directional.difference(events))
    if missing_events:
        errors.append(f"callouts.{faction}.events missing {', '.join(missing_events)}")

    generation = data.get("generation", [])
    seen_generation = set()
    for item in generation:
        path = item.get("file") if isinstance(item, dict) else None
        text = item.get("text") if isinstance(item, dict) else None
        event = item.get("event") if isinstance(item, dict) else None
        if not path or not text or not event:
            errors.append(f"invalid generation record in {faction}: {item!r}")
            continue
        if path in seen_generation:
            errors.append(f"duplicate generation file in {faction}: {path}")
        seen_generation.add(path)
        all_generation_files.add(path)

    for event, files in events.items():
        if not isinstance(files, list) or not files:
            errors.append(f"callouts.{faction}.events.{event} must contain files")
            continue
        for path in files:
            if not isinstance(path, str) or not path.startswith(f"voices/{faction}/"):
                errors.append(f"unexpected voice path for {faction}/{event}: {path!r}")
                continue
            all_runtime_files.add(path)
            local = os.path.join(asset_root, path)
            if not os.path.isfile(local) or os.path.getsize(local) == 0:
                errors.append(f"missing runtime voice asset: {path}")

    missing_metadata = sorted(set(p for files in events.values() if isinstance(files, list) for p in files) - seen_generation)
    if missing_metadata:
        errors.append(f"{faction} runtime files missing generation metadata: {', '.join(missing_metadata)}")

variation = manifest.get("rules", {}).get("voice", {}).get("variation", {})
profiles = variation.get("profiles", [])
if variation.get("strategy") != "stable-per-soldier":
    errors.append("voice variation strategy must be stable-per-soldier")
if variation.get("preserveDuration") is not True:
    errors.append("voice variation must preserve duration")
if not any(abs(float(p.get("semitones", 0))) < 1e-9 and p.get("suffix", "") == "" for p in profiles):
    errors.append("voice variation requires a neutral profile with no suffix")
for profile in profiles:
    semitones = float(profile.get("semitones", 0))
    suffix = str(profile.get("suffix", ""))
    if abs(semitones) > 1e-9 and not suffix:
        errors.append(f"non-neutral profile {profile.get('id')} needs a filename suffix")
    if float(profile.get("weight", 0)) < 0:
        errors.append(f"negative voice profile weight: {profile.get('id')}")

if errors:
    print("Voice manifest validation failed:", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    sys.exit(1)

print(f"Voice manifest OK: {len(all_runtime_files)} runtime base files, {len(profiles)} pitch profiles")
