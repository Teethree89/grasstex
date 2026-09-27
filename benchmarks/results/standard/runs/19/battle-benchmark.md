# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `42bdb6cb92150a8c521bfbd8d27c06044fa8da66`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **357.32s** (157.2× real-time, 16.79 battles/min)
- Results: US **52** (52.0%), GER **48** (48.0%), draw/none **0** (0.0%)
- Time-limit battles: **78/100**; captures avg **2.95** of **4.54** objectives; no-capture **22**
- Objectives nobody ever owned: **92** (20.3%) · never even contested **89** · distinct objectives assigned per side US **2.62**, GER **2.62**
- No objective progress: longest **600.1s** · mean per battle **278.4s**
- First contact avg **52.6s** · first fire **95.7s** · first objective progress **81.6s** · first capture **165.8s**
- Health: **80.2/100 overall** · strategic 73.2 · movement 98.5 · cohesion 74.6 · combat 97.5 · objective 57.3
- Stalls: vacant objective **117** · route **0** · soldier movement **39** · targetless command **0** · long regroup **1**
- Coordination: writer conflicts **48** (48 strategic) · loop alerts **1516** · idle-under-orders 1.6% · over-cohesion 47.6%
- Combat: **170606** discharges · **120386** direct · **19023** hits (15.8%) · **10** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1298 asset/CORS noise** · 303 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| meeting | 60 | 33/27 | 80.7 | 70.9 | 98.2 | 74.3 | 62.4 | 0 | 35 | 41 | 1025 | 180.9s | 2.57/2.46 | 10.35 | 95 |
| us-defend | 20 | 17/3 | 78.8 | 76.5 | 98.8 | 72.5 | 48.8 | 0 | 4 | 2 | 259 | 417.6s | 2.79/2.86 | 8.6 | 9 |
| ge-defend | 20 | 2/18 | 80.2 | 76.8 | 99.3 | 77.7 | 50.7 | 0 | 0 | 5 | 232 | 431.9s | 2.61/2.84 | 6.2 | 10 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s1-b0008-0001` | meeting | ge | 67.9 | 0/3 | 3 | 2.99/2.8 | 0 | 1 | 0 | 0 | 0 | 2 | 16 | 600.1s |
| `standard-benchmark-meeting-s4-b0005-0001` | meeting | us | 76.9 | 5/4 | 0 | 2.23/2.64 | 0 | 0 | 0 | 8 | 0 | 1 | 19 | 162.4s |
| `standard-benchmark-meeting-s6-b0007-0001` | meeting | ge | 74.8 | 6/4 | 0 | 2.31/2.97 | 0 | 2 | 0 | 7 | 0 | 1 | 17 | 227.6s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 70.5 | 0/6 | 3 | 3/2.59 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 597.6s |
| `standard-benchmark-meeting-s3-b0002-0001` | meeting | ge | 77.5 | 5/6 | 1 | 2.68/2.23 | 0 | 0 | 0 | 7 | 0 | 0 | 19 | 152.6s |
| `standard-benchmark-meeting-s2-b0003-0001` | meeting | ge | 78.7 | 5/4 | 0 | 2.05/2.3 | 0 | 0 | 0 | 7 | 0 | 0 | 20 | 240s |
| `standard-benchmark-meeting-s5-b0006-0001` | meeting | ge | 76.9 | 6/5 | 0 | 2.22/2.19 | 0 | 0 | 0 | 5 | 0 | 1 | 20 | 125.1s |
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 74.3 | 0/6 | 3 | 2.7/3 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 80.9 | 6/5 | 0 | 2.48/2.42 | 0 | 0 | 0 | 2 | 0 | 3 | 20 | 135s |
| `standard-benchmark-meeting-s1-b0003-0001` | meeting | us | 77.3 | 3/3 | 0 | 2.73/2.49 | 0 | 0 | 0 | 2 | 0 | 3 | 16 | 295.1s |
| `standard-benchmark-meeting-s5-b0007-0001` | meeting | ge | 80.4 | 7/6 | 0 | 1.85/2.05 | 0 | 0 | 0 | 3 | 0 | 2 | 20 | 130s |
| `standard-benchmark-ge-defend-s2-b0003-0001` | ge-defend | ge | 74.1 | 0/4 | 1 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-us-defend-s1-b0001-0001` | us-defend | us | 72.4 | 0/5 | 2 | 3/2.59 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s4-b0004-0001` | meeting | ge | 75.3 | 1/4 | 3 | 3.33/3.18 | 0 | 2 | 0 | 0 | 0 | 0 | 20 | 382.5s |
| `standard-benchmark-meeting-s2-b0005-0001` | meeting | ge | 80.4 | 7/6 | 0 | 2.74/2.06 | 0 | 0 | 0 | 2 | 0 | 3 | 18 | 142.5s |
| `standard-benchmark-us-defend-s2-b0007-0001` | us-defend | us | 73.2 | 0/5 | 2 | 3/2.98 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s3-b0001-0001` | meeting | us | 77.1 | 3/5 | 2 | 3.04/2.73 | 0 | 0 | 0 | 1 | 0 | 2 | 16 | 230.1s |
| `standard-benchmark-meeting-s6-b0006-0001` | meeting | us | 79.8 | 6/5 | 0 | 2.33/2.44 | 0 | 1 | 0 | 4 | 0 | 1 | 20 | 112.5s |
| `standard-benchmark-us-defend-s2-b0003-0001` | us-defend | us | 73 | 0/4 | 1 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0001-0001` | ge-defend | ge | 74.3 | 0/4 | 2 | 2.81/2 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
