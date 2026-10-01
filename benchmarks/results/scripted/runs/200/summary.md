# Benchmark run #200 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- main @ e186d1f · [run](https://github.com/APPARANYX/grasstex/actions/runs/36883411455) · build v29-dev

## Verdict

**one battle per arm, 8 of 9 records changed, first part at 134.1 s, casualties 417 to 404: sizes, not findings**

- The pairs are checkpoints of one battle, so the sign tests in the table are not independent: read the sizes and where the arms part, not the p values.

## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **1** · runtime errors off 0 / on 0 · wall time on/off x0.932 (gate 1.25)
- the 8 changed records first part at simulated second: min 134.1, p10 134.1, median 134.1, p90 134.1, max 134.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 417 | 404 | -1.4444 | 8 | 3 | 5 | 0.7266 |
| `usKills` | 220 | 143 | -8.5556 | 7 | 0 | 7 | 0.0156 |
| `geKills` | 197 | 261 | 7.1111 | 8 | 8 | 0 | 0.0078 |
| `fire.total` | 1342 | 1190 | -16.8889 | 7 | 3 | 4 | 1 |
| `fire.hits` | 127 | 108 | -2.1111 | 5 | 2 | 3 | 1 |
| `retreatSamples` | 1020 | 912 | -12 | 8 | 3 | 5 | 0.7266 |
| `movementResolver.changes` | 37104 | 30982 | -680.2222 | 8 | 1 | 7 | 0.0703 |
| `movementStalls.length` | 0 | 1 | 0.1111 | 1 | 1 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 32 | 49 | 1.8889 | 8 | 8 | 0 | 0.0078 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 57 | 48 | -1 | 6 | 2 | 4 | 0.6875 |
| `stallOutcomes.wakes` | 86 | 78 | -0.8889 | 4 | 0 | 4 | 0.125 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 6 | 0.6667 | 6 | 6 | 0 | 0.0313 |
| `timeline.stalledSamples` | 0 | 54 | 6 | 6 | 6 | 0 | 0.0313 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 134.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=200&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=200`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

