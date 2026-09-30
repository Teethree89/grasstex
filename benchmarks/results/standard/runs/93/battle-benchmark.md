# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `c8f0615ce3109e759e0b50fb1a697c08df4d3b55`
- Build: `v29-dev`
- Policy: stashed-defaults, revision 0
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **248.2s** (208× real-time, 24.17 battles/min)
- Results: US **47** (47.0%), GER **53** (53.0%), draw/none **0** (0.0%)
- Time-limit battles: **50/100**; captures avg **3.76** of **4.53** objectives; no-capture **19**
- Objectives nobody ever owned: **56** (12.4%) · never even contested **51** · distinct objectives assigned per side US **2.43**, GER **2.32**
- No objective progress: longest **597.6s** · mean per battle **217s**
- First contact avg **62.5s** · first fire **98.4s** · first objective progress **82.5s** · first capture **178.2s**
- Health: **82.9/100 overall** · strategic 77.6 · movement 98.6 · cohesion 83.3 · combat 98.5 · objective 56.5
- Stalls: vacant objective **200** · route **0** · soldier movement **52** · targetless command **0** · long regroup **10**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1064** · idle-under-orders 1.0% · over-cohesion 30.2%
- Combat: **112674** discharges · **53593** direct · **10614** hits (19.8%) · **0** trigger-time LOS blocks · **235765** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1298 asset/CORS noise** · 313 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 25/35 | 83 | 75.4 | 98.7 | 82.2 | 60.1 | 0 | 26 | 0 | 798 | 142s | 2.31/2.28 | 10.73 | 0 | 65/221 |
| us-defend | 20 | 14/6 | 82.4 | 83.7 | 99.5 | 84.8 | 45.6 | 0 | 1 | 0 | 123 | 312.4s | 2.63/2.28 | 8.5 | 0 | 7/112 |
| ge-defend | 20 | 8/12 | 83.1 | 78.2 | 97.2 | 85.2 | 56.7 | 0 | 25 | 0 | 143 | 346.5s | 2.6/2.48 | 7.95 | 0 | 12/107 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `ai-layers-20260929-meeting-s1-b0009-0001` | meeting | ge | 77.7 | 3/3 | 0 | 2.49/2.21 | 0 | 2 | 0 | 7 | 1 | 0 | 15 | 137.6s |
| `ai-layers-20260929-meeting-s2-b0004-0001` | meeting | ge | 76.5 | 3/3 | 0 | 2.51/2.73 | 0 | 0 | 0 | 5 | 0 | 0 | 17 | 305.1s |
| `ai-layers-20260929-meeting-s5-b0009-0001` | meeting | us | 80 | 10/6 | 0 | 2.48/1.98 | 0 | 0 | 0 | 7 | 0 | 0 | 16 | 95.1s |
| `ai-layers-20260929-meeting-s1-b0001-0001` | meeting | us | 78.8 | 5/4 | 0 | 1.54/1.6 | 0 | 1 | 0 | 9 | 1 | 0 | 10 | 90s |
| `ai-layers-20260929-us-defend-s2-b0010-0001` | us-defend | us | 73.5 | 0/6 | 3 | 3/2.79 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 597.6s |
| `ai-layers-20260929-meeting-s3-b0002-0001` | meeting | ge | 79.1 | 4/4 | 1 | 2.6/2.05 | 0 | 0 | 0 | 5 | 0 | 0 | 16 | 110.1s |
| `ai-layers-20260929-meeting-s5-b0007-0001` | meeting | us | 81.9 | 9/6 | 0 | 1.97/2.24 | 0 | 0 | 0 | 8 | 0 | 0 | 13 | 100.1s |
| `ai-layers-20260929-us-defend-s2-b0009-0001` | us-defend | us | 76.2 | 0/4 | 1 | 3/1.37 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `ai-layers-20260929-meeting-s3-b0005-0001` | meeting | ge | 80.1 | 7/5 | 0 | 2.57/2.5 | 0 | 0 | 0 | 6 | 0 | 0 | 16 | 100.1s |
| `ai-layers-20260929-us-defend-s2-b0008-0001` | us-defend | us | 78.5 | 0/5 | 2 | 3/1.68 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 362.5s |
| `ai-layers-20260929-meeting-s4-b0009-0001` | meeting | us | 80.4 | 2/5 | 3 | 2.42/1.81 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 402.6s |
| `ai-layers-20260929-meeting-s3-b0004-0001` | meeting | ge | 78.1 | 4/3 | 1 | 2.37/2.95 | 0 | 4 | 0 | 3 | 0 | 0 | 16 | 210s |
| `ai-layers-20260929-meeting-s6-b0004-0001` | meeting | us | 80.8 | 6/5 | 0 | 2.16/2.83 | 0 | 0 | 0 | 5 | 0 | 0 | 16 | 127.5s |
| `ai-layers-20260929-ge-defend-s1-b0007-0001` | ge-defend | ge | 73.8 | 0/5 | 2 | 2.52/2.31 | 0 | 1 | 0 | 2 | 0 | 0 | 8 | 417.6s |
| `ai-layers-20260929-ge-defend-s2-b0008-0001` | ge-defend | ge | 74.6 | 0/6 | 3 | 2.12/3 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 597.6s |
| `ai-layers-20260929-meeting-s2-b0008-0001` | meeting | ge | 79.4 | 4/4 | 1 | 2.48/2.69 | 0 | 1 | 0 | 3 | 0 | 0 | 16 | 185.1s |
| `ai-layers-20260929-meeting-s6-b0006-0001` | meeting | ge | 81 | 6/5 | 0 | 1.99/1.95 | 0 | 0 | 0 | 6 | 0 | 0 | 14 | 70s |
| `ai-layers-20260929-meeting-s4-b0005-0001` | meeting | ge | 81.2 | 7/5 | 1 | 1.6/2.31 | 0 | 2 | 0 | 3 | 0 | 0 | 17 | 127.5s |
| `ai-layers-20260929-meeting-s5-b0005-0001` | meeting | us | 78.5 | 6/4 | 0 | 2.13/1.66 | 0 | 5 | 0 | 3 | 1 | 0 | 17 | 105s |
| `ai-layers-20260929-meeting-s6-b0010-0001` | meeting | us | 81.3 | 5/4 | 0 | 2.38/1.49 | 0 | 0 | 0 | 4 | 0 | 0 | 17 | 110.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
