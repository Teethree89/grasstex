# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `8c07d5cd62b88a4ddfc94760c750c4d6a8a6c0cd`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **355.1s** (156.4× real-time, 16.9 battles/min)
- Results: US **40** (40.0%), GER **60** (60.0%), draw/none **0** (0.0%)
- Time-limit battles: **72/100**; captures avg **3.2** of **4.54** objectives; no-capture **23**
- Objectives nobody ever owned: **71** (15.6%) · never even contested **69** · distinct objectives assigned per side US **2.55**, GER **2.58**
- No objective progress: longest **597.6s** · mean per battle **261.9s**
- First contact avg **53.6s** · first fire **99.4s** · first objective progress **83.4s** · first capture **166.9s**
- Health: **80.7/100 overall** · strategic 74.2 · movement 98.5 · cohesion 78.6 · combat 98.5 · objective 53.9
- Stalls: vacant objective **200** · route **0** · soldier movement **45** · targetless command **0** · long regroup **1**
- Coordination: writer conflicts **38** (38 strategic) · loop alerts **1364** · idle-under-orders 1.4% · over-cohesion 40.0%
- Combat: **159048** discharges · **82439** direct · **9083** hits (11.0%) · **6** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 303 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| meeting | 60 | 23/37 | 81.2 | 71.9 | 98 | 78.1 | 59.4 | 0 | 41 | 32 | 993 | 158.7s | 2.48/2.42 | 12.72 | 124 |
| us-defend | 20 | 16/4 | 79.5 | 76.8 | 99.1 | 76.8 | 46.3 | 0 | 2 | 2 | 194 | 381.3s | 2.69/2.84 | 9.35 | 9 |
| ge-defend | 20 | 1/19 | 80.5 | 78.3 | 99.1 | 82 | 45.1 | 0 | 2 | 4 | 177 | 452.3s | 2.63/2.79 | 7 | 16 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s6-b0007-0001` | meeting | ge | 75.4 | 6/4 | 0 | 2.17/2.82 | 0 | 1 | 0 | 5 | 0 | 3 | 19 | 150s |
| `standard-benchmark-meeting-s4-b0006-0001` | meeting | us | 73.8 | 3/4 | 1 | 3.22/3.03 | 0 | 0 | 0 | 5 | 0 | 1 | 20 | 252.6s |
| `standard-benchmark-us-defend-s1-b0002-0001` | us-defend | us | 71 | 0/6 | 3 | 2.17/2.78 | 0 | 0 | 0 | 3 | 0 | 0 | 17 | 300s |
| `standard-benchmark-meeting-s5-b0008-0001` | meeting | us | 77.8 | 6/5 | 0 | 2.27/2.11 | 0 | 1 | 0 | 5 | 0 | 2 | 20 | 142.5s |
| `standard-benchmark-meeting-s6-b0002-0001` | meeting | ge | 78.1 | 7/6 | 0 | 2.85/2.21 | 0 | 0 | 0 | 5 | 0 | 2 | 18 | 95.1s |
| `standard-benchmark-meeting-s5-b0003-0001` | meeting | ge | 78.1 | 6/5 | 1 | 2.12/1.68 | 0 | 0 | 0 | 7 | 1 | 0 | 16 | 137.4s |
| `standard-benchmark-meeting-s4-b0003-0001` | meeting | us | 75.2 | 1/4 | 3 | 2.22/2.29 | 0 | 1 | 0 | 0 | 0 | 2 | 17 | 302.5s |
| `standard-benchmark-meeting-s6-b0004-0001` | meeting | us | 77.8 | 6/5 | 0 | 2.59/2.12 | 0 | 0 | 0 | 5 | 0 | 2 | 17 | 124.9s |
| `standard-benchmark-meeting-s1-b0007-0001` | meeting | ge | 78.1 | 6/5 | 0 | 2.99/2.65 | 0 | 0 | 0 | 7 | 0 | 1 | 16 | 145s |
| `standard-benchmark-meeting-s3-b0006-0001` | meeting | us | 78.9 | 5/5 | 0 | 2.15/2.45 | 0 | 2 | 0 | 9 | 0 | 0 | 16 | 90.1s |
| `standard-benchmark-meeting-s4-b0007-0001` | meeting | ge | 77.6 | 6/6 | 1 | 2.06/2.38 | 0 | 0 | 0 | 8 | 0 | 0 | 14 | 167.5s |
| `standard-benchmark-meeting-s4-b0004-0001` | meeting | ge | 72.2 | 4/4 | 0 | 3.21/2.76 | 0 | 7 | 0 | 4 | 0 | 1 | 18 | 247.5s |
| `standard-benchmark-ge-defend-s1-b0009-0001` | ge-defend | ge | 76.5 | 1/5 | 1 | 2.09/2.2 | 0 | 0 | 0 | 4 | 0 | 1 | 17 | 180.1s |
| `standard-benchmark-meeting-s2-b0003-0001` | meeting | ge | 78.3 | 5/4 | 0 | 2.05/2.05 | 0 | 0 | 0 | 7 | 0 | 0 | 17 | 195s |
| `standard-benchmark-meeting-s3-b0009-0001` | meeting | us | 75 | 3/3 | 0 | 1.67/2.99 | 0 | 14 | 0 | 1 | 0 | 2 | 20 | 304.9s |
| `standard-benchmark-us-defend-s1-b0010-0001` | us-defend | us | 73.1 | 1/5 | 2 | 2.39/2.43 | 0 | 0 | 0 | 4 | 0 | 0 | 14 | 355s |
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 75.1 | 0/6 | 3 | 2.78/3 | 0 | 0 | 0 | 0 | 0 | 0 | 14 | 597.6s |
| `standard-benchmark-meeting-s1-b0001-0001` | meeting | ge | 79.9 | 6/5 | 0 | 2.41/2.46 | 0 | 2 | 0 | 7 | 0 | 0 | 17 | 127.5s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 78.7 | 4/5 | 1 | 2.46/2.19 | 0 | 0 | 0 | 5 | 0 | 0 | 18 | 135s |
| `standard-benchmark-meeting-s5-b0002-0001` | meeting | us | 76.6 | 3/4 | 1 | 2.54/2.31 | 0 | 0 | 0 | 4 | 0 | 1 | 16 | 100.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
