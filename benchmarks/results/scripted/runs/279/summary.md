# Benchmark run #279 · 100 seeds from `stance-churn-20261003` (meeting), windows `contact+120`

- **OFF** flags: `coverStance=0&alertHold=0` · **ON** flags: `none`
- claude/fix-stance-churn-mu5sxa @ f105431 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37087066479) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 53.1 s); 6 of 18 counters under p 0.05 (about 0.9 by chance), 3 under 0.0028; casualties -31.9% (p 0.0004)**

- Clears the Bonferroni line (p < 0.0028): movementResolver.changes 149037 to 126438 (-15.2%, p 0); casualties 817 to 556 (-31.9%, p 0.0004); fire.hits 1627 to 1145 (-29.6%, p 0.0011).
- Under 0.05 only: geKills 457 to 306 (-33.0%, p 0.0059); fire.total 8535 to 5865 (-31.3%, p 0.0103); usKills 360 to 250 (-30.6%, p 0.0169).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.999 (gate 1.25)
- the 100 changed records first part at simulated second: min 3, p10 8.1, median 53.1, p90 113.1, max 160.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 817 | 556 | -2.61 | 88 | 27 | 61 | 0.0004 |
| `usKills` | 360 | 250 | -1.1 | 78 | 28 | 50 | 0.0169 |
| `geKills` | 457 | 306 | -1.51 | 77 | 26 | 51 | 0.0059 |
| `fire.total` | 8535 | 5865 | -26.7 | 96 | 35 | 61 | 0.0103 |
| `fire.hits` | 1627 | 1145 | -4.82 | 92 | 30 | 62 | 0.0011 |
| `retreatSamples` | 1665 | 1195 | -4.7 | 71 | 31 | 40 | 0.3425 |
| `movementResolver.changes` | 149037 | 126438 | -225.99 | 100 | 10 | 90 | 0 |
| `movementStalls.length` | 10 | 8 | -0.02 | 6 | 2 | 4 | 0.6875 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 1 | 0.01 | 1 | 1 | 0 | 1 |
| `loopAlerts.length` | 23 | 35 | 0.12 | 30 | 17 | 13 | 0.5847 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 338 | 358 | 0.2 | 57 | 34 | 23 | 0.1849 |
| `stallOutcomes.wakes` | 311 | 329 | 0.18 | 15 | 9 | 6 | 0.6072 |
| `stallOutcomes.repeats` | 50 | 47 | -0.03 | 8 | 3 | 5 | 0.7266 |
| `timeline.stalledOnsets` | 14 | 11 | -0.03 | 6 | 2 | 4 | 0.6875 |
| `timeline.stalledSamples` | 285 | 110 | -1.75 | 8 | 3 | 5 | 0.7266 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

stance-churn-20261003-0047 3 s (timeline) · stance-churn-20261003-0090 3 s (timeline) · stance-churn-20261003-0053 4.05 s (timeline) · stance-churn-20261003-0045 5.1 s (timeline) · stance-churn-20261003-0055 5.1 s (timeline) · stance-churn-20261003-0018 6 s (timeline) · stance-churn-20261003-0099 6 s (timeline) · stance-churn-20261003-0098 7.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=279&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=279`); it opens the seed that parts earliest, and the dropdowns choose another.

