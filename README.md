# M3C ownership sweep — test evidence

Data only. Orphan branch with no code history, so it will never merge into a
code branch and nothing here affects a build.

The sweep was merged to main as `3d3e805` on 2026-09-18. Every figure quoted
in that merge commit comes from this branch.

## benchmark/

The standard 60/20/20 benchmark, run on main and the branch with the same
seed prefix (`merge-check-20260918`) and a 45 minute worker cutoff. Both
arms completed all 100 battles.

- `main/` — `5c0e0f3`, run 35336628550
- `branch/` — `b3c4a05`, run 35336635523

Each holds the rendered report, the per-battle CSV, and the summary block.
The full per-battle JSON (7–16 MB each) is not kept; the CSV carries the
per-battle rows.

This is the comparison that decided the merge. Per battle:

| | main | branch |
|---|---|---|
| writerConflicts | 75.82 | 0 |
| strategicWriterConflicts | 75.82 | 0 |
| longRegroups | 1.21 | 0 |
| losBlockedFireAttempts | 2.35 | 0.11 |
| movementStalls | 1.88 | 0.91 |
| loopAlerts | 15.57 | 13.66 |
| vacantObjectiveStalls | 1.30 | 1.08 |
| objectivesNeverOwned | 1.05 | 1.25 |
| health overall | 71.8 | 79.7 |

Two cautions on reading it. `writerConflicts` is exactly 80 in 92 of main's
100 battles, which looks like a cap or a structural constant rather than a
measured count — so main's true rate is at least 80 per battle and the size
of the drop to zero is unknown, though the zero itself is not in doubt.
And outcomes did not change: US wins 50/100 against 45/100, Fisher p=0.571,
with no scenario significant alone.

### The wall-time tail

Main's per-battle wall seconds run p50 29.8, p90 41.6, max **506.9**. The
branch runs p50 26.5, p90 34.8, max **42.8**. Four main battles exceed 60 s
and none of the branch's do.

The median barely moves. What changed is that the tail is gone, and that is
what makes the whole run faster — ten parallel workers cannot finish before
the slowest, so one 507 s battle drags everything.

Comparing main's four slow battles against their seed twins: stalls separate
them, conflicts do not. `vacantObjectiveStalls` 5.5 against 1.1, and
`movementStalls` 5.3 against 1.7, while `simulatedSeconds` is flat at 600.1
against 574.6 and `writerConflicts` is flat at 80.0 against 75.6. The same
simulated battle costs 17x the real time, so the per-step cost exploded
rather than the step count. That points at stall-driven navigation replanning,
which the roadmap already names as the hot path. All four slow seeds show
`movementStalls: 0` on their branch twin.

## paired-sample/

`m3c-paired-sample-20260917.json` — one row per run, 300 runs across three
arms, distilled from ~1.1 GB of full captures that are **not** in this repo
and were written to `/private/tmp/m3c-evidence/`, a path that does not
survive a reboot. This file is the surviving record.

- `runs.B` — 100 runs, main `5c0e0f3`
- `runs.A` — 100 runs, branch `42a30cf`
- `runs.A2` — 100 runs, branch `0eafc66`, the arm that measured what merged

40 meeting, 30 US-defending, 30 GE-defending per arm, matched seeds, headless
at `timeScale` 1.

**Do not read `ownershipConflicts: 0` on the B arm as a measurement.** Its
`ownershipEvents` is 0 because main has no ownership instrumentation at all —
the sweep added those counters. The branch's 0 conflicts across 561,860
events stands on its own; there is simply no baseline to compare it against.

An earlier revision of the sweep's write-up called a GE-defend shift from
3/30 to 0/30 "the finding" and read it as attackers no longer being able to
take prepared ground. That was wrong: Fisher p=0.237, a four-run swing across
100 paired battles. These scenarios need roughly 216 runs per arm to resolve
a difference that size. The retraction is commit `b3c4a05`.

## live-preview/

Three full browser captures of build `preview-42a30cf`, read-only, real-time
(`timeScale` 8), seed `live-mu5o5lh2-43z8q`. All ran the full 600 s limit.
Winners: us, ge, ge — same seed, three outcomes, because real-time stepping
is wall-clock dependent. They are not a controlled comparison with each
other.

Still unexplained: `claimCollisionsPrevented` reads 23, 3,838 and 970 across
the three.

## Re-running a comparison

The B arm is `5c0e0f3` and does not change, so a later run needs only a fresh
arm compared against `runs.B`. Do not regenerate the baseline for the sake of
a matching pair — a fresh baseline is a weaker comparison than the one the
other arm was actually measured against.
