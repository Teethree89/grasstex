# 100-battle headless benchmark

- Commit: `e345c496f1db415d550e7dfad4152732733e7e92`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **10**
- Completed: **100/100** in about **1728.71s** (32.4× real-time, 3.47 battles/min)
- Results: US **37** (37.0%), GER **63** (63.0%), draw/none **0** (0.0%)
- Time-limit battles: **69/100**; captures avg **5.77** of **4.55** objectives; no-capture **0**
- Objectives nobody ever owned: **9** (2.0%) · never even contested **7** · distinct objectives assigned per side US **1.97**, GER **1.9**
- No objective progress: longest **392.5s** · mean per battle **143.1s**
- First contact avg **153.1s** · first fire **175.8s** · first objective progress **117.2s** · first capture **124.9s**
- Health: **72.5/100 overall** · strategic 76.5 · movement 69.6 · cohesion 54.2 · combat 99.5 · objective 62.7
- Stalls: vacant objective **327** · route **56** · soldier movement **1191** · targetless command **125** · long regroup **267**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **635** · idle-under-orders 13.1% · over-cohesion 50.8%
- Combat: **156582** discharges · **140985** direct · **15572** hits (11.1%) · **0** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **30 asset/CORS noise** · 50 warnings

## Most problematic runs

| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `manual-benchmark-s10-0009` | ge | 60.8 | 4/3 | 0 | 1.18/1.78 | 0 | 6 | 16 | 8 | 5 | 0 | 16 | 147.6s |
| `manual-benchmark-s5-0007` | us | 60.7 | 6/4 | 0 | 1.78/1.92 | 1 | 11 | 15 | 9 | 2 | 0 | 16 | 137.5s |
| `manual-benchmark-s2-0001` | us | 54.7 | 5/4 | 0 | 1.72/1.74 | 3 | 28 | 6 | 10 | 3 | 0 | 16 | 135s |
| `manual-benchmark-s8-0003` | us | 66.9 | 10/6 | 0 | 2.52/2.34 | 0 | 4 | 13 | 4 | 2 | 0 | 16 | 150s |
| `manual-benchmark-s5-0003` | ge | 67.6 | 6/5 | 0 | 1.7/2.06 | 0 | 9 | 15 | 2 | 2 | 0 | 16 | 227.5s |
| `manual-benchmark-s3-0009` | ge | 67.7 | 7/6 | 0 | 2.85/1.95 | 1 | 26 | 0 | 15 | 1 | 0 | 13 | 120s |
| `manual-benchmark-s10-0001` | ge | 66.8 | 7/5 | 0 | 1.83/2.06 | 0 | 21 | 0 | 12 | 3 | 0 | 16 | 122.6s |
| `manual-benchmark-s6-0007` | ge | 57.2 | 5/3 | 0 | 1.66/1.35 | 0 | 20 | 4 | 6 | 4 | 0 | 12 | 135s |
| `manual-benchmark-s5-0006` | ge | 66.1 | 5/4 | 0 | 1.49/1.78 | 1 | 14 | 0 | 14 | 5 | 0 | 2 | 127.5s |
| `manual-benchmark-s1-0007` | us | 60.5 | 7/5 | 0 | 1.83/1.87 | 1 | 12 | 2 | 4 | 5 | 0 | 15 | 177.4s |
| `manual-benchmark-s5-0001` | us | 65.2 | 5/5 | 0 | 1.83/1.74 | 1 | 9 | 7 | 2 | 2 | 0 | 16 | 145s |
| `manual-benchmark-s10-0006` | us | 66 | 6/6 | 1 | 2.22/2.68 | 0 | 2 | 2 | 6 | 7 | 0 | 6 | 120s |
| `manual-benchmark-s6-0006` | ge | 67.2 | 5/4 | 0 | 1.63/1.79 | 0 | 5 | 2 | 4 | 4 | 0 | 16 | 122.4s |
| `manual-benchmark-s6-0009` | us | 68.9 | 5/4 | 0 | 1.7/2.02 | 0 | 15 | 0 | 5 | 2 | 0 | 16 | 132.6s |
| `manual-benchmark-s1-0003` | ge | 64.6 | 6/5 | 0 | 2.43/1.58 | 0 | 29 | 0 | 7 | 4 | 0 | 7 | 115s |
| `manual-benchmark-s6-0002` | ge | 70.9 | 6/4 | 0 | 1.3/1.9 | 0 | 0 | 2 | 8 | 4 | 0 | 4 | 110.1s |
| `manual-benchmark-s1-0008` | ge | 67 | 8/5 | 0 | 2.49/1.53 | 0 | 34 | 0 | 7 | 7 | 0 | 3 | 122.6s |
| `manual-benchmark-s1-0005` | ge | 66 | 7/5 | 0 | 2.47/2.13 | 0 | 27 | 0 | 6 | 3 | 0 | 10 | 130.1s |
| `manual-benchmark-s2-0002` | us | 66 | 8/5 | 0 | 2.12/1.22 | 2 | 11 | 0 | 6 | 5 | 0 | 3 | 102.6s |
| `manual-benchmark-s6-0001` | us | 70.4 | 7/6 | 0 | 2.9/2.06 | 0 | 12 | 0 | 3 | 3 | 0 | 16 | 117.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
