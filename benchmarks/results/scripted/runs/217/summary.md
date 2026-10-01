# Benchmark run #217 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `rageLock=1`
- claude/project-thread-1msen6 @ e66cfc1 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36937484780) · build v29-dev

## Verdict

**WEAK: 14 of 100 pairs changed (median first part 264.6 s); 1 of 18 counters under p 0.05 (about 0.9 by chance); casualties +0.9% (p 0.0215)**

- Under 0.05 only: casualties 5762 to 5813 (+0.9%, p 0.0215).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **86** · runtime errors off 0 / on 0 · wall time on/off x0.97 (gate 1.25)
- the 12 changed records first part at simulated second: min 145.05, p10 199.05, median 264.6, p90 366, max 450

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5762 | 5813 | 0.51 | 10 | 9 | 1 | 0.0215 |
| `usKills` | 2661 | 2686 | 0.25 | 9 | 4 | 5 | 1 |
| `geKills` | 3101 | 3127 | 0.26 | 10 | 7 | 3 | 0.3438 |
| `fire.total` | 49903 | 50578 | 6.75 | 11 | 8 | 3 | 0.2266 |
| `fire.hits` | 11150 | 11196 | 0.46 | 10 | 7 | 3 | 0.3438 |
| `retreatSamples` | 117480 | 120293 | 28.13 | 10 | 7 | 3 | 0.3438 |
| `movementResolver.changes` | 444715 | 444961 | 2.46 | 14 | 7 | 7 | 1 |
| `movementStalls.length` | 42 | 42 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 294 | 285 | -0.09 | 7 | 2 | 5 | 0.4531 |
| `loopAlerts.length` | 828 | 826 | -0.02 | 10 | 5 | 5 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 739 | 739 | 0 | 7 | 4 | 3 | 1 |
| `stallOutcomes.wakes` | 375 | 375 | 0 | 5 | 3 | 2 | 1 |
| `stallOutcomes.repeats` | 112 | 108 | -0.04 | 3 | 1 | 2 | 1 |
| `timeline.stalledOnsets` | 53 | 53 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 867 | 867 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0066 145.05 s (stress) · ai-layers-b-20260929-0065 199.05 s (timeline) · ai-layers-b-20260929-0078 214.05 s (timeline) · ai-layers-b-20260929-0035 221.1 s (timeline) · ai-layers-b-20260929-0022 250.05 s (stress) · ai-layers-b-20260929-0046 254.1 s (timeline) · ai-layers-b-20260929-0068 275.1 s (stress) · ai-layers-b-20260929-0019 290.1 s (stress)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=217&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=217`); it opens the seed that parts earliest, and the dropdowns choose another.

