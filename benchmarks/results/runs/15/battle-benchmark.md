# 100-battle headless benchmark

- Commit: `f4560430c737d14803bcf659b4b20014a6add43e`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **10**
- Completed: **100/100** in about **367.19s** (145× real-time, 16.34 battles/min)
- Results: US **45** (45.0%), GER **55** (55.0%), draw/none **0** (0.0%)
- Time-limit battles: **53/100**; captures avg **6.03** of **4.55** objectives; no-capture **0**
- Objectives nobody ever owned: **1** (0.2%) · never even contested **1** · distinct objectives assigned per side US **1.98**, GER **1.91**
- No objective progress: longest **272.4s** · mean per battle **131.7s**
- First contact avg **150.4s** · first fire **169.4s** · first objective progress **113.9s** · first capture **121.6s**
- Health: **74.6/100 overall** · strategic 73.1 · movement 96.2 · cohesion 49.3 · combat 98.8 · objective 55.9
- Stalls: vacant objective **560** · route **25** · soldier movement **78** · targetless command **58** · long regroup **357**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1522** · idle-under-orders 1.1% · over-cohesion 50.6%
- Combat: **221959** discharges · **179653** direct · **19343** hits (10.8%) · **0** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **30 asset/CORS noise** · 50 warnings

## Most problematic runs

| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `manual-benchmark-s6-0007` | ge | 64.7 | 5/3 | 0 | 1.35/1.87 | 0 | 0 | 8 | 18 | 3 | 0 | 16 | 215.1s |
| `manual-benchmark-s5-0003` | ge | 64.5 | 7/5 | 0 | 1.55/1.78 | 0 | 0 | 10 | 10 | 6 | 0 | 16 | 110.1s |
| `manual-benchmark-s3-0004` | ge | 69.9 | 8/5 | 0 | 2.09/2.28 | 0 | 3 | 0 | 18 | 5 | 0 | 16 | 110.1s |
| `manual-benchmark-s3-0010` | ge | 70.3 | 5/4 | 0 | 2.29/1.23 | 1 | 0 | 0 | 13 | 7 | 0 | 20 | 127.5s |
| `manual-benchmark-s6-0003` | ge | 65.6 | 7/5 | 0 | 1.76/1.38 | 1 | 2 | 8 | 9 | 3 | 0 | 18 | 107.6s |
| `manual-benchmark-s10-0009` | ge | 67.8 | 5/3 | 0 | 1.15/1.74 | 1 | 0 | 1 | 11 | 6 | 0 | 18 | 147.6s |
| `manual-benchmark-s8-0010` | us | 70.4 | 11/6 | 0 | 1.72/1.55 | 0 | 2 | 0 | 13 | 5 | 0 | 20 | 112.5s |
| `manual-benchmark-s9-0007` | us | 73.1 | 9/5 | 0 | 2.1/2.03 | 1 | 0 | 0 | 14 | 4 | 0 | 17 | 95.1s |
| `manual-benchmark-s6-0010` | ge | 67.6 | 6/6 | 0 | 1.69/1.73 | 1 | 4 | 0 | 9 | 6 | 0 | 20 | 125.1s |
| `manual-benchmark-s6-0004` | us | 67.9 | 7/5 | 0 | 1.41/2.07 | 0 | 3 | 1 | 10 | 5 | 0 | 19 | 105s |
| `manual-benchmark-s2-0002` | us | 71.6 | 7/5 | 0 | 2.38/1.46 | 1 | 0 | 0 | 9 | 7 | 0 | 19 | 97.5s |
| `manual-benchmark-s8-0006` | us | 72.5 | 9/6 | 0 | 1.85/2.57 | 0 | 0 | 0 | 12 | 5 | 0 | 18 | 87.6s |
| `manual-benchmark-s6-0008` | us | 71.4 | 7/4 | 0 | 1.76/2.23 | 0 | 1 | 0 | 12 | 6 | 0 | 16 | 97.5s |
| `manual-benchmark-s8-0001` | us | 70.3 | 5/4 | 0 | 1.81/2.03 | 0 | 4 | 0 | 11 | 4 | 0 | 20 | 130.1s |
| `manual-benchmark-s7-0001` | ge | 69.5 | 7/5 | 0 | 2.5/1.56 | 0 | 1 | 0 | 9 | 7 | 0 | 18 | 154.9s |
| `manual-benchmark-s5-0004` | us | 68.8 | 5/5 | 0 | 1.36/2.5 | 0 | 1 | 0 | 9 | 6 | 0 | 18 | 214.9s |
| `manual-benchmark-s10-0010` | ge | 69.4 | 3/3 | 0 | 1.96/1.3 | 0 | 2 | 0 | 9 | 5 | 0 | 20 | 167.6s |
| `manual-benchmark-s6-0005` | us | 70.7 | 8/5 | 0 | 1.84/2.15 | 0 | 1 | 0 | 9 | 8 | 0 | 16 | 102.6s |
| `manual-benchmark-s3-0008` | us | 72.6 | 8/4 | 0 | 1.45/1.34 | 0 | 2 | 0 | 13 | 5 | 0 | 12 | 105s |
| `manual-benchmark-s5-0006` | ge | 72.1 | 5/4 | 0 | 1.27/1.98 | 0 | 0 | 0 | 11 | 4 | 0 | 16 | 137.5s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
