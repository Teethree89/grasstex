# Benchmark run #253 · scripted scenario `lfp-sweep-20261002-0020` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/lfp-rosterfix-0020-20261002 @ 10d7880 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36997670957) · build v29-dev

## Verdict

**INERT: all 9 pairs identical in every field**


## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **9** · runtime errors off 0 / on 0 · wall time on/off x0.964 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 371 | 371 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 207 | 207 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 164 | 164 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 429 | 429 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 115 | 115 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 2700 | 2700 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 24734 | 24734 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 4 | 4 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 37 | 37 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 38 | 38 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 2 | 2 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

lfp-sweep-20261002-0020 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=253&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=253`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

