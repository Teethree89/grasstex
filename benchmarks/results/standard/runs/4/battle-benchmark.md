# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **45 min cutoff**

- Commit: `5c0e0f3bd7ea41e782b38becf77572adc24807f7`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **855.05s** (67.3× real-time, 7.02 battles/min)
- Results: US **50** (50.0%), GER **50** (50.0%), draw/none **0** (0.0%)
- Time-limit battles: **87/100**; captures avg **2.76** of **4.69** objectives; no-capture **22**
- Objectives nobody ever owned: **105** (22.4%) · never even contested **100** · distinct objectives assigned per side US **2.98**, GER **3.04**
- No objective progress: longest **597.6s** · mean per battle **271.2s**
- First contact avg **52.8s** · first fire **89.2s** · first objective progress **73.2s** · first capture **146.5s**
- Health: **71.8/100 overall** · strategic 46.5 · movement 94.4 · cohesion 62.7 · combat 97.6 · objective 57.6
- Stalls: vacant objective **130** · route **0** · soldier movement **188** · targetless command **0** · long regroup **121**
- Coordination: writer conflicts **7582** (7582 strategic) · loop alerts **1557** · idle-under-orders 4.0% · over-cohesion 53.5%
- Combat: **149537** discharges · **101954** direct · **16692** hits (16.4%) · **235** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **300 asset/CORS noise** · 500 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 31/29 | 72.2 | 45 | 94 | 59 | 64.9 | 0 | 134 | 4800 | 1064 | 179.3s |
| us-defend | 20 | 17/3 | 71.6 | 50.5 | 94.5 | 72.1 | 43.7 | 0 | 33 | 1376 | 240 | 381.8s |
| ge-defend | 20 | 2/18 | 70.7 | 46.8 | 95.5 | 64.7 | 49.5 | 0 | 21 | 1406 | 253 | 436.2s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `merge-check-20260918-meeting-s5-b0009-0001` | meeting | us | 56.2 | 2/4 | 2 | 2.49/2.47 | 0 | 12 | 0 | 11 | 3 | 80 | 17 | 242.5s |
| `merge-check-20260918-meeting-s5-b0010-0001` | meeting | us | 67.8 | 4/4 | 0 | 2.2/2.38 | 0 | 0 | 0 | 11 | 4 | 80 | 20 | 109.9s |
| `merge-check-20260918-us-defend-s2-b0006-0001` | us-defend | us | 58.9 | 0/4 | 1 | 2.34/1.99 | 0 | 5 | 0 | 11 | 0 | 80 | 12 | 395.1s |
| `merge-check-20260918-ge-defend-s1-b0006-0001` | ge-defend | ge | 62 | 0/6 | 3 | 2.99/2.9 | 0 | 0 | 0 | 1 | 2 | 80 | 19 | 424.9s |
| `merge-check-20260918-ge-defend-s1-b0009-0001` | ge-defend | ge | 63.8 | 0/6 | 3 | 3.98/3 | 0 | 0 | 0 | 0 | 4 | 80 | 15 | 597.6s |
| `merge-check-20260918-meeting-s2-b0008-0001` | meeting | us | 67.7 | 4/4 | 0 | 2.99/3.03 | 0 | 0 | 0 | 6 | 3 | 80 | 17 | 197.5s |
| `merge-check-20260918-meeting-s6-b0010-0001` | meeting | ge | 65 | 4/4 | 0 | 2.85/2.68 | 0 | 8 | 0 | 4 | 3 | 80 | 20 | 117.6s |
| `merge-check-20260918-meeting-s4-b0009-0001` | meeting | us | 69.4 | 2/3 | 1 | 2.46/2.49 | 0 | 0 | 0 | 7 | 0 | 80 | 16 | 270.1s |
| `merge-check-20260918-meeting-s3-b0007-0001` | meeting | ge | 64.4 | 4/6 | 3 | 3.57/3.22 | 0 | 11 | 0 | 1 | 3 | 80 | 17 | 212.6s |
| `merge-check-20260918-meeting-s2-b0005-0001` | meeting | ge | 64.4 | 1/5 | 4 | 2.99/3.95 | 0 | 4 | 0 | 0 | 3 | 80 | 16 | 264.9s |
| `merge-check-20260918-us-defend-s2-b0002-0001` | us-defend | us | 64.9 | 0/4 | 1 | 3.03/2.99 | 0 | 0 | 0 | 1 | 1 | 80 | 19 | 432.4s |
| `merge-check-20260918-meeting-s4-b0006-0001` | meeting | us | 68.8 | 8/5 | 0 | 2.79/2.9 | 0 | 1 | 0 | 4 | 3 | 80 | 20 | 115.1s |
| `merge-check-20260918-meeting-s1-b0010-0001` | meeting | ge | 66.5 | 3/3 | 1 | 2.53/2.71 | 0 | 0 | 0 | 4 | 2 | 80 | 17 | 182.5s |
| `merge-check-20260918-ge-defend-s2-b0010-0001` | ge-defend | ge | 64.5 | 0/4 | 1 | 2.99/3 | 0 | 3 | 0 | 0 | 1 | 80 | 18 | 597.6s |
| `merge-check-20260918-meeting-s4-b0002-0001` | meeting | ge | 70.2 | 2/5 | 3 | 2.99/3.45 | 0 | 1 | 0 | 0 | 2 | 80 | 20 | 240s |
| `merge-check-20260918-meeting-s1-b0003-0001` | meeting | ge | 67.9 | 3/3 | 0 | 2.99/2.4 | 0 | 1 | 0 | 3 | 3 | 80 | 19 | 222.4s |
| `merge-check-20260918-meeting-s4-b0007-0001` | meeting | ge | 65.5 | 3/6 | 3 | 2.99/3.44 | 0 | 11 | 0 | 1 | 0 | 80 | 18 | 302.4s |
| `merge-check-20260918-us-defend-s2-b0007-0001` | us-defend | us | 66.7 | 0/5 | 2 | 3.62/2.99 | 0 | 0 | 0 | 0 | 1 | 80 | 15 | 597.6s |
| `merge-check-20260918-us-defend-s1-b0007-0001` | us-defend | us | 66.1 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 80 | 13 | 597.6s |
| `merge-check-20260918-meeting-s5-b0007-0001` | meeting | us | 72.4 | 4/4 | 1 | 3.07/2.27 | 0 | 0 | 0 | 1 | 3 | 80 | 20 | 230.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
