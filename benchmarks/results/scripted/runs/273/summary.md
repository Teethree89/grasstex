# Benchmark run #273 · 100 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ a5d4cbf · [run](https://github.com/APPARANYX/grasstex/actions/runs/37080528089) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 20.1 s); 13 of 29 counters under p 0.05 (about 1.5 by chance), 12 under 0.0017; casualties -10.5% (p 0.4657)**

- Clears the Bonferroni line (p < 0.0017): movementResolver.changes 155070 to 174810 (+12.7%, p 0); regroups.entries 385 to 1221 (+217.1%, p 0); stallOutcomes.wakes 480 to 712 (+48.3%, p 0); soldierBeliefs.updates 0 to 569396 (new, p 0); soldierBeliefs.seen 0 to 496371 (new, p 0); soldierBeliefs.told 0 to 68167 (new, p 0); soldierBeliefs.heard 0 to 4858 (new, p 0); soldierBeliefs.expired 0 to 41697 (new, p 0); soldierBeliefs.unknownMen 0 to 2847 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 1976 (new, p 0); soldierBeliefs.activeBySource.told 0 to 4384 (new, p 0); fire.total 8290 to 12803 (+54.4%, p 0.0008).
- Under 0.05 only: soldierBeliefs.activeBySource.heard 0 to 40 (new, p 0.0078).
- Wall time on/off x1.36 is over the 1.25 gate.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.36 (gate 1.25)
- the 100 changed records first part at simulated second: min 1.05, p10 4.05, median 20.1, p90 71.1, max 109.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 841 | 753 | -0.88 | 92 | 42 | 50 | 0.4657 |
| `usKills` | 394 | 349 | -0.45 | 77 | 33 | 44 | 0.2543 |
| `geKills` | 447 | 404 | -0.43 | 86 | 48 | 38 | 0.3318 |
| `fire.total` | 8290 | 12803 | 45.13 | 98 | 66 | 32 | 0.0008 |
| `fire.hits` | 1687 | 1441 | -2.46 | 95 | 45 | 50 | 0.6817 |
| `retreatSamples` | 2252 | 1791 | -4.61 | 74 | 32 | 42 | 0.2954 |
| `movementResolver.changes` | 155070 | 174810 | 197.4 | 100 | 72 | 28 | 0 |
| `movementStalls.length` | 15 | 4 | -0.11 | 7 | 2 | 5 | 0.4531 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 0 | -0.01 | 1 | 0 | 1 | 1 |
| `loopAlerts.length` | 25 | 29 | 0.04 | 29 | 12 | 17 | 0.4583 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 385 | 1221 | 8.36 | 88 | 80 | 8 | 0 |
| `stallOutcomes.wakes` | 480 | 712 | 2.32 | 31 | 30 | 1 | 0 |
| `stallOutcomes.repeats` | 95 | 95 | 0 | 10 | 5 | 5 | 1 |
| `timeline.stalledOnsets` | 14 | 10 | -0.04 | 10 | 4 | 6 | 0.7539 |
| `timeline.stalledSamples` | 105 | 394 | 2.89 | 11 | 5 | 6 | 1 |
| `acquisitions.total` | 21778 | 18238 | -35.4 | 100 | 43 | 57 | 0.1933 |
| `acquisitions.reacquired` | 17330 | 14385 | -29.45 | 100 | 44 | 56 | 0.2713 |
| `soldierBeliefs.updates` | 0 | 569396 | 5693.96 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 496371 | 4963.71 | 89 | 89 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 68167 | 681.67 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 4858 | 48.58 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.expired` | 0 | 41697 | 416.97 | 97 | 97 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 2847 | 28.47 | 97 | 97 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 1976 | 19.76 | 84 | 84 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 4384 | 43.84 | 98 | 98 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 40 | 0.4 | 8 | 8 | 0 | 0.0078 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0015 1.05 s (timeline) · soldier-beliefs-0002 2.1 s (timeline) · soldier-beliefs-0063 2.1 s (timeline) · soldier-beliefs-0012 3 s (timeline) · soldier-beliefs-0044 3 s (timeline) · soldier-beliefs-0050 3 s (timeline) · soldier-beliefs-0057 3 s (timeline) · soldier-beliefs-0089 3 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=273&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=273&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=273`); it opens the seed that parts earliest, and the dropdowns choose another.

