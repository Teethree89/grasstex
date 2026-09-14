# 100-battle headless benchmark

- Commit: `5fb100530ada8ea65da4f3e379fc16a2af7db07d`
- Build: `v29-dev`
- Policy: live-policy-endpoint, revision 13
- Parallel shards: **10**
- Completed: **100/100** in about **410.89s** (129.3× real-time, 14.6 battles/min)
- Results: US **44** (44.0%), GER **56** (56.0%), draw/none **0** (0.0%)
- Time-limit battles: **52/100**; captures avg **6.42** of **4.55** objectives; no-capture **0**
- Objectives nobody ever owned: **3** (0.7%) · never even contested **2** · distinct objectives assigned per side US **1.93**, GER **1.89**
- No objective progress: longest **222.6s** · mean per battle **123.5s**
- First contact avg **150.8s** · first fire **169.2s** · first objective progress **114s** · first capture **121.7s**
- Health: **73.2/100 overall** · strategic 72.6 · movement 96.2 · cohesion 47.7 · combat 98.8 · objective 50.6
- Stalls: vacant objective **626** · route **26** · soldier movement **73** · targetless command **58** · long regroup **385**
- Coordination: writer conflicts **0** (0 strategic) · loop alerts **1610** · idle-under-orders 1.1% · over-cohesion 50.2%
- Combat: **175893** discharges · **144125** direct · **20333** hits (14.1%) · **0** trigger-time LOS blocks
- Runtime: **0 probable JS/runtime errors** · **30 asset/CORS noise** · 50 warnings

## Most problematic runs

| Seed | Winner | Health | Captures | Never owned | Spread us/ge | Route stalls | Move stalls | Targetless | Vacant | Regroup | Conflicts | Loops | Max no-progress |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `manual-benchmark-s5-0007` | ge | 63.5 | 4/4 | 0 | 2.08/1.26 | 1 | 0 | 8 | 6 | 4 | 0 | 20 | 127.5s |
| `manual-benchmark-s4-0008` | us | 68.2 | 4/3 | 0 | 1.95/1.27 | 0 | 5 | 0 | 14 | 6 | 0 | 16 | 130.1s |
| `manual-benchmark-s8-0001` | us | 69.3 | 6/4 | 0 | 1.63/1.87 | 0 | 4 | 0 | 13 | 7 | 0 | 17 | 130.1s |
| `manual-benchmark-s4-0005` | ge | 71.4 | 8/4 | 0 | 1.44/2.5 | 0 | 0 | 0 | 13 | 7 | 0 | 16 | 115.1s |
| `manual-benchmark-s7-0001` | ge | 70.3 | 7/5 | 0 | 2.47/1.63 | 0 | 0 | 0 | 10 | 9 | 0 | 17 | 100.1s |
| `manual-benchmark-s7-0010` | us | 70.4 | 4/4 | 0 | 1.78/2.53 | 0 | 0 | 0 | 13 | 5 | 0 | 16 | 152.5s |
| `manual-benchmark-s10-0007` | us | 71.3 | 6/4 | 0 | 1.83/2.04 | 0 | 0 | 0 | 11 | 7 | 0 | 18 | 95.1s |
| `manual-benchmark-s9-0008` | ge | 69.9 | 6/4 | 0 | 1.63/1.15 | 0 | 3 | 0 | 12 | 4 | 0 | 19 | 155.1s |
| `manual-benchmark-s6-0010` | us | 66.7 | 8/6 | 1 | 1.69/2.14 | 1 | 3 | 0 | 8 | 6 | 0 | 19 | 125.1s |
| `manual-benchmark-s6-0007` | ge | 64.6 | 6/3 | 0 | 1.45/1.9 | 0 | 0 | 8 | 4 | 4 | 0 | 20 | 135s |
| `manual-benchmark-s8-0002` | ge | 73.9 | 8/6 | 0 | 2.15/1.97 | 0 | 0 | 0 | 13 | 5 | 0 | 17 | 80.1s |
| `manual-benchmark-s6-0005` | ge | 70.5 | 6/5 | 0 | 2.37/2.08 | 0 | 1 | 0 | 10 | 6 | 0 | 19 | 102.6s |
| `manual-benchmark-s4-0007` | ge | 65.3 | 5/4 | 0 | 2.04/1.55 | 0 | 0 | 9 | 4 | 4 | 0 | 17 | 127.5s |
| `manual-benchmark-s6-0003` | ge | 70.7 | 7/5 | 0 | 1.16/1.28 | 1 | 1 | 9 | 7 | 0 | 0 | 16 | 107.6s |
| `manual-benchmark-s5-0001` | us | 64.5 | 6/5 | 0 | 1.51/1.53 | 1 | 4 | 9 | 3 | 3 | 0 | 17 | 120s |
| `manual-benchmark-s2-0009` | ge | 72 | 10/6 | 0 | 2.34/2.33 | 0 | 0 | 0 | 10 | 6 | 0 | 18 | 115.1s |
| `manual-benchmark-s3-0001` | us | 70.4 | 5/5 | 0 | 2.12/2.76 | 0 | 1 | 0 | 10 | 5 | 0 | 18 | 140.1s |
| `manual-benchmark-s6-0002` | us | 70.4 | 5/4 | 0 | 1.35/1.83 | 0 | 1 | 0 | 9 | 7 | 0 | 17 | 115.1s |
| `manual-benchmark-s1-0009` | ge | 71.1 | 7/5 | 0 | 1.96/1.67 | 0 | 0 | 0 | 11 | 5 | 0 | 16 | 100.1s |
| `manual-benchmark-s7-0009` | us | 74.4 | 5/4 | 0 | 2.27/1.66 | 0 | 0 | 0 | 11 | 2 | 0 | 20 | 195.1s |

## Diagnostic score note

Health scores are transparent triage aids, not pass/fail gates. Raw metrics and reproducible seeds remain authoritative.
