# 100-battle headless benchmark

- Commit: `f00b8599775c7ef5945b4d995f1b696b6298d1e9`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **10**
- Completed: **100/100** in about **263.04s** (208.4× real-time, 22.81 battles/min)
- Results: US **47** (47.0%), GER **53** (53.0%), draw/none **0** (0.0%)
- Time-limit battles: **58/100**; captures avg **6.03** of **4.55** objectives; no-capture **0**
- Objectives nobody ever owned: **6** (1.3%) · never even contested **4** · distinct objectives assigned per side US **1.91**, GER **1.9**
- No objective progress: longest **392.5s** · mean per battle **137.4s**
- First contact avg **152.5s** · first fire **176.1s** · first objective progress **117.3s** · first capture **125.1s**
- Health: **74.3/100 overall** · strategic 67.6 · movement 96.8 · cohesion 52.8 · combat 99.7 · objective 54.6
- Stalls: vacant objective **517** · route **14** · soldier movement **81** · targetless command **159** · long regroup **350**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1532** · idle-under-orders 1.2% · over-cohesion 45.8%
- Combat: **191420** discharges · **180589** direct · **19791** hits (11.0%) · **0** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **30 asset/CORS noise** · 50 warnings

## Most problematic runs

| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `manual-benchmark-s2-0002` | us | 63.7 | 9/5 | 0 | 2/1.27 | 0 | 1 | 12 | 7 | 7 | 0 | 20 | 105s |
| `manual-benchmark-s5-0001` | us | 68.8 | 7/5 | 0 | 1.38/1.28 | 0 | 6 | 22 | 1 | 3 | 0 | 17 | 130.1s |
| `manual-benchmark-s6-0005` | us | 71 | 7/5 | 0 | 1.97/2.08 | 0 | 0 | 0 | 14 | 8 | 0 | 17 | 115.1s |
| `manual-benchmark-s1-0007` | us | 65.6 | 9/5 | 0 | 1.83/1.89 | 0 | 2 | 9 | 10 | 4 | 0 | 14 | 87.6s |
| `manual-benchmark-s6-0003` | ge | 66.7 | 6/5 | 0 | 1.76/1.11 | 1 | 0 | 9 | 8 | 3 | 0 | 17 | 110.1s |
| `manual-benchmark-s5-0003` | ge | 71.2 | 7/5 | 0 | 1.15/1.81 | 0 | 0 | 11 | 7 | 1 | 0 | 20 | 120s |
| `manual-benchmark-s6-0002` | ge | 68.9 | 6/4 | 0 | 1.29/1.58 | 0 | 0 | 2 | 14 | 5 | 0 | 13 | 115.1s |
| `manual-benchmark-s2-0009` | ge | 72.8 | 9/6 | 0 | 2.58/2.59 | 0 | 0 | 0 | 13 | 6 | 0 | 18 | 117.6s |
| `manual-benchmark-s5-0007` | us | 66.1 | 7/4 | 0 | 2.25/1.31 | 1 | 0 | 9 | 5 | 3 | 0 | 18 | 135s |
| `manual-benchmark-s4-0006` | us | 71.1 | 7/5 | 0 | 2.26/1.25 | 0 | 0 | 1 | 9 | 6 | 0 | 20 | 87.6s |
| `manual-benchmark-s10-0010` | us | 71 | 3/3 | 0 | 1.82/1.94 | 0 | 0 | 0 | 10 | 7 | 0 | 17 | 197.6s |
| `manual-benchmark-s3-0010` | ge | 71.5 | 4/4 | 0 | 1.61/1.11 | 1 | 0 | 0 | 9 | 5 | 0 | 20 | 159.9s |
| `manual-benchmark-s7-0002` | us | 67.8 | 5/4 | 0 | 1.47/1.85 | 0 | 0 | 2 | 7 | 7 | 0 | 16 | 135s |
| `manual-benchmark-s10-0001` | us | 70.2 | 6/5 | 0 | 1.57/2.73 | 0 | 3 | 0 | 8 | 7 | 0 | 18 | 135s |
| `manual-benchmark-s3-0004` | ge | 71.6 | 9/5 | 0 | 2.25/2.03 | 0 | 1 | 0 | 10 | 6 | 0 | 16 | 107.6s |
| `manual-benchmark-s6-0004` | us | 65.4 | 6/5 | 0 | 1.31/2.64 | 0 | 4 | 3 | 7 | 4 | 0 | 17 | 137.4s |
| `manual-benchmark-s7-0004` | us | 63.2 | 7/6 | 0 | 1.62/2.46 | 0 | 6 | 7 | 3 | 5 | 0 | 16 | 147.6s |
| `manual-benchmark-s8-0007` | us | 72.5 | 9/5 | 0 | 1.76/1.49 | 0 | 0 | 0 | 9 | 5 | 0 | 19 | 125.1s |
| `manual-benchmark-s1-0004` | ge | 67.1 | 4/3 | 0 | 2.1/1.49 | 0 | 0 | 2 | 7 | 5 | 0 | 17 | 187.5s |
| `manual-benchmark-s3-0002` | us | 72 | 8/5 | 0 | 2.13/2.05 | 0 | 0 | 0 | 9 | 6 | 0 | 17 | 105s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
