# M3C Ownership Sweep — Testing Record

**Date:** 2026-09-17
**Branch:** `work/m3c-ownership-sweep-20260917`
**Build under test:** `preview-42a30cf`
**Baseline for comparison:** `main` at `5c0e0f3`

Two independent bodies of evidence are recorded here:

1. **Live preview runs** — 3 full diagnostic captures taken by hand in the browser against the deployed preview. Read-only, real-time (`timeScale` 8).
2. **Paired seed sample** — 200 headless replay runs (100 baseline / 100 sweep) over matched seeds at `timeScale` 1.

Neither set is a visual/gameplay validation. No frame-by-frame or behavioural review has been performed.

---

## 1. Live preview runs (3 captures)

All three used scenario seed `live-mu5o5lh2-43z8q` on build `preview-42a30cf`, each running the full 600 s limit and ending on "time limit objective score".

| | 15:15:10Z | 15:17:14Z | 15:19:03Z |
|---|---|---|---|
| Winner | **us** | **ge** | **ge** |
| Objectives held at export (of 5) | us 1 / ge 0 | us 2 / ge 1 | us 0 / ge 3 |
| US alive / kills | 25 / 20 | 16 / 13 | 19 / 10 |
| GE alive / kills | 30 / 25 | 37 / 34 | 40 / 31 |
| Ownership events | 7,169 | 3,313 | 4,061 |
| Ownership conflicts | 0 | 0 | 0 |
| Telemetry session | b-mu5o5mcd-ci056y | b-mu5o8ycz-yob85y | b-mu5obe1w-1fi5hw |
| Events sent / batches | 6,459 / 348 | 5,497 / 309 | 6,169 / 335 |
| Failed batches / dropped | 0 / 0 | 0 / 0 | 0 / 0 |
| Modules loaded | 22 | 22 | 22 |
| Console output | empty | empty | empty |

**Same seed, three different outcomes.** These ran at `timeScale` 8 in a live browser, so stepping is wall-clock dependent and not deterministic. Divergence here is expected and is *not* evidence of instability — but it also means these three runs cannot be compared against each other as a controlled experiment. The paired sample in section 2 is the controlled evidence.

### Tactical position assignments

| | 15:15:10Z | 15:17:14Z | 15:19:03Z |
|---|---|---|---|
| Assignments created | 5 | 15 | 15 |
| Occupied | 4 | 11 | 15 |
| Released | 5 | 15 | 15 |
| Live at export | 0 | 0 | 0 |
| Reassignments | 0 | 1 | 0 |
| Ingress routes created / invalidated | 5 / 0 | 15 / 0 | 15 / 0 |
| **Claim collisions prevented** | **23** | **3,838** | **970** |

Claim collisions prevented swings by two orders of magnitude across three runs of the same seed. This is the window/ingress crowding item already open in the roadmap — it is still not root-caused, and these captures do not explain it. Created/released balance exactly in all three runs, with nothing left live at export.

### What these captures do and do not show

- **Do show:** the preview deploy serves the intended build, runs a full match, loads all 22 modules, logs nothing to console, records zero ownership conflicts, and ships telemetry with no failed batches and no dropped events.
- **Do not show:** that the sweep is correct, that behaviour looks right on screen, or anything comparative — there is no baseline capture taken the same way.

---

## 2. Paired seed sample (300 runs)

Three arms over matched seeds, headless at `timeScale` 1, 100 runs each. Win/loss is taken from the recorded `battle.winner` field.

| Arm | Build | What it is |
|---|---|---|
| `B` | main @ `5c0e0f3` | baseline |
| `A` | branch @ `42a30cf` | the sweep |
| `A2` | branch @ `0eafc66` | the sweep plus cross-squad cover |

### Win split

| Scenario | n per arm | B | A | A2 | Fisher, A2 vs B |
|---|---|---|---|---|---|
| Meeting | 40 | 19 (47.5%) | 18 (45.0%) | 18 (45.0%) | p = 1.000 |
| US defending | 30 | 28 (93.3%) | 29 (96.7%) | 29 (96.7%) | p = 1.000 |
| GE defending | 30 | 3 (10.0%) | 0 (0.0%) | 1 (3.3%) | p = 0.612 |
| Pooled, defender wins | 60 | 55 (91.7%) | 59 (98.3%) | 58 (96.7%) | p = 0.439 |

**No win-split difference here is distinguishable from noise.** Every comparison against baseline is non-significant, including the one this document previously led with: GE-defend 3/30 against 0/30 is Fisher p = 0.237, and against A2's 1/30 it is p = 0.612. The 95% intervals overlap heavily in every scenario — GE-defend baseline is [3.5%, 25.6%] against A2's [0.6%, 16.7%].

An earlier revision of this file called the 3/30 to 0/30 shift "the finding" and described it as "a coherent directional effect, not scattered noise". That was wrong. It was a four-run swing across 100 paired battles, read as a mechanism it cannot support.

These scenarios are simply underpowered for the effect sizes involved. Calling a 10% against 3.3% difference at 80% power and alpha 0.05 needs about **216 runs per arm**; the pooled defender advantage, 91.7% against 96.7%, needs about **342 per arm**. We have 30 and 60. A defender-favouring drift may well be real — this sample cannot say either way, and no larger sample should be run just to settle it unless the answer changes a decision.

### Per-scenario metrics (mean, with median in brackets)

**Meeting (n=40 per arm)**

| Metric | Baseline | Sweep | Change |
|---|---|---|---|
| US alive | 26.32 [27] | 26.50 [26] | +0.7% |
| GE alive | 28.85 [27] | 26.30 [27] | −8.8% |
| US kills | 21.15 [23] | 23.70 [23] | +12.1% |
| GE kills | 23.68 [23] | 23.50 [24] | −0.7% |
| Objectives held, US | 1.52 [2] | 1.63 [1] | +6.6% |
| Objectives held, GE | 1.70 [2] | 1.57 [2] | −7.4% |
| Wall seconds | 39.14 [33.50] | 31.96 [31.76] | −18.3% |

**US defending (n=30 per arm)**

| Metric | Baseline | Sweep | Change |
|---|---|---|---|
| US alive | 36.37 [38] | 37.10 [38] | +2.0% |
| GE alive | 36.33 [36] | 37.83 [39] | +4.1% |
| US kills | 13.67 [15] | 12.17 [11] | −11.0% |
| GE kills | 13.63 [13] | 12.90 [13] | −5.4% |
| Objectives held, US | 2.77 [3] | 2.77 [3] | 0.0% |
| Objectives held, GE | 0.53 [0] | 0.37 [0] | −31.3% |
| Wall seconds | 44.07 [37.73] | 29.21 [33.33] | −33.7% |

**GE defending (n=30 per arm)**

| Metric | Baseline | Sweep | Change |
|---|---|---|---|
| US alive | 37.77 [37] | 38.33 [39] | +1.5% |
| GE alive | 35.00 [40] | 39.03 [41] | +11.5% |
| US kills | 15.00 [10] | 10.97 [10] | −26.9% |
| GE kills | 12.23 [13] | 11.67 [14] | −4.6% |
| Objectives held, US | 0.50 [0] | 0.20 [0] | −60.0% |
| Objectives held, GE | 2.63 [3] | 2.83 [3] | +7.6% |
| Wall seconds | 20.78 [23.16] | 23.75 [26.45] | +14.3% |

Wall seconds is runner cost, not in-game time; every run plays the full 600 s match.

---

## 3. Reading of the results

**Stable across all three arms:** zero ownership conflicts, zero telemetry loss, no console errors, all 22 modules loading, and zero runtime errors across the 100 A2 runs.

**Outcomes are unchanged within measurement precision.** That is the main result. The sweep is outcome-neutral at this sample size, and the cross-squad cover change did not move the win split either (GE-defend 0/30 to 1/30 is one run).

**The one robust behavioural difference is regroup churn.** Position assignments released because the squad entered regroup:

| Scenario | B | A | A2 |
|---|---|---|---|
| Meeting | 146 | 198 | 207 |
| US defending | 30 | 176 | 182 |
| GE defending | 17 | 167 | 154 |

Six- to nine-fold in the defend scenarios, and consistent across both sweep builds rather than varying between them. Unlike the win split, this is far too large to be sampling noise. Yet at the final snapshot only 2 squads sit in regroup on the sweep against 13 on baseline — so the sweep enters regroup constantly and leaves quickly, where baseline enters rarely and stays. This is worth understanding on its own merits. It is **not** evidence of a win-split regression, because there is no measured win-split regression.

**Wall seconds are not usable as a speed claim.** A2 reads far lower than A (meeting 32.0 s to 17.8 s), but A2 ran with nothing else competing for the machine while the earlier arms ran alongside a second server. Runner cost here is confounded with machine load, and the medians in section 2 are the more honest figure.

**Not established:** anything about on-screen behaviour beyond the visual check already done, whether the regroup churn has any outcome consequence, and what drives the claim-collision swing in the preview captures.

## 4. Status

- Preview deploy verified serving `preview-42a30cf`; production untouched, still v153.
- No merge to main. Awaiting visual check, then the standard 60/20/20 benchmark.
- Open roadmap issues from this sweep are recorded in `battle/AI_SIM_ROADMAP.md`.

**Open question for the visual check:** watch an assaulting force against a prepared defence and judge whether attackers are being beaten or are failing to commit.

---

## Source files

Live preview captures (~2.0 MB each, in `local testing/`):

```
battle-full-diag-live-mu5o5lh2-43z8q-preview-42a30cf-2026-09-17T15-15-10-666Z.json
battle-full-diag-live-mu5o5lh2-43z8q-preview-42a30cf-2026-09-17T15-17-14-786Z.json
battle-full-diag-live-mu5o5lh2-43z8q-preview-42a30cf-2026-09-17T15-19-03-875Z.json
```

Paired sample (200 files, ~2.1 MB each, in `/private/tmp/m3c-evidence/`, not in the repo):

```
B-meeting-01..40.json   A-meeting-01..40.json    (baseline / sweep)
B-us-01..30.json        A-us-01..30.json
B-ge-01..30.json        A-ge-01..30.json
```

Each paired file carries its seed at `.seed` and the match result at `.diagnostic.battle.winner`.
