# Benchmark run #265 · scripted scenario `lfp-sweep-20261002-0012` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/cover-detour-fix-0012-20261002 @ b7465e8 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37003411534) · build v29-dev

## Verdict

**INERT: all 9 pairs identical in every field**


## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **9** · runtime errors off 0 / on 0 · wall time on/off x0.993 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 210 | 210 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 15 | 15 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 195 | 195 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 514 | 514 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 79 | 79 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 780 | 780 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 23894 | 23894 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 4 | 4 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 15 | 15 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 56 | 56 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0012 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=265&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=265`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

