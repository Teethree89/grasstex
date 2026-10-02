# Benchmark run #269 · scripted scenario `lfp-sweep-20261002-0002` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/shared-stance-fix-0002-20261002 @ 2e4dc0c · [run](https://github.com/APPARANYX/grasstex/actions/runs/37004947757) · build v29-dev

## Verdict

**INERT: all 7 pairs identical in every field**


## Paired comparison (off against on)

- **7** pairs (unpaired: off 0, on 0) · identical in every field: **7** · runtime errors off 0 / on 0 · wall time on/off x1.004 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 221 | 221 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 44 | 44 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 177 | 177 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 329 | 329 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 105 | 105 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 942 | 942 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 17324 | 17324 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 6 | 6 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 28 | 28 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0002 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=269&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=269`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

