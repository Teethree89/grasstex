# 100-battle headless benchmark

- Commit: `4831a5764f9dee48ab9e16e9c459f7dd58dfcb17`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **10**
- Completed: **100/100** in about **307.45s** (176.7× real-time, 19.52 battles/min)
- Results: US **46** (46.0%), GER **54** (54.0%), draw/none **0** (0.0%)
- Time-limit battles: **56/100**; captures avg **6.26** of **4.55** objectives; no-capture **0**
- Objectives nobody ever owned: **2** (0.4%) · never even contested **1** · distinct objectives assigned per side US **1.94**, GER **1.92**
- No objective progress: longest **300.1s** · mean per battle **135.8s**
- First contact avg **158s** · first fire **176.6s** · first objective progress **118.2s** · first capture **125.8s**
- Health: **74.3/100 overall** · strategic 67 · movement 97.1 · cohesion 53.5 · combat 98.8 · objective 55
- Stalls: vacant objective **474** · route **14** · soldier movement **70** · targetless command **159** · long regroup **366**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1607** · idle-under-orders 1.0% · over-cohesion 42.4%
- Combat: **226702** discharges · **184021** direct · **19503** hits (10.6%) · **0** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **30 asset/CORS noise** · 50 warnings

## Most problematic runs

| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `manual-benchmark-s5-0001` | us | 65.5 | 6/5 | 0 | 1.47/1.58 | 0 | 4 | 23 | 3 | 3 | 0 | 20 | 130.1s |
| `manual-benchmark-s3-0010` | ge | 70.6 | 5/4 | 0 | 1.37/1.14 | 1 | 0 | 0 | 14 | 8 | 0 | 20 | 117.6s |
| `manual-benchmark-s10-0005` | ge | 63.7 | 5/5 | 0 | 1.69/1.38 | 0 | 0 | 8 | 6 | 6 | 0 | 20 | 117.6s |
| `manual-benchmark-s8-0005` | us | 70.9 | 7/4 | 0 | 2.24/1.27 | 0 | 0 | 2 | 12 | 4 | 0 | 20 | 127.5s |
| `manual-benchmark-s2-0007` | us | 67.9 | 8/4 | 0 | 1.98/1.67 | 0 | 0 | 8 | 9 | 3 | 0 | 16 | 112.5s |
| `manual-benchmark-s2-0003` | us | 71.7 | 5/4 | 0 | 1.92/1.45 | 0 | 0 | 0 | 10 | 8 | 0 | 18 | 180s |
| `manual-benchmark-s4-0005` | ge | 67.7 | 7/4 | 0 | 1.38/1.79 | 0 | 0 | 3 | 8 | 6 | 0 | 19 | 120s |
| `manual-benchmark-s7-0008` | ge | 72.4 | 8/5 | 0 | 1.93/1.98 | 0 | 0 | 0 | 10 | 6 | 0 | 20 | 107.6s |
| `manual-benchmark-s9-0004` | ge | 70.9 | 6/5 | 0 | 2.47/1.93 | 0 | 0 | 0 | 8 | 6 | 0 | 20 | 130s |
| `manual-benchmark-s6-0010` | ge | 65.6 | 6/6 | 0 | 1.65/1.56 | 0 | 2 | 4 | 7 | 3 | 0 | 16 | 220s |
| `manual-benchmark-s6-0004` | us | 67.4 | 6/5 | 0 | 1.5/2.34 | 0 | 2 | 3 | 7 | 4 | 0 | 18 | 107.6s |
| `manual-benchmark-s8-0007` | us | 72.3 | 8/5 | 0 | 1.89/1.36 | 0 | 0 | 0 | 8 | 8 | 0 | 17 | 122.6s |
| `manual-benchmark-s6-0002` | us | 65.2 | 4/4 | 0 | 1.3/2.47 | 0 | 2 | 3 | 3 | 7 | 0 | 18 | 300.1s |
| `manual-benchmark-s3-0005` | ge | 73.3 | 7/5 | 0 | 2.34/1.71 | 0 | 0 | 0 | 9 | 4 | 0 | 20 | 115.1s |
| `manual-benchmark-s5-0009` | us | 72.5 | 7/5 | 0 | 2.26/1.96 | 0 | 0 | 0 | 13 | 6 | 0 | 8 | 100.1s |
| `manual-benchmark-s6-0003` | ge | 67.7 | 6/5 | 0 | 1.78/1.16 | 1 | 1 | 6 | 5 | 2 | 0 | 16 | 112.5s |
| `manual-benchmark-s10-0002` | us | 69.7 | 6/4 | 0 | 1.82/2.06 | 0 | 1 | 3 | 8 | 3 | 0 | 16 | 90s |
| `manual-benchmark-s6-0005` | ge | 72.7 | 8/5 | 0 | 1.88/2.12 | 0 | 0 | 0 | 8 | 4 | 0 | 20 | 120s |
| `manual-benchmark-s7-0007` | us | 68.1 | 7/5 | 0 | 1.86/2.06 | 0 | 0 | 2 | 6 | 6 | 0 | 16 | 122.6s |
| `manual-benchmark-s7-0005` | ge | 72 | 8/6 | 0 | 2.45/1.83 | 0 | 0 | 0 | 7 | 5 | 0 | 20 | 122.6s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
