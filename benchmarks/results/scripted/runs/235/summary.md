# Benchmark run #235 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/stance-churn-fix-v3-20261002 @ 2f9e33b · [run](https://github.com/APPARANYX/grasstex/actions/runs/36965543117) · build v29-dev

## Verdict

**INERT: all 10 pairs identical in every field**


## Paired comparison (off against on)

- **10** pairs (unpaired: off 0, on 0) · identical in every field: **10** · runtime errors off 0 / on 0 · wall time on/off x0.952 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 274 | 274 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 226 | 226 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 48 | 48 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 637 | 637 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 121 | 121 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 2041 | 2041 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 28028 | 28028 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 43 | 43 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 40 | 40 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=235&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=235`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

