#!/usr/bin/env python3
"""Check Assets/audio/weapon-clip-manifest.json for completeness and single-shot clips.

  python3 scripts/check_weapon_clips.py                  # manifest completeness only
  python3 scripts/check_weapon_clips.py --audio          # also onset-check every clip that exists
  python3 scripts/check_weapon_clips.py --shots a.mp3 …  # onset-check arbitrary files as shots

Completeness means that every weapon model the battle backend fields (WEAPON_MODELS in
battle/modules/53-fbx-soldier-backend.js) has an entry, and each entry has the actions its
mechanism needs. A shot clip passes when the file holds exactly one onset: after the first
transient, the level never climbs back within 10 dB of peak after first dropping 18 dB below it.
Rapid fire is built at runtime from these clips, so a recorded burst fails.
"""
import argparse, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "Assets/audio/weapon-clip-manifest.json"
BACKEND = ROOT / "battle/modules/53-fbx-soldier-backend.js"

BASE = {"fire", "fireDistant", "stoppageClick", "stoppageClear"}
BY_KIND = {
    "rifle": set(),
    "carbine": {"reloadMagOut", "reloadMagIn", "reloadCharge"},
    "lmg": {"reloadCoverOpen", "reloadBeltLay", "reloadCoverClose", "reloadCharge", "bipodDeploy", "bipodFold"},
    "pistol": {"reloadMagOut", "reloadMagIn", "reloadSlideRelease"},
}
BY_MODEL = {
    "m1-garand": {"clipPing", "reloadClipInsert", "reloadBoltRelease"},
    "kar98k": {"boltCycle", "reloadBoltOpen", "reloadStripperClip", "reloadBoltClose"},
}
SHARED = {"casingRifle", "casingPistol", "casingBeltLink", "crackSupersonic", "whizSubsonic"}


def fielded_models():
    src = BACKEND.read_text()
    block = re.search(r"var WEAPON_MODELS=\{(.*?)\},WEAPON_BUTT", src, re.S).group(1)
    return sorted({m[:-4] for m in re.findall(r"'([\w-]+\.fbx)'", block)})


def completeness(man):
    errs, weapons = [], man["weapons"]
    for mid in fielded_models():
        if mid not in weapons:
            errs.append(f"{mid}: fielded by the backend but missing from the manifest")
    for wid, w in weapons.items():
        need = BASE | BY_KIND.get(w["simKind"], set()) | BY_MODEL.get(wid, set())
        if w.get("cyclicRpm"):
            need.add("fireTail")
        for a in sorted(need - set(w["clips"])):
            errs.append(f"{wid}: missing action {a}")
        for cid, c in w["clips"].items():
            errs += clip_errors(f"{wid}.{cid}", c)
        if not w["clips"].get("fire", {}).get("singleShot"):
            errs.append(f"{wid}.fire: must be singleShot")
    for a in sorted(SHARED - set(man["shared"])):
        errs.append(f"shared: missing {a}")
    for cid, c in man["shared"].items():
        errs += clip_errors(f"shared.{cid}", c)
    seen = {}
    for name, c in all_clips(man):
        for f in c["files"]:
            if f in seen:
                errs.append(f"{name}: file {f} already used by {seen[f]}")
            seen[f] = name
    return errs


def clip_errors(name, c):
    e = []
    if len(c["files"]) != c["variations"]:
        e.append(f"{name}: {len(c['files'])} files for {c['variations']} variations")
    if c["role"] == "shot" and c["variations"] < 3:
        e.append(f"{name}: shots need >= 3 variations")
    return e


def all_clips(man):
    for wid, w in man["weapons"].items():
        for cid, c in w["clips"].items():
            yield f"{wid}.{cid}", c
    for cid, c in man["shared"].items():
        yield f"shared.{cid}", c


def onsets(path, rate=22050, win=0.004):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(rate),
                          "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(float) / 32768
    w = int(rate * win); n = len(x) // w
    env = 20 * np.log10(np.sqrt((x[:n * w].reshape(n, w) ** 2).mean(1)) + 1e-9)
    peak, armed, hits = env.max(), True, []
    for i, v in enumerate(env):
        if armed and v > peak - 10:
            hits.append(round(i * win, 3)); armed = False
        elif not armed and v < peak - 18:
            armed = True
    return hits, n * win


def shot_errors(path, max_dur=None):
    hits, dur = onsets(path)
    e = []
    if len(hits) != 1:
        e.append(f"{len(hits)} onsets at {hits[:6]}s (burst or double report)")
    elif hits[0] > 0.012:
        e.append(f"onset at {hits[0]}s; trim leading silence to <= 10 ms")
    if max_dur and dur > max_dur + 0.01:
        e.append(f"{dur:.2f}s long, cap is {max_dur}s")
    return e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", action="store_true")
    ap.add_argument("--shots", nargs="+")
    args = ap.parse_args()

    if args.shots:
        bad = 0
        for f in args.shots:
            e = shot_errors(f)
            bad += bool(e)
            print(("FAIL " if e else "ok   ") + f + ("  " + "; ".join(e) if e else ""))
        print(f"{len(args.shots) - bad}/{len(args.shots)} single shots")
        return 1 if bad else 0

    man = json.loads(MANIFEST.read_text())
    errs = completeness(man)
    clips = list(all_clips(man))
    total = sum(c["variations"] for _, c in clips)
    print(f"weapons {len(man['weapons'])} (fielded {len(fielded_models())}), actions {len(clips)}, clips {total}")
    if args.audio:
        base, present, p0_missing = ROOT / man["base"], 0, 0
        for name, c in clips:
            for f in c["files"]:
                p = base / f
                if not p.exists():
                    p0_missing += c["priority"] == "P0"
                    continue
                present += 1
                if c.get("singleShot"):
                    errs += [f"{f}: {x}" for x in shot_errors(p, c["maxDurationS"])]
                elif c.get("noTransient") and len(onsets(p)[0]) > 1:
                    errs.append(f"{f}: tail clip has repeated transients")
        print(f"audio present {present}/{total}, P0 missing {p0_missing}")
    for e in errs:
        print("FAIL " + e)
    print("manifest complete" if not errs else f"{len(errs)} problems")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
