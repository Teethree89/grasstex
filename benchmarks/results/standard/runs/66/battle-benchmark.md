# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `cdbbd33b6f9203d9471b766ccd5537cf599d432a`
- Build: `v29-dev`
- Policy: stashed-defaults, revision 0
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **223.06s** (229.9× real-time, 26.9 battles/min)
- Results: US **41** (41.0%), GER **59** (59.0%), draw/none **0** (0.0%)
- Time-limit battles: **48/100**; captures avg **3.76** of **4.53** objectives; no-capture **17**
- Objectives nobody ever owned: **48** (10.6%) · never even contested **42** · distinct objectives assigned per side US **2.45**, GER **2.37**
- No objective progress: longest **597.6s** · mean per battle **227.3s**
- First contact avg **62.5s** · first fire **94.6s** · first objective progress **85.4s** · first capture **188.7s**
- Health: **82/100 overall** · strategic 71.3 · movement 98.9 · cohesion 83.9 · combat 98.4 · objective 57.7
- Stalls: vacant objective **194** · route **0** · soldier movement **33** · targetless command **0** · long regroup **8**
- Coordination: writer conflicts **97** (97 strategic) · loop alerts **1093** · idle-under-orders 0.9% · over-cohesion 29.6%
- Combat: **111785** discharges · **52976** direct · **10410** hits (19.7%) · **0** trigger-time LOS blocks · **243534** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1299 asset/CORS noise** · 309 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 23/37 | 81.7 | 67.4 | 99.1 | 83.3 | 60.1 | 0 | 16 | 79 | 788 | 154.3s | 2.38/2.33 | 11.02 | 0 | 77/271 |
| us-defend | 20 | 13/7 | 82.5 | 77.7 | 98.7 | 84.5 | 53.7 | 0 | 8 | 12 | 145 | 290.1s | 2.52/2.42 | 8.7 | 0 | 10/114 |
| ge-defend | 20 | 5/15 | 82.5 | 76.6 | 98.6 | 84.9 | 54.4 | 0 | 9 | 6 | 160 | 383.6s | 2.6/2.46 | 7.5 | 0 | 25/121 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `ai-layers-20260929-meeting-s2-b0006-0001` | meeting | ge | 78.4 | 6/5 | 0 | 1.82/1.53 | 0 | 1 | 0 | 14 | 0 | 1 | 12 | 137.4s |
| `ai-layers-20260929-meeting-s2-b0007-0001` | meeting | us | 75.7 | 9/6 | 0 | 2.11/2.22 | 0 | 3 | 0 | 8 | 0 | 2 | 20 | 102.6s |
| `ai-layers-20260929-meeting-s5-b0010-0001` | meeting | ge | 79.4 | 3/6 | 3 | 2.35/2.45 | 0 | 0 | 0 | 0 | 0 | 4 | 18 | 245.1s |
| `ai-layers-20260929-meeting-s1-b0009-0001` | meeting | us | 77 | 5/3 | 0 | 2.7/1.9 | 0 | 0 | 0 | 3 | 0 | 4 | 18 | 207.4s |
| `ai-layers-20260929-meeting-s2-b0003-0001` | meeting | ge | 75.9 | 5/6 | 1 | 2.51/2.65 | 0 | 0 | 0 | 2 | 1 | 6 | 7 | 315s |
| `ai-layers-20260929-meeting-s4-b0003-0001` | meeting | ge | 76.7 | 6/4 | 0 | 1.71/2.82 | 0 | 2 | 0 | 6 | 0 | 2 | 17 | 125.1s |
| `ai-layers-20260929-ge-defend-s1-b0001-0001` | ge-defend | ge | 76.1 | 0/6 | 3 | 2.51/3 | 0 | 0 | 0 | 0 | 0 | 0 | 19 | 597.6s |
| `ai-layers-20260929-meeting-s5-b0005-0001` | meeting | ge | 76.1 | 6/4 | 0 | 1.62/2.07 | 0 | 0 | 0 | 5 | 1 | 2 | 16 | 110.1s |
| `ai-layers-20260929-meeting-s5-b0008-0001` | meeting | us | 77.4 | 5/4 | 0 | 2.29/2.71 | 0 | 1 | 0 | 4 | 1 | 2 | 18 | 97.5s |
| `ai-layers-20260929-meeting-s4-b0010-0001` | meeting | us | 76.2 | 5/4 | 0 | 2.39/2.27 | 0 | 2 | 0 | 5 | 0 | 2 | 16 | 152.4s |
| `ai-layers-20260929-us-defend-s1-b0003-0001` | us-defend | us | 74.7 | 0/5 | 2 | 3/1.57 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `ai-layers-20260929-meeting-s5-b0001-0001` | meeting | ge | 79.9 | 7/6 | 0 | 2.59/2.24 | 0 | 0 | 0 | 3 | 0 | 3 | 17 | 105s |
| `ai-layers-20260929-us-defend-s1-b0010-0001` | us-defend | us | 74.6 | 0/5 | 2 | 2.66/2.73 | 0 | 0 | 0 | 2 | 0 | 0 | 15 | 390s |
| `ai-layers-20260929-meeting-s3-b0002-0001` | meeting | us | 76.9 | 3/4 | 1 | 1.89/2.31 | 0 | 0 | 0 | 4 | 0 | 0 | 16 | 402.6s |
| `ai-layers-20260929-meeting-s2-b0008-0001` | meeting | us | 80.2 | 5/4 | 0 | 2.23/2.6 | 0 | 2 | 0 | 2 | 0 | 3 | 16 | 122.5s |
| `ai-layers-20260929-meeting-s6-b0007-0001` | meeting | ge | 81.9 | 6/5 | 0 | 2.59/2.2 | 0 | 0 | 0 | 1 | 1 | 3 | 16 | 117.6s |
| `ai-layers-20260929-meeting-s2-b0001-0001` | meeting | us | 78.4 | 5/4 | 0 | 2.39/2.19 | 0 | 0 | 0 | 5 | 0 | 1 | 14 | 155.1s |
| `ai-layers-20260929-meeting-s6-b0003-0001` | meeting | ge | 78.9 | 4/3 | 0 | 1.99/2.63 | 0 | 0 | 0 | 5 | 0 | 1 | 14 | 150s |
| `ai-layers-20260929-meeting-s3-b0005-0001` | meeting | ge | 81.1 | 7/5 | 0 | 1.93/2.42 | 0 | 0 | 0 | 7 | 0 | 0 | 13 | 127.5s |
| `ai-layers-20260929-meeting-s4-b0001-0001` | meeting | ge | 79.8 | 3/4 | 1 | 1.81/2.34 | 0 | 0 | 0 | 3 | 0 | 0 | 17 | 230.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
