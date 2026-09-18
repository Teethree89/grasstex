# M3C ownership sweep — test evidence (2026-09-17)

Data only. This is an orphan branch with no code history, so it will never
merge into a code branch and nothing here affects a build.

Code under test lives on `work/m3c-ownership-sweep-20260917`.

## live-preview/

Three full diagnostic captures taken by hand in the browser against the
deployed preview of build `preview-42a30cf`. Read-only, real-time
(`timeScale` 8), scenario seed `live-mu5o5lh2-43z8q`.

All three ran the full 600 s limit. Winners: us, ge, ge. Same seed, three
outcomes — real-time stepping is wall-clock dependent, so these are not a
controlled comparison with each other. They are the only capture of the
tactical-position and claim-collision counters under live conditions.

Notable and still unexplained: `claimCollisionsPrevented` reads 23, 3,838
and 970 across the three runs.

## paired-sample/

`m3c-paired-sample-20260917.json` — one row per run, distilled from 200 full
captures totalling ~1.1 GB that are **not** in this repo. The raw captures
were written to `/private/tmp/m3c-evidence/` and that path does not survive
a reboot; treat this file as the surviving record.

- `runs.B` — 100 baseline runs, `main` @ `5c0e0f3`
- `runs.A` — 100 sweep runs, `42a30cf`, **before** the cross-squad cover change

40 meeting, 30 US-defending, 30 GE-defending per arm, matched seeds, headless
at `timeScale` 1. `winner` is the recorded `battle.winner` field.

Headline from this sample: the sweep shifts outcomes toward the defender in
every scenario. US wins against a prepared German defence go from 3/30 to
0/30.

## Re-running a comparison

The B arm is `main` @ `5c0e0f3` and does not change, so a later run only
needs a fresh A arm compared against `runs.B` here. Do not regenerate the
baseline just to have a matching pair — a fresh baseline is a weaker
comparison than the one the A arm was actually measured against.

Findings written up in `M3C_STRUCTURAL_SWEEP_TESTING_SUMMARY.md` on the code
branch.
