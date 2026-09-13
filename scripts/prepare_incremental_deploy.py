#!/usr/bin/env python3
"""Build a content-hash based lftp deployment plan for the Battle Sim runtime.

The remote hash state is authoritative for files managed by this script. A missing
remote state intentionally causes one full managed-runtime upload to bootstrap
incremental deployments. Voice MP3s are handled separately as immutable,
existence-based assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
from pathlib import Path

STATIC_FILES = [
    ("battle_sim_local.php", "battle_sim.php"),
    ("battle_log.php", "battle_log.php"),
    ("battle_log_stats.php", "battle_log_stats.php"),
    ("battle_policy.php", "battle_policy.php"),
    ("battle_learning.php", "battle_learning.php"),
    ("battle_metrics.php", "battle_metrics.php"),
]

BATTLE_FILES = [
    "battle_sim.html",
    "soldier.js",
    "weapons.js",
    "terrain-features.js",
    "squad-ai.js",
    "battle-sim.js",
    "acoustics.js",
    "scenario-generator.js",
    "battle-navigation.js",
    "town-objectives.js",
    "module-registry.js",
    "ai-policy.js",
    "objective-system.js",
    "battle-telemetry.js",
    "commander-ai.js",
    "ai-trainer.js",
    "battle-control.js",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def lftp_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def read_remote_manifest(path: Path | None) -> dict[str, str]:
    if path is None or not path.is_file():
        return {}
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            digest, remote = line.split("\t", 1)
        except ValueError:
            continue
        digest = digest.strip().lower()
        remote = remote.strip().lstrip("./")
        if len(digest) == 64 and all(c in "0123456789abcdef" for c in digest) and remote:
            out[remote] = digest
    return out


def write_commands(path: Path, pairs: list[tuple[Path, str]]) -> None:
    lines: list[str] = []
    parents = sorted({posixpath.dirname(remote) for _, remote in pairs if posixpath.dirname(remote)})
    for parent in parents:
        lines.append(f"mkdir -p {lftp_quote(parent)}")
    for local, remote in pairs:
        lines.append(f"put {lftp_quote(str(local))} -o {lftp_quote(remote)}")
    path.write_text(("\n".join(lines) + "\n") if lines else "# no files to upload\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--remote-manifest", default=".deploy-remote.sha256.tsv")
    ap.add_argument("--audio-manifest", default=".audio-deploy/manifest.json")
    ap.add_argument("--output", default=".deploy-plan")
    args = ap.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    runtime: list[tuple[Path, str]] = [(Path(local), remote) for local, remote in STATIC_FILES]
    runtime.extend((Path("battle") / name, f"battle/{name}") for name in BATTLE_FILES)
    runtime.extend((p, p.as_posix()) for p in sorted(Path("battle/modules").glob("*.js")))

    # Publish the audio manifest after any newly generated/uploaded MP3s, but keep it in
    # the same hash state so unchanged manifests also become zero-transfer.
    post: list[tuple[Path, str]] = [(Path(args.audio_manifest), "Assets/audio/manifest.json")]
    managed = runtime + post

    missing = [str(local) for local, _ in managed if not local.is_file() or local.stat().st_size <= 0]
    if missing:
        raise SystemExit("missing/empty managed deployment file(s): " + ", ".join(missing))

    current = {remote: sha256(local) for local, remote in managed}
    remote_path = Path(args.remote_manifest)
    remote_state_available = remote_path.is_file()
    previous = read_remote_manifest(remote_path)

    runtime_uploads = [(local, remote) for local, remote in runtime if previous.get(remote) != current[remote]]
    post_uploads = [(local, remote) for local, remote in post if previous.get(remote) != current[remote]]

    # Deletion is intentionally limited to the dynamic module namespace. Fixed runtime
    # files are validated as required inputs and should never disappear due to a typo.
    deletes = sorted(
        remote
        for remote in previous
        if remote.startswith("battle/modules/") and remote.endswith(".js") and remote not in current
    )

    write_commands(out_dir / "uploads.lftp", runtime_uploads)
    write_commands(out_dir / "post-uploads.lftp", post_uploads)
    (out_dir / "deletes.lftp").write_text(
        ("\n".join(f"rm -f {lftp_quote(remote)}" for remote in deletes) + "\n")
        if deletes
        else "# no managed files to delete\n",
        encoding="utf-8",
    )
    (out_dir / "current.sha256.tsv").write_text(
        "".join(f"{current[remote]}\t{remote}\n" for remote in sorted(current)),
        encoding="utf-8",
    )

    summary = {
        "remoteStateAvailable": remote_state_available,
        "managedFiles": len(managed),
        "runtimeUploads": len(runtime_uploads),
        "postUploads": len(post_uploads),
        "deletes": len(deletes),
        "unchanged": len(managed) - len(runtime_uploads) - len(post_uploads),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    if not remote_state_available:
        print("No remote deployment hash state found: bootstrapping with one full managed-runtime upload.")
    print(
        "Incremental deploy plan: "
        f"{summary['runtimeUploads']} runtime upload(s), "
        f"{summary['postUploads']} post upload(s), "
        f"{summary['deletes']} delete(s), "
        f"{summary['unchanged']} unchanged/skipped."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
