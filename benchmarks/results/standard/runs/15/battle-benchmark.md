# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `13b7264b0cf39cca1cf557e5e769eb90e98352a7`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **551.92s** (103.6× real-time, 10.87 battles/min)
- Results: US **49** (49.0%), GER **51** (51.0%), draw/none **0** (0.0%)
- Time-limit battles: **84/100**; captures avg **2.99** of **4.54** objectives; no-capture **21**
- Objectives nobody ever owned: **80** (17.6%) · never even contested **77** · distinct objectives assigned per side US **2.45**, GER **2.52**
- No objective progress: longest **597.6s** · mean per battle **282.7s**
- First contact avg **54.4s** · first fire **97.9s** · first objective progress **84.4s** · first capture **164.5s**
- Health: **79.7/100 overall** · strategic 71.8 · movement 98.5 · cohesion 74.6 · combat 97.7 · objective 56.2
- Stalls: vacant objective **167** · route **0** · soldier movement **40** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **77** (77 strategic) · loop alerts **1464** · idle-under-orders 1.6% · over-cohesion 47.5%
- Combat: **168261** discharges · **120049** direct · **18464** hits (15.4%) · **27** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 302 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| meeting | 60 | 31/29 | 80.1 | 69.3 | 98.1 | 74.8 | 60.2 | 0 | 38 | 57 | 1037 | 181.9s | 2.33/2.33 | 9.35 | 15 |
| us-defend | 20 | 18/2 | 78.4 | 75.9 | 99.2 | 72.5 | 46.9 | 0 | 1 | 7 | 240 | 457.1s | 2.85/2.76 | 7.25 | 2 |
| ge-defend | 20 | 0/20 | 80.2 | 75 | 99 | 76.4 | 53.3 | 0 | 1 | 13 | 187 | 410.8s | 2.4/2.83 | 5.9 | 4 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s4-b0007-0001` | meeting | ge | 76.3 | 7/6 | 0 | 2.32/1.86 | 0 | 0 | 0 | 10 | 0 | 2 | 16 | 154.9s |
| `standard-benchmark-meeting-s1-b0004-0001` | meeting | us | 69.5 | 2/4 | 2 | 2.3/2.32 | 0 | 1 | 0 | 5 | 0 | 2 | 16 | 220s |
| `standard-benchmark-meeting-s6-b0003-0001` | meeting | us | 76.4 | 4/4 | 0 | 1.45/2.29 | 0 | 2 | 0 | 10 | 0 | 1 | 17 | 195s |
| `standard-benchmark-meeting-s6-b0007-0001` | meeting | us | 77.9 | 5/4 | 0 | 1.91/2.87 | 0 | 0 | 0 | 9 | 0 | 0 | 20 | 235s |
| `standard-benchmark-meeting-s6-b0008-0001` | meeting | us | 78.5 | 7/5 | 0 | 2.19/2.35 | 0 | 1 | 0 | 9 | 0 | 1 | 17 | 100.1s |
| `standard-benchmark-meeting-s3-b0005-0001` | meeting | ge | 77.9 | 5/4 | 0 | 2.25/1.72 | 0 | 0 | 0 | 9 | 0 | 2 | 13 | 130.1s |
| `standard-benchmark-meeting-s6-b0005-0001` | meeting | ge | 77.4 | 8/6 | 0 | 3.17/2.56 | 0 | 0 | 0 | 8 | 0 | 1 | 18 | 120s |
| `standard-benchmark-meeting-s5-b0001-0001` | meeting | ge | 76.6 | 4/5 | 1 | 2.2/2.02 | 0 | 0 | 0 | 0 | 0 | 4 | 18 | 375s |
| `standard-benchmark-meeting-s4-b0001-0001` | meeting | ge | 76.1 | 6/6 | 0 | 2.73/1.93 | 0 | 0 | 0 | 4 | 0 | 2 | 20 | 177.6s |
| `standard-benchmark-meeting-s2-b0001-0001` | meeting | ge | 76.5 | 5/4 | 0 | 2.08/2.24 | 0 | 0 | 0 | 6 | 0 | 2 | 16 | 184.9s |
| `standard-benchmark-us-defend-s1-b0006-0001` | us-defend | us | 70.4 | 0/5 | 2 | 3/1.99 | 0 | 1 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 71.8 | 0/6 | 3 | 1.99/3 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 70.7 | 0/6 | 3 | 3/2.39 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 78.9 | 4/5 | 1 | 3.05/2.85 | 0 | 0 | 0 | 2 | 0 | 3 | 18 | 155.1s |
| `standard-benchmark-meeting-s2-b0008-0001` | meeting | us | 78.9 | 4/4 | 1 | 2.5/1.71 | 0 | 4 | 0 | 1 | 0 | 3 | 20 | 115.1s |
| `standard-benchmark-us-defend-s1-b0002-0001` | us-defend | us | 72.4 | 0/6 | 3 | 3/1.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0006-0001` | ge-defend | ge | 79.8 | 1/3 | 0 | 1.82/2 | 0 | 0 | 0 | 0 | 0 | 5 | 16 | 282.4s |
| `standard-benchmark-meeting-s3-b0001-0001` | meeting | us | 76.1 | 2/5 | 3 | 2.22/2.99 | 0 | 0 | 0 | 2 | 0 | 0 | 19 | 272.5s |
| `standard-benchmark-meeting-s3-b0006-0001` | meeting | us | 79.8 | 6/5 | 0 | 2.45/2.98 | 0 | 0 | 0 | 2 | 0 | 4 | 16 | 112.5s |
| `standard-benchmark-meeting-s5-b0006-0001` | meeting | ge | 78.5 | 6/5 | 0 | 2.44/2.76 | 0 | 1 | 0 | 6 | 0 | 0 | 20 | 105.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
