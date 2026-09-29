# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `b8a5f242bd460211c261452cc1bd8e65fe1dd2d8`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **231.94s** (226.6× real-time, 25.87 battles/min)
- Results: US **45** (45.0%), GER **55** (55.0%), draw/none **0** (0.0%)
- Time-limit battles: **56/100**; captures avg **3.86** of **4.44** objectives; no-capture **13**
- Objectives nobody ever owned: **44** (9.9%) · never even contested **42** · distinct objectives assigned per side US **2.44**, GER **2.55**
- No objective progress: longest **597.6s** · mean per battle **210.3s**
- First contact avg **66s** · first fire **98.5s** · first objective progress **77.9s** · first capture **155.7s**
- Health: **82.5/100 overall** · strategic 71.3 · movement 98.8 · cohesion 83.6 · combat 98.5 · objective 60.3
- Stalls: vacant objective **203** · route **0** · soldier movement **38** · targetless command **0** · long regroup **7**
- Coordination: writer conflicts **102** (102 strategic) · loop alerts **1136** · idle-under-orders 1.0% · over-cohesion 29.9%
- Combat: **116415** discharges · **55346** direct · **10606** hits (19.2%) · **0** trigger-time LOS blocks · **236690** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1299 asset/CORS noise** · 319 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 27/33 | 81.2 | 66.6 | 98.3 | 82.8 | 59.8 | 0 | 37 | 85 | 863 | 138s | 2.36/2.42 | 12.72 | 0 | 161/249 |
| us-defend | 20 | 14/6 | 84.5 | 77.7 | 99.6 | 84.2 | 62.6 | 0 | 0 | 9 | 128 | 336.4s | 2.59/2.89 | 8.35 | 0 | 37/107 |
| ge-defend | 20 | 4/16 | 84.3 | 78.7 | 99.4 | 85.5 | 59.5 | 0 | 1 | 8 | 145 | 301.2s | 2.5/2.62 | 8.05 | 0 | 27/116 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `paired-20260929-meeting-s4-b0005-0001` | meeting | us | 68.1 | 9/6 | 0 | 2.29/1.99 | 0 | 15 | 0 | 9 | 1 | 4 | 17 | 95.1s |
| `paired-20260929-meeting-s2-b0006-0001` | meeting | ge | 70.1 | 3/5 | 2 | 2.99/2.49 | 0 | 0 | 0 | 5 | 1 | 3 | 17 | 150s |
| `paired-20260929-meeting-s6-b0002-0001` | meeting | us | 76 | 7/4 | 0 | 2.07/2.07 | 0 | 0 | 0 | 8 | 1 | 3 | 16 | 115.1s |
| `paired-20260929-meeting-s2-b0005-0001` | meeting | us | 78 | 5/4 | 0 | 1.44/1.96 | 0 | 0 | 0 | 10 | 0 | 1 | 15 | 230.1s |
| `paired-20260929-meeting-s4-b0001-0001` | meeting | us | 78.8 | 6/4 | 0 | 2.07/2.23 | 0 | 0 | 0 | 6 | 0 | 2 | 20 | 117.6s |
| `paired-20260929-meeting-s5-b0004-0001` | meeting | ge | 75.6 | 5/4 | 0 | 1.98/2.21 | 0 | 0 | 0 | 4 | 0 | 4 | 16 | 115.1s |
| `paired-20260929-meeting-s3-b0003-0001` | meeting | us | 77 | 5/4 | 0 | 2.06/2.38 | 0 | 2 | 0 | 9 | 0 | 2 | 13 | 95.1s |
| `paired-20260929-meeting-s5-b0006-0001` | meeting | ge | 78.8 | 6/5 | 0 | 2.84/2.55 | 0 | 0 | 0 | 7 | 0 | 1 | 17 | 145s |
| `paired-20260929-meeting-s3-b0006-0001` | meeting | us | 78.7 | 5/4 | 0 | 2.41/2.78 | 0 | 0 | 0 | 7 | 0 | 1 | 17 | 122.6s |
| `paired-20260929-meeting-s3-b0001-0001` | meeting | us | 79.1 | 10/6 | 0 | 2.06/2.16 | 0 | 0 | 0 | 3 | 0 | 5 | 12 | 95.1s |
| `paired-20260929-meeting-s2-b0001-0001` | meeting | us | 79.8 | 7/6 | 0 | 2.75/1.85 | 0 | 0 | 0 | 3 | 0 | 4 | 14 | 75s |
| `paired-20260929-ge-defend-s2-b0008-0001` | ge-defend | ge | 76.5 | 0/5 | 2 | 2.19/3 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 597.6s |
| `paired-20260929-meeting-s3-b0004-0001` | meeting | ge | 77.4 | 8/5 | 1 | 1.94/2.7 | 0 | 0 | 0 | 4 | 1 | 1 | 16 | 100.1s |
| `paired-20260929-meeting-s1-b0010-0001` | meeting | us | 77.8 | 5/4 | 0 | 1.5/2.11 | 0 | 2 | 0 | 4 | 0 | 2 | 16 | 105s |
| `paired-20260929-meeting-s3-b0010-0001` | meeting | ge | 79.3 | 5/4 | 0 | 2.31/2.62 | 0 | 0 | 0 | 3 | 0 | 3 | 15 | 122.6s |
| `paired-20260929-meeting-s2-b0008-0001` | meeting | us | 82.5 | 5/6 | 1 | 1.96/2.53 | 0 | 0 | 0 | 1 | 0 | 3 | 18 | 100.1s |
| `paired-20260929-meeting-s4-b0010-0001` | meeting | us | 80.7 | 6/4 | 0 | 2.14/2.02 | 0 | 0 | 0 | 5 | 0 | 1 | 18 | 92.4s |
| `paired-20260929-meeting-s6-b0004-0001` | meeting | us | 81.4 | 6/4 | 0 | 1.85/2.23 | 0 | 0 | 0 | 7 | 0 | 0 | 17 | 122.6s |
| `paired-20260929-meeting-s6-b0008-0001` | meeting | us | 81.2 | 7/6 | 1 | 2.49/1.8 | 0 | 1 | 0 | 2 | 1 | 1 | 20 | 110.1s |
| `paired-20260929-meeting-s6-b0007-0001` | meeting | us | 79.6 | 6/5 | 0 | 2.27/2.99 | 0 | 0 | 0 | 4 | 0 | 2 | 16 | 90s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
