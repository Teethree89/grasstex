#!/usr/bin/env python3
"""List and download model outputs from the Tripo v3 API."""

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
from typing import Any, Iterable

BASE_URL = "https://openapi.tripo3d.ai/v3"
MODEL_EXTENSIONS = {".glb", ".gltf", ".fbx", ".obj", ".stl", ".ply", ".usdz", ".zip"}

def api_request(path: str, api_key: str, *, method: str = "GET", payload: Any = None) -> Any:
    url = f"{BASE_URL}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "User-Agent": "grasstex-tripo-sync/1.0",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Tripo API HTTP {exc.code} for {path}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Tripo API request failed for {path}: {exc}") from exc
    if body.get("code") != 0:
        raise RuntimeError(
            f"Tripo API error for {path}: code={body.get('code')} "
            f"message={body.get('message')!r} suggestion={body.get('suggestion')!r}"
        )
    return body.get("data")

def split_task_ids(value: str) -> list[str]:
    return [x for x in re.split(r"[\s,]+", value.strip()) if x] if value.strip() else []

def usage_task_ids(api_key: str, limit: int) -> list[str]:
    data = api_request(f"/account/usage?limit={limit}&offset=0", api_key)
    if isinstance(data, dict):
        records = data.get("items") or data.get("records") or data.get("usage") or []
    else:
        records = data or []
    ids = []
    for record in records:
        if not isinstance(record, dict):
            continue
        task_id = record.get("task_id")
        if task_id:
            ids.append(str(task_id))
    return list(dict.fromkeys(ids))[:limit]

def get_tasks(api_key: str, task_ids: list[str]) -> list[dict[str, Any]]:
    tasks = []
    for start in range(0, len(task_ids), 100):
        batch = task_ids[start:start + 100]
        data = api_request("/tasks/list", api_key, method="POST", payload={"task_ids": batch})
        task_map = data.get("tasks", {}) if isinstance(data, dict) else {}
        for task_id in batch:
            task = task_map.get(task_id)
            if isinstance(task, dict):
                tasks.append(task)
    return tasks

def model_urls(output: Any) -> list[tuple[str, str]]:
    found = []
    def visit(value: Any, key_path: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                path = f"{key_path}.{key}" if key_path else str(key)
                if isinstance(child, str) and child.startswith(("http://", "https://")):
                    low_key = str(key).lower()
                    ext = Path(urllib.parse.urlparse(child).path).suffix.lower()
                    if (
                        "model" in low_key
                        or low_key in {"fbx_url", "glb_url", "gltf_url", "obj_url", "stl_url"}
                        or ext in MODEL_EXTENSIONS
                    ) and "rendered_image" not in low_key and "preview" not in low_key:
                        found.append((path, child))
                else:
                    visit(child, path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{key_path}[{index}]")
    visit(output)
    unique = []
    seen = set()
    for key, url in found:
        if url not in seen:
            seen.add(url)
            unique.append((key, url))
    return unique

def extension_from_url(url: str, response: Any) -> str:
    ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if ext in MODEL_EXTENSIONS:
        return ext
    content_type = (response.headers.get_content_type() or "").lower()
    return {
        "model/gltf-binary": ".glb",
        "model/gltf+json": ".gltf",
        "application/zip": ".zip",
        "application/octet-stream": ".bin",
    }.get(content_type, ".bin")

def safe_name(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "model"

def download(url: str, destination_without_ext: Path) -> Path:
    request = urllib.request.Request(url, headers={"User-Agent": "grasstex-tripo-sync/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            destination = destination_without_ext.with_suffix(extension_from_url(url, response))
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
            return destination
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"Model download failed with HTTP {exc.code}; rerun to obtain a fresh Tripo URL."
        ) from exc

def append_summary(path: str | None, lines: Iterable[str]) -> None:
    text_value = "\n".join(lines) + "\n"
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(text_value)
    else:
        print(text_value)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("list", "download"), default="list")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--task-ids", default="")
    parser.add_argument("--destination", default="Assets/tripo")
    parser.add_argument("--summary")
    args = parser.parse_args()

    api_key = os.environ.get("TRIP_API", "").strip()
    if not api_key:
        raise SystemExit("TRIP_API is required")
    if args.limit < 1 or args.limit > 500:
        raise SystemExit("--limit must be between 1 and 500")

    task_ids = split_task_ids(args.task_ids) or usage_task_ids(api_key, args.limit)
    if not task_ids:
        append_summary(args.summary, ["## Tripo models", "", "No recent Tripo task IDs were found."])
        return 0

    tasks = get_tasks(api_key, task_ids)
    rows = [(task, model_urls(task.get("output") or {})) for task in tasks]
    rows = [(task, urls) for task, urls in rows if urls]

    summary = [
        "## Tripo models", "",
        f"Inspected **{len(task_ids)}** task IDs; found **{len(rows)}** tasks with model outputs.", "",
        "| Task | Type | Status | Created | Model outputs |",
        "|---|---|---|---|---:|",
    ]
    for task, urls in rows:
        summary.append("| {} | {} | {} | {} | {} |".format(
            task.get("task_id", ""), task.get("type", ""), task.get("status", ""),
            task.get("created_at", ""), len(urls)
        ))

    if args.mode == "list":
        summary += [
            "",
            "Run again with mode = download. Leave task_ids blank for the recent models above, "
            "or provide specific task IDs."
        ]
        append_summary(args.summary, summary)
        for task, _ in rows:
            print(task.get("task_id", ""))
        return 0

    root = Path(args.destination)
    root.mkdir(parents=True, exist_ok=True)
    manifest = []
    downloaded = 0

    for task, _ in rows:
        task_id = str(task.get("task_id") or "")
        if task.get("status") != "success" or not task_id:
            continue
        fresh = api_request(f"/tasks/{urllib.parse.quote(task_id, safe='')}", api_key)
        urls = model_urls((fresh or {}).get("output") or {})
        for index, (output_key, url) in enumerate(urls, start=1):
            stem = safe_name(task_id)
            if len(urls) > 1:
                stem += f"-{index}-{safe_name(output_key.split('.')[-1])}"
            path = download(url, root / stem)
            downloaded += 1
            manifest.append({
                "task_id": task_id,
                "type": fresh.get("type"),
                "status": fresh.get("status"),
                "created_at": fresh.get("created_at"),
                "completed_at": fresh.get("completed_at"),
                "output_key": output_key,
                "file": path.relative_to(root).as_posix(),
                "bytes": path.stat().st_size,
            })
            print(f"Downloaded {task_id} {output_key} -> {path}")

    manifest_path = root / "tripo-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    summary += [
        "",
        f"Downloaded **{downloaded}** model file(s) into {root.as_posix()}.",
        f"Metadata written to {manifest_path.as_posix()}. Signed URLs are intentionally not stored.",
    ]
    append_summary(args.summary, summary)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
