#!/usr/bin/env python3
"""The production deploy must never delete or overwrite server files the repo does not manage.

Feeds prepare_incremental_deploy.py a remote hash state that lists sidecar JSON, FBX
soldier-animation lab files, models and a retired module, and asserts that only the retired
battle module is deleted, that a mass deletion is refused, and that a protected upload is refused.
The repo's own Motion Lab files (MANAGED_LAB) are the one lab exception: uploaded, never deleted.
Run from the repo root (CI's deploy-plan job does).
"""
from __future__ import annotations
import json, os, subprocess, sys, tempfile
from pathlib import Path

PLANNER = [sys.executable, "scripts/prepare_incremental_deploy.py", "--audio-manifest", "Assets/audio/manifest.json"]
PROTECTED_REMOTE = [
    "Assets/animations/rifle-walk.fbx.json",
    "Assets/animations/clips.sidecar.json",
    "Assets/soldiers/us-rifleman-rigged.json",
    "fbx-animation-lab.html",
    "fbx-soldier-animation-lab/index.html",
    "fbx-soldier-animation-lab/clips/walk.json",
    "labs/hand-placed-lab.html",
    "Assets/soldiers/us-captain.fbx.json",
    "battle/modules/sidecar.json",
    "battle/modules/77-animation-lab.js",
    "state/ai-policy.json",
]
H = "0" * 64


def plan(entries: list[str], extra_env: dict[str, str] | None = None) -> tuple[int, str, str]:
    tmp = Path(tempfile.mkdtemp())
    state = tmp / "remote.tsv"
    state.write_text("".join(f"{H}\t{e}\n" for e in entries), encoding="utf-8")
    env = dict(os.environ, **(extra_env or {}))
    r = subprocess.run(PLANNER + ["--remote-manifest", str(state), "--output", str(tmp / "plan")],
                       capture_output=True, text=True, env=env)
    deletes = (tmp / "plan" / "deletes.lftp").read_text(encoding="utf-8") if r.returncode == 0 else ""
    return r.returncode, deletes, r.stdout + r.stderr


def main() -> int:
    if not Path("battle/build-version.json").is_file():
        print("DEPLOY SAFETY FAIL\n  battle/build-version.json is missing: run `python3 scripts/build_version.py stamp` first")
        return 1
    failures = []
    # Stale retired module + protected server files in the recorded state.
    code, deletes, out = plan(PROTECTED_REMOTE + ["battle/modules/37-retired-module.js"])
    if code != 0:
        failures.append("planner failed on a normal state: " + out)
    if 'rm -f "battle/modules/37-retired-module.js"' not in deletes:
        failures.append("a retired battle module was not deleted")
    for remote in PROTECTED_REMOTE:
        if remote in deletes:
            failures.append("protected server file scheduled for deletion: " + remote)
    # A state that suddenly lacks most modules must not wipe the server.
    many = [f"battle/modules/9{i:02d}-gone.js" for i in range(12)]
    code, deletes, out = plan(many)
    if code == 0 or "refusing to delete" not in out:
        failures.append("mass deletion of 12 modules was not refused")
    code, deletes, out = plan(many, {"DEPLOY_MAX_DELETES": "20"})
    if code != 0 or deletes.count("rm -f") != 12:
        failures.append("DEPLOY_MAX_DELETES override did not allow an intended bulk retirement")
    # The planner must refuse to overwrite a protected path even if one becomes managed.
    sys.path.insert(0, "scripts")
    import prepare_incremental_deploy as P  # noqa: E402
    for remote in PROTECTED_REMOTE:
        if not P.is_protected(remote):
            failures.append("not protected: " + remote)
    # The repo's own Motion Lab files are the one lab exception: uploaded, never deleted.
    code, deletes, out = plan(PROTECTED_REMOTE + [f"labs/{n}" for n in ("gone-lab.php",)])
    for lab in P.MANAGED_LAB:
        if P.is_protected(lab):
            failures.append("repo-owned lab file wrongly protected: " + lab)
        if not any(remote == lab for _, remote in P.STATIC_FILES):
            failures.append("repo-owned lab file is not deployed: " + lab)
    if "labs/" in deletes:
        failures.append("a lab file was scheduled for deletion")
    for managed in sorted(P.MANAGED_JSON):
        if P.is_protected(managed):
            failures.append("deploy-owned JSON wrongly protected: " + managed)
    if failures:
        print("DEPLOY SAFETY FAIL\n  " + "\n  ".join(failures))
        return 1
    print("Deploy safety: only retired battle/modules/*.js are deleted; sidecar JSON, lab files and "
          "unmanaged files are never deleted or overwritten; mass deletion is refused.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
