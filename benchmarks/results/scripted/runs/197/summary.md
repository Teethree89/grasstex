# Benchmark run #197 · scripted scenario `scripted-scout-0003` (meeting), windows `contact+60,every60`

- **OFF** flags: `stressMem=0` · **ON** flags: `none`
- work/stress-lasting-default @ 26f13d9 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36866002238) · build v29-dev

## Verdict

**one battle per arm, 9 of 9 records changed, first part at 71.1 s, casualties 430 to 417: sizes, not findings**

- The pairs are checkpoints of one battle, so the sign tests in the table are not independent: read the sizes and where the arms part, not the p values.

## Paired comparison (off against on)

- **9** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.97 (gate 1.25)
- the 9 changed records first part at simulated second: min 71.1, p10 71.1, median 71.1, p90 71.1, max 71.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 430 | 417 | -1.4444 | 6 | 2 | 4 | 0.6875 |
| `usKills` | 181 | 220 | 4.3333 | 8 | 5 | 3 | 0.7266 |
| `geKills` | 249 | 197 | -5.7778 | 8 | 2 | 6 | 0.2891 |
| `fire.total` | 1469 | 1342 | -14.1111 | 7 | 3 | 4 | 1 |
| `fire.hits` | 132 | 127 | -0.5556 | 7 | 3 | 4 | 1 |
| `retreatSamples` | 886 | 1020 | 14.8889 | 8 | 6 | 2 | 0.2891 |
| `movementResolver.changes` | 32851 | 37104 | 472.5556 | 9 | 9 | 0 | 0.0039 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 58 | 32 | -2.8889 | 8 | 0 | 8 | 0.0078 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 41 | 57 | 1.7778 | 5 | 5 | 0 | 0.0625 |
| `stallOutcomes.wakes` | 86 | 86 | 0 | 4 | 2 | 2 | 1 |
| `stallOutcomes.repeats` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## Where the arms part (simulated seconds)

scripted-scout-0003 71.1 s (stress)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=197&pick=-end&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/stress-lasting-default/ai_flow_live.html?bench=197&pick=-end&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=197`); it opens the full-length record (`pick=-end`), and the dropdowns choose another.

