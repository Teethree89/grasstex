#!/usr/bin/env python3
"""List Tripo model tasks and export them as FBX / Mixamo / 4K.

The export preserves skeleton/animation data when it already exists by setting
with_animation=true. This script never calls Tripo's rigging endpoint, so an
unrigged source remains unrigged.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BASE = "https://openapi.tripo3d.ai/v3"
POLL_SECONDS = 5
POLL_TIMEOUT = 900

def api(path: str, key: str, method: str = "GET", payload: Any = None) -> Any:
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "User-Agent": "grasstex-tripo-sync/4.0",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Tripo HTTP {exc.code} for {path}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Tripo request failed for {path}: {exc}") from exc

    if body.get("code") != 0:
        raise RuntimeError(f"Tripo API error for {path}: {body}")
    return body.get("data")

def split_ids(value: str) -> list[str]:
    return [item for item in re.split(r"[\s,]+", value.strip()) if item] if value.strip() else []

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
    tasks = []
    for start in range(0, len(ids), 100):
        batch = ids[start:start + 100]
        data = api("/tasks/list", key, "POST", {"task_ids": batch})
        mapping = data.get("tasks", {}) if isinstance(data, dict) else {}
        for task_id in batch:
            value = mapping.get(task_id)
            if isinstance(value, dict):
                tasks.append(value)
    return tasks

def find_model_url(output: Any) -> str | None:
    if not isinstance(output, dict):
        return None

    direct = output.get("model_url")
    if isinstance(direct, str) and direct.startswith(("http://", "https://")):
        return direct

    urls = output.get("model_urls")
    if isinstance(urls, list):
        for value in urls:
            if isinstance(value, str) and value.startswith(("http://", "https://")):
                return value

    for value in output.values():
        if isinstance(value, dict):
            found = find_model_url(value)
            if found:
                return found
    return None

def poll(key: str, task_id: str) -> dict[str, Any]:
    deadline = time.time() + POLL_TIMEOUT
    while time.time() < deadline:
        current = task(key, task_id)
        status = str(current.get("status") or "")
        if status == "success":
            return current
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"Tripo task {task_id} ended as {status}: {current}")
        time.sleep(POLL_SECONDS)
    raise TimeoutError(f"Timed out waiting for Tripo task {task_id}")

def export_fbx(key: str, source: dict[str, Any]) -> dict[str, Any]:
    source_id = str(source.get("task_id") or "")
    source_type = str(source.get("type") or "")
    source_url = find_model_url(source.get("output") or {})

    if not source_url:
        raise RuntimeError(f"Task {source_id} has no model output URL")

    data = api(
        "/models/convert",
        key,
        "POST",
        {
            "input": source_url,
            "format": "FBX",
            "texture_size": 4096,
            "with_animation": True,
            "fbx_preset": "mixamo",
            "bake": True,
        },
    )
    export_task_id = str(data.get("task_id") or "")
    if not export_task_id:
        raise RuntimeError(f"Tripo did not return an export task ID for {source_id}")

    print(
        f"Exporting {source_id} ({source_type}) as FBX / Mixamo / 4K / "
        "preserve skeleton if present"
    )
    return poll(key, export_task_id)

def download(url: str, path: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "grasstex-tripo-sync/4.0"})
    with urllib.request.urlopen(request, timeout=300) as response, path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

def candidate_tasks(key: str, ids: list[str]) -> list[dict[str, Any]]:
    rows = []
    for item in batch_tasks(key, ids):
        if item.get("status") != "success":
            continue
        task_type = str(item.get("type") or "")
        if task_type == "convert_model":
            continue
        if find_model_url(item.get("output") or {}):
            rows.append(item)
    return rows

def write_summary(path: str | None, text: str) -> None:
    if path:
        Path(path).write_text(text, encoding="utf-8")
    print(text)

def list_mode(key: str, ids: list[str], summary: str | None) -> int:
    rows = candidate_tasks(key, ids)
    lines = [
        "## Tripo model sources",
        "",
        "Download mode exports these sources with: FBX, Mixamo preset, 4096 texture size, and skeleton/animation data when already present.",
        "No rigging task is ever created.",
        "",
        "| Task ID | Type | Created |",
        "|---|---|---|",
    ]
    for item in rows:
        lines.append(
            f"| {item.get('task_id','')} | {item.get('type','')} | {item.get('created_at','')} |"
        )
    if not rows:
        lines += ["", "No successful recent model tasks were found."]
    write_summary(summary, "\n".join(lines) + "\n")
    return 0

def download_mode(
    key: str,
    ids: list[str],
    destination: Path,
    summary: str | None,
) -> int:
    rows = candidate_tasks(key, ids)
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []

    for source in rows:
        source_id = str(source.get("task_id") or "")
        fresh_source = task(key, source_id)
        converted = export_fbx(key, fresh_source)
        final_url = find_model_url(converted.get("output") or {})
        if not final_url:
            raise RuntimeError(
                f"Export task {converted.get('task_id')} for {source_id} returned no model URL"
            )

        output = destination / f"{source_id}-mixamo-4k.fbx"
        download(final_url, output)

        manifest.append(
            {
                "source_task_id": source_id,
                "source_type": fresh_source.get("type"),
                "export_task_id": converted.get("task_id"),
                "file": output.name,
                "format": "FBX",
                "fbx_preset": "mixamo",
                "texture_size": 4096,
                "with_animation": True,
                "rigging_created": False,
                "skeleton_behavior": "preserve if source contains one; otherwise remain unrigged",
                "bytes": output.stat().st_size,
            }
        )
        print(f"Downloaded {output}")

    manifest_path = destination / "tripo-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    text = (
        "## Tripo FBX exports\n\n"
        f"Exported and downloaded **{len(manifest)}** model(s).\n\n"
        "Settings: FBX, Mixamo preset, 4096 texture size, with_animation=true.\n"
        "Existing skeletons are included; unrigged models are not rigged.\n"
    )
    write_summary(summary, text)
    return 0

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("list", "download"), default="list")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--task-ids", default="")
    parser.add_argument("--destination", default="Assets/tripo")
    parser.add_argument("--summary")
    args = parser.parse_args()

    key = os.environ.get("TRIP_API", "").strip()
    if not key:
        raise SystemExit("TRIP_API is required")
    if args.limit < 1 or args.limit > 500:
        raise SystemExit("--limit must be between 1 and 500")

    ids = split_ids(args.task_ids) or usage_ids(key, args.limit)
    if not ids:
        raise SystemExit("No Tripo task IDs found")

    if args.mode == "list":
        return list_mode(key, ids, args.summary)
    return download_mode(key, ids, Path(args.destination), args.summary)

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
