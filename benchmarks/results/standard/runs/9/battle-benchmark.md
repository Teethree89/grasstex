# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `479e871ec039b0c9934b4edae510399b3e990934`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **415.77s** (134.8× real-time, 14.43 battles/min)
- Results: US **46** (46.0%), GER **54** (54.0%), draw/none **0** (0.0%)
- Time-limit battles: **85/100**; captures avg **2.5** of **4.4** objectives; no-capture **29**
- Objectives nobody ever owned: **105** (23.9%) · never even contested **99** · distinct objectives assigned per side US **2.77**, GER **2.74**
- No objective progress: longest **597.6s** · mean per battle **293.3s**
- First contact avg **50.7s** · first fire **90.5s** · first objective progress **85.9s** · first capture **152.9s**
- Health: **79.4/100 overall** · strategic 73.3 · movement 98.5 · cohesion 74.3 · combat 97.7 · objective 53.1
- Stalls: vacant objective **131** · route **0** · soldier movement **37** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **47** (47 strategic) · loop alerts **1442** · idle-under-orders 1.6% · over-cohesion 48.5%
- Combat: **156669** discharges · **109620** direct · **17871** hits (16.3%) · **5** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **300 asset/CORS noise** · 300 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 25/35 | 80.1 | 70.9 | 98.3 | 73.2 | 60.3 | 0 | 33 | 41 | 1013 | 175.2s |
| us-defend | 20 | 20/0 | 77.6 | 77.3 | 99.2 | 74.9 | 39.3 | 0 | 1 | 3 | 202 | 493.8s |
| ge-defend | 20 | 1/19 | 79 | 76.7 | 98.7 | 76.9 | 45.1 | 0 | 3 | 3 | 227 | 447s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `succession-compare-20260924-meeting-s1-b0005-0001` | meeting | us | 80.1 | 5/4 | 0 | 1.41/1.93 | 0 | 0 | 0 | 13 | 0 | 1 | 18 | 72.6s |
| `succession-compare-20260924-meeting-s5-b0005-0001` | meeting | ge | 73.4 | 3/4 | 1 | 2.99/2.27 | 0 | 1 | 0 | 4 | 0 | 3 | 20 | 120s |
| `succession-compare-20260924-meeting-s1-b0006-0001` | meeting | us | 76.3 | 4/5 | 1 | 2.6/3.05 | 0 | 1 | 0 | 7 | 0 | 1 | 19 | 105s |
| `succession-compare-20260924-us-defend-s2-b0002-0001` | us-defend | us | 71.3 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `succession-compare-20260924-ge-defend-s1-b0002-0001` | ge-defend | ge | 71.5 | 0/6 | 3 | 2.92/3 | 0 | 0 | 0 | 0 | 0 | 1 | 16 | 597.6s |
| `succession-compare-20260924-meeting-s1-b0009-0001` | meeting | ge | 77 | 8/6 | 0 | 3.02/2.42 | 0 | 0 | 0 | 7 | 0 | 1 | 19 | 105s |
| `succession-compare-20260924-meeting-s5-b0004-0001` | meeting | us | 70.1 | 0/4 | 4 | 2.99/2.84 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 447.6s |
| `succession-compare-20260924-meeting-s1-b0010-0001` | meeting | us | 74.7 | 3/4 | 2 | 2.58/2.9 | 0 | 0 | 0 | 3 | 0 | 1 | 17 | 210s |
| `succession-compare-20260924-meeting-s1-b0001-0001` | meeting | us | 75.8 | 2/3 | 1 | 2.32/2.89 | 0 | 1 | 0 | 4 | 0 | 1 | 18 | 192.6s |
| `succession-compare-20260924-meeting-s2-b0008-0001` | meeting | ge | 77.1 | 3/4 | 1 | 3.02/2.58 | 0 | 0 | 0 | 6 | 0 | 0 | 18 | 137.5s |
| `succession-compare-20260924-meeting-s2-b0001-0001` | meeting | us | 79.8 | 7/6 | 0 | 2.68/2.76 | 0 | 1 | 0 | 3 | 0 | 3 | 18 | 105s |
| `succession-compare-20260924-meeting-s5-b0008-0001` | meeting | ge | 73.5 | 3/3 | 1 | 2.32/2.27 | 0 | 0 | 0 | 6 | 0 | 0 | 16 | 157.5s |
| `succession-compare-20260924-us-defend-s2-b0008-0001` | us-defend | us | 72.5 | 0/5 | 2 | 3/2.5 | 0 | 0 | 0 | 0 | 0 | 1 | 14 | 597.6s |
| `succession-compare-20260924-meeting-s3-b0002-0001` | meeting | ge | 74.9 | 3/4 | 1 | 2.72/2.56 | 0 | 0 | 0 | 4 | 0 | 0 | 19 | 237.6s |
| `succession-compare-20260924-meeting-s4-b0002-0001` | meeting | ge | 74.4 | 4/4 | 0 | 2.37/2.16 | 0 | 9 | 0 | 5 | 0 | 0 | 20 | 152.5s |
| `succession-compare-20260924-ge-defend-s2-b0002-0001` | ge-defend | ge | 72.4 | 0/5 | 2 | 3.58/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `succession-compare-20260924-us-defend-s1-b0009-0001` | us-defend | us | 74.2 | 0/6 | 3 | 3/2.83 | 0 | 0 | 0 | 0 | 0 | 1 | 11 | 597.6s |
| `succession-compare-20260924-ge-defend-s2-b0004-0001` | ge-defend | ge | 73.1 | 0/5 | 2 | 3.44/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `succession-compare-20260924-meeting-s4-b0008-0001` | meeting | ge | 73.4 | 4/3 | 1 | 1.85/2.85 | 0 | 2 | 0 | 5 | 0 | 0 | 16 | 167.6s |
| `succession-compare-20260924-meeting-s3-b0001-0001` | meeting | us | 77.7 | 5/5 | 0 | 3.02/3.19 | 0 | 0 | 0 | 4 | 0 | 2 | 16 | 137.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
