# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `499b466483dde6d0abc7e45c045146a9c2e2ad17`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **226.92s** (237.5× real-time, 26.44 battles/min)
- Results: US **42** (42.0%), GER **58** (58.0%), draw/none **0** (0.0%)
- Time-limit battles: **64/100**; captures avg **3.39** of **4.58** objectives; no-capture **20**
- Objectives nobody ever owned: **70** (15.3%) · never even contested **65** · distinct objectives assigned per side US **2.52**, GER **2.56**
- No objective progress: longest **597.6s** · mean per battle **241.3s**
- First contact avg **57.3s** · first fire **93.2s** · first objective progress **76.8s** · first capture **165.1s**
- Health: **80.2/100 overall** · strategic 69.1 · movement 99 · cohesion 79.2 · combat 98.4 · objective 55.6
- Stalls: vacant objective **202** · route **0** · soldier movement **24** · targetless command **0** · long regroup **12**
- Coordination: writer conflicts **136** (136 strategic) · loop alerts **1283** · idle-under-orders 1.2% · over-cohesion 38.2%
- Combat: **124680** discharges · **44389** direct · **9950** hits (22.4%) · **2** trigger-time LOS blocks · **234621** held over a crest
- Runtime: **0 probable JS/runtime errors** · **1300 asset/CORS noise** · 306 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 27/33 | 79.8 | 63.6 | 98.8 | 78.8 | 59.7 | 0 | 22 | 115 | 946 | 152.2s | 2.41/2.4 | 13.6 | 0 | 223/370 |
| us-defend | 20 | 13/7 | 80.2 | 75.8 | 99.2 | 80.8 | 46.8 | 0 | 2 | 14 | 168 | 368.7s | 2.79/2.84 | 8 | 0 | 52/164 |
| ge-defend | 20 | 2/18 | 81.5 | 78.8 | 99.4 | 78.7 | 52 | 0 | 0 | 7 | 169 | 381.1s | 2.58/2.75 | 11.45 | 0 | 38/149 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `m3c-block-20260928-meeting-s2-b0003-0001` | meeting | us | 69.2 | 7/5 | 0 | 2.42/2.71 | 0 | 0 | 0 | 7 | 3 | 5 | 15 | 147.4s |
| `m3c-block-20260928-meeting-s1-b0009-0001` | meeting | ge | 76.2 | 7/5 | 0 | 1.92/1.88 | 0 | 0 | 0 | 11 | 0 | 4 | 16 | 87.4s |
| `m3c-block-20260928-meeting-s5-b0006-0001` | meeting | ge | 71 | 5/4 | 0 | 2.12/1.29 | 0 | 0 | 0 | 6 | 0 | 5 | 19 | 162.6s |
| `m3c-block-20260928-meeting-s4-b0004-0001` | meeting | ge | 73.1 | 4/5 | 1 | 2.75/2.44 | 0 | 0 | 0 | 3 | 0 | 5 | 19 | 257.5s |
| `m3c-block-20260928-meeting-s6-b0001-0001` | meeting | ge | 73.4 | 6/5 | 0 | 3.02/2.52 | 0 | 0 | 0 | 5 | 0 | 5 | 18 | 120s |
| `m3c-block-20260928-meeting-s5-b0003-0001` | meeting | ge | 74.4 | 4/5 | 1 | 2.93/2.63 | 0 | 0 | 0 | 3 | 0 | 4 | 20 | 197.5s |
| `m3c-block-20260928-meeting-s4-b0009-0001` | meeting | us | 75.9 | 8/5 | 0 | 2.15/2.45 | 0 | 0 | 0 | 8 | 0 | 3 | 17 | 105s |
| `m3c-block-20260928-meeting-s2-b0009-0001` | meeting | ge | 75.9 | 7/5 | 0 | 2.16/2.21 | 0 | 0 | 0 | 4 | 0 | 5 | 18 | 112.5s |
| `m3c-block-20260928-meeting-s1-b0008-0001` | meeting | us | 73.4 | 7/5 | 0 | 2.29/2.99 | 0 | 3 | 0 | 5 | 1 | 3 | 20 | 109.9s |
| `m3c-block-20260928-meeting-s4-b0006-0001` | meeting | us | 72.5 | 3/3 | 0 | 2.25/1.98 | 0 | 0 | 0 | 5 | 0 | 4 | 16 | 249.9s |
| `m3c-block-20260928-meeting-s2-b0004-0001` | meeting | ge | 72.2 | 3/5 | 2 | 2.51/2.36 | 0 | 0 | 0 | 5 | 0 | 1 | 18 | 214.9s |
| `m3c-block-20260928-meeting-s6-b0009-0001` | meeting | us | 74.4 | 5/4 | 0 | 2.79/2.9 | 0 | 0 | 0 | 5 | 0 | 4 | 14 | 145.1s |
| `m3c-block-20260928-meeting-s3-b0009-0001` | meeting | ge | 77 | 7/5 | 0 | 2.27/1.99 | 0 | 0 | 0 | 9 | 0 | 3 | 10 | 115.1s |
| `m3c-block-20260928-ge-defend-s2-b0006-0001` | ge-defend | ge | 71.4 | 0/6 | 3 | 2.79/3 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 597.6s |
| `m3c-block-20260928-us-defend-s1-b0007-0001` | us-defend | us | 72.9 | 0/6 | 3 | 3/2.75 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 597.6s |
| `m3c-block-20260928-meeting-s2-b0005-0001` | meeting | us | 80.9 | 3/3 | 0 | 1.72/2.55 | 0 | 0 | 0 | 1 | 0 | 6 | 15 | 150s |
| `m3c-block-20260928-meeting-s6-b0004-0001` | meeting | ge | 81.4 | 6/5 | 0 | 2.77/2.56 | 0 | 0 | 0 | 9 | 0 | 0 | 18 | 117.6s |
| `m3c-block-20260928-us-defend-s2-b0007-0001` | us-defend | us | 72.8 | 0/4 | 1 | 2.96/2.66 | 0 | 0 | 0 | 1 | 0 | 2 | 14 | 570s |
| `m3c-block-20260928-meeting-s4-b0002-0001` | meeting | ge | 77.3 | 8/5 | 0 | 2.37/2.71 | 0 | 1 | 0 | 4 | 0 | 3 | 17 | 87.6s |
| `m3c-block-20260928-meeting-s1-b0002-0001` | meeting | ge | 76 | 5/5 | 0 | 2.22/2.21 | 0 | 0 | 0 | 4 | 0 | 3 | 16 | 105s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
