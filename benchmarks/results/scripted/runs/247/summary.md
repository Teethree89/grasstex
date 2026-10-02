# Benchmark run #247 · scripted scenario `lfp-sweep-20261002-0004` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/lfp-fix-hot6-20261002 @ 6cd2f94 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36996291703) · build v29-dev

## Verdict

**INERT: all 4 pairs identical in every field**


## Paired comparison (off against on)

- **4** pairs (unpaired: off 0, on 0) · identical in every field: **4** · runtime errors off 0 / on 0 · wall time on/off x1.004 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 90 | 90 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 57 | 57 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 33 | 33 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 300 | 300 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 85 | 85 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 227 | 227 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 7406 | 7406 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 2 | 2 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 14 | 14 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0004 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=247&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=247`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

