# Benchmark run #198 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- main @ 7ed2d24 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36866005571) · build v29-dev

## Verdict

**INERT: all 9 pairs identical in every field**


## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **9** · runtime errors off 0 / on 0 · wall time on/off x0.968 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 430 | 430 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 181 | 181 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 249 | 249 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 1469 | 1469 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 132 | 132 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 886 | 886 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 32851 | 32851 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 58 | 58 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 41 | 41 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 86 | 86 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=198&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=198`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

