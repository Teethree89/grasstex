# Benchmark run #215 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+600`

- **OFF** flags: `none` · **ON** flags: `slStress=all`
- claude/project-thread-s8qgm5 @ 73c20d8 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36937054951) · build v29-dev

## Verdict

**QUIET: 100 of 100 pairs changed (median first part 160.05 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties +2.4% (p 0.6101)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x0.983 (gate 1.25)
- the 100 changed records first part at simulated second: min 86.1, p10 120, median 160.05, p90 211.05, max 394.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5710 | 5845 | 1.35 | 96 | 51 | 45 | 0.6101 |
| `usKills` | 2553 | 2741 | 1.88 | 93 | 50 | 43 | 0.5341 |
| `geKills` | 3157 | 3104 | -0.53 | 97 | 42 | 55 | 0.2229 |
| `fire.total` | 47055 | 50829 | 37.74 | 100 | 53 | 47 | 0.6173 |
| `fire.hits` | 10955 | 11378 | 4.23 | 96 | 49 | 47 | 0.9188 |
| `retreatSamples` | 128159 | 134356 | 61.97 | 100 | 51 | 49 | 0.9204 |
| `movementResolver.changes` | 458637 | 448385 | -102.52 | 100 | 45 | 55 | 0.3682 |
| `movementStalls.length` | 28 | 27 | -0.01 | 14 | 9 | 5 | 0.424 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 282 | 306 | 0.24 | 75 | 40 | 35 | 0.6445 |
| `loopAlerts.length` | 809 | 804 | -0.05 | 87 | 43 | 44 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 788 | 720 | -0.68 | 94 | 39 | 55 | 0.1214 |
| `stallOutcomes.wakes` | 417 | 480 | 0.63 | 59 | 36 | 23 | 0.1175 |
| `stallOutcomes.repeats` | 140 | 140 | 0 | 37 | 17 | 20 | 0.7428 |
| `timeline.stalledOnsets` | 39 | 34 | -0.05 | 13 | 9 | 4 | 0.2668 |
| `timeline.stalledSamples` | 755 | 394 | -3.61 | 15 | 10 | 5 | 0.3018 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0029 86.1 s (stress) · ai-layers-20260929-0030 97.05 s (timeline) · ai-layers-20260929-0013 102 s (timeline) · ai-layers-20260929-0008 112.05 s (timeline) · ai-layers-20260929-0056 113.1 s (timeline) · ai-layers-20260929-0009 114 s (stress) · ai-layers-20260929-0061 117 s (timeline) · ai-layers-20260929-0100 117 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=215&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=215`); it opens the seed that parts earliest, and the dropdowns choose another.

