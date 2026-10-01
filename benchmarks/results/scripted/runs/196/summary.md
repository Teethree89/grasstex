# Benchmark run #196 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `coa=1`
- work/scripted-benchmark @ 3d8427a · [run](https://github.com/APPARANYX/grasstex/actions/runs/36861940235) · build v29-dev

## Verdict

**one battle per arm, 8 of 9 records changed, first part at 157.05 s, casualties 430 to 344: sizes, not findings**

- The pairs are checkpoints of one battle, so the sign tests in the table are not independent: read the sizes and where the arms part, not the p values.

## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **1** · runtime errors off 0 / on 0 · wall time on/off x0.934 (gate 1.25)
- the 8 changed records first part at simulated second: min 157.05, p10 157.05, median 157.05, p90 157.05, max 157.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 430 | 344 | -9.5556 | 8 | 1 | 7 | 0.0703 |
| `usKills` | 181 | 112 | -7.6667 | 7 | 0 | 7 | 0.0156 |
| `geKills` | 249 | 232 | -1.8889 | 7 | 1 | 6 | 0.125 |
| `fire.total` | 1469 | 1047 | -46.8889 | 7 | 3 | 4 | 1 |
| `fire.hits` | 132 | 95 | -4.1111 | 6 | 2 | 4 | 0.6875 |
| `retreatSamples` | 886 | 537 | -38.7778 | 7 | 0 | 7 | 0.0156 |
| `movementResolver.changes` | 32851 | 26382 | -718.7778 | 8 | 1 | 7 | 0.0703 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 1 | 0.1111 | 1 | 1 | 0 | 1 |
| `loopAlerts.length` | 58 | 52 | -0.6667 | 8 | 2 | 6 | 0.2891 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 41 | 47 | 0.6667 | 5 | 5 | 0 | 0.0625 |
| `stallOutcomes.wakes` | 86 | 72 | -1.5556 | 6 | 0 | 6 | 0.0313 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 157.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/preview/scripted-benchmark/ai_flow_live.html?bench=196&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=196`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

