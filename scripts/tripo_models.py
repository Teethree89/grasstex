#!/usr/bin/env python3
"""List and download existing rigged FBX outputs from the Tripo v3 API.

This tool never creates, rigs, converts, resizes, or re-encodes assets. It downloads
Tripo's already-prepared FBX files byte-for-byte so embedded/native 4K textures are preserved.
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BASE = "https://openapi.tripo3d.ai/v3"

def api(path: str, key: str, method: str = "GET", payload: Any = None) -> Any:
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "User-Agent": "grasstex-tripo-sync/3.0",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = json.load(r)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Tripo HTTP {exc.code} for {path}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Tripo request failed for {path}: {exc}") from exc
    if body.get("code") != 0:
        raise RuntimeError(f"Tripo API error for {path}: {body}")
    return body.get("data")

def split_ids(value: str) -> list[str]:
    return [x for x in re.split(r"[\s,]+", value.strip()) if x] if value.strip() else []

def usage_ids(key: str, limit: int) -> list[str]:
    data = api(f"/account/usage?limit={limit}&offset=0", key)
    if isinstance(data, dict):
        records = data.get("items") or data.get("records") or data.get("usage") or []
    else:
        records = data or []
    ids = []
    for row in records:
        if isinstance(row, dict) and row.get("task_id"):
            ids.append(str(row["task_id"]))
    return list(dict.fromkeys(ids))[:limit]

def task(key: str, task_id: str) -> dict[str, Any]:
    data = api(f"/tasks/{urllib.parse.quote(task_id, safe='')}", key)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected task payload for {task_id}")
    return data

def batch_tasks(key: str, ids: list[str]) -> list[dict[str, Any]]:
    out = []
    for i in range(0, len(ids), 100):
        batch = ids[i:i + 100]
        data = api("/tasks/list", key, "POST", {"task_ids": batch})
        mapping = data.get("tasks", {}) if isinstance(data, dict) else {}
        for task_id in batch:
            value = mapping.get(task_id)
            if isinstance(value, dict):
                out.append(value)
    return out

def fbx_urls(output: Any) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    def visit(value: Any, key_path: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                path = f"{key_path}.{key}" if key_path else str(key)
                if isinstance(child, str) and child.startswith(("http://", "https://")):
                    parsed_path = urllib.parse.urlparse(child).path.lower()
                    key_lower = str(key).lower()
                    if key_lower in {"fbx_url", "fbx"} or key_lower.endswith("_fbx_url") or parsed_path.endswith(".fbx"):
                        found.append((path, child))
                else:
                    visit(child, path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{key_path}[{index}]")

    visit(output)
    seen = set()
    unique = []
    for key_path, url in found:
        if url not in seen:
            seen.add(url)
            unique.append((key_path, url))
    return unique

def refresh_rows(key: str, ids: list[str]) -> list[tuple[dict[str, Any], list[tuple[str, str]]]]:
    rows = []
    for t in batch_tasks(key, ids):
        if t.get("status") != "success":
            continue
        urls = fbx_urls(t.get("output") or {})
        if urls:
            rows.append((t, urls))
    return rows

def download_raw(url: str, path: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "grasstex-tripo-sync/3.0"})
    with urllib.request.urlopen(req, timeout=300) as response, path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

def list_mode(key: str, ids: list[str], summary: str | None) -> int:
    rows = refresh_rows(key, ids)
    lines = [
        "## Existing Tripo FBX outputs",
        "",
        "No conversion or texture processing is performed. These are the FBX outputs available for direct download.",
        "",
        "| Task ID | Type | Created | FBX files |",
        "|---|---|---|---:|",
    ]
    for t, urls in rows:
        lines.append(
            f"| {t.get('task_id','')} | {t.get('type','')} | {t.get('created_at','')} | {len(urls)} |"
        )
    if not rows:
        lines += ["", "No successful recent tasks with FBX outputs were found."]
    text_value = "\n".join(lines) + "\n"
    if summary:
        Path(summary).write_text(text_value, encoding="utf-8")
    print(text_value)
    return 0

def download_mode(key: str, ids: list[str], destination: Path, summary: str | None) -> int:
    rows = refresh_rows(key, ids)
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    downloaded = 0

    for listed_task, listed_urls in rows:
        task_id = str(listed_task.get("task_id") or "")
        fresh = task(key, task_id)
        urls = fbx_urls(fresh.get("output") or {})
        if not urls:
            continue

        for index, (output_key, url) in enumerate(urls, start=1):
            suffix = "" if len(urls) == 1 else f"-{index}"
            out = destination / f"{task_id}{suffix}.fbx"
            download_raw(url, out)
            downloaded += 1
            manifest.append({
                "task_id": task_id,
                "task_type": fresh.get("type"),
                "output_key": output_key,
                "file": out.name,
                "bytes": out.stat().st_size,
                "preserved_as_downloaded": True,
            })
            print(f"Downloaded {task_id} {output_key} -> {out}")

    manifest_path = destination / "tripo-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    text_value = (
        "## Tripo FBX download\n\n"
        f"Downloaded **{downloaded}** existing FBX file(s) byte-for-byte into {destination}.\n\n"
        "No rigging, conversion, texture resizing, recompression, or FBX rewriting was performed.\n"
    )
    if summary:
        Path(summary).write_text(text_value, encoding="utf-8")
    print(text_value)
    return 0

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=("list", "download"), default="list")
    p.add_argument("--limit", type=int, default=50)
    p.add_argument("--task-ids", default="")
    p.add_argument("--destination", default="Assets/tripo")
    p.add_argument("--summary")
    a = p.parse_args()

    key = os.environ.get("TRIP_API", "").strip()
    if not key:
        raise SystemExit("TRIP_API is required")
    if a.limit < 1 or a.limit > 500:
        raise SystemExit("--limit must be between 1 and 500")

    ids = split_ids(a.task_ids) or usage_ids(key, a.limit)
    if not ids:
        raise SystemExit("No Tripo task IDs found")

    if a.mode == "list":
        return list_mode(key, ids, a.summary)
    return download_mode(key, ids, Path(a.destination), a.summary)

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
