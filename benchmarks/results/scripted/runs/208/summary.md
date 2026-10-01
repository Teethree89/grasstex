# Benchmark run #208 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `stressAct=cower,freeze,rage` · **ON** flags: `none`
- main @ 515d1af · [run](https://github.com/APPARANYX/grasstex/actions/runs/36933929002) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 176.55 s); 2 of 18 counters under p 0.05 (about 0.9 by chance), 1 under 0.0028; casualties -2.4% (p 0.0822)**

- Clears the Bonferroni line (p < 0.0028): retreatSamples 62075 to 118473 (+90.9%, p 0).
- Under 0.05 only: vacantObjectiveStalls.length 339 to 277 (-18.3%, p 0.0066).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.999 (gate 1.25)
- the 100 changed records first part at simulated second: min 98.1, p10 132, median 176.55, p90 238.05, max 311.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5777 | 5640 | -1.37 | 96 | 39 | 57 | 0.0822 |
| `usKills` | 2689 | 2520 | -1.69 | 90 | 36 | 54 | 0.0725 |
| `geKills` | 3088 | 3120 | 0.32 | 91 | 52 | 39 | 0.2082 |
| `fire.total` | 47306 | 46992 | -3.14 | 98 | 47 | 51 | 0.762 |
| `fire.hits` | 11279 | 10784 | -4.95 | 97 | 40 | 57 | 0.1038 |
| `retreatSamples` | 62075 | 118473 | 563.98 | 100 | 93 | 7 | 0 |
| `movementResolver.changes` | 458788 | 452130 | -66.58 | 100 | 49 | 51 | 0.9204 |
| `movementStalls.length` | 22 | 28 | 0.06 | 11 | 5 | 6 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 339 | 277 | -0.62 | 79 | 27 | 52 | 0.0066 |
| `loopAlerts.length` | 789 | 796 | 0.07 | 90 | 49 | 41 | 0.4608 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 743 | 785 | 0.42 | 83 | 44 | 39 | 0.6609 |
| `stallOutcomes.wakes` | 465 | 383 | -0.82 | 51 | 22 | 29 | 0.4011 |
| `stallOutcomes.repeats` | 124 | 121 | -0.03 | 36 | 16 | 20 | 0.6177 |
| `timeline.stalledOnsets` | 26 | 39 | 0.13 | 12 | 5 | 7 | 0.7744 |
| `timeline.stalledSamples` | 907 | 755 | -1.52 | 12 | 5 | 7 | 0.7744 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0029 98.1 s (timeline) · ai-layers-20260929-0084 110.1 s (timeline) · ai-layers-20260929-0048 112.05 s (timeline) · ai-layers-20260929-0061 113.1 s (timeline) · ai-layers-20260929-0069 120 s (timeline) · ai-layers-20260929-0009 124.05 s (timeline) · ai-layers-20260929-0016 124.05 s (timeline) · ai-layers-20260929-0028 124.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=208&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=208`); it opens the seed that parts earliest, and the dropdowns choose another.

