# Benchmark run #278 · 20 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ 62c6e77 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37086222479) · build v29-dev

## Verdict

**MOVED: 20 of 20 pairs changed (median first part 13.05 s); 23 of 53 counters under p 0.05 (about 2.7 by chance), 18 under 0.0009; casualties +11.7% (p 0.3593)**

- Clears the Bonferroni line (p < 0.0009): regroups.entries 77 to 264 (+242.9%, p 0); soldierBeliefs.updates 0 to 17817 (new, p 0); soldierBeliefs.seen 0 to 3520 (new, p 0); soldierBeliefs.seenRefreshes 0 to 97878 (new, p 0); soldierBeliefs.told 0 to 14098 (new, p 0); soldierBeliefs.expired 0 to 8825 (new, p 0); soldierBeliefs.unknownMen 0 to 581 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 350 (new, p 0); soldierBeliefs.activeBySource.told 0 to 878 (new, p 0); combatUrgency.sharedContactRepeatBlocks 189475 to 71895 (-62.1%, p 0); movementGoals.actualChanges 98046 to 114368 (+16.6%, p 0); movementGoals.bySource.squad-stability.changes 72102 to 85351 (+18.4%, p 0); regroups.endedCohesionRestored 74 to 243 (+228.4%, p 0); movementGoals.bySource.weapon-cycle.changes 3 to 32 (+966.7%, p 0.0001); regroups.regroupRequests 505 to 1611 (+219.0%, p 0.0001); movementResolver.changes 31201 to 38022 (+21.9%, p 0.0004); movementGoals.bySource.squad-stability.requests 67888 to 85852 (+26.5%, p 0.0004); regroups.suppressed 428 to 1347 (+214.7%, p 0.0007).
- Under 0.05 only: regroups.endedNewMission 1 to 13 (+1200.0%, p 0.0078); stallOutcomes.wakes 88 to 144 (+63.6%, p 0.0156); movementGoals.combatIntentRequests 1321238 to 1171916 (-11.3%, p 0.0414); movementGoals.combatIntentCoalesced 938799 to 827436 (-11.9%, p 0.0414); movementGoals.bySource.engagement.requests 382053 to 343829 (-10.0%, p 0.0414).
- Wall time on/off x1.479 is over the 1.25 gate.

## Paired comparison (off against on)

- **20** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.479 (gate 1.25)
- the 20 changed records first part at simulated second: min 1.05, p10 2.1, median 13.05, p90 71.1, max 93

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 162 | 181 | 0.95 | 19 | 12 | 7 | 0.3593 |
| `usKills` | 96 | 72 | -1.2 | 17 | 8 | 9 | 1 |
| `geKills` | 66 | 109 | 2.15 | 15 | 10 | 5 | 0.3018 |
| `fire.total` | 1740 | 1736 | -0.2 | 19 | 9 | 10 | 1 |
| `fire.hits` | 312 | 332 | 1 | 19 | 13 | 6 | 0.1671 |
| `retreatSamples` | 467 | 412 | -2.75 | 16 | 9 | 7 | 0.8036 |
| `movementResolver.changes` | 31201 | 38022 | 341.05 | 20 | 18 | 2 | 0.0004 |
| `movementStalls.length` | 4 | 1 | -0.15 | 1 | 0 | 1 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 0 | 1 | 0.05 | 1 | 1 | 0 | 1 |
| `loopAlerts.length` | 5 | 6 | 0.05 | 9 | 5 | 4 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 77 | 264 | 9.35 | 19 | 19 | 0 | 0 |
| `stallOutcomes.wakes` | 88 | 144 | 2.8 | 7 | 7 | 0 | 0.0156 |
| `stallOutcomes.repeats` | 18 | 18 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 4 | 6 | 0.1 | 3 | 2 | 1 | 1 |
| `timeline.stalledSamples` | 43 | 30 | -0.65 | 4 | 2 | 2 | 1 |
| `acquisitions.total` | 4637 | 4003 | -31.7 | 20 | 9 | 11 | 0.8238 |
| `acquisitions.reacquired` | 3754 | 3192 | -28.1 | 20 | 9 | 11 | 0.8238 |
| `soldierBeliefs.updates` | 0 | 17817 | 890.85 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 3520 | 176 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.seenRefreshes` | 0 | 97878 | 4893.9 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 14098 | 704.9 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 199 | 9.95 | 2 | 2 | 0 | 0.5 |
| `soldierBeliefs.expired` | 0 | 8825 | 441.25 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 581 | 29.05 | 19 | 19 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 350 | 17.5 | 19 | 19 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 878 | 43.9 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 10 | 0.5 | 1 | 1 | 0 | 1 |
| `combatUrgency.sharedContactReactions` | 2284 | 2291 | 0.35 | 20 | 12 | 8 | 0.5034 |
| `combatUrgency.sharedContactRepeatBlocks` | 189475 | 71895 | -5879 | 20 | 1 | 19 | 0 |
| `combatUrgency.sharedContactCooldownBlocks` | 0 | 19 | 0.95 | 2 | 2 | 0 | 0.5 |
| `combatUrgency.sharedContactSoundBlocks` | 0 | 348 | 17.4 | 1 | 1 | 0 | 1 |
| `combatUrgency.urgentCoverStarts` | 26 | 24 | -0.1 | 11 | 5 | 6 | 1 |
| `combatUrgency.urgentCoverArrivals` | 12 | 6 | -0.3 | 6 | 2 | 4 | 0.6875 |
| `movementGoals.actualChanges` | 98046 | 114368 | 816.1 | 20 | 20 | 0 | 0 |
| `movementGoals.requests` | 450327 | 430332 | -999.75 | 20 | 9 | 11 | 0.8238 |
| `movementGoals.combatIntentRequests` | 1321238 | 1171916 | -7466.1 | 20 | 5 | 15 | 0.0414 |
| `movementGoals.combatIntentCoalesced` | 938799 | 827436 | -5568.15 | 20 | 5 | 15 | 0.0414 |
| `movementGoals.bySource.engagement.requests` | 382053 | 343829 | -1911.2 | 20 | 5 | 15 | 0.0414 |
| `movementGoals.bySource.engagement.changes` | 21183 | 19811 | -68.6 | 20 | 7 | 13 | 0.2632 |
| `movementGoals.bySource.squad-stability.requests` | 67888 | 85852 | 898.2 | 20 | 18 | 2 | 0.0004 |
| `movementGoals.bySource.squad-stability.changes` | 72102 | 85351 | 662.45 | 20 | 19 | 1 | 0 |
| `movementGoals.bySource.weapon-cycle.requests` | 386 | 651 | 13.25 | 20 | 14 | 6 | 0.1153 |
| `movementGoals.bySource.weapon-cycle.changes` | 3 | 32 | 1.45 | 15 | 15 | 0 | 0.0001 |
| `regroups.regroupRequests` | 505 | 1611 | 55.3 | 18 | 17 | 1 | 0.0001 |
| `regroups.suppressed` | 428 | 1347 | 45.95 | 19 | 17 | 2 | 0.0007 |
| `regroups.stragglerSuppressions` | 140 | 363 | 11.15 | 18 | 11 | 7 | 0.4807 |
| `regroups.endedContact` | 0 | 4 | 0.2 | 4 | 4 | 0 | 0.125 |
| `regroups.endedCohesionRestored` | 74 | 243 | 8.45 | 18 | 18 | 0 | 0 |
| `regroups.endedNewMission` | 1 | 13 | 0.6 | 8 | 8 | 0 | 0.0078 |
| `regroups.endedRetreat` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0015 1.05 s (timeline) · soldier-beliefs-0002 2.1 s (timeline) · soldier-beliefs-0012 3 s (timeline) · soldier-beliefs-0007 5.1 s (timeline) · soldier-beliefs-0018 5.1 s (timeline) · soldier-beliefs-0013 6 s (timeline) · soldier-beliefs-0003 7.05 s (timeline) · soldier-beliefs-0017 7.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=278&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=278&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=278`); it opens the seed that parts earliest, and the dropdowns choose another.

