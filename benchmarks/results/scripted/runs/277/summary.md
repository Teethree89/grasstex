# Benchmark run #277 · 20 seeds from `soldier-beliefs` (meeting), windows `contact+120`

- **OFF** flags: `soldierBeliefs=0&callouts=1` · **ON** flags: `soldierBeliefs=1&callouts=1`
- work/soldier-beliefs @ 415ca75 · [run](https://github.com/APPARANYX/grasstex/actions/runs/37086177668) · build v29-dev

## Verdict

**MOVED: 20 of 20 pairs changed (median first part 77.025 s); 9 of 53 counters under p 0.05 (about 2.7 by chance), 9 under 0.0009; casualties +0.4% (p 1)**

- Clears the Bonferroni line (p < 0.0009): soldierBeliefs.updates 0 to 24509 (new, p 0); soldierBeliefs.seen 0 to 4574 (new, p 0); soldierBeliefs.seenRefreshes 0 to 146421 (new, p 0); soldierBeliefs.told 0 to 18434 (new, p 0); soldierBeliefs.expired 0 to 10434 (new, p 0); soldierBeliefs.unknownMen 0 to 498 (new, p 0); soldierBeliefs.activeBySource.seen 0 to 540 (new, p 0); soldierBeliefs.activeBySource.told 0 to 729 (new, p 0); combatUrgency.sharedContactRepeatBlocks 212844 to 55638 (-73.9%, p 0).

## Paired comparison (off against on)

- **20** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.883 (gate 1.25)
- the 20 changed records first part at simulated second: min 55.05, p10 59.1, median 77.025, p90 118.05, max 151.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 229 | 230 | 0.05 | 15 | 8 | 7 | 1 |
| `usKills` | 119 | 120 | 0.05 | 15 | 9 | 6 | 0.6072 |
| `geKills` | 110 | 110 | 0 | 11 | 6 | 5 | 1 |
| `fire.total` | 1597 | 1737 | 7 | 19 | 10 | 9 | 1 |
| `fire.hits` | 430 | 426 | -0.2 | 17 | 10 | 7 | 0.6291 |
| `retreatSamples` | 569 | 567 | -0.1 | 15 | 8 | 7 | 1 |
| `movementResolver.changes` | 34951 | 35196 | 12.25 | 20 | 11 | 9 | 0.8238 |
| `movementStalls.length` | 9 | 2 | -0.35 | 2 | 0 | 2 | 0.5 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 1 | 0 | -0.05 | 1 | 0 | 1 | 1 |
| `loopAlerts.length` | 4 | 5 | 0.05 | 7 | 4 | 3 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 76 | 80 | 0.2 | 10 | 7 | 3 | 0.3438 |
| `stallOutcomes.wakes` | 56 | 56 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 17 | 17 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 5 | 3 | -0.1 | 1 | 0 | 1 | 1 |
| `timeline.stalledSamples` | 51 | 22 | -1.45 | 2 | 0 | 2 | 0.5 |
| `acquisitions.total` | 5343 | 5337 | -0.3 | 19 | 10 | 9 | 1 |
| `acquisitions.reacquired` | 4251 | 4212 | -1.95 | 19 | 10 | 9 | 1 |
| `soldierBeliefs.updates` | 0 | 24509 | 1225.45 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.seen` | 0 | 4574 | 228.7 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.seenRefreshes` | 0 | 146421 | 7321.05 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.told` | 0 | 18434 | 921.7 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.heard` | 0 | 1501 | 75.05 | 5 | 5 | 0 | 0.0625 |
| `soldierBeliefs.expired` | 0 | 10434 | 521.7 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.unknownMen` | 0 | 498 | 24.9 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.activeBySource.seen` | 0 | 540 | 27 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.activeBySource.told` | 0 | 729 | 36.45 | 20 | 20 | 0 | 0 |
| `soldierBeliefs.activeBySource.heard` | 0 | 3 | 0.15 | 1 | 1 | 0 | 1 |
| `combatUrgency.sharedContactReactions` | 2703 | 2451 | -12.6 | 20 | 7 | 13 | 0.2632 |
| `combatUrgency.sharedContactRepeatBlocks` | 212844 | 55638 | -7860.3 | 20 | 0 | 20 | 0 |
| `combatUrgency.sharedContactCooldownBlocks` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `combatUrgency.sharedContactSoundBlocks` | 0 | 428 | 21.4 | 2 | 2 | 0 | 0.5 |
| `combatUrgency.urgentCoverStarts` | 39 | 27 | -0.6 | 12 | 6 | 6 | 1 |
| `combatUrgency.urgentCoverArrivals` | 16 | 13 | -0.15 | 10 | 5 | 5 | 1 |
| `movementGoals.actualChanges` | 34951 | 35196 | 12.25 | 20 | 11 | 9 | 0.8238 |
| `movementGoals.requests` | 168543 | 167693 | -42.5 | 20 | 7 | 13 | 0.2632 |
| `movementGoals.combatIntentRequests` | 499748 | 500748 | 50 | 20 | 10 | 10 | 1 |
| `movementGoals.combatIntentCoalesced` | 355032 | 356965 | 96.65 | 20 | 9 | 11 | 0.8238 |
| `movementGoals.bySource.engagement.requests` | 144596 | 143628 | -48.4 | 20 | 8 | 12 | 0.5034 |
| `movementGoals.bySource.engagement.changes` | 7827 | 7820 | -0.35 | 20 | 11 | 9 | 0.8238 |
| `movementGoals.bySource.squad-stability.requests` | 23827 | 23910 | 4.15 | 20 | 12 | 8 | 0.5034 |
| `movementGoals.bySource.squad-stability.changes` | 25486 | 25643 | 7.85 | 19 | 10 | 9 | 1 |
| `movementGoals.bySource.weapon-cycle.requests` | 120 | 155 | 1.75 | 13 | 8 | 5 | 0.5811 |
| `movementGoals.bySource.weapon-cycle.changes` | 0 | 2 | 0.1 | 2 | 2 | 0 | 0.5 |
| `regroups.regroupRequests` | 534 | 541 | 0.35 | 12 | 7 | 5 | 0.7744 |
| `regroups.suppressed` | 458 | 461 | 0.15 | 12 | 6 | 6 | 1 |
| `regroups.stragglerSuppressions` | 168 | 162 | -0.3 | 10 | 5 | 5 | 1 |
| `regroups.endedContact` | 1 | 1 | 0 | 2 | 1 | 1 | 1 |
| `regroups.endedCohesionRestored` | 73 | 76 | 0.15 | 9 | 6 | 3 | 0.5078 |
| `regroups.endedNewMission` | 1 | 2 | 0.05 | 1 | 1 | 0 | 1 |
| `regroups.endedRetreat` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

soldier-beliefs-0003 55.05 s (timeline) · soldier-beliefs-0008 59.1 s (timeline) · soldier-beliefs-0010 61.05 s (timeline) · soldier-beliefs-0015 63 s (timeline) · soldier-beliefs-0016 63 s (timeline) · soldier-beliefs-0011 65.1 s (timeline) · soldier-beliefs-0020 67.05 s (timeline) · soldier-beliefs-0007 69.15 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=277&view=brain3d) · [the same on this branch's viewer](https://test.ivandpopov.com/grasstex/preview/soldier-beliefs/ai_flow_live.html?bench=277&view=brain3d) (it has the change before it reaches main)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=277`); it opens the seed that parts earliest, and the dropdowns choose another.

