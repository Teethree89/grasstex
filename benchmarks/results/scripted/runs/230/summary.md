# Benchmark run #230 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+120`

- **OFF** flags: `none` · **ON** flags: `callouts=1`
- claude/project-thread-s6b8cr @ d5bb0e7 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36960733501) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 40.575 s); 5 of 18 counters under p 0.05 (about 0.9 by chance), 3 under 0.0028; casualties -20.2% (p 0.0007)**

- Clears the Bonferroni line (p < 0.0028): movementResolver.changes 185112 to 160655 (-13.2%, p 0); casualties 1538 to 1228 (-20.2%, p 0.0007); stallOutcomes.wakes 247 to 368 (+49.0%, p 0.0015).
- Under 0.05 only: fire.hits 2938 to 2474 (-15.8%, p 0.0334); geKills 844 to 717 (-15.0%, p 0.0352).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.988 (gate 1.25)
- the 94 changed records first part at simulated second: min 2.1, p10 5.1, median 40.575, p90 150, max 194.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1538 | 1228 | -3.1 | 86 | 27 | 59 | 0.0007 |
| `usKills` | 694 | 511 | -1.83 | 82 | 32 | 50 | 0.0598 |
| `geKills` | 844 | 717 | -1.27 | 82 | 31 | 51 | 0.0352 |
| `fire.total` | 13286 | 11755 | -15.31 | 91 | 43 | 48 | 0.6752 |
| `fire.hits` | 2938 | 2474 | -4.64 | 89 | 34 | 55 | 0.0334 |
| `retreatSamples` | 4602 | 3997 | -6.05 | 80 | 31 | 49 | 0.0567 |
| `movementResolver.changes` | 185112 | 160655 | -244.57 | 93 | 19 | 74 | 0 |
| `movementStalls.length` | 4 | 4 | 0 | 4 | 2 | 2 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 3 | 3 | 0 | 4 | 2 | 2 | 1 |
| `loopAlerts.length` | 336 | 275 | -0.61 | 79 | 37 | 42 | 0.653 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 299 | 356 | 0.57 | 56 | 35 | 21 | 0.0814 |
| `stallOutcomes.wakes` | 247 | 368 | 1.21 | 24 | 20 | 4 | 0.0015 |
| `stallOutcomes.repeats` | 65 | 71 | 0.06 | 11 | 6 | 5 | 1 |
| `timeline.stalledOnsets` | 7 | 6 | -0.01 | 4 | 2 | 2 | 1 |
| `timeline.stalledSamples` | 43 | 25 | -0.18 | 4 | 2 | 2 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0089 2.1 s (timeline) · ai-layers-20260929-0022 3 s (timeline) · ai-layers-20260929-0025 3 s (timeline) · ai-layers-20260929-0069 3 s (timeline) · ai-layers-20260929-0060 4.05 s (timeline) · ai-layers-20260929-0100 4.05 s (timeline) · ai-layers-20260929-0004 5.1 s (timeline) · ai-layers-20260929-0005 5.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=230&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=230`); it opens the seed that parts earliest, and the dropdowns choose another.

