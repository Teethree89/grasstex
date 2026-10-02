# Benchmark run #264 · scripted scenario `lfp-sweep-20261002-0012` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/position-0012-episode-20261002 @ 021da83 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37002573866) · build v29-dev

## Verdict

**INERT: all 9 pairs identical in every field**


## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **9** · runtime errors off 0 / on 0 · wall time on/off x0.916 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 229 | 229 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 33 | 33 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 196 | 196 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 565 | 565 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 82 | 82 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 1680 | 1680 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 22697 | 22697 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 3 | 3 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 23 | 23 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 24 | 24 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 56 | 56 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0012 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=264&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=264`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

