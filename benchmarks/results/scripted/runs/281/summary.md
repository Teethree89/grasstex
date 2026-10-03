# Benchmark run #281 · 100 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ 7ce66c0 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37088164770) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 81.525 s); 21 of 53 counters under p 0.05 (about 2.7 by chance), 15 under 0.0009; casualties -0.4% (p 0.6646)**

- Clears the Bonferroni line (p < 0.0009): movementResolver.changes 175676 to 178463 (+1.6%, p 0); soldierBeliefs.updates 0 to 126800 (new, p 0); soldierBeliefs.seen 0 to 23305 (new, p 0); soldierBeliefs.seenRefreshes 0 to 704794 (new, p 0); soldierBeliefs.told 0 to 92250 (new, p 0); soldierBeliefs.heard 0 to 11245 (new, p 0); soldierBeliefs.expired 0 to 53294 (new, p 0); soldierBeliefs.unknownMen 0 to 2300 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 2659 (new, p 0); soldierBeliefs.activeBySource.told 0 to 3751 (new, p 0); combatUrgency.sharedContactRepeatBlocks 1047812 to 296596 (-71.7%, p 0); combatUrgency.sharedContactSoundBlocks 0 to 4147 (new, p 0); soldierBeliefs.activeBySource.heard 0 to 53 (new, p 0.0001); movementGoals.bySource.squad-stability.changes 381064 to 385878 (+1.3%, p 0.0001); movementGoals.actualChanges 526073 to 533437 (+1.4%, p 0.0009).
- Under 0.05 only: combatUrgency.sharedContactReactions 13629 to 12820 (-5.9%, p 0.0029); movementGoals.bySource.weapon-cycle.requests 2578 to 3659 (+41.9%, p 0.0046); combatUrgency.sharedContactCooldownBlocks 0 to 157 (new, p 0.0078); movementGoals.bySource.engagement.changes 118704 to 122255 (+3.0%, p 0.0086); movementGoals.combatIntentCoalesced 5238875 to 5306640 (+1.3%, p 0.012); movementGoals.combatIntentRequests 7378275 to 7461049 (+1.1%, p 0.021).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.888 (gate 1.25)
- the 100 changed records first part at simulated second: min 39, p10 57, median 81.525, p90 115.05, max 151.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1242 | 1237 | -0.05 | 85 | 45 | 40 | 0.6646 |
| `usKills` | 554 | 570 | 0.16 | 72 | 41 | 31 | 0.2888 |
| `geKills` | 688 | 667 | -0.21 | 79 | 42 | 37 | 0.653 |
| `fire.total` | 9462 | 11563 | 21.01 | 94 | 54 | 40 | 0.1797 |
| `fire.hits` | 2405 | 2411 | 0.06 | 89 | 47 | 42 | 0.6718 |
| `retreatSamples` | 3286 | 3422 | 1.36 | 74 | 36 | 38 | 0.9076 |
| `movementResolver.changes` | 175676 | 178463 | 27.87 | 100 | 71 | 29 | 0 |
| `movementStalls.length` | 17 | 16 | -0.01 | 4 | 2 | 2 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 2 | 0.01 | 3 | 2 | 1 | 1 |
| `loopAlerts.length` | 38 | 43 | 0.05 | 38 | 24 | 14 | 0.1433 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 333 | 327 | -0.06 | 38 | 18 | 20 | 0.8714 |
| `stallOutcomes.wakes` | 319 | 311 | -0.08 | 1 | 0 | 1 | 1 |
| `stallOutcomes.repeats` | 89 | 90 | 0.01 | 1 | 1 | 0 | 1 |
| `timeline.stalledOnsets` | 19 | 18 | -0.01 | 2 | 1 | 1 | 1 |
| `timeline.stalledSamples` | 167 | 175 | 0.08 | 4 | 2 | 2 | 1 |
| `acquisitions.total` | 24552 | 25021 | 4.69 | 99 | 52 | 47 | 0.6879 |
| `acquisitions.reacquired` | 19128 | 19449 | 3.21 | 99 | 51 | 48 | 0.8408 |
| `soldierBeliefs.updates` | 0 | 126800 | 1268 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 23305 | 233.05 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.seenRefreshes` | 0 | 704794 | 7047.94 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 92250 | 922.5 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 11245 | 112.45 | 34 | 34 | 0 | 0 |
| `soldierBeliefs.expired` | 0 | 53294 | 532.94 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 2300 | 23 | 99 | 99 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 2659 | 26.59 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 3751 | 37.51 | 100 | 100 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 53 | 0.53 | 14 | 14 | 0 | 0.0001 |
| `combatUrgency.sharedContactReactions` | 13629 | 12820 | -8.09 | 96 | 33 | 63 | 0.0029 |
| `combatUrgency.sharedContactRepeatBlocks` | 1047812 | 296596 | -7512.16 | 100 | 0 | 100 | 0 |
| `combatUrgency.sharedContactCooldownBlocks` | 0 | 157 | 1.57 | 8 | 8 | 0 | 0.0078 |
| `combatUrgency.sharedContactSoundBlocks` | 0 | 4147 | 41.47 | 22 | 22 | 0 | 0 |
| `combatUrgency.urgentCoverStarts` | 210 | 179 | -0.31 | 65 | 31 | 34 | 0.8043 |
| `combatUrgency.urgentCoverArrivals` | 94 | 73 | -0.21 | 46 | 20 | 26 | 0.4614 |
| `movementGoals.actualChanges` | 526073 | 533437 | 73.64 | 100 | 67 | 33 | 0.0009 |
| `movementGoals.requests` | 2500812 | 2512915 | 121.03 | 100 | 48 | 52 | 0.7644 |
| `movementGoals.combatIntentRequests` | 7378275 | 7461049 | 827.74 | 100 | 62 | 38 | 0.021 |
| `movementGoals.combatIntentCoalesced` | 5238875 | 5306640 | 677.65 | 100 | 63 | 37 | 0.012 |
| `movementGoals.bySource.engagement.requests` | 2136822 | 2150750 | 139.28 | 100 | 53 | 47 | 0.6173 |
| `movementGoals.bySource.engagement.changes` | 118704 | 122255 | 35.51 | 99 | 63 | 36 | 0.0086 |
| `movementGoals.bySource.squad-stability.requests` | 361412 | 358506 | -29.06 | 99 | 44 | 55 | 0.3149 |
| `movementGoals.bySource.squad-stability.changes` | 381064 | 385878 | 48.14 | 99 | 69 | 30 | 0.0001 |
| `movementGoals.bySource.weapon-cycle.requests` | 2578 | 3659 | 10.81 | 92 | 60 | 32 | 0.0046 |
| `movementGoals.bySource.weapon-cycle.changes` | 52 | 93 | 0.41 | 43 | 23 | 20 | 0.7608 |
| `regroups.regroupRequests` | 2385 | 2281 | -1.04 | 56 | 24 | 32 | 0.3497 |
| `regroups.suppressed` | 2052 | 1954 | -0.98 | 57 | 24 | 33 | 0.2892 |
| `regroups.stragglerSuppressions` | 780 | 700 | -0.8 | 48 | 17 | 31 | 0.0595 |
| `regroups.endedContact` | 9 | 10 | 0.01 | 15 | 8 | 7 | 1 |
| `regroups.endedCohesionRestored` | 313 | 307 | -0.06 | 31 | 14 | 17 | 0.7201 |
| `regroups.endedNewMission` | 4 | 6 | 0.02 | 2 | 2 | 0 | 0.5 |
| `regroups.endedRetreat` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0027 39 s (timeline) · soldier-beliefs-0040 39 s (timeline) · soldier-beliefs-0083 39.15 s (timeline) · soldier-beliefs-0086 40.05 s (timeline) · soldier-beliefs-0082 43.05 s (timeline) · soldier-beliefs-0076 44.1 s (timeline) · soldier-beliefs-0039 45 s (timeline) · soldier-beliefs-0069 53.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=281&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=281&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=281`); it opens the seed that parts earliest, and the dropdowns choose another.

