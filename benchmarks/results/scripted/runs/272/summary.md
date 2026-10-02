# Benchmark run #272 · 100 seeds from `buddy-pairs-fixed` (meeting), windows `contact+120`

- **OFF** flags: `buddyPairs=0` · **ON** flags: `buddyPairs=1`
- work/buddy-pairs @ 71528ba · [run](https://github.com/APPARANYX/grasstex/actions/runs/37068420274) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 112.57499999999999 s); 10 of 27 counters under p 0.05 (about 1.4 by chance), 8 under 0.0019; casualties -7.3% (p 0.708)**

- Clears the Bonferroni line (p < 0.0019): buddyPairs.pairActivations 0 to 135 (new, p 0); buddyPairs.breaks 0 to 6396 (new, p 0); buddyPairs.reforms 0 to 4124 (new, p 0); buddyPairs.separated 0 to 4708 (new, p 0); buddyPairs.suppressed 0 to 631 (new, p 0); buddyPairs.incompatible 0 to 338 (new, p 0); buddyPairs.coverMoves 0 to 135 (new, p 0); movementResolver.changes 153211 to 150895 (-1.5%, p 0.001).
- Under 0.05 only: buddyPairs.routeDiverged 0 to 12 (new, p 0.0039); buddyPairs.blocked 0 to 19 (new, p 0.0078).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.001 (gate 1.25)
- the 88 changed records first part at simulated second: min 2.1, p10 8.1, median 112.57499999999999, p90 205.05, max 240

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 880 | 816 | -0.64 | 64 | 30 | 34 | 0.708 |
| `usKills` | 394 | 355 | -0.39 | 54 | 23 | 31 | 0.3409 |
| `geKills` | 486 | 461 | -0.25 | 60 | 25 | 35 | 0.2451 |
| `fire.total` | 8537 | 8859 | 3.22 | 73 | 40 | 33 | 0.4828 |
| `fire.hits` | 1727 | 1597 | -1.3 | 69 | 31 | 38 | 0.4704 |
| `retreatSamples` | 2615 | 2153 | -4.62 | 53 | 22 | 31 | 0.2717 |
| `movementResolver.changes` | 153211 | 150895 | -23.16 | 85 | 27 | 58 | 0.001 |
| `buddyPairs.pairActivations` | 0 | 135 | 1.35 | 54 | 54 | 0 | 0 |
| `buddyPairs.breaks` | 0 | 6396 | 63.96 | 100 | 100 | 0 | 0 |
| `buddyPairs.reforms` | 0 | 4124 | 41.24 | 100 | 100 | 0 | 0 |
| `buddyPairs.separated` | 0 | 4708 | 47.08 | 100 | 100 | 0 | 0 |
| `buddyPairs.blocked` | 0 | 19 | 0.19 | 8 | 8 | 0 | 0.0078 |
| `buddyPairs.suppressed` | 0 | 631 | 6.31 | 75 | 75 | 0 | 0 |
| `buddyPairs.incompatible` | 0 | 338 | 3.38 | 87 | 87 | 0 | 0 |
| `buddyPairs.routeDiverged` | 0 | 12 | 0.12 | 9 | 9 | 0 | 0.0039 |
| `buddyPairs.coverMoves` | 0 | 135 | 1.35 | 54 | 54 | 0 | 0 |
| `movementStalls.length` | 26 | 31 | 0.05 | 3 | 3 | 0 | 0.25 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 3 | 5 | 0.02 | 3 | 2 | 1 | 1 |
| `loopAlerts.length` | 59 | 40 | -0.19 | 22 | 10 | 12 | 0.8318 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 354 | 361 | 0.07 | 39 | 21 | 18 | 0.7493 |
| `stallOutcomes.wakes` | 456 | 431 | -0.25 | 11 | 4 | 7 | 0.5488 |
| `stallOutcomes.repeats` | 120 | 108 | -0.12 | 6 | 2 | 4 | 0.6875 |
| `timeline.stalledOnsets` | 35 | 38 | 0.03 | 3 | 3 | 0 | 0.25 |
| `timeline.stalledSamples` | 942 | 983 | 0.41 | 3 | 3 | 0 | 0.25 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

buddy-pairs-fixed-0040 2.1 s (timeline) · buddy-pairs-fixed-0068 2.1 s (timeline) · buddy-pairs-fixed-0075 3 s (timeline) · buddy-pairs-fixed-0005 5.1 s (timeline) · buddy-pairs-fixed-0024 5.1 s (timeline) · buddy-pairs-fixed-0023 6 s (timeline) · buddy-pairs-fixed-0050 6 s (timeline) · buddy-pairs-fixed-0039 7.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=272&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/buddy-pairs/ai_flow_live.html?bench=272&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=272`); it opens the seed that parts earliest, and the dropdowns choose another.

