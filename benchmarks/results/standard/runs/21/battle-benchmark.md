# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `40988190bfa2405736b25a92c46d405ae17ebc05`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **362.43s** (155.8× real-time, 16.55 battles/min)
- Results: US **57** (57.0%), GER **43** (43.0%), draw/none **0** (0.0%)
- Time-limit battles: **79/100**; captures avg **3.1** of **4.54** objectives; no-capture **24**
- Objectives nobody ever owned: **79** (17.4%) · never even contested **77** · distinct objectives assigned per side US **2.6**, GER **2.58**
- No objective progress: longest **597.6s** · mean per battle **286.9s**
- First contact avg **52.6s** · first fire **95.7s** · first objective progress **84.3s** · first capture **163.3s**
- Health: **80.2/100 overall** · strategic 73.3 · movement 98.5 · cohesion 77.4 · combat 98.4 · objective 53.4
- Stalls: vacant objective **193** · route **0** · soldier movement **43** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **56** (56 strategic) · loop alerts **1434** · idle-under-orders 1.5% · over-cohesion 42.3%
- Combat: **171404** discharges · **84335** direct · **8562** hits (10.2%) · **24** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 301 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| meeting | 60 | 37/23 | 80.6 | 70.4 | 98.1 | 77.1 | 58.6 | 0 | 39 | 46 | 1044 | 171.4s | 2.49/2.45 | 12.53 | 123 |
| us-defend | 20 | 19/1 | 79.2 | 77 | 99 | 75.5 | 46.1 | 0 | 3 | 4 | 216 | 450.1s | 2.81/2.74 | 8.7 | 11 |
| ge-defend | 20 | 1/19 | 80.1 | 78 | 99.2 | 80.5 | 44.8 | 0 | 1 | 6 | 174 | 470.1s | 2.73/2.82 | 7 | 18 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s1-b0009-0001` | meeting | us | 77.3 | 6/4 | 0 | 2.17/2.05 | 0 | 1 | 0 | 13 | 0 | 2 | 16 | 135.1s |
| `standard-benchmark-meeting-s6-b0007-0001` | meeting | ge | 72.5 | 6/4 | 0 | 2.6/3.15 | 0 | 3 | 0 | 6 | 0 | 4 | 16 | 215.1s |
| `standard-benchmark-meeting-s4-b0008-0001` | meeting | us | 75.7 | 6/4 | 0 | 3.12/2.22 | 0 | 0 | 0 | 9 | 0 | 1 | 20 | 202.5s |
| `standard-benchmark-meeting-s6-b0005-0001` | meeting | us | 77.3 | 8/6 | 0 | 2.9/2.5 | 0 | 1 | 0 | 7 | 0 | 2 | 20 | 122.5s |
| `standard-benchmark-us-defend-s1-b0001-0001` | us-defend | us | 71.2 | 0/5 | 2 | 3/2.79 | 0 | 0 | 0 | 0 | 0 | 2 | 18 | 597.6s |
| `standard-benchmark-meeting-s4-b0005-0001` | meeting | us | 78.6 | 4/4 | 0 | 2.26/2.71 | 0 | 0 | 0 | 8 | 0 | 1 | 20 | 142.5s |
| `standard-benchmark-meeting-s5-b0006-0001` | meeting | ge | 77.8 | 6/5 | 0 | 2.56/2.25 | 0 | 0 | 0 | 7 | 0 | 1 | 20 | 125.1s |
| `standard-benchmark-meeting-s1-b0004-0001` | meeting | ge | 74.4 | 3/4 | 1 | 2.55/2.47 | 0 | 0 | 0 | 5 | 0 | 1 | 19 | 172.5s |
| `standard-benchmark-meeting-s4-b0007-0001` | meeting | ge | 79.4 | 7/6 | 0 | 2.26/2.13 | 0 | 0 | 0 | 10 | 0 | 0 | 17 | 125.1s |
| `standard-benchmark-meeting-s2-b0006-0001` | meeting | us | 79.8 | 8/6 | 0 | 1.99/1.63 | 0 | 1 | 0 | 8 | 0 | 1 | 18 | 100.1s |
| `standard-benchmark-meeting-s6-b0002-0001` | meeting | us | 78.9 | 8/6 | 0 | 2.2/2.29 | 0 | 0 | 0 | 8 | 0 | 1 | 17 | 97.5s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 71 | 0/6 | 3 | 3/2.59 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s6-b0001-0001` | meeting | us | 77.4 | 5/4 | 0 | 1.87/2.19 | 0 | 0 | 0 | 7 | 0 | 1 | 16 | 105s |
| `standard-benchmark-meeting-s6-b0008-0001` | meeting | ge | 77.9 | 9/5 | 0 | 2.19/2.38 | 0 | 0 | 0 | 5 | 0 | 2 | 17 | 92.6s |
| `standard-benchmark-meeting-s3-b0006-0001` | meeting | us | 77.7 | 4/5 | 1 | 1.87/2.81 | 0 | 2 | 0 | 3 | 0 | 2 | 18 | 127.5s |
| `standard-benchmark-meeting-s6-b0009-0001` | meeting | ge | 77.1 | 4/4 | 0 | 3.78/2.02 | 0 | 0 | 0 | 3 | 0 | 2 | 18 | 237.6s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 81.9 | 4/5 | 1 | 2.48/2.31 | 0 | 0 | 0 | 2 | 0 | 2 | 20 | 135s |
| `standard-benchmark-ge-defend-s2-b0004-0001` | ge-defend | ge | 74.4 | 0/4 | 1 | 2.19/3 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0003-0001` | ge-defend | ge | 74.5 | 0/4 | 1 | 2.99/3 | 0 | 1 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-meeting-s6-b0006-0001` | meeting | us | 77.3 | 4/5 | 1 | 2.33/2.37 | 0 | 0 | 0 | 4 | 0 | 1 | 16 | 225s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
