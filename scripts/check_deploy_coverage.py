#!/usr/bin/env python3
"""Fail if the page or the loader requests a runtime the deploy plan never uploads.

Three lists have to agree: the core `<script src>` tags in battle/battle_sim.html, the runtime lists
in battle_sim_local.php, and BATTLE_FILES in scripts/prepare_incremental_deploy.py. When they drift,
nothing errors at build time - the deployed loader just asks for a file that was never uploaded and
the page dies on a 404. Adding battle/obstacle-field.js and battle/engagement.js without touching the
deploy plan is exactly that mistake, so it is a check now.
"""
from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def load_deploy_plan():
    spec = importlib.util.spec_from_file_location("deploy_plan", REPO / "scripts/prepare_incremental_deploy.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def page_core_tags() -> list[str]:
    html = (REPO / "battle/battle_sim.html").read_text(encoding="utf-8")
    return re.findall(r'<script src="([A-Za-z0-9._-]+\.js)"></script>', html)


def loader_runtimes() -> list[str]:
    php = (REPO / "battle_sim_local.php").read_text(encoding="utf-8")
    found: list[str] = []
    for name in ("coreScripts", "preCommander"):
        match = re.search(r"\$" + name + r"=array\((.*?)\);", php, re.S)
        if not match:
            raise SystemExit(f"could not find ${name} in battle_sim_local.php")
        found += [part.strip().strip("'\"") for part in match.group(1).split(",") if part.strip()]
    # The trailer is written inline rather than as a named array.
    found += re.findall(r"foreach\(array\(([^)]*)\) as \$file\)", php)[0].replace("'", "").split(",")
    return [f.strip() for f in found if f.strip().endswith(".js")]


def main() -> None:
    plan = load_deploy_plan()
    listed = set(plan.BATTLE_FILES)
    required = sorted(set(page_core_tags()) | set(loader_runtimes()))
    missing = [name for name in required if name not in listed]
    if missing:
        raise SystemExit(
            "runtimes loaded by the page/loader but absent from BATTLE_FILES in "
            "scripts/prepare_incremental_deploy.py: " + ", ".join(missing)
        )
    stale = sorted(listed - set(required) - {"battle_sim.html"})
    print(f"Deploy plan covers all {len(required)} page/loader runtimes.")
    if stale:
        print("Uploaded but not referenced by the page or loader (harmless, worth a look): " + ", ".join(stale))
    if not (REPO / "battle/modules").is_dir():
        raise SystemExit("battle/modules is missing")


if __name__ == "__main__":
    sys.exit(main())
