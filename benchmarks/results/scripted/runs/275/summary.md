# Benchmark run #275 · 100 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ d53c002 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37082545475) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 22.575000000000003 s); 16 of 36 counters under p 0.05 (about 1.8 by chance), 15 under 0.0014; casualties +25.6% (p 0.047)**

- Clears the Bonferroni line (p < 0.0014): movementResolver.changes 155070 to 194817 (+25.6%, p 0); regroups.entries 385 to 1314 (+241.3%, p 0); stallOutcomes.wakes 480 to 712 (+48.3%, p 0); soldierBeliefs.updates 0 to 103800 (new, p 0); soldierBeliefs.seen 0 to 19509 (new, p 0); soldierBeliefs.seenRefreshes 0 to 598560 (new, p 0); soldierBeliefs.told 0 to 79288 (new, p 0); soldierBeliefs.heard 0 to 5003 (new, p 0); soldierBeliefs.expired 0 to 48235 (new, p 0); soldierBeliefs.unknownMen 0 to 2874 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 2219 (new, p 0); soldierBeliefs.activeBySource.told 0 to 3829 (new, p 0); combatUrgency.sharedContactRepeatBlocks 857811 to 362912 (-57.7%, p 0); combatUrgency.sharedContactSoundBlocks 0 to 2403 (new, p 0.0001); combatUrgency.sharedContactCooldownBlocks 0 to 158 (new, p 0.001).
- Under 0.05 only: casualties 841 to 1056 (+25.6%, p 0.047).
- Wall time on/off x1.494 is over the 1.25 gate.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.494 (gate 1.25)
- the 100 changed records first part at simulated second: min 1.05, p10 5.1, median 22.575000000000003, p90 71.1, max 109.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 841 | 1056 | 2.15 | 92 | 56 | 36 | 0.047 |
| `usKills` | 394 | 460 | 0.66 | 86 | 47 | 39 | 0.4505 |
| `geKills` | 447 | 596 | 1.49 | 83 | 50 | 33 | 0.0784 |
| `fire.total` | 8290 | 10044 | 17.54 | 96 | 51 | 45 | 0.6101 |
| `fire.hits` | 1687 | 2040 | 3.53 | 94 | 56 | 38 | 0.079 |
| `retreatSamples` | 2252 | 2137 | -1.15 | 74 | 41 | 33 | 0.416 |
| `movementResolver.changes` | 155070 | 194817 | 397.47 | 100 | 88 | 12 | 0 |
| `movementStalls.length` | 15 | 16 | 0.01 | 9 | 4 | 5 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 2 | 0.01 | 3 | 2 | 1 | 1 |
| `loopAlerts.length` | 25 | 38 | 0.13 | 40 | 26 | 14 | 0.0807 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 385 | 1314 | 9.29 | 93 | 85 | 8 | 0 |
| `stallOutcomes.wakes` | 480 | 712 | 2.32 | 31 | 30 | 1 | 0 |
| `stallOutcomes.repeats` | 95 | 95 | 0 | 10 | 5 | 5 | 1 |
| `timeline.stalledOnsets` | 14 | 15 | 0.01 | 11 | 5 | 6 | 1 |
| `timeline.stalledSamples` | 105 | 348 | 2.43 | 12 | 6 | 6 | 1 |
| `acquisitions.total` | 21778 | 20946 | -8.32 | 100 | 50 | 50 | 1 |
| `acquisitions.reacquired` | 17330 | 16306 | -10.24 | 99 | 50 | 49 | 1 |
| `soldierBeliefs.updates` | 0 | 103800 | 1038 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 19509 | 195.09 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seenRefreshes` | 0 | 598560 | 5985.6 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 79288 | 792.88 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 5003 | 50.03 | 22 | 22 | 0 | 0 |
| `soldierBeliefs.expired` | 0 | 48235 | 482.35 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 2874 | 28.74 | 97 | 97 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 2219 | 22.19 | 98 | 98 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 3829 | 38.29 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 22 | 0.22 | 5 | 5 | 0 | 0.0625 |
| `combatUrgency.sharedContactReactions` | 11713 | 11169 | -5.44 | 97 | 43 | 54 | 0.3099 |
| `combatUrgency.sharedContactRepeatBlocks` | 857811 | 362912 | -4948.99 | 100 | 9 | 91 | 0 |
| `combatUrgency.sharedContactCooldownBlocks` | 0 | 158 | 1.58 | 11 | 11 | 0 | 0.001 |
| `combatUrgency.sharedContactSoundBlocks` | 0 | 2403 | 24.03 | 15 | 15 | 0 | 0.0001 |
| `combatUrgency.urgentCoverStarts` | 168 | 175 | 0.07 | 70 | 31 | 39 | 0.403 |
| `combatUrgency.urgentCoverArrivals` | 78 | 74 | -0.04 | 47 | 20 | 27 | 0.3817 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0015 1.05 s (timeline) · soldier-beliefs-0002 2.1 s (timeline) · soldier-beliefs-0063 2.1 s (timeline) · soldier-beliefs-0012 3 s (timeline) · soldier-beliefs-0044 3 s (timeline) · soldier-beliefs-0050 3 s (timeline) · soldier-beliefs-0089 3 s (timeline) · soldier-beliefs-0075 4.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=275&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=275&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=275`); it opens the seed that parts earliest, and the dropdowns choose another.

