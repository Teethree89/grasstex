# Benchmark run #271 · 100 seeds from `buddy-pairs` (meeting), windows `contact+120`

- **OFF** flags: `buddyPairs=0` · **ON** flags: `buddyPairs=1`
- work/buddy-pairs @ 8a0f76d · [run](https://github.com/APPARANYX/grasstex/actions/runs/37067099268) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 52.05 s); 9 of 27 counters under p 0.05 (about 1.4 by chance), 8 under 0.0019; casualties -1.4% (p 1)**

- Clears the Bonferroni line (p < 0.0019): buddyPairs.pairActivations 0 to 164 (new, p 0); buddyPairs.breaks 0 to 40477 (new, p 0); buddyPairs.reforms 0 to 37980 (new, p 0); buddyPairs.separated 0 to 12671 (new, p 0); buddyPairs.suppressed 0 to 951 (new, p 0); buddyPairs.incompatible 0 to 25949 (new, p 0); buddyPairs.coverMoves 0 to 164 (new, p 0); buddyPairs.routeDiverged 0 to 14 (new, p 0.0005).
- Under 0.05 only: buddyPairs.blocked 0 to 25 (new, p 0.0078).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.033 (gate 1.25)
- the 90 changed records first part at simulated second: min 2.1, p10 4.05, median 52.05, p90 175.05, max 218.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1003 | 989 | -0.14 | 79 | 39 | 40 | 1 |
| `usKills` | 448 | 490 | 0.42 | 71 | 39 | 32 | 0.4767 |
| `geKills` | 555 | 499 | -0.56 | 76 | 38 | 38 | 1 |
| `fire.total` | 9518 | 8013 | -15.05 | 85 | 36 | 49 | 0.1928 |
| `fire.hits` | 1984 | 1962 | -0.22 | 82 | 45 | 37 | 0.4397 |
| `retreatSamples` | 3423 | 3265 | -1.58 | 70 | 33 | 37 | 0.7202 |
| `movementResolver.changes` | 154141 | 153817 | -3.24 | 90 | 41 | 49 | 0.4608 |
| `buddyPairs.pairActivations` | 0 | 164 | 1.64 | 56 | 56 | 0 | 0 |
| `buddyPairs.breaks` | 0 | 40477 | 404.77 | 100 | 100 | 0 | 0 |
| `buddyPairs.reforms` | 0 | 37980 | 379.8 | 100 | 100 | 0 | 0 |
| `buddyPairs.separated` | 0 | 12671 | 126.71 | 100 | 100 | 0 | 0 |
| `buddyPairs.blocked` | 0 | 25 | 0.25 | 8 | 8 | 0 | 0.0078 |
| `buddyPairs.suppressed` | 0 | 951 | 9.51 | 82 | 82 | 0 | 0 |
| `buddyPairs.incompatible` | 0 | 25949 | 259.49 | 100 | 100 | 0 | 0 |
| `buddyPairs.routeDiverged` | 0 | 14 | 0.14 | 12 | 12 | 0 | 0.0005 |
| `buddyPairs.coverMoves` | 0 | 164 | 1.64 | 56 | 56 | 0 | 0 |
| `movementStalls.length` | 13 | 12 | -0.01 | 5 | 2 | 3 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 3 | 0.03 | 3 | 3 | 0 | 0.25 |
| `loopAlerts.length` | 44 | 26 | -0.18 | 27 | 9 | 18 | 0.1221 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 336 | 334 | -0.02 | 49 | 24 | 25 | 1 |
| `stallOutcomes.wakes` | 391 | 416 | 0.25 | 20 | 12 | 8 | 0.5034 |
| `stallOutcomes.repeats` | 84 | 79 | -0.05 | 9 | 5 | 4 | 1 |
| `timeline.stalledOnsets` | 20 | 18 | -0.02 | 4 | 1 | 3 | 0.625 |
| `timeline.stalledSamples` | 307 | 288 | -0.19 | 9 | 2 | 7 | 0.1797 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

buddy-pairs-0018 2.1 s (timeline) · buddy-pairs-0029 2.1 s (timeline) · buddy-pairs-0007 3 s (timeline) · buddy-pairs-0020 3 s (timeline) · buddy-pairs-0083 3 s (timeline) · buddy-pairs-0085 3 s (timeline) · buddy-pairs-0017 4.05 s (timeline) · buddy-pairs-0030 4.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=271&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/buddy-pairs/ai_flow_live.html?bench=271&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=271`); it opens the seed that parts earliest, and the dropdowns choose another.

