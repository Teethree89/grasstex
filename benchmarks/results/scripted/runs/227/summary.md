# Benchmark run #227 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1&rageGuard=1` · **ON** flags: `rageLock=1&rageGuard=1&rageTrance=1`
- claude/project-thread-1msen6 @ c1a4902 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36943398539) · build v29-dev

## Verdict

**WEAK: 41 of 100 pairs changed (median first part 293.025 s); 2 of 18 counters under p 0.05 (about 0.9 by chance); casualties +0.6% (p 0.8642)**

- Under 0.05 only: fire.hits 11442 to 11818 (+3.3%, p 0.0095); stallOutcomes.wakes 434 to 405 (-6.7%, p 0.049).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **59** · runtime errors off 0 / on 0 · wall time on/off x1.022 (gate 1.25)
- the 40 changed records first part at simulated second: min 127.05, p10 192, median 293.025, p90 390, max 466.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5904 | 5940 | 0.36 | 34 | 18 | 16 | 0.8642 |
| `usKills` | 2805 | 2864 | 0.59 | 35 | 20 | 15 | 0.4996 |
| `geKills` | 3099 | 3076 | -0.23 | 35 | 16 | 19 | 0.7359 |
| `fire.total` | 48691 | 49621 | 9.3 | 39 | 26 | 13 | 0.0533 |
| `fire.hits` | 11442 | 11818 | 3.76 | 39 | 28 | 11 | 0.0095 |
| `retreatSamples` | 116330 | 117787 | 14.57 | 39 | 25 | 14 | 0.1081 |
| `movementResolver.changes` | 447075 | 445990 | -10.85 | 40 | 22 | 18 | 0.6358 |
| `movementStalls.length` | 49 | 54 | 0.05 | 2 | 2 | 0 | 0.5 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 270 | 276 | 0.06 | 33 | 20 | 13 | 0.2962 |
| `loopAlerts.length` | 827 | 850 | 0.23 | 32 | 17 | 15 | 0.8601 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 721 | 732 | 0.11 | 27 | 15 | 12 | 0.7011 |
| `stallOutcomes.wakes` | 434 | 405 | -0.29 | 17 | 4 | 13 | 0.049 |
| `stallOutcomes.repeats` | 116 | 103 | -0.13 | 11 | 4 | 7 | 0.5488 |
| `timeline.stalledOnsets` | 61 | 66 | 0.05 | 2 | 2 | 0 | 0.5 |
| `timeline.stalledSamples` | 2063 | 1919 | -1.44 | 2 | 1 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0035 127.05 s (timeline) · ai-layers-b-20260929-0066 145.05 s (timeline) · ai-layers-b-20260929-0015 180 s (timeline) · ai-layers-b-20260929-0048 192 s (timeline) · ai-layers-b-20260929-0022 223.05 s (timeline) · ai-layers-b-20260929-0099 223.05 s (timeline) · ai-layers-b-20260929-0028 226.05 s (timeline) · ai-layers-b-20260929-0041 229.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=227&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=227`); it opens the seed that parts earliest, and the dropdowns choose another.

