# Benchmark run #209 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `stressAct=cower,freeze,rage` · **ON** flags: `none`
- main @ 515d1af · [run](https://github.com/APPARANYX/grasstex/actions/runs/36933932240) · build v29-dev

## Verdict

**MOVED: 97 of 100 pairs changed (median first part 178.05 s); 1 of 18 counters under p 0.05 (about 0.9 by chance), 1 under 0.0028; casualties -0.9% (p 0.9179)**

- Clears the Bonferroni line (p < 0.0028): retreatSamples 62349 to 117480 (+88.4%, p 0).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **3** · runtime errors off 0 / on 0 · wall time on/off x1.008 (gate 1.25)
- the 97 changed records first part at simulated second: min 75.15, p10 134.1, median 178.05, p90 246, max 311.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5814 | 5762 | -0.52 | 94 | 46 | 48 | 0.9179 |
| `usKills` | 2644 | 2661 | 0.17 | 91 | 49 | 42 | 0.5296 |
| `geKills` | 3170 | 3101 | -0.69 | 92 | 43 | 49 | 0.6024 |
| `fire.total` | 47211 | 49903 | 26.92 | 95 | 54 | 41 | 0.2181 |
| `fire.hits` | 11226 | 11150 | -0.76 | 94 | 47 | 47 | 1 |
| `retreatSamples` | 62349 | 117480 | 551.31 | 97 | 87 | 10 | 0 |
| `movementResolver.changes` | 455613 | 444715 | -108.98 | 96 | 40 | 56 | 0.1253 |
| `movementStalls.length` | 49 | 42 | -0.07 | 12 | 6 | 6 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 288 | 294 | 0.06 | 68 | 34 | 34 | 1 |
| `loopAlerts.length` | 742 | 828 | 0.86 | 81 | 49 | 32 | 0.0748 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 792 | 739 | -0.53 | 86 | 37 | 49 | 0.2354 |
| `stallOutcomes.wakes` | 370 | 375 | 0.05 | 51 | 27 | 24 | 0.7798 |
| `stallOutcomes.repeats` | 112 | 112 | 0 | 30 | 17 | 13 | 0.5847 |
| `timeline.stalledOnsets` | 59 | 53 | -0.06 | 12 | 6 | 6 | 1 |
| `timeline.stalledSamples` | 720 | 867 | 1.47 | 13 | 8 | 5 | 0.5811 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0058 75.15 s (timeline) · ai-layers-b-20260929-0028 93 s (timeline) · ai-layers-b-20260929-0039 93 s (timeline) · ai-layers-b-20260929-0054 93 s (timeline) · ai-layers-b-20260929-0043 113.1 s (timeline) · ai-layers-b-20260929-0044 116.1 s (timeline) · ai-layers-b-20260929-0048 118.05 s (timeline) · ai-layers-b-20260929-0012 127.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=209&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=209`); it opens the seed that parts earliest, and the dropdowns choose another.

