#!/usr/bin/env bash
set -uo pipefail

# Failsafe wrapper around the existing benchmark runner.
#
# Each worker runs battles one at a time and keeps every completed battle report. When the worker
# wall-clock budget is exhausted it stops starting/running battles, merges whatever completed data
# exists, marks the worker report partial, and exits successfully so Actions can still upload it.
# This is deliberately a workflow/benchmark concern; it does not change simulation timing or AI.

requested="${BATTLE_BENCHMARK_COUNT:-10}"
cutoff_minutes="${BATTLE_BENCHMARK_WORKER_MINUTES:-10}"
final_output="${BATTLE_BENCHMARK_OUTPUT:-reports}"
base_seed="${BATTLE_BENCHMARK_SEED:-benchmark-worker}"

if ! [[ "$requested" =~ ^[0-9]+$ ]] || [ "$requested" -lt 1 ]; then
  echo "Invalid BATTLE_BENCHMARK_COUNT=$requested" >&2
  exit 2
fi
if ! [[ "$cutoff_minutes" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "Invalid BATTLE_BENCHMARK_WORKER_MINUTES=$cutoff_minutes" >&2
  exit 2
fi

cutoff_seconds="$(node -e 'const n=Number(process.argv[1]); process.stdout.write(String(Math.max(60, Math.round(n*60))))' "$cutoff_minutes")"
start_epoch="$(date +%s)"
deadline_epoch=$((start_epoch + cutoff_seconds))
scratch="$(mktemp -d)"
attempted=0
completed=0
failed=0
cutoff_reached=0

finish_report() {
  local reports
  reports="$(find "$scratch" -name battle-benchmark.json -type f 2>/dev/null | wc -l | tr -d ' ')"
  rm -rf "$final_output"
  mkdir -p "$final_output"

  if [ "$reports" -lt 1 ]; then
    cat >"$final_output/worker-status.json" <<EOF
{"requestedBattles":$requested,"attemptedBattles":$attempted,"completedBattles":0,"failedBattleAttempts":$failed,"workerMinutesCutoff":$cutoff_minutes,"workerCutoffReached":$cutoff_reached}
EOF
    echo "[BENCH-WORKER] No completed battles were available to merge." >&2
    return 1
  fi

  BATTLE_BENCHMARK_MERGE_INPUT="$scratch" BATTLE_BENCHMARK_OUTPUT="$final_output" node scripts/merge_battle_benchmarks.mjs

  REQUESTED="$requested" ATTEMPTED="$attempted" FAILED="$failed" CUTOFF_MINUTES="$cutoff_minutes" CUTOFF_REACHED="$cutoff_reached" OUTPUT="$final_output" node <<'NODE'
const fs = require('fs');
const path = require('path');
const out = process.env.OUTPUT;
const jsonPath = path.join(out, 'battle-benchmark.json');
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const requested = Number(process.env.REQUESTED || 0);
const attempted = Number(process.env.ATTEMPTED || 0);
const failed = Number(process.env.FAILED || 0);
const cutoffMinutes = Number(process.env.CUTOFF_MINUTES || 0);
const cutoffReached = process.env.CUTOFF_REACHED === '1';
const completed = Number(report.summary?.completedBattles || report.battles?.length || 0);
report.summary = report.summary || {};
report.summary.requestedBattles = requested;
report.summary.attemptedBattles = attempted;
report.summary.completedBattles = completed;
report.summary.missingBattles = Math.max(0, requested - completed);
report.summary.failedBattleAttempts = failed;
report.summary.workerMinutesCutoff = cutoffMinutes;
report.summary.workerCutoffReached = cutoffReached;
report.summary.workerStatus = completed >= requested && !cutoffReached && failed === 0 ? 'complete' : 'partial';
/* This report merges battles that ran sequentially inside one worker. The generic merger's
   cpuWallSeconds is therefore the worker's aggregate simulation wall time. Preserve it under the
   leaf-report wallSeconds key so the top-level merge can correctly take the max across parallel
   workers instead of seeing zero or using only the slowest single battle. */
const sequentialWall = Number(report.summary.cpuWallSeconds);
if (Number.isFinite(sequentialWall) && sequentialWall >= 0) report.summary.wallSeconds = sequentialWall;
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');

const mdPath = path.join(out, 'battle-benchmark.md');
if (fs.existsSync(mdPath)) {
  let md = fs.readFileSync(mdPath, 'utf8');
  md = md.replace(/- Completed: \*\*\d+\/\d+\*\*/, `- Completed: **${completed}/${requested} requested**`);
  const line = `- Worker failsafe: **${cutoffMinutes} min cap** · attempted **${attempted}** · failed attempts **${failed}** · cutoff ${cutoffReached ? '**reached**' : 'not reached'}`;
  md = md.replace(/^(# .*\n)/, `$1\n${line}\n`);
  fs.writeFileSync(mdPath, md);
}
NODE

  echo "[BENCH-WORKER] Preserved ${completed}/${requested} requested battles; attempted=${attempted}; failed=${failed}; cutoff=${cutoff_reached}."
}

# Best effort for local/runner SIGTERM. GitHub's explicit Cancel workflow can terminate the job before
# a later artifact-upload step runs, so the reliable failsafe is the self-imposed worker deadline.
trap 'cutoff_reached=1; finish_report || true; exit 143' TERM INT

for i in $(seq 1 "$requested"); do
  now="$(date +%s)"
  remaining=$((deadline_epoch - now))
  if [ "$remaining" -le 0 ]; then
    cutoff_reached=1
    echo "[BENCH-WORKER] ${cutoff_minutes} minute worker cap reached before battle ${i}; stopping."
    break
  fi

  attempted=$((attempted + 1))
  battle_dir="$scratch/battle-$(printf '%04d' "$i")"
  mkdir -p "$battle_dir"
  battle_seed="${base_seed}-b$(printf '%04d' "$i")"
  echo "[BENCH-WORKER] Battle ${i}/${requested}; ${remaining}s remain; seed=${battle_seed}"

  set +e
  BATTLE_BENCHMARK_COUNT=1 \
  BATTLE_BENCHMARK_OUTPUT="$battle_dir" \
  BATTLE_BENCHMARK_SEED="$battle_seed" \
  timeout --signal=TERM --kill-after=10s "${remaining}s" node scripts/run_battle_benchmark.mjs
  rc=$?
  set -e

  if [ -f "$battle_dir/battle-benchmark.json" ]; then
    completed=$((completed + 1))
  fi

  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ] || [ "$rc" -eq 143 ]; then
    cutoff_reached=1
    echo "[BENCH-WORKER] Wall-clock cap interrupted battle ${i}; preserving earlier completed battles."
    break
  elif [ "$rc" -ne 0 ]; then
    failed=$((failed + 1))
    echo "[BENCH-WORKER] Battle ${i} failed with exit ${rc}; continuing while budget remains." >&2
  fi
done

finish_report