#!/usr/bin/env python3
"""Build version derived from git tags.

The deploy workflow owns the build number. Tags named ``build-v<N>`` are the record of what has
actually been published, one per successful deploy, so the next build is always ``max(N) + 1``.

Flow inside the workflow:

  1. ``build_version.py next``    -> the number this run will publish (highest tag + 1)
  2. ``build_version.py stamp``   -> writes battle/build-version.json, which the deployed loader
                                     reads and serves to the page as the build id and cache epoch
  3. deploy
  4. ``build_version.py tag``     -> creates build-v<N> on the deployed commit, only after success

Nothing is committed back to the repository: the tag is the source of truth and the generated
version file is a deployment artifact. A run that fails or is cancelled therefore never burns a
version number in the tag list, it only skips one.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

TAG_PREFIX = "build-v"
TAG_RE = re.compile(r"^" + re.escape(TAG_PREFIX) + r"(\d+)$")
DEFAULT_OUTPUT = Path("battle/build-version.json")
LATEST_TAG = "build-latest"
FIRST_VERSION = 30  # v29 was the last hand-maintained build; tags take over from v30.


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(("git",) + args, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def published_versions() -> list[int]:
    out = git("tag", "--list", TAG_PREFIX + "*")
    versions = []
    for line in out.splitlines():
        match = TAG_RE.match(line.strip())
        if match:
            versions.append(int(match.group(1)))
    return sorted(versions)


def current_version() -> int | None:
    versions = published_versions()
    return versions[-1] if versions else None


def next_version() -> int:
    latest = current_version()
    return FIRST_VERSION if latest is None else latest + 1


def short_sha() -> str:
    return git("rev-parse", "--short=8", "HEAD")


def stamp(number: int, output: Path, run_id: str | None) -> dict:
    sha = short_sha()
    payload = {
        "version": f"v{number}",
        "number": number,
        # The sha is part of the cache epoch so redeploying the same version number still busts
        # every client's cached runtime.
        "cacheEpoch": f"v{number}-{sha}",
        "commit": git("rev-parse", "HEAD"),
        "shortCommit": sha,
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "run": run_id or "",
        "previousVersion": (lambda v: f"v{v}" if v is not None else "")(current_version()),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def read_stamp(output: Path) -> dict:
    if not output.is_file():
        raise SystemExit(f"{output} not found: run 'build_version.py stamp' before tagging")
    return json.loads(output.read_text(encoding="utf-8"))


def create_tag(number: int, message: str, push: bool) -> None:
    tag = f"{TAG_PREFIX}{number}"
    if number in published_versions():
        raise SystemExit(
            f"{tag} already exists. A published build version is never overwritten - "
            "check whether a concurrent deploy already published this number."
        )
    git("tag", "-a", tag, "-m", message)
    # build-latest is a convenience pointer, so it is the one tag that moves.
    git("tag", "-f", "-a", LATEST_TAG, "-m", message)
    if push:
        git("push", "origin", tag)
        git("push", "--force", "origin", LATEST_TAG)
    print(f"tagged {tag}" + (" and pushed" if push else " (not pushed)"))


def emit_outputs(pairs: dict, github_output: str | None) -> None:
    for key, value in pairs.items():
        print(f"{key}={value}")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as handle:
            for key, value in pairs.items():
                handle.write(f"{key}={value}\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    p_next = sub.add_parser("next", help="print the version this run should publish")
    p_next.add_argument("--github-output")

    p_stamp = sub.add_parser("stamp", help="write the generated build-version.json for deployment")
    p_stamp.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p_stamp.add_argument("--number", type=int, help="override the computed version")
    p_stamp.add_argument("--run-id", default="")
    p_stamp.add_argument("--github-output")

    p_tag = sub.add_parser("tag", help="publish the tag for the version that was just deployed")
    p_tag.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p_tag.add_argument("--message", default="")
    p_tag.add_argument("--no-push", action="store_true")

    sub.add_parser("show", help="print the currently published version")

    args = ap.parse_args()

    if args.command == "next":
        number = next_version()
        latest = current_version()
        emit_outputs(
            {"version": f"v{number}", "number": str(number), "previous": f"v{latest}" if latest else "none"},
            args.github_output,
        )
    elif args.command == "stamp":
        number = args.number if args.number else next_version()
        payload = stamp(number, args.output, args.run_id)
        print(json.dumps(payload, indent=2))
        emit_outputs(
            {"version": payload["version"], "number": str(payload["number"]), "cacheEpoch": payload["cacheEpoch"]},
            args.github_output,
        )
    elif args.command == "tag":
        payload = read_stamp(args.output)
        message = args.message or f"Battle runtime {payload['version']} deployed from {payload['shortCommit']}"
        create_tag(int(payload["number"]), message, push=not args.no_push)
    elif args.command == "show":
        latest = current_version()
        print(f"v{latest}" if latest else "none")
    else:  # pragma: no cover - argparse guarantees a command
        ap.error("unknown command")


if __name__ == "__main__":
    main()
