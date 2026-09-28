# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `8983160a20bd71295f15dd2fa6b0fbdce1a89a32`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **360.12s** (155.4× real-time, 16.66 battles/min)
- Results: US **47** (47.0%), GER **53** (53.0%), draw/none **0** (0.0%)
- Time-limit battles: **79/100**; captures avg **3.09** of **4.68** objectives; no-capture **14**
- Objectives nobody ever owned: **96** (20.5%) · never even contested **93** · distinct objectives assigned per side US **2.62**, GER **2.53**
- No objective progress: longest **600.1s** · mean per battle **256.6s**
- First contact avg **55.8s** · first fire **97.9s** · first objective progress **86.3s** · first capture **178s**
- Health: **80.9/100 overall** · strategic 72.4 · movement 98.2 · cohesion 78.5 · combat 98.5 · objective 57.1
- Stalls: vacant objective **161** · route **0** · soldier movement **60** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **64** (64 strategic) · loop alerts **1384** · idle-under-orders 1.4% · over-cohesion 39.9%
- Combat: **166899** discharges · **81419** direct · **9053** hits (11.1%) · **3** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1298 asset/CORS noise** · 302 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 25/35 | 80 | 70.5 | 97.7 | 77.2 | 56.1 | 0 | 50 | 45 | 999 | 185.6s | 2.55/2.41 | 13.02 | 59 | 269/462 |
| us-defend | 20 | 18/2 | 83.4 | 77.3 | 98.6 | 80.8 | 62 | 0 | 7 | 6 | 181 | 329.4s | 2.85/2.76 | 8.3 | 9 | 23/135 |
| ge-defend | 20 | 4/16 | 81.1 | 73.3 | 98.9 | 80 | 55.3 | 0 | 3 | 13 | 204 | 396.9s | 2.61/2.65 | 8.1 | 5 | 47/151 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `forward-line-meeting-s1-b0003-0001` | meeting | us | 71 | 4/4 | 1 | 1.71/2.44 | 0 | 0 | 0 | 10 | 0 | 4 | 20 | 250s |
| `forward-line-meeting-s3-b0004-0001` | meeting | ge | 75.1 | 3/3 | 0 | 2.43/2.18 | 0 | 0 | 0 | 9 | 0 | 2 | 20 | 257.6s |
| `forward-line-meeting-s4-b0006-0001` | meeting | us | 74.3 | 6/5 | 0 | 2.44/2.68 | 0 | 1 | 0 | 5 | 0 | 4 | 18 | 77.6s |
| `forward-line-meeting-s5-b0006-0001` | meeting | ge | 69.8 | 0/6 | 6 | 2.57/2.91 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 600.1s |
| `forward-line-meeting-s6-b0006-0001` | meeting | us | 75.7 | 5/6 | 1 | 2.49/2.32 | 0 | 4 | 0 | 8 | 0 | 0 | 18 | 155.1s |
| `forward-line-meeting-s1-b0008-0001` | meeting | us | 73.2 | 7/6 | 1 | 2.07/1.86 | 0 | 5 | 0 | 4 | 0 | 2 | 18 | 117.6s |
| `forward-line-meeting-s1-b0006-0001` | meeting | ge | 75.2 | 1/6 | 5 | 2.79/2.76 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 537.6s |
| `forward-line-meeting-s4-b0009-0001` | meeting | ge | 72.6 | 1/3 | 2 | 2.98/2.37 | 0 | 0 | 0 | 3 | 0 | 1 | 16 | 332.5s |
| `forward-line-meeting-s5-b0007-0001` | meeting | us | 76.8 | 8/6 | 0 | 2.82/2.68 | 0 | 0 | 0 | 4 | 0 | 3 | 16 | 97.5s |
| `forward-line-meeting-s5-b0004-0001` | meeting | us | 77.3 | 4/5 | 2 | 2.22/2.73 | 0 | 0 | 0 | 3 | 0 | 1 | 19 | 135s |
| `forward-line-meeting-s3-b0010-0001` | meeting | ge | 77.3 | 4/4 | 0 | 2.59/2.14 | 0 | 0 | 0 | 5 | 0 | 1 | 19 | 210s |
| `forward-line-ge-defend-s1-b0010-0001` | ge-defend | ge | 72.6 | 0/4 | 1 | 2.19/3 | 0 | 0 | 0 | 0 | 0 | 1 | 17 | 597.6s |
| `forward-line-meeting-s6-b0008-0001` | meeting | us | 78.7 | 6/6 | 1 | 2.76/2.66 | 0 | 0 | 0 | 5 | 0 | 0 | 20 | 105s |
| `forward-line-meeting-s1-b0009-0001` | meeting | ge | 74.9 | 2/3 | 1 | 2.29/2.28 | 0 | 0 | 0 | 5 | 0 | 0 | 16 | 340s |
| `forward-line-meeting-s6-b0001-0001` | meeting | ge | 78 | 1/4 | 3 | 2.59/3.33 | 0 | 0 | 0 | 0 | 0 | 1 | 19 | 274.9s |
| `forward-line-meeting-s2-b0009-0001` | meeting | us | 74.4 | 3/4 | 1 | 3.14/2.71 | 0 | 12 | 0 | 3 | 0 | 0 | 20 | 212.6s |
| `forward-line-meeting-s3-b0003-0001` | meeting | us | 78.9 | 7/5 | 0 | 2.22/1.84 | 0 | 0 | 0 | 6 | 0 | 1 | 16 | 102.6s |
| `forward-line-ge-defend-s1-b0004-0001` | ge-defend | ge | 73.5 | 0/5 | 2 | 2.02/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `forward-line-meeting-s4-b0005-0001` | meeting | ge | 77.9 | 1/4 | 3 | 3.18/2.09 | 0 | 1 | 0 | 1 | 0 | 0 | 20 | 240.1s |
| `forward-line-meeting-s4-b0001-0001` | meeting | ge | 78.8 | 6/5 | 0 | 2.78/2.06 | 0 | 2 | 0 | 6 | 0 | 0 | 18 | 97.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
