# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **45 min cutoff**

- Commit: `d2837b0cce8c912ea3105772fbd48264d9c72e79`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **404.04s** (138.8× real-time, 14.85 battles/min)
- Results: US **39** (39.0%), GER **61** (61.0%), draw/none **0** (0.0%)
- Time-limit battles: **79/100**; captures avg **3.04** of **4.54** objectives; no-capture **22**
- Objectives nobody ever owned: **87** (19.2%) · never even contested **86** · distinct objectives assigned per side US **2.79**, GER **2.79**
- No objective progress: longest **597.6s** · mean per battle **275.6s**
- First contact avg **51.1s** · first fire **93.3s** · first objective progress **78.7s** · first capture **154.4s**
- Health: **80.5/100 overall** · strategic 75.8 · movement 98.6 · cohesion 73.3 · combat 97.6 · objective 56.9
- Stalls: vacant objective **142** · route **0** · soldier movement **37** · targetless command **0** · long regroup **3**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1604** · idle-under-orders 1.6% · over-cohesion 49.6%
- Combat: **158998** discharges · **114408** direct · **17962** hits (15.7%) · **16** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **300 asset/CORS noise** · 500 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 22/38 | 81.3 | 75 | 98.1 | 72.7 | 62.8 | 0 | 37 | 0 | 1066 | 170.8s |
| us-defend | 20 | 17/3 | 79.2 | 76.5 | 99.3 | 73.7 | 49 | 0 | 0 | 0 | 274 | 417.9s |
| ge-defend | 20 | 0/20 | 79.3 | 77.5 | 99.2 | 75 | 47.4 | 0 | 0 | 0 | 264 | 447.4s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-meeting-s2-b0010-0001` | meeting | ge | 80.7 | 7/5 | 0 | 2.48/2.99 | 0 | 0 | 0 | 13 | 0 | 0 | 17 | 110.1s |
| `standard-benchmark-meeting-s5-b0003-0001` | meeting | ge | 80.2 | 6/5 | 0 | 3.02/1.86 | 0 | 0 | 0 | 10 | 0 | 0 | 20 | 87.5s |
| `standard-benchmark-meeting-s1-b0009-0001` | meeting | ge | 79.1 | 4/4 | 0 | 2.37/1.35 | 0 | 0 | 0 | 8 | 0 | 0 | 20 | 150.1s |
| `standard-benchmark-us-defend-s2-b0002-0001` | us-defend | us | 70.2 | 0/6 | 3 | 3/3.59 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-us-defend-s1-b0001-0001` | us-defend | us | 70.9 | 0/5 | 2 | 3/2.99 | 0 | 0 | 0 | 0 | 1 | 0 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0004-0001` | ge-defend | ge | 73.8 | 0/6 | 3 | 3.39/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s2-b0005-0001` | meeting | ge | 76.5 | 6/6 | 0 | 3.55/2.5 | 0 | 5 | 0 | 8 | 0 | 0 | 16 | 95.1s |
| `standard-benchmark-ge-defend-s2-b0001-0001` | ge-defend | ge | 74.1 | 0/4 | 2 | 2.59/2 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0008-0001` | ge-defend | ge | 73.2 | 0/5 | 2 | 3.78/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s1-b0005-0001` | ge-defend | ge | 73.3 | 0/5 | 2 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0009-0001` | ge-defend | ge | 74.2 | 0/5 | 2 | 3.19/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-meeting-s5-b0009-0001` | meeting | us | 78.2 | 6/5 | 0 | 2.6/3.16 | 0 | 0 | 0 | 5 | 0 | 0 | 20 | 142.5s |
| `standard-benchmark-meeting-s3-b0002-0001` | meeting | ge | 78.5 | 5/6 | 2 | 2.99/3.6 | 0 | 0 | 0 | 3 | 1 | 0 | 18 | 114.9s |
| `standard-benchmark-us-defend-s1-b0002-0001` | us-defend | us | 76.3 | 0/6 | 3 | 2.85/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 375s |
| `standard-benchmark-us-defend-s2-b0005-0001` | us-defend | us | 77.6 | 0/4 | 1 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 19 | 597.6s |
| `standard-benchmark-meeting-s1-b0004-0001` | meeting | us | 76 | 2/4 | 2 | 2.99/2.26 | 0 | 1 | 0 | 3 | 0 | 0 | 17 | 197.5s |
| `standard-benchmark-meeting-s4-b0007-0001` | meeting | ge | 75.9 | 5/6 | 1 | 3.02/3.44 | 0 | 2 | 0 | 5 | 0 | 0 | 16 | 117.6s |
| `standard-benchmark-meeting-s2-b0003-0001` | meeting | ge | 76.7 | 4/4 | 1 | 2.11/2.39 | 0 | 0 | 0 | 4 | 0 | 0 | 17 | 220s |
| `standard-benchmark-ge-defend-s1-b0008-0001` | ge-defend | ge | 72.4 | 0/4 | 1 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `standard-benchmark-us-defend-s1-b0006-0001` | us-defend | us | 72.1 | 0/5 | 2 | 3/2.78 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 597.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
