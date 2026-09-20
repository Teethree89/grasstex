#!/usr/bin/env python3
"""List Tripo models and export selected ones as Mixamo-compatible rigged 4K FBX."""

from __future__ import annotations
import argparse, json, os, re, sys, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path
from typing import Any

BASE = "https://openapi.tripo3d.ai/v3"
GEN_TYPES = {"text_to_model", "image_to_model", "multiview_to_model"}

def api(path: str, key: str, method: str = "GET", payload: Any = None) -> Any:
    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json", "User-Agent": "grasstex-tripo-sync/2.0"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = json.load(r)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"Tripo HTTP {exc.code} for {path}: {detail}") from exc
    if body.get("code") != 0:
        raise RuntimeError(f"Tripo API error for {path}: {body}")
    return body.get("data")

def split_ids(value: str) -> list[str]:
    return [x for x in re.split(r"[\s,]+", value.strip()) if x]

def usage_ids(key: str, limit: int) -> list[str]:
    data = api(f"/account/usage?limit={limit}&offset=0", key)
    if isinstance(data, dict):
        records = data.get("items") or data.get("records") or data.get("usage") or []
    else:
        records = data or []
    out = []
    for row in records:
        if isinstance(row, dict) and row.get("task_id"):
            out.append(str(row["task_id"]))
    return list(dict.fromkeys(out))

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

def poll(key: str, task_id: str, timeout: int = 900) -> dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        t = task(key, task_id)
        status = t.get("status")
        if status == "success":
            return t
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"Tripo task {task_id} ended as {status}: {t}")
        time.sleep(5)
    raise TimeoutError(f"Timed out waiting for Tripo task {task_id}")

def model_url(t: dict[str, Any]) -> str:
    output = t.get("output") or {}
    url = output.get("model_url")
    if not url:
        urls = output.get("model_urls") or []
        if isinstance(urls, list) and urls:
            url = urls[0]
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise RuntimeError(f"No downloadable model URL on task {t.get('task_id')}")
    return url

def download(url: str, path: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "grasstex-tripo-sync/2.0"})
    with urllib.request.urlopen(req, timeout=300) as r, path.open("wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

def make_rig(key: str, source_task_id: str) -> dict[str, Any]:
    data = api("/animations/rig", key, "POST", {
        "input": source_task_id,
        "model": "v1.0-20240301",
        "rig_type": "biped",
        "spec": "mixamo",
        "out_format": "fbx",
    })
    return poll(key, data["task_id"])

def make_4k_fbx(key: str, rigged_url: str) -> dict[str, Any]:
    data = api("/models/convert", key, "POST", {
        "input": rigged_url,
        "format": "FBX",
        "texture_size": 4096,
        "texture_format": "PNG",
        "bake": True,
        "with_animation": True,
        "fbx_preset": "mixamo",
    })
    return poll(key, data["task_id"])

def list_mode(key: str, limit: int, summary: str | None) -> int:
    ids = usage_ids(key, limit)
    rows = batch_tasks(key, ids)
    rows = [
        t for t in rows
        if t.get("status") == "success"
        and (t.get("type") in GEN_TYPES or "rig" in str(t.get("type", "")).lower())
    ]
    lines = [
        "## Tripo character sources", "",
        "Successful recent model/rig tasks. Select source task IDs and rerun in download mode.", "",
        "| Task ID | Type | Created |",
        "|---|---|---|",
    ]
    for t in rows:
        lines.append(f"| {t.get('task_id','')} | {t.get('type','')} | {t.get('created_at','')} |")
    text_value = "\n".join(lines) + "\n"
    if summary:
        Path(summary).write_text(text_value, encoding="utf-8")
    print(text_value)
    return 0

def download_mode(key: str, ids: list[str], destination: Path, summary: str | None) -> int:
    if not ids:
        raise SystemExit("download mode requires explicit --task-ids to avoid accidental rig/convert credit usage")
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    for source_id in ids:
        src = task(key, source_id)
        if src.get("status") != "success":
            raise RuntimeError(f"Source task {source_id} is not successful")
        src_type = str(src.get("type") or "")
        if src_type in GEN_TYPES:
            rig = make_rig(key, source_id)
        elif "rig" in src_type.lower():
            rig = src
        else:
            raise RuntimeError(f"{source_id} is not a generation or rig task (type={src_type})")

        converted = make_4k_fbx(key, model_url(rig))
        out = destination / f"{source_id}-mixamo-4k.fbx"
        download(model_url(converted), out)

        manifest.append({
            "source_task_id": source_id,
            "source_type": src_type,
            "rig_task_id": rig.get("task_id"),
            "convert_task_id": converted.get("task_id"),
            "file": out.name,
            "format": "FBX",
            "rig": "biped",
            "skeleton_spec": "mixamo",
            "texture_size": 4096,
            "texture_format": "PNG",
            "with_animation": True,
            "bytes": out.stat().st_size,
        })
        print(f"Downloaded {out}")

    manifest_path = destination / "tripo-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    text_value = (
        "## Tripo rigged FBX export\n\n"
        f"Exported **{len(manifest)}** Mixamo-compatible rigged FBX model(s) with 4096 px PNG textures.\n\n"
        f"Files: {destination}\n"
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
    if a.mode == "list":
        return list_mode(key, a.limit, a.summary)
    return download_mode(key, split_ids(a.task_ids), Path(a.destination), a.summary)

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
