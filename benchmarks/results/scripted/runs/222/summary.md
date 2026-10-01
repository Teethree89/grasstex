# Benchmark run #222 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1&rageGuard=1` · **ON** flags: `rageLock=1&rageGuard=1&rageTrance=1`
- claude/project-thread-1msen6 @ 3c81132 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36940448807) · build v29-dev

## Verdict

**QUIET: 27 of 75 pairs changed (median first part 271.05 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties -0.8% (p 0.5235)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.
- Unpaired records: off 25, on 0 (a seed or checkpoint only one arm reached: the flag changed how long the battle lasted, or a shard failed).

## Paired comparison (off against on)

- **75** pairs (unpaired: off 25, on 0) · identical in every field: **48** · runtime errors off 0 / on 0 · wall time on/off x0.987 (gate 1.25)
- the 27 changed records first part at simulated second: min 86.1, p10 112.05, median 271.05, p90 429.15, max 561.15

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 4333 | 4297 | -0.48 | 22 | 13 | 9 | 0.5235 |
| `usKills` | 2030 | 1977 | -0.7067 | 22 | 10 | 12 | 0.8318 |
| `geKills` | 2303 | 2320 | 0.2267 | 21 | 14 | 7 | 0.1892 |
| `fire.total` | 37100 | 36805 | -3.9333 | 24 | 13 | 11 | 0.8388 |
| `fire.hits` | 8394 | 8332 | -0.8267 | 22 | 13 | 9 | 0.5235 |
| `retreatSamples` | 88840 | 87058 | -23.76 | 22 | 6 | 16 | 0.0525 |
| `movementResolver.changes` | 329231 | 329086 | -1.9333 | 24 | 16 | 8 | 0.1516 |
| `movementStalls.length` | 9 | 10 | 0.0133 | 1 | 1 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 212 | 211 | -0.0133 | 18 | 8 | 10 | 0.8145 |
| `loopAlerts.length` | 614 | 602 | -0.16 | 21 | 11 | 10 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 538 | 549 | 0.1467 | 18 | 9 | 9 | 1 |
| `stallOutcomes.wakes` | 324 | 346 | 0.2933 | 9 | 5 | 4 | 1 |
| `stallOutcomes.repeats` | 77 | 87 | 0.1333 | 4 | 3 | 1 | 0.625 |
| `timeline.stalledOnsets` | 14 | 14 | 0 | 2 | 1 | 1 | 1 |
| `timeline.stalledSamples` | 134 | 139 | 0.0667 | 2 | 1 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0012 86.1 s (timeline) · ai-layers-20260929-0097 106.05 s (timeline) · ai-layers-20260929-0060 112.05 s (timeline) · ai-layers-20260929-0020 167.1 s (timeline) · ai-layers-20260929-0033 184.05 s (timeline) · ai-layers-20260929-0086 187.05 s (stress) · ai-layers-20260929-0010 212.1 s (timeline) · ai-layers-20260929-0070 219 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=222&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=222`); it opens the seed that parts earliest, and the dropdowns choose another.

