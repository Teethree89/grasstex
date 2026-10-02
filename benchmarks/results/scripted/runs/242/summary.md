# Benchmark run #242 · scripted scenario `lfp-sweep-20261002` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/lfp-sweep-24-20261002 @ a3833f7 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36994694887) · build v29-dev

## Verdict

**INERT: all 10 pairs identical in every field**


## Paired comparison (off against on)

- **10** pairs (unpaired: off 0, on 0) · identical in every field: **10** · runtime errors off 0 / on 0 · wall time on/off x0.963 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 340 | 340 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 291 | 291 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 49 | 49 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 432 | 432 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 111 | 111 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 748 | 748 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 22112 | 22112 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 6 | 6 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 36 | 36 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 20 | 20 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=242&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=242`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

