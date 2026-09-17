# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **52 min cutoff**

- Commit: `c2b43faf614a4c7e0ebba22e851c9cd3f59ca22d`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **8/10**
- Completed: **17/100 expected** in about **3055.32s** (3.1× real-time, 0.33 battles/min)
- Results: US **4** (23.5%), GER **13** (76.5%), draw/none **0** (0.0%)
- Time-limit battles: **15/17**; captures avg **1.29** of **4.76** objectives; no-capture **9**
- Objectives nobody ever owned: **24** (29.6%) · never even contested **23** · distinct objectives assigned per side US **2.96**, GER **3.09**
- No objective progress: longest **597.6s** · mean per battle **424s**
- First contact avg **33.5s** · first fire **97.1s** · first objective progress **28.7s** · first capture **172.6s**
- Health: **70.1/100 overall** · strategic 47.5 · movement 91.6 · cohesion 68.1 · combat 98.1 · objective 45
- Stalls: vacant objective **7** · route **0** · soldier movement **46** · targetless command **0** · long regroup **3**
- Coordination: writer conflicts **1107** (1107 strategic) · loop alerts **214** · idle-under-orders 8.1% · over-cohesion 58.4%
- Combat: **13082** discharges · **10855** direct · **1363** hits (12.6%) · **6** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **51 asset/CORS noise** · 85 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 4 | 0/4 | 69.3 | 45 | 84.8 | 62.3 | 55.8 | 0 | 25 | 320 | 65 | 241.3s |
| us-defend | 6 | 4/2 | 68.2 | 45 | 90 | 66 | 40.9 | 0 | 17 | 418 | 86 | 501.3s |
| ge-defend | 7 | 0/7 | 72.1 | 51.1 | 96.9 | 73.2 | 42.4 | 0 | 4 | 369 | 63 | 462.2s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-ge-defend-s1-b0001-0001` | ge-defend | ge | 64.1 | 0/5 | 2 | 2.99/3 | 0 | 4 | 0 | 0 | 0 | 80 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0001-0001` | ge-defend | ge | 67 | 0/4 | 2 | 2.99/2 | 0 | 0 | 0 | 0 | 0 | 80 | 16 | 597.6s |
| `standard-benchmark-meeting-s4-b0001-0001` | meeting | ge | 68.2 | 2/6 | 4 | 2.99/3.81 | 0 | 3 | 0 | 0 | 0 | 80 | 16 | 425.1s |
| `standard-benchmark-meeting-s5-b0001-0001` | meeting | ge | 66.6 | 3/5 | 2 | 3.73/2.71 | 0 | 18 | 0 | 0 | 0 | 80 | 20 | 272.5s |
| `standard-benchmark-us-defend-s2-b0003-0001` | us-defend | us | 66.8 | 0/4 | 1 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 80 | 16 | 597.6s |
| `standard-benchmark-us-defend-s1-b0002-0001` | us-defend | ge | 69.4 | 2/6 | 2 | 2.18/3.01 | 0 | 9 | 0 | 1 | 0 | 80 | 19 | 195s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 65.9 | 0/6 | 3 | 3/3.98 | 0 | 1 | 0 | 0 | 0 | 80 | 9 | 597.6s |
| `standard-benchmark-us-defend-s2-b0001-0001` | us-defend | us | 65.2 | 0/5 | 2 | 3/2.99 | 0 | 2 | 0 | 0 | 0 | 80 | 10 | 597.6s |
| `standard-benchmark-meeting-s3-b0001-0001` | meeting | ge | 69.1 | 5/5 | 1 | 3.63/3.55 | 0 | 4 | 0 | 2 | 1 | 80 | 16 | 162.6s |
| `standard-benchmark-meeting-s2-b0001-0001` | meeting | ge | 73.3 | 5/4 | 0 | 2.98/2.86 | 0 | 0 | 0 | 4 | 0 | 80 | 13 | 105s |
| `standard-benchmark-us-defend-s2-b0004-0001` | us-defend | ge | 78.4 | 3/6 | 0 | 3/3.7 | 0 | 4 | 0 | 0 | 0 | 80 | 16 | 422.5s |
| `standard-benchmark-ge-defend-s2-b0002-0001` | ge-defend | ge | 74.9 | 1/5 | 1 | 2.99/3 | 0 | 0 | 0 | 0 | 1 | 80 | 7 | 470.1s |
| `standard-benchmark-ge-defend-s2-b0004-0001` | ge-defend | ge | 67.2 | 0/4 | 1 | 1.99/3 | 0 | 0 | 0 | 0 | 1 | 32 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0003-0001` | ge-defend | ge | 78.5 | 1/4 | 0 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 38 | 6 | 342.6s |
| `standard-benchmark-ge-defend-s2-b0005-0001` | ge-defend | ge | 74.9 | 0/4 | 1 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 34 | 2 | 597.6s |
| `standard-benchmark-us-defend-s1-b0001-0001` | us-defend | us | 63.5 | 0/5 | 2 | 3/2.99 | 0 | 1 | 0 | 0 | 0 | 18 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0002-0001` | ge-defend | ge | 78.4 | 0/3 | 0 | 2.8/3 | 0 | 0 | 0 | 0 | 0 | 25 | 0 | 32.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
