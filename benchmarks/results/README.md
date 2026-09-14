# Persistent battle benchmark results

This branch stores lightweight, durable outputs from the `100 Battle Benchmark` workflow.

- `status.json` is the completion signal for the newest published run.
- `latest/` contains the newest completed Markdown, CSV, and compact JSON summary.
- `runs/<run-number>/` keeps the same lightweight report bundle for history.
- Full per-battle JSON remains available as the GitHub Actions artifact for 30 days; it is intentionally not committed here to keep repository growth under control.

Historical backfill is present for benchmark runs **1, 2, and 3**, with Markdown, CSV, and compact JSON summary files under `runs/1/`, `runs/2/`, and `runs/3/`.

The benchmark workflow runs from `main`. This results branch is separate from `main`, so report publication does not trigger the Battle Sim deployment workflow or another benchmark run.
