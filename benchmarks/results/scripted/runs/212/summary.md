# Benchmark run #212 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+120`

- **OFF** flags: `none` · **ON** flags: `slStress=all`
- claude/project-thread-s8qgm5 @ 73c20d8 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36934807754) · build v29-dev

## Verdict

**QUIET: 83 of 100 pairs changed (median first part 158.1 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties +2.8% (p 0.556)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **17** · runtime errors off 0 / on 0 · wall time on/off x1.008 (gate 1.25)
- the 83 changed records first part at simulated second: min 113.1, p10 123, median 158.1, p90 192, max 259.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1600 | 1644 | 0.44 | 72 | 39 | 33 | 0.556 |
| `usKills` | 730 | 716 | -0.14 | 67 | 28 | 39 | 0.2215 |
| `geKills` | 870 | 928 | 0.58 | 65 | 39 | 26 | 0.136 |
| `fire.total` | 13428 | 14327 | 8.99 | 77 | 44 | 33 | 0.2543 |
| `fire.hits` | 3016 | 3162 | 1.46 | 72 | 44 | 28 | 0.0764 |
| `retreatSamples` | 4382 | 4347 | -0.35 | 65 | 30 | 35 | 0.6201 |
| `movementResolver.changes` | 201907 | 200790 | -11.17 | 82 | 38 | 44 | 0.5811 |
| `movementStalls.length` | 4 | 4 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 11 | 9 | -0.02 | 6 | 2 | 4 | 0.6875 |
| `loopAlerts.length` | 224 | 207 | -0.17 | 53 | 26 | 27 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 310 | 304 | -0.06 | 17 | 6 | 11 | 0.3323 |
| `stallOutcomes.wakes` | 246 | 246 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 63 | 63 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 7 | 7 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 43 | 43 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0056 113.1 s (timeline) · ai-layers-20260929-0009 114 s (stress) · ai-layers-20260929-0060 114 s (timeline) · ai-layers-20260929-0061 117 s (timeline) · ai-layers-20260929-0100 117 s (timeline) · ai-layers-20260929-0097 119.1 s (timeline) · ai-layers-20260929-0038 120 s (timeline) · ai-layers-20260929-0021 122.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=212&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=212`); it opens the seed that parts earliest, and the dropdowns choose another.

