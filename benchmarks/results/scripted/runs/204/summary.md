# Benchmark run #204 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- main @ ca14438 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36886188708) · build v29-dev

## Verdict

**MOVED: 95 of 95 pairs changed (median first part 137.1 s); 1 of 18 counters under p 0.05 (about 0.9 by chance), 1 under 0.0028; casualties -0.4% (p 0.4657)**

- Clears the Bonferroni line (p < 0.0028): regroups.entries 1030 to 1237 (+20.1%, p 0.0018).

## Paired comparison (off against on)

- **95** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.051 (gate 1.25)
- the 95 changed records first part at simulated second: min 65.1, p10 107.1, median 137.1, p90 164.1, max 196.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5641 | 5619 | -0.2316 | 92 | 42 | 50 | 0.4657 |
| `usKills` | 2723 | 2737 | 0.1474 | 90 | 45 | 45 | 1 |
| `geKills` | 2918 | 2882 | -0.3789 | 88 | 47 | 41 | 0.5943 |
| `fire.total` | 109688 | 104533 | -54.2632 | 95 | 39 | 56 | 0.1002 |
| `fire.hits` | 10704 | 10709 | 0.0526 | 93 | 45 | 48 | 0.8358 |
| `retreatSamples` | 58523 | 57554 | -10.2 | 95 | 43 | 52 | 0.4119 |
| `movementResolver.changes` | 478868 | 486147 | 76.6211 | 95 | 55 | 40 | 0.1505 |
| `movementStalls.length` | 18 | 14 | -0.0421 | 12 | 5 | 7 | 0.7744 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 282 | 281 | -0.0105 | 78 | 38 | 40 | 0.9099 |
| `loopAlerts.length` | 1110 | 1156 | 0.4842 | 87 | 44 | 43 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 1030 | 1237 | 2.1789 | 88 | 59 | 29 | 0.0018 |
| `stallOutcomes.wakes` | 339 | 353 | 0.1474 | 35 | 18 | 17 | 1 |
| `stallOutcomes.repeats` | 84 | 83 | -0.0105 | 13 | 6 | 7 | 1 |
| `timeline.stalledOnsets` | 30 | 21 | -0.0947 | 15 | 6 | 9 | 0.6072 |
| `timeline.stalledSamples` | 665 | 707 | 0.4421 | 17 | 7 | 10 | 0.6291 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0074 65.1 s (timeline) · ai-layers-b-20260929-0072 67.05 s (timeline) · ai-layers-b-20260929-0044 74.1 s (timeline) · ai-layers-b-20260929-0075 87 s (timeline) · ai-layers-b-20260929-0058 88.05 s (timeline) · ai-layers-b-20260929-0090 90 s (timeline) · ai-layers-b-20260929-0003 98.1 s (timeline) · ai-layers-b-20260929-0014 103.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=204&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=204`); it opens the seed that parts earliest, and the dropdowns choose another.

