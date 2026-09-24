# M3C standard benchmark

- Profile: **60 meeting / 20 US-defend / 20 GE-defend**
- Worker settings: **10 battles/worker** · **10 min cutoff**

- Commit: `ca02b72b433116c35310549c2d51dfd50d33b3fd`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 14
- Scenario/workers available: **10/10**
- Completed: **100/100 expected** in about **413.73s** (135.5× real-time, 14.5 battles/min)
- Results: US **41** (41.0%), GER **59** (59.0%), draw/none **0** (0.0%)
- Time-limit battles: **82/100**; captures avg **2.76** of **4.53** objectives; no-capture **22**
- Objectives nobody ever owned: **92** (20.3%) · never even contested **88** · distinct objectives assigned per side US **2.81**, GER **2.85**
- No objective progress: longest **597.6s** · mean per battle **282.5s**
- First contact avg **49.4s** · first fire **92.1s** · first objective progress **87.9s** · first capture **175.1s**
- Health: **79.7/100 overall** · strategic 72.2 · movement 98.3 · cohesion 73.3 · combat 98.2 · objective 56.5
- Stalls: vacant objective **134** · route **0** · soldier movement **48** · targetless command **0** · long regroup **0**
- Coordination: writer conflicts **65** (65 strategic) · loop alerts **1470** · idle-under-orders 1.8% · over-cohesion 50.3%
- Combat: **158693** discharges · **118005** direct · **17308** hits (14.7%) · **15** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **300 asset/CORS noise** · 300 warnings

## By battle type

| Type | Battles | US / GER wins | Health | Strategic | Movement | Cohesion | Objective | Route stalls | Move stalls | Conflicts | Loops | Mean no-progress |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| meeting | 60 | 20/40 | 79.8 | 69.6 | 98.1 | 71.9 | 61.2 | 0 | 35 | 56 | 995 | 194.9s |
| us-defend | 20 | 20/0 | 79.3 | 75.7 | 98.2 | 76.3 | 48.5 | 0 | 10 | 6 | 240 | 418.4s |
| ge-defend | 20 | 1/19 | 79.7 | 76.5 | 98.8 | 74.5 | 50.3 | 0 | 3 | 3 | 235 | 409.4s |

## Most problematic runs

| Seed | Type | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `recon-compare-20260924-meeting-s6-b0008-0001` | meeting | ge | 71.9 | 4/5 | 1 | 3.18/3.02 | 0 | 5 | 0 | 9 | 0 | 1 | 20 | 172.5s |
| `recon-compare-20260924-meeting-s4-b0009-0001` | meeting | ge | 74.4 | 7/6 | 0 | 3.02/2.9 | 0 | 2 | 0 | 8 | 0 | 3 | 17 | 87.6s |
| `recon-compare-20260924-meeting-s6-b0001-0001` | meeting | ge | 74.8 | 4/4 | 0 | 2.99/1.96 | 0 | 1 | 0 | 7 | 0 | 3 | 17 | 97.5s |
| `recon-compare-20260924-meeting-s2-b0010-0001` | meeting | ge | 78.2 | 4/4 | 0 | 2.17/2.71 | 0 | 1 | 0 | 1 | 0 | 7 | 16 | 165s |
| `recon-compare-20260924-meeting-s5-b0006-0001` | meeting | ge | 78 | 7/6 | 0 | 3.02/2.56 | 0 | 0 | 0 | 9 | 0 | 1 | 16 | 132.6s |
| `recon-compare-20260924-meeting-s4-b0007-0001` | meeting | ge | 78 | 6/6 | 1 | 2.9/2.59 | 0 | 0 | 0 | 8 | 0 | 0 | 17 | 152.5s |
| `recon-compare-20260924-meeting-s6-b0009-0001` | meeting | us | 75.6 | 5/4 | 0 | 2.67/2.83 | 0 | 6 | 0 | 7 | 0 | 0 | 20 | 172.5s |
| `recon-compare-20260924-meeting-s2-b0004-0001` | meeting | us | 74.1 | 4/6 | 2 | 3.59/3.78 | 0 | 0 | 0 | 2 | 0 | 2 | 16 | 375s |
| `recon-compare-20260924-ge-defend-s1-b0010-0001` | ge-defend | ge | 72.5 | 0/5 | 2 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 597.6s |
| `recon-compare-20260924-us-defend-s2-b0007-0001` | us-defend | us | 73.2 | 0/5 | 2 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 1 | 17 | 597.6s |
| `recon-compare-20260924-meeting-s2-b0009-0001` | meeting | us | 75.6 | 3/3 | 0 | 2.27/2.26 | 0 | 1 | 0 | 3 | 0 | 2 | 20 | 257.5s |
| `recon-compare-20260924-us-defend-s2-b0005-0001` | us-defend | us | 71.5 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `recon-compare-20260924-us-defend-s2-b0009-0001` | us-defend | us | 72.1 | 0/4 | 2 | 2/2.79 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 597.6s |
| `recon-compare-20260924-us-defend-s2-b0010-0001` | us-defend | us | 73.3 | 0/5 | 2 | 3/3.17 | 0 | 0 | 0 | 0 | 0 | 1 | 15 | 597.6s |
| `recon-compare-20260924-us-defend-s2-b0003-0001` | us-defend | us | 74.2 | 0/6 | 3 | 3/2.99 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |
| `recon-compare-20260924-meeting-s2-b0002-0001` | meeting | ge | 76.8 | 4/5 | 1 | 3.02/2.44 | 0 | 3 | 0 | 2 | 0 | 3 | 16 | 97.5s |
| `recon-compare-20260924-meeting-s6-b0005-0001` | meeting | us | 79.9 | 5/4 | 0 | 2.3/2.45 | 0 | 0 | 0 | 3 | 0 | 2 | 20 | 165s |
| `recon-compare-20260924-ge-defend-s2-b0009-0001` | ge-defend | ge | 73.4 | 0/6 | 3 | 2.99/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 415s |
| `recon-compare-20260924-meeting-s1-b0007-0001` | meeting | us | 82.1 | 5/6 | 1 | 2.84/2.99 | 0 | 0 | 0 | 0 | 0 | 4 | 17 | 169.9s |
| `recon-compare-20260924-ge-defend-s2-b0010-0001` | ge-defend | ge | 72.6 | 0/5 | 2 | 3.78/3 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 597.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
