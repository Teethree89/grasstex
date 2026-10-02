# Benchmark run #229 · scripted scenario `stance-loop-probe-0002` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/stance-churn-20261001-2327 @ 4f94b0f · [run](https://github.com/APPARANYX/grasstex/actions/runs/36960534118) · build v29-dev

## Verdict

**INERT: all 8 pairs identical in every field**


## Paired comparison (off against on)

- **8** pairs (unpaired: off 0, on 0) · identical in every field: **8** · runtime errors off 0 / on 0 · wall time on/off x0.949 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 380 | 380 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 137 | 137 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 243 | 243 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 301 | 301 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 105 | 105 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 1945 | 1945 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 24210 | 24210 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 5 | 5 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 127 | 127 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 26 | 26 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 73 | 73 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 8 | 8 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

stance-loop-probe-0002 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=229&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=229`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

