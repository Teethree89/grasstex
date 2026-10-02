# Benchmark run #268 · scripted scenario `lfp-sweep-20261002-0002` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/posture-0002-probe-20261002 @ e038b88 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37004147973) · build v29-dev

## Verdict

**INERT: all 8 pairs identical in every field**


## Paired comparison (off against on)

- **8** pairs (unpaired: off 0, on 0) · identical in every field: **8** · runtime errors off 0 / on 0 · wall time on/off x0.994 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 289 | 289 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 100 | 100 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 189 | 189 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 468 | 468 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 116 | 116 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 1720 | 1720 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 22760 | 22760 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 2 | 2 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 17 | 17 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 21 | 21 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0002 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=268&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=268`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

