# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `aefc110babfd3f8087089447e975d7ef4bc37621`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **235.16s** (217.2× real-time, 25.51 battles/min)
- Results: US **41** (41.0%), GER **59** (59.0%), draw/none **0** (0.0%)
- Time-limit battles: **65/100**; captures avg **3.01** of **4.44** objectives; no-capture **30**
- Objectives nobody ever owned: **78** (17.6%) · never even contested **73** · distinct objectives assigned per side US **2.5**, GER **2.5**
- No objective progress: longest **597.6s** · mean per battle **241.9s**
- First contact avg **59.9s** · first fire **96.1s** · first objective progress **85.2s** · first capture **167.7s**
- Health: **80.5/100 overall** · strategic 73 · movement 98.8 · cohesion 79.3 · combat 98.7 · objective 52.9
- Stalls: vacant objective **185** · route **0** · soldier movement **36** · targetless command **0** · long regroup **2**
- Coordination: writer conflicts **88** (88 strategic) · loop alerts **1261** · idle-under-orders 1.2% · over-cohesion 40.4%
- Combat: **151900** discharges · **76756** direct · **8418** hits (11.0%) · **2** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **1299 asset/CORS noise** · 302 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress | Spread us/ge | Regroups/battle | Regroup timeouts | Stall repeats/wakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| meeting | 60 | 23/37 | 80.5 | 68 | 98.5 | 78.1 | 59.5 | 0 | 31 | 76 | 990 | 164s | 2.41/2.46 | 14.07 | 75 | 214/419 |
| us-defend | 20 | 17/3 | 82.1 | 85.1 | 99.1 | 83.6 | 43.9 | 0 | 4 | 4 | 104 | 278.3s | 2.74/2.4 | 6.6 | 3 | 18/116 |
| ge-defend | 20 | 1/19 | 78.9 | 75.9 | 99.3 | 78.9 | 42.2 | 0 | 1 | 8 | 167 | 439.4s | 2.54/2.73 | 5.75 | 4 | 40/162 |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `crest-pair-meeting-s1-b0002-0001` | meeting | us | 76.8 | 5/5 | 0 | 2.79/1.97 | 0 | 0 | 0 | 3 | 0 | 10 | 17 | 102.6s |
| `crest-pair-meeting-s3-b0007-0001` | meeting | us | 74 | 7/5 | 0 | 2.64/2.84 | 0 | 0 | 0 | 5 | 0 | 6 | 20 | 107.6s |
| `crest-pair-meeting-s6-b0007-0001` | meeting | ge | 75.5 | 8/6 | 0 | 2.34/2.83 | 0 | 1 | 0 | 7 | 0 | 4 | 17 | 110.1s |
| `crest-pair-meeting-s6-b0001-0001` | meeting | us | 75.5 | 6/5 | 0 | 2.32/2.29 | 0 | 0 | 0 | 4 | 0 | 5 | 16 | 122.6s |
| `crest-pair-meeting-s4-b0001-0001` | meeting | ge | 78.5 | 4/4 | 0 | 3/1.89 | 0 | 0 | 0 | 12 | 0 | 0 | 16 | 145.1s |
| `crest-pair-meeting-s1-b0005-0001` | meeting | us | 78.1 | 6/4 | 0 | 2.22/1.69 | 0 | 0 | 0 | 7 | 0 | 2 | 19 | 100.1s |
| `crest-pair-meeting-s4-b0009-0001` | meeting | ge | 74.6 | 3/3 | 1 | 2.32/2.32 | 0 | 2 | 0 | 8 | 0 | 0 | 17 | 214.9s |
| `crest-pair-meeting-s1-b0009-0001` | meeting | ge | 76.8 | 6/6 | 1 | 2.09/2.95 | 0 | 0 | 0 | 3 | 1 | 2 | 20 | 122.6s |
| `crest-pair-meeting-s5-b0010-0001` | meeting | ge | 78.4 | 5/4 | 0 | 2.02/2.34 | 0 | 0 | 0 | 8 | 0 | 1 | 17 | 185.1s |
| `crest-pair-meeting-s2-b0001-0001` | meeting | ge | 79 | 5/5 | 0 | 2.16/2.51 | 0 | 0 | 0 | 2 | 0 | 3 | 20 | 295.1s |
| `crest-pair-meeting-s3-b0009-0001` | meeting | us | 78.3 | 7/6 | 0 | 2.01/2.12 | 0 | 1 | 0 | 6 | 0 | 1 | 19 | 165.1s |
| `crest-pair-meeting-s6-b0003-0001` | meeting | ge | 77.5 | 5/5 | 0 | 2.03/2.51 | 0 | 0 | 0 | 6 | 0 | 1 | 19 | 132.6s |
| `crest-pair-meeting-s1-b0006-0001` | meeting | ge | 78.2 | 5/5 | 0 | 2.22/2.29 | 0 | 1 | 0 | 7 | 0 | 0 | 20 | 130.1s |
| `crest-pair-meeting-s2-b0006-0001` | meeting | ge | 77.4 | 5/6 | 1 | 2.09/2.33 | 0 | 1 | 0 | 5 | 0 | 0 | 20 | 152.4s |
| `crest-pair-meeting-s2-b0003-0001` | meeting | us | 78.6 | 7/6 | 0 | 2.37/2.02 | 0 | 2 | 0 | 3 | 0 | 2 | 20 | 115.1s |
| `crest-pair-meeting-s4-b0008-0001` | meeting | ge | 78.8 | 5/5 | 0 | 2.19/2.77 | 0 | 0 | 0 | 6 | 0 | 0 | 20 | 145.1s |
| `crest-pair-meeting-s5-b0003-0001` | meeting | us | 79.3 | 6/5 | 0 | 2.87/2.34 | 0 | 0 | 0 | 4 | 0 | 2 | 17 | 97.5s |
| `crest-pair-ge-defend-s1-b0001-0001` | ge-defend | ge | 76.3 | 0/4 | 1 | 1.89/2.57 | 0 | 0 | 0 | 1 | 0 | 2 | 14 | 312.4s |
| `crest-pair-meeting-s1-b0007-0001` | meeting | ge | 78.5 | 5/5 | 1 | 2.47/2.8 | 0 | 0 | 0 | 3 | 0 | 2 | 15 | 154.9s |
| `crest-pair-us-defend-s1-b0010-0001` | us-defend | us | 72.8 | 0/4 | 2 | 2/2.27 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 597.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
