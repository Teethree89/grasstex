#!/usr/bin/env python3
"""Forget recorded uploads of FBX assets the server no longer has, so the deploy re-uploads them.

The deploy uploads by content hash against the state it published last run
(.battle-deploy.sha256.tsv). That state only says what was uploaded, not what is still there:
delete Assets/animations on the host and every later deploy still skips those clips. Given a
listing of the remote Assets/{soldiers,animations,weapons} directories, this drops state entries
for FBX files missing from it; the planner then sees them as new and uploads them again.

Only entries under the listed directories are touched, and an unreadable listing changes nothing.

  prune_missing_remote_assets.py <state.tsv> <listing.txt>

The listing holds one path per line relative to Assets/ (e.g. "animations/Rifle Walk.fbx"), as
lftp `find` prints it, and must end with the line __LISTED__ to prove the listing completed.
"""
from __future__ import annotations
import sys
from pathlib import Path

DIRS = ("soldiers", "animations", "weapons")
SENTINEL = "__LISTED__"


def main() -> int:
    state_path, listing_path = Path(sys.argv[1]), Path(sys.argv[2])
    if not state_path.is_file():
        print("No remote deployment state: nothing to prune (a bootstrap run uploads everything).")
        return 0
    lines = listing_path.read_text(encoding="utf-8", errors="replace").splitlines() if listing_path.is_file() else []
    if SENTINEL not in (l.strip() for l in lines):
        print("Remote asset listing incomplete: keeping the recorded state unchanged.")
        return 0
    present = {"Assets/" + l.strip().lstrip("./").rstrip("/") for l in lines if l.strip() and l.strip() != SENTINEL}
    kept, dropped = [], []
    for raw in state_path.read_text(encoding="utf-8").splitlines(keepends=True):
        parts = raw.rstrip("\n").split("\t", 1)
        remote = parts[1].strip() if len(parts) == 2 else ""
        managed = remote.lower().endswith(".fbx") and any(remote.startswith(f"Assets/{d}/") for d in DIRS)
        (dropped if managed and remote not in present else kept).append(remote if managed and remote not in present else raw)
    state_path.write_text("".join(kept), encoding="utf-8")
    by_dir = {d: sum(1 for r in dropped if r.startswith(f"Assets/{d}/")) for d in DIRS}
    print(f"FBX assets recorded as uploaded but missing on the server (will re-upload): {len(dropped)} "
          + ", ".join(f"{d} {n}" for d, n in by_dir.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
