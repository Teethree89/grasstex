# Benchmark run #211 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `stressAct=cower,flee,freeze` · **ON** flags: `none`
- main @ 515d1af · [run](https://github.com/APPARANYX/grasstex/actions/runs/36934273486) · build v29-dev

## Verdict

**QUIET: 38 of 100 pairs changed (median first part 255 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties +0.5% (p 0.7359)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **62** · runtime errors off 0 / on 0 · wall time on/off x0.989 (gate 1.25)
- the 38 changed records first part at simulated second: min 113.1, p10 145.05, median 255, p90 378, max 462

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5734 | 5762 | 0.28 | 35 | 19 | 16 | 0.7359 |
| `usKills` | 2686 | 2661 | -0.25 | 34 | 16 | 18 | 0.8642 |
| `geKills` | 3048 | 3101 | 0.53 | 32 | 21 | 11 | 0.1102 |
| `fire.total` | 47070 | 49903 | 28.33 | 37 | 24 | 13 | 0.0989 |
| `fire.hits` | 11012 | 11150 | 1.38 | 33 | 20 | 13 | 0.2962 |
| `retreatSamples` | 117470 | 117480 | 0.1 | 36 | 18 | 18 | 1 |
| `movementResolver.changes` | 442465 | 444715 | 22.5 | 37 | 19 | 18 | 1 |
| `movementStalls.length` | 40 | 42 | 0.02 | 4 | 2 | 2 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 296 | 294 | -0.02 | 27 | 13 | 14 | 1 |
| `loopAlerts.length` | 826 | 828 | 0.02 | 33 | 17 | 16 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 753 | 739 | -0.14 | 31 | 13 | 18 | 0.4731 |
| `stallOutcomes.wakes` | 386 | 375 | -0.11 | 16 | 7 | 9 | 0.8036 |
| `stallOutcomes.repeats` | 119 | 112 | -0.07 | 10 | 4 | 6 | 0.7539 |
| `timeline.stalledOnsets` | 51 | 53 | 0.02 | 4 | 2 | 2 | 1 |
| `timeline.stalledSamples` | 727 | 867 | 1.4 | 5 | 3 | 2 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0043 113.1 s (timeline) · ai-layers-b-20260929-0044 116.1 s (timeline) · ai-layers-b-20260929-0084 129 s (timeline) · ai-layers-b-20260929-0066 145.05 s (stress) · ai-layers-b-20260929-0042 178.05 s (timeline) · ai-layers-b-20260929-0094 187.05 s (timeline) · ai-layers-b-20260929-0015 192 s (timeline) · ai-layers-b-20260929-0065 199.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=211&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=211`); it opens the seed that parts earliest, and the dropdowns choose another.

