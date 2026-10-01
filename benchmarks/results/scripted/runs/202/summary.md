# Benchmark run #202 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- main @ ca14438 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36886170334) · build v29-dev

## Verdict

**MOVED: 100 of 100 pairs changed (median first part 138 s); 1 of 18 counters under p 0.05 (about 0.9 by chance), 1 under 0.0028; casualties -1.9% (p 0.1843)**

- Clears the Bonferroni line (p < 0.0028): regroups.entries 1049 to 1295 (+23.5%, p 0).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.013 (gate 1.25)
- the 100 changed records first part at simulated second: min 48, p10 102, median 138, p90 170.1, max 186

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5844 | 5735 | -1.09 | 96 | 41 | 55 | 0.1843 |
| `usKills` | 2863 | 2804 | -0.59 | 96 | 46 | 50 | 0.7596 |
| `geKills` | 2981 | 2931 | -0.5 | 93 | 41 | 52 | 0.2997 |
| `fire.total` | 114862 | 108850 | -60.12 | 100 | 43 | 57 | 0.1933 |
| `fire.hits` | 10882 | 10946 | 0.64 | 97 | 47 | 50 | 0.8392 |
| `retreatSamples` | 61276 | 59307 | -19.69 | 100 | 40 | 60 | 0.0569 |
| `movementResolver.changes` | 497533 | 496347 | -11.86 | 100 | 47 | 53 | 0.6173 |
| `movementStalls.length` | 40 | 22 | -0.18 | 14 | 6 | 8 | 0.7905 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 281 | 319 | 0.38 | 76 | 43 | 33 | 0.3019 |
| `loopAlerts.length` | 1167 | 1207 | 0.4 | 88 | 48 | 40 | 0.4557 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 1049 | 1295 | 2.46 | 96 | 69 | 27 | 0 |
| `stallOutcomes.wakes` | 381 | 371 | -0.1 | 36 | 18 | 18 | 1 |
| `stallOutcomes.repeats` | 95 | 95 | 0 | 17 | 9 | 8 | 1 |
| `timeline.stalledOnsets` | 45 | 30 | -0.15 | 15 | 6 | 9 | 0.6072 |
| `timeline.stalledSamples` | 719 | 470 | -2.49 | 16 | 7 | 9 | 0.8036 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0077 48 s (timeline) · ai-layers-20260929-0070 83.1 s (timeline) · ai-layers-20260929-0082 88.05 s (timeline) · ai-layers-20260929-0058 92.1 s (timeline) · ai-layers-20260929-0069 92.1 s (timeline) · ai-layers-20260929-0024 98.1 s (timeline) · ai-layers-20260929-0088 98.1 s (timeline) · ai-layers-20260929-0027 99 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=202&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=202`); it opens the seed that parts earliest, and the dropdowns choose another.

