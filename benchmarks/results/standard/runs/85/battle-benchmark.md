# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `aa1ef832cdc4a9c439a32e136f9c4d3c3d8e0404`
- Build: `v29-dev`
- Policy: stashed-defaults, revision 0
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **222.36s** (235.4× real-time, 26.98 battles/min)
- Results: US **40** (40.0%), GER **60** (60.0%), draw/none **0** (0.0%)
- Time-limit battles: **50/100**; captures avg **4.01** of **4.54** objectives; no-capture **15**
- Objectives nobody ever owned: **52** (11.5%) · never even contested **48** · distinct objectives assigned per side US **2.3**, GER **2.39**
- No objective progress: longest **597.6s** · mean per battle **201.9s**
- First contact avg **58.3s** · first fire **97.8s** · first objective progress **72.1s** · first capture **164.4s**
- Health: **83.1/100 overall** · strategic 77 · movement 98.8 · cohesion 83.6 · combat 98.5 · objective 57.6
- Stalls: vacant objective **221** · route **0** · soldier movement **38** · targetless command **0** · long regroup **9**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1112** · idle-under-orders 1.0% · over-cohesion 29.6%
- Combat: **118197** discharges · **58067** direct · **11120** hits (19.1%) · **0** trigger-time LOS blocks · **255682** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1295 asset/CORS noise** · 319 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 24/36 | 82.9 | 75.2 | 98.4 | 82.7 | 59.5 | 0 | 34 | 0 | 815 | 130.5s | 2.23/2.3 | 10.97 | 0 | 45/205 |
| us-defend | 20 | 11/9 | 84.6 | 81.5 | 99.1 | 83.5 | 60.3 | 0 | 3 | 0 | 114 | 293.3s | 2.51/2.5 | 10.7 | 0 | 10/128 |
| ge-defend | 20 | 5/15 | 82.4 | 78.2 | 99.6 | 86.1 | 49.4 | 0 | 1 | 0 | 183 | 324.7s | 2.3/2.55 | 7.05 | 0 | 12/101 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 72.4 | 0/6 | 3 | 3.04/2.39 | 0 | 0 | 0 | 2 | 1 | 0 | 15 | 367.6s |
| `standard-benchmark-meeting-s2-b0008-0001` | meeting | us | 73.5 | 2/4 | 2 | 2.54/2.41 | 0 | 4 | 0 | 3 | 0 | 0 | 20 | 232.5s |
| `standard-benchmark-meeting-s2-b0003-0001` | meeting | ge | 79.8 | 7/4 | 0 | 1.36/2.24 | 0 | 0 | 0 | 8 | 1 | 0 | 16 | 87.6s |
| `standard-benchmark-meeting-s5-b0005-0001` | meeting | us | 78.3 | 6/5 | 0 | 1.89/2.22 | 0 | 0 | 0 | 7 | 1 | 0 | 16 | 187.6s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 75 | 0/6 | 3 | 3/2.19 | 0 | 0 | 0 | 0 | 1 | 0 | 12 | 597.6s |
| `standard-benchmark-meeting-s3-b0006-0001` | meeting | us | 78.1 | 4/5 | 1 | 2.78/2.37 | 0 | 1 | 0 | 6 | 0 | 0 | 14 | 127.6s |
| `standard-benchmark-meeting-s2-b0006-0001` | meeting | ge | 82 | 8/6 | 0 | 2.13/2.02 | 0 | 0 | 0 | 8 | 0 | 0 | 14 | 95.1s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 80.9 | 5/5 | 1 | 1.74/2.5 | 0 | 0 | 0 | 3 | 0 | 0 | 20 | 202.5s |
| `standard-benchmark-meeting-s3-b0008-0001` | meeting | ge | 80.7 | 6/4 | 0 | 2.08/2.11 | 0 | 0 | 0 | 7 | 0 | 0 | 15 | 95s |
| `standard-benchmark-meeting-s4-b0002-0001` | meeting | us | 80.8 | 6/5 | 0 | 2.8/2.03 | 0 | 0 | 0 | 6 | 0 | 0 | 17 | 90s |
| `standard-benchmark-meeting-s6-b0002-0001` | meeting | ge | 80 | 9/6 | 1 | 2.06/2.53 | 0 | 0 | 0 | 5 | 0 | 0 | 16 | 95.1s |
| `standard-benchmark-ge-defend-s1-b0006-0001` | ge-defend | ge | 71.8 | 0/3 | 1 | 1.79/1.88 | 0 | 1 | 0 | 3 | 0 | 0 | 8 | 525s |
| `standard-benchmark-ge-defend-s2-b0001-0001` | ge-defend | ge | 77.5 | 0/4 | 2 | 2.01/2 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 597.6s |
| `standard-benchmark-meeting-s5-b0002-0001` | meeting | ge | 80.1 | 5/4 | 0 | 2.39/2.22 | 0 | 0 | 0 | 5 | 0 | 0 | 17 | 95.1s |
| `standard-benchmark-meeting-s5-b0006-0001` | meeting | us | 79.7 | 8/5 | 1 | 2.44/2.28 | 0 | 0 | 0 | 4 | 0 | 0 | 16 | 120s |
| `standard-benchmark-meeting-s3-b0003-0001` | meeting | ge | 79.1 | 5/4 | 0 | 2.1/2.47 | 0 | 0 | 0 | 4 | 1 | 0 | 16 | 192.6s |
| `standard-benchmark-meeting-s1-b0002-0001` | meeting | us | 79.9 | 6/5 | 0 | 2.16/2.6 | 0 | 0 | 0 | 6 | 0 | 0 | 13 | 210s |
| `standard-benchmark-meeting-s6-b0003-0001` | meeting | ge | 80.7 | 6/4 | 0 | 1.63/2.01 | 0 | 0 | 0 | 6 | 0 | 0 | 14 | 130s |
| `standard-benchmark-meeting-s6-b0008-0001` | meeting | us | 82.5 | 11/5 | 0 | 1.83/2.07 | 0 | 1 | 0 | 4 | 0 | 0 | 19 | 90s |
| `standard-benchmark-us-defend-s2-b0003-0001` | us-defend | us | 73.6 | 0/4 | 1 | 2.5/2.73 | 0 | 0 | 0 | 3 | 0 | 0 | 9 | 347.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
