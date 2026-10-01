# Benchmark run #210 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `stressAct=cower,flee,freeze` · **ON** flags: `none`
- main @ 515d1af · [run](https://github.com/APPARANYX/grasstex/actions/runs/36934270278) · build v29-dev

## Verdict

**WEAK: 36 of 100 pairs changed (median first part 264.525 s); 1 of 18 counters under p 0.05 (about 0.9 by chance); casualties -1.6% (p 0.5966)**

- Under 0.05 only: retreatSamples 124809 to 118473 (-5.1%, p 0.041).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **64** · runtime errors off 0 / on 0 · wall time on/off x1.008 (gate 1.25)
- the 36 changed records first part at simulated second: min 185.1, p10 194.1, median 264.525, p90 387, max 506.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5730 | 5640 | -0.9 | 32 | 14 | 18 | 0.5966 |
| `usKills` | 2628 | 2520 | -1.08 | 32 | 14 | 18 | 0.5966 |
| `geKills` | 3102 | 3120 | 0.18 | 30 | 15 | 15 | 1 |
| `fire.total` | 47683 | 46992 | -6.91 | 36 | 17 | 19 | 0.8679 |
| `fire.hits` | 10933 | 10784 | -1.49 | 35 | 15 | 20 | 0.4996 |
| `retreatSamples` | 124809 | 118473 | -63.36 | 35 | 11 | 24 | 0.041 |
| `movementResolver.changes` | 449815 | 452130 | 23.15 | 36 | 19 | 17 | 0.8679 |
| `movementStalls.length` | 28 | 28 | 0 | 2 | 1 | 1 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 285 | 277 | -0.08 | 28 | 11 | 17 | 0.3449 |
| `loopAlerts.length` | 814 | 796 | -0.18 | 30 | 17 | 13 | 0.5847 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 779 | 785 | 0.06 | 30 | 16 | 14 | 0.8555 |
| `stallOutcomes.wakes` | 389 | 383 | -0.06 | 13 | 7 | 6 | 1 |
| `stallOutcomes.repeats` | 126 | 121 | -0.05 | 13 | 6 | 7 | 1 |
| `timeline.stalledOnsets` | 39 | 39 | 0 | 2 | 1 | 1 | 1 |
| `timeline.stalledSamples` | 706 | 755 | 0.49 | 3 | 2 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0025 185.1 s (timeline) · ai-layers-20260929-0086 186 s (timeline) · ai-layers-20260929-0082 191.1 s (timeline) · ai-layers-20260929-0071 194.1 s (timeline) · ai-layers-20260929-0081 209.1 s (timeline) · ai-layers-20260929-0044 213 s (timeline) · ai-layers-20260929-0070 218.1 s (timeline) · ai-layers-20260929-0059 223.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=210&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=210`); it opens the seed that parts earliest, and the dropdowns choose another.

