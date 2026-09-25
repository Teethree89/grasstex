# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `e66cd23af545ec52ea589a8056c49e389d1f5009`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **545.46s** (102.3× real-time, 11 battles/min)
- Results: US **53** (53.0%), GER **47** (47.0%), draw/none **0** (0.0%)
- Time-limit battles: **75/100**; captures avg **2.95** of **4.54** objectives; no-capture **24**
- Objectives nobody ever owned: **90** (19.8%) · never even contested **87** · distinct objectives assigned per side US **2.81**, GER **2.76**
- No objective progress: longest **600.1s** · mean per battle **284.7s**
- First contact avg **51.7s** · first fire **95.1s** · first objective progress **76.6s** · first capture **149.4s**
- Health: **79.6/100 overall** · strategic 71.6 · movement 98.7 · cohesion 74.3 · combat 97.7 · objective 56
- Stalls: vacant objective **134** · route **0** · soldier movement **34** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **75** (75 strategic) · loop alerts **1454** · idle-under-orders 1.5% · over-cohesion 48.3%
- Combat: **157079** discharges · **112983** direct · **17435** hits (15.4%) · **16** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 306 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 32/28 | 80.4 | 69.5 | 98.3 | 74.4 | 62 | 0 | 32 | 56 | 1009 | 172.4s |
| us-defend | 20 | 19/1 | 78 | 75.3 | 99.3 | 72.6 | 45.6 | 0 | 0 | 7 | 235 | 462.7s |
| ge-defend | 20 | 2/18 | 78.8 | 74 | 99 | 75.6 | 48.3 | 0 | 2 | 12 | 210 | 443.4s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s6-b0002-0001` | meeting | ge | 77.8 | 8/6 | 1 | 3.16/3.2 | 0 | 0 | 0 | 10 | 0 | 1 | 16 | 97.5s |
| `standard-benchmark-meeting-s2-b0008-0001` | meeting | us | 76.1 | 5/4 | 0 | 2.53/2.9 | 0 | 1 | 0 | 4 | 0 | 4 | 19 | 115.1s |
| `standard-benchmark-meeting-s4-b0005-0001` | meeting | us | 76.7 | 5/4 | 0 | 1.56/2.32 | 0 | 0 | 0 | 7 | 0 | 2 | 18 | 130.1s |
| `standard-benchmark-meeting-s4-b0004-0001` | meeting | us | 67 | 0/4 | 4 | 2.99/3.65 | 0 | 1 | 0 | 0 | 0 | 0 | 17 | 600.1s |
| `standard-benchmark-meeting-s2-b0005-0001` | meeting | ge | 74.3 | 7/6 | 0 | 3.59/2.49 | 0 | 6 | 0 | 5 | 0 | 3 | 18 | 102.6s |
| `standard-benchmark-meeting-s6-b0003-0001` | meeting | us | 76.4 | 4/4 | 0 | 1.98/2.21 | 0 | 2 | 0 | 9 | 0 | 1 | 16 | 185.1s |
| `standard-benchmark-meeting-s2-b0010-0001` | meeting | us | 78 | 7/5 | 0 | 2.25/2.62 | 0 | 0 | 0 | 6 | 0 | 2 | 19 | 112.5s |
| `standard-benchmark-meeting-s2-b0003-0001` | meeting | ge | 73.4 | 4/4 | 1 | 2.11/2.05 | 0 | 0 | 0 | 6 | 0 | 1 | 16 | 277.6s |
| `standard-benchmark-us-defend-s2-b0008-0001` | us-defend | us | 73.7 | 0/5 | 3 | 2/2.37 | 0 | 0 | 0 | 0 | 0 | 0 | 19 | 597.6s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 70.3 | 0/6 | 3 | 3/3.59 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0008-0001` | ge-defend | ge | 73.8 | 0/5 | 2 | 3.77/3 | 0 | 0 | 0 | 0 | 0 | 2 | 16 | 437.5s |
| `standard-benchmark-us-defend-s1-b0006-0001` | us-defend | us | 71.5 | 0/5 | 2 | 3/2.78 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-meeting-s4-b0006-0001` | meeting | us | 75.5 | 2/4 | 2 | 2.99/2.99 | 0 | 0 | 0 | 2 | 0 | 1 | 20 | 232.5s |
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 73.1 | 0/6 | 3 | 3.15/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0007-0001` | ge-defend | ge | 73 | 0/4 | 1 | 2.14/3 | 0 | 0 | 0 | 0 | 0 | 3 | 10 | 597.6s |
| `standard-benchmark-us-defend-s2-b0003-0001` | us-defend | us | 72.2 | 0/4 | 1 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `standard-benchmark-us-defend-s2-b0009-0001` | us-defend | us | 79.9 | 1/6 | 2 | 3/3.42 | 0 | 0 | 0 | 0 | 0 | 3 | 16 | 309.9s |
| `standard-benchmark-us-defend-s2-b0010-0001` | us-defend | us | 73.6 | 0/5 | 2 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `standard-benchmark-meeting-s6-b0007-0001` | meeting | ge | 78.4 | 8/4 | 0 | 2.23/2.55 | 0 | 0 | 0 | 4 | 0 | 1 | 20 | 167.6s |
| `standard-benchmark-meeting-s5-b0010-0001` | meeting | ge | 80 | 5/4 | 0 | 2.91/2.45 | 0 | 3 | 0 | 1 | 0 | 4 | 17 | 127.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
