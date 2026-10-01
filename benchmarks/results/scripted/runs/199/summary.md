# Benchmark run #199 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- claude/epic-goldberg-dr09q0 @ e4d8c7c · [run](https://github.com/APPARANYX/grasstex/actions/runs/36883407225) · build v29-dev

## Verdict

**one battle per arm, 8 of 9 records changed, first part at 134.1 s, casualties 417 to 440: sizes, not findings**

- The pairs are checkpoints of one battle, so the sign tests in the table are not independent: read the sizes and where the arms part, not the p values.

## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **1** · runtime errors off 0 / on 0 · wall time on/off x0.899 (gate 1.25)
- the 8 changed records first part at simulated second: min 134.1, p10 134.1, median 134.1, p90 134.1, max 134.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 417 | 440 | 2.5556 | 8 | 6 | 2 | 0.2891 |
| `usKills` | 220 | 229 | 1 | 7 | 4 | 3 | 1 |
| `geKills` | 197 | 211 | 1.5556 | 8 | 6 | 2 | 0.2891 |
| `fire.total` | 1342 | 980 | -40.2222 | 8 | 3 | 5 | 0.7266 |
| `fire.hits` | 127 | 117 | -1.1111 | 7 | 4 | 3 | 1 |
| `retreatSamples` | 1020 | 4410 | 376.6667 | 8 | 8 | 0 | 0.0078 |
| `movementResolver.changes` | 37104 | 31754 | -594.4444 | 8 | 1 | 7 | 0.0703 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 32 | 49 | 1.8889 | 7 | 7 | 0 | 0.0156 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 57 | 45 | -1.3333 | 7 | 2 | 5 | 0.4531 |
| `stallOutcomes.wakes` | 86 | 90 | 0.4444 | 2 | 2 | 0 | 0.5 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 134.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=199&pick=-end&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=199`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

