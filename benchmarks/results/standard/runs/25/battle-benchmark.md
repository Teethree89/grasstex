# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `5693fe4e15b5eb84f6f3a247a23563482701630e`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **371.34s** (150.3× real-time, 16.16 battles/min)
- Results: US **49** (49.0%), GER **51** (51.0%), draw/none **0** (0.0%)
- Time-limit battles: **73/100**; captures avg **3.14** of **4.68** objectives; no-capture **15**
- Objectives nobody ever owned: **87** (18.6%) · never even contested **81** · distinct objectives assigned per side US **2.57**, GER **2.54**
- No objective progress: longest **600.1s** · mean per battle **251s**
- First contact avg **55.9s** · first fire **98.6s** · first objective progress **81.9s** · first capture **173.8s**
- Health: **80.7/100 overall** · strategic 70.6 · movement 98.1 · cohesion 77.3 · combat 98.5 · objective 59
- Stalls: vacant objective **140** · route **0** · soldier movement **61** · targetless command **0** · long regroup **3**
- Coordination: writer conflicts **93** (93 strategic) · loop alerts **1420** · idle-under-orders 1.4% · over-cohesion 41.4%
- Combat: **172141** discharges · **84536** direct · **8827** hits (10.4%) · **17** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 307 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 31/29 | 80 | 67.8 | 97.4 | 75.9 | 60.2 | 0 | 58 | 72 | 1044 | 178.6s | 2.48/2.41 | 14.05 | 71 | 240/437 |
| us-defend | 20 | 16/4 | 83.1 | 74.3 | 99.4 | 80.6 | 63.3 | 0 | 1 | 14 | 188 | 321.6s | 2.82/2.78 | 7.7 | 12 | 15/126 |
| ge-defend | 20 | 2/18 | 80.5 | 75.5 | 99.1 | 78.4 | 51.4 | 0 | 2 | 7 | 188 | 397.3s | 2.58/2.66 | 7.7 | 6 | 59/179 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `forward-line-meeting-s4-b0005-0001` | meeting | ge | 76.1 | 3/4 | 1 | 3.48/2.33 | 0 | 0 | 0 | 2 | 0 | 4 | 20 | 167.6s |
| `forward-line-meeting-s6-b0008-0001` | meeting | us | 77.4 | 7/6 | 0 | 2.43/2.94 | 0 | 0 | 0 | 6 | 0 | 2 | 20 | 95.1s |
| `forward-line-us-defend-s1-b0002-0001` | us-defend | ge | 75.8 | 1/4 | 0 | 2.79/2.39 | 0 | 0 | 0 | 1 | 0 | 4 | 18 | 462.4s |
| `forward-line-meeting-s5-b0002-0001` | meeting | ge | 78.2 | 5/3 | 0 | 1.7/1.94 | 0 | 0 | 0 | 6 | 0 | 2 | 18 | 150s |
| `forward-line-meeting-s1-b0009-0001` | meeting | ge | 78.7 | 4/3 | 0 | 2.1/2.35 | 0 | 0 | 0 | 7 | 0 | 1 | 19 | 147.6s |
| `forward-line-meeting-s4-b0010-0001` | meeting | ge | 74.6 | 6/5 | 1 | 2.35/2.13 | 0 | 0 | 0 | 6 | 0 | 1 | 17 | 110.1s |
| `forward-line-meeting-s4-b0006-0001` | meeting | us | 78.4 | 6/5 | 0 | 2.57/2.54 | 0 | 1 | 0 | 2 | 1 | 4 | 18 | 77.6s |
| `forward-line-meeting-s2-b0006-0001` | meeting | us | 78 | 5/6 | 1 | 2.78/2.2 | 0 | 0 | 0 | 3 | 0 | 2 | 20 | 190s |
| `forward-line-meeting-s1-b0007-0001` | meeting | us | 76.4 | 6/5 | 0 | 2.29/2.26 | 0 | 0 | 0 | 5 | 1 | 1 | 20 | 97.5s |
| `forward-line-meeting-s2-b0008-0001` | meeting | us | 78.9 | 6/4 | 0 | 2.27/2 | 0 | 1 | 0 | 3 | 0 | 4 | 16 | 122.6s |
| `forward-line-meeting-s6-b0006-0001` | meeting | us | 75.5 | 6/6 | 0 | 2.06/2.05 | 0 | 4 | 0 | 3 | 0 | 2 | 20 | 214.9s |
| `forward-line-meeting-s1-b0010-0001` | meeting | us | 75.5 | 7/5 | 0 | 2.29/2.65 | 0 | 0 | 0 | 5 | 0 | 2 | 16 | 207.4s |
| `forward-line-meeting-s4-b0002-0001` | meeting | us | 78.5 | 6/5 | 1 | 2.37/2.73 | 0 | 5 | 0 | 1 | 0 | 3 | 20 | 137.5s |
| `forward-line-meeting-s5-b0004-0001` | meeting | us | 74.8 | 4/5 | 2 | 2.25/2.92 | 0 | 0 | 0 | 4 | 0 | 1 | 16 | 185.1s |
| `forward-line-meeting-s3-b0005-0001` | meeting | ge | 69 | 0/3 | 3 | 2.56/2.29 | 0 | 1 | 0 | 0 | 0 | 0 | 15 | 600.1s |
| `forward-line-meeting-s1-b0003-0001` | meeting | us | 76.7 | 5/4 | 0 | 2.18/2.86 | 0 | 0 | 0 | 6 | 0 | 1 | 18 | 125.1s |
| `forward-line-meeting-s5-b0009-0001` | meeting | us | 76.7 | 7/6 | 1 | 3.13/2.26 | 0 | 0 | 0 | 4 | 0 | 2 | 16 | 127.5s |
| `forward-line-meeting-s6-b0002-0001` | meeting | us | 78.4 | 3/3 | 0 | 2.81/2.54 | 0 | 1 | 0 | 0 | 0 | 4 | 18 | 342.6s |
| `forward-line-meeting-s6-b0009-0001` | meeting | us | 78.8 | 5/4 | 0 | 3.29/2.91 | 0 | 1 | 0 | 3 | 0 | 2 | 20 | 185.1s |
| `forward-line-meeting-s6-b0004-0001` | meeting | ge | 76.5 | 6/6 | 1 | 2.54/2.45 | 0 | 0 | 0 | 5 | 0 | 1 | 16 | 147.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
