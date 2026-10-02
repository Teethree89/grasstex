# Benchmark run #245 · 24 seeds from `lfp-sweep-20261002` (meeting), windows `contact+120`

- **OFF** flags: `none` · **ON** flags: `none`
- bench/lfp-fix-sweep24-20261002 @ e40f11f · [run](https://github.com/APPARANYX/grasstex/actions/runs/36996184231) · build v29-dev

## Verdict

**INERT: all 24 pairs identical in every field**


## Paired comparison (off against on)

- **24** pairs (unpaired: off 0, on 0) · identical in every field: **24** · runtime errors off 0 / on 0 · wall time on/off x0.95 (gate 1.25)
- no record has a timeline or stress series that parts

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 263 | 263 | 0 | 0 | 0 | 0 | 1 |
| `usKills` | 134 | 134 | 0 | 0 | 0 | 0 | 1 |
| `geKills` | 129 | 129 | 0 | 0 | 0 | 0 | 1 |
| `fire.total` | 1852 | 1852 | 0 | 0 | 0 | 0 | 1 |
| `fire.hits` | 497 | 497 | 0 | 0 | 0 | 0 | 1 |
| `retreatSamples` | 598 | 598 | 0 | 0 | 0 | 0 | 1 |
| `movementResolver.changes` | 40283 | 40283 | 0 | 0 | 0 | 0 | 1 |
| `movementStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 21 | 21 | 0 | 0 | 0 | 0 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 93 | 93 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.wakes` | 48 | 48 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 14 | 14 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

lfp-sweep-20261002-0001 (identical) · lfp-sweep-20261002-0002 (identical) · lfp-sweep-20261002-0003 (identical) · lfp-sweep-20261002-0004 (identical) · lfp-sweep-20261002-0005 (identical) · lfp-sweep-20261002-0006 (identical) · lfp-sweep-20261002-0007 (identical) · lfp-sweep-20261002-0008 (identical)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=245&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=245`); it opens the seed that parts earliest, and the dropdowns choose another.

