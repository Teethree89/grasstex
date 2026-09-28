# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `aefc110babfd3f8087089447e975d7ef4bc37621`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **237.14s** (242× real-time, 25.3 battles/min)
- Results: US **37** (37.0%), GER **63** (63.0%), draw/none **0** (0.0%)
- Time-limit battles: **77/100**; captures avg **3.33** of **4.62** objectives; no-capture **17**
- Objectives nobody ever owned: **73** (15.8%) · never even contested **68** · distinct objectives assigned per side US **2.5**, GER **2.5**
- No objective progress: longest **597.6s** · mean per battle **246.5s**
- First contact avg **57.1s** · first fire **97.7s** · first objective progress **75.4s** · first capture **153.1s**
- Health: **81.5/100 overall** · strategic 72.2 · movement 98.5 · cohesion 78.3 · combat 98.6 · objective 59.8
- Stalls: vacant objective **167** · route **0** · soldier movement **41** · targetless command **0** · long regroup **2**
- Coordination: writer conflicts **64** (64 strategic) · loop alerts **1394** · idle-under-orders 1.4% · over-cohesion 39.6%
- Combat: **171214** discharges · **85177** direct · **9519** hits (11.2%) · **11** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1297 asset/CORS noise** · 308 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 20/40 | 81.3 | 69.5 | 98.3 | 78.2 | 61.8 | 0 | 34 | 55 | 996 | 159.8s | 2.37/2.34 | 13.02 | 79 | 283/430 |
| us-defend | 20 | 15/5 | 83.2 | 78.2 | 98.7 | 78.7 | 62.1 | 0 | 5 | 3 | 174 | 333.5s | 2.68/2.62 | 8.15 | 11 | 28/161 |
| ge-defend | 20 | 2/18 | 80.2 | 74.2 | 99 | 78.2 | 51.4 | 0 | 2 | 6 | 224 | 419.4s | 2.68/2.85 | 12.95 | 8 | 46/180 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `regroup-results-20260928-meeting-s4-b0009-0001` | meeting | ge | 79 | 5/5 | 0 | 2.23/1.91 | 0 | 0 | 0 | 12 | 0 | 1 | 17 | 127.6s |
| `regroup-results-20260928-meeting-s6-b0002-0001` | meeting | us | 75.2 | 6/4 | 0 | 2.24/1.97 | 0 | 0 | 0 | 7 | 0 | 4 | 16 | 105s |
| `regroup-results-20260928-meeting-s5-b0001-0001` | meeting | ge | 76.9 | 5/4 | 0 | 2.02/1.81 | 0 | 0 | 0 | 8 | 0 | 3 | 16 | 185.1s |
| `regroup-results-20260928-meeting-s5-b0009-0001` | meeting | us | 75.6 | 5/4 | 0 | 2/1.77 | 0 | 3 | 0 | 6 | 0 | 3 | 19 | 122.6s |
| `regroup-results-20260928-meeting-s2-b0002-0001` | meeting | ge | 73.7 | 5/5 | 1 | 2.39/1.84 | 0 | 0 | 0 | 5 | 0 | 2 | 16 | 220s |
| `regroup-results-20260928-meeting-s2-b0010-0001` | meeting | us | 74.9 | 4/4 | 0 | 1.77/2.02 | 0 | 0 | 0 | 5 | 0 | 3 | 16 | 160s |
| `regroup-results-20260928-meeting-s6-b0001-0001` | meeting | ge | 74.9 | 4/4 | 1 | 2.42/2.17 | 0 | 0 | 0 | 6 | 0 | 0 | 17 | 237.6s |
| `regroup-results-20260928-meeting-s3-b0001-0001` | meeting | ge | 75.1 | 5/5 | 0 | 2.21/2.95 | 0 | 0 | 0 | 5 | 0 | 3 | 13 | 125.1s |
| `regroup-results-20260928-meeting-s3-b0008-0001` | meeting | ge | 79.9 | 5/3 | 0 | 1.64/2.59 | 0 | 3 | 0 | 1 | 0 | 4 | 18 | 122.6s |
| `regroup-results-20260928-ge-defend-s2-b0008-0001` | ge-defend | ge | 74.2 | 0/5 | 2 | 2.5/3 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `regroup-results-20260928-meeting-s6-b0009-0001` | meeting | ge | 78.6 | 5/5 | 1 | 2.17/1.71 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 225.1s |
| `regroup-results-20260928-meeting-s5-b0010-0001` | meeting | ge | 76.6 | 2/4 | 2 | 3.14/2.61 | 0 | 0 | 0 | 2 | 0 | 1 | 18 | 182.5s |
| `regroup-results-20260928-meeting-s2-b0004-0001` | meeting | ge | 78.4 | 3/3 | 0 | 2.66/2.78 | 0 | 0 | 0 | 1 | 0 | 3 | 17 | 350.1s |
| `regroup-results-20260928-us-defend-s2-b0004-0001` | us-defend | us | 72.3 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 597.6s |
| `regroup-results-20260928-meeting-s5-b0005-0001` | meeting | ge | 80.5 | 5/4 | 0 | 2.77/2.16 | 0 | 0 | 0 | 6 | 0 | 0 | 19 | 135s |
| `regroup-results-20260928-meeting-s2-b0008-0001` | meeting | ge | 78.1 | 3/5 | 2 | 2.56/2.99 | 0 | 1 | 0 | 2 | 0 | 1 | 17 | 195s |
| `regroup-results-20260928-meeting-s3-b0003-0001` | meeting | ge | 79.6 | 6/4 | 0 | 2.27/2.23 | 0 | 0 | 0 | 5 | 0 | 2 | 14 | 112.5s |
| `regroup-results-20260928-meeting-s4-b0010-0001` | meeting | ge | 79.1 | 5/4 | 0 | 2.59/2.56 | 0 | 0 | 0 | 6 | 0 | 1 | 14 | 197.6s |
| `regroup-results-20260928-meeting-s2-b0003-0001` | meeting | ge | 79.7 | 9/5 | 0 | 1.65/2.68 | 0 | 0 | 0 | 6 | 0 | 1 | 15 | 87.6s |
| `regroup-results-20260928-meeting-s1-b0004-0001` | meeting | us | 78.4 | 4/5 | 1 | 3.21/3.02 | 0 | 1 | 0 | 3 | 0 | 0 | 20 | 180s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
