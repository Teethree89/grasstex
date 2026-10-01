# Benchmark run #218 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1` · **ON** flags: `rageLock=1&rageGuard=1`
- claude/project-thread-1msen6 @ 46fcfbf · [run](https://github.com/APPARANYX/grasstex/actions/runs/36937878027) · build v29-dev

## Verdict

**WEAK: 17 of 100 pairs changed (median first part 266.1 s); 1 of 18 counters under p 0.05 (about 0.9 by chance); casualties +1.7% (p 0.0225)**

- Under 0.05 only: casualties 5629 to 5722 (+1.7%, p 0.0225).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **83** · runtime errors off 0 / on 0 · wall time on/off x0.992 (gate 1.25)
- the 13 changed records first part at simulated second: min 211.05, p10 223.05, median 266.1, p90 329.1, max 450

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5629 | 5722 | 0.93 | 13 | 11 | 2 | 0.0225 |
| `usKills` | 2522 | 2574 | 0.52 | 9 | 6 | 3 | 0.5078 |
| `geKills` | 3107 | 3148 | 0.41 | 13 | 9 | 4 | 0.2668 |
| `fire.total` | 46871 | 46945 | 0.74 | 13 | 7 | 6 | 1 |
| `fire.hits` | 10812 | 10971 | 1.59 | 13 | 9 | 4 | 0.2668 |
| `retreatSamples` | 119717 | 121058 | 13.41 | 13 | 10 | 3 | 0.0923 |
| `movementResolver.changes` | 450673 | 453548 | 28.75 | 13 | 10 | 3 | 0.0923 |
| `movementStalls.length` | 28 | 27 | -0.01 | 1 | 0 | 1 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 276 | 280 | 0.04 | 11 | 6 | 5 | 1 |
| `loopAlerts.length` | 794 | 787 | -0.07 | 9 | 3 | 6 | 0.5078 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 785 | 787 | 0.02 | 13 | 8 | 5 | 0.5811 |
| `stallOutcomes.wakes` | 385 | 373 | -0.12 | 7 | 1 | 6 | 0.125 |
| `stallOutcomes.repeats` | 125 | 116 | -0.09 | 4 | 0 | 4 | 0.125 |
| `timeline.stalledOnsets` | 39 | 38 | -0.01 | 1 | 0 | 1 | 1 |
| `timeline.stalledSamples` | 755 | 705 | -0.5 | 1 | 0 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0081 211.05 s (timeline) · ai-layers-20260929-0059 223.05 s (timeline) · ai-layers-20260929-0010 233.1 s (timeline) · ai-layers-20260929-0072 249 s (timeline) · ai-layers-20260929-0043 251.1 s (timeline) · ai-layers-20260929-0046 264 s (timeline) · ai-layers-20260929-0001 266.1 s (timeline) · ai-layers-20260929-0012 270 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=218&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=218`); it opens the seed that parts earliest, and the dropdowns choose another.

