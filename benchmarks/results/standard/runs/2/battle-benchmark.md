# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `3708d708824d445db0dbf78cd65fb8425df21bf7`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **2/10**
- Completed: **5/100 expected** in about **0s** (0× real-time, 0 battles/min)
- Results: US **2** (40.0%), GER **3** (60.0%), draw/none **0** (0.0%)
- Time-limit battles: **5/5**; captures avg **0.4** of **4.8** objectives; no-capture **3**
- Objectives nobody ever owned: **8** (33.3%) · never even contested **8** · distinct objectives assigned per side US **2.87**, GER **2.82**
- No objective progress: longest **597.6s** · mean per battle **467.1s**
- First contact avg **6s** · first fire **62.2s** · first objective progress **2.5s** · first capture **206.3s**
- Health: **72/100 overall** · strategic 49.4 · movement 94.9 · cohesion 73.1 · combat 97.9 · objective 44.8
- Stalls: vacant objective **0** · route **0** · soldier movement **6** · targetless command **0** · long regroup **1**
- Coordination: writer conflicts **362** (362 strategic) · loop alerts **48** · idle-under-orders 7.2% · over-cohesion 46.3%
- Combat: **3066** discharges · **2178** direct · **424** hits (19.5%) · **2** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **15 asset/CORS noise** · 25 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 0 | 0/0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0s |
| us-defend | 2 | 2/0 | 65.3 | 45 | 88.7 | 64.1 | 30.8 | 0 | 6 | 160 | 32 | 475.1s |
| ge-defend | 3 | 0/3 | 76.5 | 52.3 | 99 | 79.2 | 54.2 | 0 | 0 | 202 | 16 | 461.8s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `standard-benchmark-us-defend-s1-b0002-0001` | us-defend | us | 66.5 | 0/6 | 3 | 2.38/2.99 | 0 | 4 | 0 | 0 | 1 | 80 | 16 | 352.5s |
| `standard-benchmark-us-defend-s1-b0001-0001` | us-defend | us | 64.2 | 0/5 | 2 | 3/2.99 | 0 | 2 | 0 | 0 | 0 | 80 | 16 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0001-0001` | ge-defend | ge | 72.6 | 0/4 | 2 | 2.99/2 | 0 | 0 | 0 | 0 | 0 | 80 | 2 | 597.6s |
| `standard-benchmark-ge-defend-s2-b0002-0001` | ge-defend | ge | 78.5 | 1/5 | 1 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 80 | 5 | 465.1s |
| `standard-benchmark-ge-defend-s2-b0003-0001` | ge-defend | ge | 78.4 | 1/4 | 0 | 2.99/3.11 | 0 | 0 | 0 | 0 | 0 | 42 | 9 | 322.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
