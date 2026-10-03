# Benchmark run #274 · 100 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ bde9ea9 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37081328737) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 22.575000000000003 s); 16 of 30 counters under p 0.05 (about 1.5 by chance), 12 under 0.0017; casualties +30.9% (p 0.016)**

- Clears the Bonferroni line (p < 0.0017): movementResolver.changes 155070 to 196473 (+26.7%, p 0); regroups.entries 385 to 1292 (+235.6%, p 0); stallOutcomes.wakes 480 to 712 (+48.3%, p 0); soldierBeliefs.updates 0 to 107559 (new, p 0); soldierBeliefs.seen 0 to 20031 (new, p 0); soldierBeliefs.seenRefreshes 0 to 603730 (new, p 0); soldierBeliefs.told 0 to 80481 (new, p 0); soldierBeliefs.heard 0 to 7047 (new, p 0); soldierBeliefs.expired 0 to 48952 (new, p 0); soldierBeliefs.unknownMen 0 to 2697 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 2264 (new, p 0); soldierBeliefs.activeBySource.told 0 to 3885 (new, p 0).
- Under 0.05 only: soldierBeliefs.activeBySource.heard 0 to 53 (new, p 0.0039); casualties 841 to 1101 (+30.9%, p 0.016); fire.hits 1687 to 2118 (+25.5%, p 0.0172); geKills 447 to 641 (+43.4%, p 0.0214).
- Wall time on/off x1.603 is over the 1.25 gate.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.603 (gate 1.25)
- the 100 changed records first part at simulated second: min 1.05, p10 5.1, median 22.575000000000003, p90 71.1, max 109.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 841 | 1101 | 2.6 | 92 | 58 | 34 | 0.016 |
| `usKills` | 394 | 460 | 0.66 | 84 | 46 | 38 | 0.4452 |
| `geKills` | 447 | 641 | 1.94 | 84 | 53 | 31 | 0.0214 |
| `fire.total` | 8290 | 10405 | 21.15 | 96 | 52 | 44 | 0.4752 |
| `fire.hits` | 1687 | 2118 | 4.31 | 94 | 59 | 35 | 0.0172 |
| `retreatSamples` | 2252 | 2266 | 0.14 | 79 | 46 | 33 | 0.1766 |
| `movementResolver.changes` | 155070 | 196473 | 414.03 | 100 | 88 | 12 | 0 |
| `movementStalls.length` | 15 | 10 | -0.05 | 7 | 2 | 5 | 0.4531 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 3 | 0.02 | 4 | 3 | 1 | 0.625 |
| `loopAlerts.length` | 25 | 36 | 0.11 | 37 | 23 | 14 | 0.1877 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 385 | 1292 | 9.07 | 93 | 85 | 8 | 0 |
| `stallOutcomes.wakes` | 480 | 712 | 2.32 | 31 | 30 | 1 | 0 |
| `stallOutcomes.repeats` | 95 | 95 | 0 | 10 | 5 | 5 | 1 |
| `timeline.stalledOnsets` | 14 | 9 | -0.05 | 9 | 3 | 6 | 0.5078 |
| `timeline.stalledSamples` | 105 | 299 | 1.94 | 10 | 4 | 6 | 0.7539 |
| `acquisitions.total` | 21778 | 21134 | -6.44 | 100 | 50 | 50 | 1 |
| `acquisitions.reacquired` | 17330 | 16364 | -9.66 | 99 | 48 | 51 | 0.8408 |
| `soldierBeliefs.updates` | 0 | 107559 | 1075.59 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 20031 | 200.31 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seenRefreshes` | 0 | 603730 | 6037.3 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 80481 | 804.81 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 7047 | 70.47 | 25 | 25 | 0 | 0 |
| `soldierBeliefs.expired` | 0 | 48952 | 489.52 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 2697 | 26.97 | 98 | 98 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 2264 | 22.64 | 99 | 99 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 3885 | 38.85 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 53 | 0.53 | 9 | 9 | 0 | 0.0039 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0015 1.05 s (timeline) · soldier-beliefs-0002 2.1 s (timeline) · soldier-beliefs-0063 2.1 s (timeline) · soldier-beliefs-0012 3 s (timeline) · soldier-beliefs-0044 3 s (timeline) · soldier-beliefs-0050 3 s (timeline) · soldier-beliefs-0089 3 s (timeline) · soldier-beliefs-0075 4.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=274&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=274&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=274`); it opens the seed that parts earliest, and the dropdowns choose another.

