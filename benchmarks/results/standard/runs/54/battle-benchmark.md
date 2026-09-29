# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `055de146d9e1a5fcdcb716b7321532a7904c6b9e`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **221.07s** (231.9× real-time, 27.14 battles/min)
- Results: US **48** (48.0%), GER **52** (52.0%), draw/none **0** (0.0%)
- Time-limit battles: **59/100**; captures avg **4.18** of **4.59** objectives; no-capture **12**
- Objectives nobody ever owned: **33** (7.2%) · never even contested **30** · distinct objectives assigned per side US **2.54**, GER **2.44**
- No objective progress: longest **597.6s** · mean per battle **183.1s**
- First contact avg **61.3s** · first fire **97s** · first objective progress **70.1s** · first capture **163.4s**
- Health: **82.2/100 overall** · strategic 71.8 · movement 98.5 · cohesion 82.9 · combat 98.5 · objective 59.1
- Stalls: vacant objective **252** · route **0** · soldier movement **50** · targetless command **0** · long regroup **17**
- Coordination: writer conflicts **111** (111 strategic) · loop alerts **1068** · idle-under-orders 1.0% · over-cohesion 30.9%
- Combat: **110278** discharges · **52570** direct · **10557** hits (20.1%) · **0** trigger-time LOS blocks · **229180** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 304 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 28/32 | 80.6 | 66.2 | 98.1 | 82 | 58.4 | 0 | 44 | 91 | 826 | 130.6s | 2.43/2.32 | 12.52 | 0 | 115/211 |
| us-defend | 20 | 12/8 | 85.4 | 83.8 | 99.3 | 86 | 59 | 0 | 3 | 13 | 96 | 205.2s | 2.67/2.64 | 10.1 | 0 | 23/82 |
| ge-defend | 20 | 8/12 | 83.7 | 76.8 | 99.2 | 82.7 | 61.5 | 0 | 3 | 7 | 146 | 318.2s | 2.75/2.59 | 10 | 0 | 50/122 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `baseline-20260929-meeting-s1-b0001-0001` | meeting | us | 75.7 | 7/6 | 0 | 2.05/2.48 | 0 | 2 | 0 | 14 | 0 | 2 | 16 | 174.9s |
| `baseline-20260929-meeting-s4-b0003-0001` | meeting | us | 75.3 | 4/4 | 0 | 1.73/2.23 | 0 | 0 | 0 | 11 | 0 | 3 | 10 | 282.6s |
| `baseline-20260929-meeting-s5-b0006-0001` | meeting | ge | 78.3 | 8/5 | 0 | 2.15/2.28 | 0 | 0 | 0 | 10 | 0 | 2 | 16 | 77.6s |
| `baseline-20260929-meeting-s2-b0004-0001` | meeting | us | 76.7 | 8/5 | 0 | 2.34/2.29 | 0 | 0 | 0 | 7 | 1 | 3 | 16 | 92.6s |
| `baseline-20260929-meeting-s4-b0008-0001` | meeting | us | 78.2 | 9/5 | 0 | 2.87/1.64 | 0 | 0 | 0 | 9 | 0 | 2 | 17 | 87.6s |
| `baseline-20260929-meeting-s6-b0006-0001` | meeting | us | 74.2 | 4/4 | 0 | 2.54/2.34 | 0 | 0 | 0 | 8 | 2 | 1 | 16 | 157.5s |
| `baseline-20260929-meeting-s3-b0004-0001` | meeting | us | 77.5 | 7/5 | 0 | 2.54/2.55 | 0 | 1 | 0 | 3 | 0 | 5 | 16 | 97.5s |
| `baseline-20260929-meeting-s2-b0005-0001` | meeting | us | 76.3 | 6/5 | 1 | 1.93/2.39 | 0 | 0 | 0 | 4 | 0 | 3 | 17 | 132.6s |
| `baseline-20260929-meeting-s1-b0003-0001` | meeting | ge | 73.1 | 11/6 | 0 | 1.54/2.24 | 0 | 2 | 0 | 6 | 1 | 4 | 10 | 72.6s |
| `baseline-20260929-meeting-s3-b0002-0001` | meeting | us | 75.9 | 4/3 | 0 | 2.37/1.87 | 0 | 0 | 0 | 4 | 0 | 3 | 17 | 260.1s |
| `baseline-20260929-meeting-s6-b0008-0001` | meeting | us | 76 | 5/4 | 0 | 2.12/2.03 | 0 | 1 | 0 | 6 | 1 | 2 | 16 | 105s |
| `baseline-20260929-meeting-s1-b0004-0001` | meeting | us | 74.6 | 10/6 | 0 | 2.08/2.97 | 0 | 3 | 0 | 5 | 0 | 6 | 6 | 90s |
| `baseline-20260929-meeting-s1-b0010-0001` | meeting | us | 77.9 | 6/6 | 1 | 2.08/2.19 | 0 | 0 | 0 | 4 | 0 | 2 | 18 | 137.5s |
| `baseline-20260929-meeting-s6-b0002-0001` | meeting | us | 77.7 | 6/4 | 0 | 2.04/2.98 | 0 | 0 | 0 | 5 | 0 | 2 | 17 | 77.6s |
| `baseline-20260929-meeting-s5-b0007-0001` | meeting | us | 79.6 | 4/4 | 0 | 1.52/1.92 | 0 | 0 | 0 | 9 | 0 | 0 | 14 | 255.1s |
| `baseline-20260929-meeting-s2-b0003-0001` | meeting | ge | 77.7 | 5/4 | 0 | 3.11/2.9 | 0 | 0 | 0 | 6 | 0 | 1 | 16 | 235.1s |
| `baseline-20260929-us-defend-s2-b0003-0001` | us-defend | ge | 81.5 | 3/5 | 0 | 2.46/2.87 | 0 | 0 | 0 | 0 | 0 | 6 | 12 | 265.1s |
| `baseline-20260929-meeting-s2-b0010-0001` | meeting | us | 78.2 | 4/4 | 1 | 3.64/2.71 | 0 | 0 | 0 | 3 | 0 | 2 | 16 | 165s |
| `baseline-20260929-us-defend-s1-b0007-0001` | us-defend | us | 77.6 | 1/5 | 1 | 2.56/2.78 | 0 | 0 | 0 | 2 | 0 | 2 | 15 | 417.4s |
| `baseline-20260929-meeting-s1-b0007-0001` | meeting | ge | 76.8 | 5/4 | 0 | 3.05/1.99 | 0 | 3 | 0 | 7 | 0 | 1 | 13 | 140.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
