# Benchmark run #213 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+120`

- **OFF** flags: `none` · **ON** flags: `none`
- claude/project-thread-s8qgm5 @ 73c20d8 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36934811108) · build v29-dev

## Verdict

**INERT: all 100 pairs identical in every field**


## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **100** · runtime errors off 0 / on 0 · wall time on/off x0.978 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1600 | 1600 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 730 | 730 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 870 | 870 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 13428 | 13428 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 3016 | 3016 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 4382 | 4382 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 201907 | 201907 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 4 | 4 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 11 | 11 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 224 | 224 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 310 | 310 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 246 | 246 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 63 | 63 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 7 | 7 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 43 | 43 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0001 (identical) · ai-layers-20260929-0002 (identical) · ai-layers-20260929-0003 (identical) · ai-layers-20260929-0004 (identical) · ai-layers-20260929-0005 (identical) · ai-layers-20260929-0006 (identical) · ai-layers-20260929-0007 (identical) · ai-layers-20260929-0008 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=213&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=213`); it opens the seed that parts earliest, and the dropdowns choose another.

