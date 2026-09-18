# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **45 min cutoff**

- Commit: `b3c4a05bd1b616521b692d7e32174112d475361a`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **379.77s** (152.6× real-time, 15.8 battles/min)
- Results: US **45** (45.0%), GER **55** (55.0%), draw/none **0** (0.0%)
- Time-limit battles: **90/100**; captures avg **2.49** of **4.69** objectives; no-capture **24**
- Objectives nobody ever owned: **125** (26.7%) · never even contested **123** · distinct objectives assigned per side US **2.83**, GER **2.82**
- No objective progress: longest **597.6s** · mean per battle **310.2s**
- First contact avg **52.3s** · first fire **91.3s** · first objective progress **73.8s** · first capture **147.9s**
- Health: **79.7/100 overall** · strategic 76.4 · movement 97.8 · cohesion 71.8 · combat 97.6 · objective 54.9
- Stalls: vacant objective **108** · route **0** · soldier movement **91** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1366** · idle-under-orders 1.7% · over-cohesion 52.5%
- Combat: **157828** discharges · **108948** direct · **16167** hits (14.8%) · **11** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **300 asset/CORS noise** · 500 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 27/33 | 80.2 | 75 | 97.9 | 69.9 | 60.1 | 0 | 51 | 0 | 1006 | 218.5s |
| us-defend | 20 | 18/2 | 79.5 | 80.6 | 96.5 | 76.8 | 46.5 | 0 | 37 | 0 | 148 | 430.4s |
| ge-defend | 20 | 0/20 | 78.4 | 76.5 | 98.8 | 72.4 | 47.9 | 0 | 3 | 0 | 212 | 465s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `merge-check-20260918-meeting-s4-b0003-0001` | meeting | us | 78.2 | 8/5 | 0 | 2.37/2.61 | 0 | 1 | 0 | 8 | 0 | 0 | 20 | 105s |
| `merge-check-20260918-meeting-s3-b0001-0001` | meeting | ge | 75.6 | 5/5 | 0 | 3.25/2.64 | 0 | 5 | 0 | 7 | 0 | 0 | 20 | 180.1s |
| `merge-check-20260918-meeting-s5-b0008-0001` | meeting | ge | 78.6 | 6/5 | 0 | 2.57/2.8 | 0 | 0 | 0 | 9 | 0 | 0 | 17 | 135s |
| `merge-check-20260918-meeting-s3-b0008-0001` | meeting | us | 76.9 | 1/5 | 4 | 3.78/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 440.1s |
| `merge-check-20260918-meeting-s2-b0007-0001` | meeting | ge | 74.7 | 1/6 | 5 | 3.19/3.25 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 382.5s |
| `merge-check-20260918-meeting-s3-b0007-0001` | meeting | ge | 73.2 | 5/6 | 2 | 3.04/3.61 | 0 | 1 | 0 | 4 | 0 | 0 | 16 | 320.1s |
| `merge-check-20260918-meeting-s3-b0010-0001` | meeting | ge | 75.6 | 4/4 | 1 | 2.35/1.99 | 0 | 0 | 0 | 5 | 0 | 0 | 19 | 127.5s |
| `merge-check-20260918-meeting-s1-b0005-0001` | meeting | us | 76.7 | 2/5 | 3 | 2.99/3.39 | 0 | 0 | 0 | 1 | 0 | 0 | 20 | 337.5s |
| `merge-check-20260918-ge-defend-s1-b0009-0001` | ge-defend | ge | 76.4 | 0/6 | 3 | 3.98/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `merge-check-20260918-meeting-s4-b0009-0001` | meeting | ge | 80 | 3/3 | 0 | 2.49/2.26 | 0 | 0 | 0 | 6 | 0 | 0 | 20 | 157.5s |
| `merge-check-20260918-meeting-s5-b0007-0001` | meeting | us | 79.8 | 5/4 | 0 | 2.17/2.24 | 0 | 1 | 0 | 6 | 0 | 0 | 20 | 112.5s |
| `merge-check-20260918-meeting-s5-b0003-0001` | meeting | us | 76.9 | 2/5 | 3 | 2.99/3.02 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 427.6s |
| `merge-check-20260918-meeting-s6-b0005-0001` | meeting | ge | 77.6 | 7/6 | 0 | 2.99/2.69 | 0 | 2 | 0 | 5 | 0 | 0 | 20 | 122.5s |
| `merge-check-20260918-meeting-s4-b0007-0001` | meeting | ge | 75.3 | 2/6 | 4 | 2.99/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 465.1s |
| `merge-check-20260918-us-defend-s1-b0007-0001` | us-defend | us | 70.4 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 597.6s |
| `merge-check-20260918-meeting-s6-b0008-0001` | meeting | us | 76.9 | 1/4 | 3 | 2.99/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 432.6s |
| `merge-check-20260918-us-defend-s1-b0004-0001` | us-defend | us | 72.3 | 0/4 | 1 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `merge-check-20260918-meeting-s2-b0010-0001` | meeting | us | 78.5 | 5/5 | 0 | 2.62/2.98 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 165s |
| `merge-check-20260918-ge-defend-s1-b0006-0001` | ge-defend | ge | 74.1 | 0/6 | 3 | 3.65/3 | 0 | 0 | 0 | 0 | 0 | 0 | 14 | 317.5s |
| `merge-check-20260918-meeting-s6-b0001-0001` | meeting | us | 79.5 | 4/4 | 0 | 1.48/2.41 | 0 | 0 | 0 | 4 | 0 | 0 | 20 | 130s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
