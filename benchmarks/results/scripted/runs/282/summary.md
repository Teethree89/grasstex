# Benchmark run #282 · 100 seeds from `alert-advance-20261003` (meeting), windows `contact+120`

- **OFF** flags: `alertAdvance=0` · **ON** flags: `none`
- claude/fix-stance-churn-mu5sxa @ d06d883 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37090071813) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 49.05 s); 2 of 18 counters under p 0.05 (about 0.9 by chance), 1 under 0.0028; casualties +17.8% (p 0.1702)**

- Clears the Bonferroni line (p < 0.0028): movementResolver.changes 125371 to 139796 (+11.5%, p 0).
- Under 0.05 only: usKills 227 to 272 (+19.8%, p 0.0046).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.939 (gate 1.25)
- the 100 changed records first part at simulated second: min 2.1, p10 4.05, median 49.05, p90 102, max 146.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 523 | 616 | 0.93 | 90 | 52 | 38 | 0.1702 |
| `usKills` | 227 | 272 | 0.45 | 73 | 49 | 24 | 0.0046 |
| `geKills` | 296 | 344 | 0.48 | 77 | 40 | 37 | 0.8199 |
| `fire.total` | 5652 | 7742 | 20.9 | 98 | 58 | 40 | 0.0854 |
| `fire.hits` | 1036 | 1203 | 1.67 | 91 | 52 | 39 | 0.2082 |
| `retreatSamples` | 1358 | 1615 | 2.57 | 63 | 35 | 28 | 0.45 |
| `movementResolver.changes` | 125371 | 139796 | 144.25 | 100 | 72 | 28 | 0 |
| `movementStalls.length` | 11 | 7 | -0.04 | 2 | 1 | 1 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `loopAlerts.length` | 44 | 59 | 0.15 | 40 | 23 | 17 | 0.4296 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 360 | 381 | 0.21 | 78 | 43 | 35 | 0.4282 |
| `stallOutcomes.wakes` | 416 | 422 | 0.06 | 17 | 8 | 9 | 1 |
| `stallOutcomes.repeats` | 72 | 84 | 0.12 | 5 | 3 | 2 | 1 |
| `timeline.stalledOnsets` | 15 | 11 | -0.04 | 2 | 1 | 1 | 1 |
| `timeline.stalledSamples` | 461 | 285 | -1.76 | 2 | 1 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

alert-advance-20261003-0004 2.1 s (timeline) · alert-advance-20261003-0005 2.1 s (timeline) · alert-advance-20261003-0018 3 s (timeline) · alert-advance-20261003-0088 3 s (timeline) · alert-advance-20261003-0054 3.15 s (timeline) · alert-advance-20261003-0002 4.05 s (timeline) · alert-advance-20261003-0003 4.05 s (timeline) · alert-advance-20261003-0050 4.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=282&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=282`); it opens the seed that parts earliest, and the dropdowns choose another.

