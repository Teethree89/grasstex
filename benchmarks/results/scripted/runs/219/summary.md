# Benchmark run #219 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1` · **ON** flags: `rageLock=1&rageGuard=1`
- claude/project-thread-1msen6 @ 46fcfbf · [run](https://github.com/APPARANYX/grasstex/actions/runs/36937880736) · build v29-dev

## Verdict

**QUIET: 27 of 100 pairs changed (median first part 249.075 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties -0.6% (p 0.4049)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **73** · runtime errors off 0 / on 0 · wall time on/off x0.987 (gate 1.25)
- the 24 changed records first part at simulated second: min 89.1, p10 106.05, median 249.075, p90 350.1, max 458.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5813 | 5776 | -0.37 | 23 | 9 | 14 | 0.4049 |
| `usKills` | 2686 | 2685 | -0.01 | 22 | 11 | 11 | 1 |
| `geKills` | 3127 | 3091 | -0.36 | 16 | 7 | 9 | 0.8036 |
| `fire.total` | 50578 | 49212 | -13.66 | 23 | 10 | 13 | 0.6776 |
| `fire.hits` | 11196 | 11222 | 0.26 | 22 | 10 | 12 | 0.8318 |
| `retreatSamples` | 120293 | 118995 | -12.98 | 23 | 10 | 13 | 0.6776 |
| `movementResolver.changes` | 444961 | 445322 | 3.61 | 23 | 12 | 11 | 1 |
| `movementStalls.length` | 42 | 43 | 0.01 | 2 | 1 | 1 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 285 | 290 | 0.05 | 15 | 9 | 6 | 0.6072 |
| `loopAlerts.length` | 826 | 815 | -0.11 | 21 | 8 | 13 | 0.3833 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 739 | 744 | 0.05 | 16 | 7 | 9 | 0.8036 |
| `stallOutcomes.wakes` | 375 | 351 | -0.24 | 10 | 2 | 8 | 0.1094 |
| `stallOutcomes.repeats` | 108 | 104 | -0.04 | 6 | 2 | 4 | 0.6875 |
| `timeline.stalledOnsets` | 53 | 54 | 0.01 | 2 | 1 | 1 | 1 |
| `timeline.stalledSamples` | 867 | 866 | -0.01 | 2 | 1 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0048 89.1 s (timeline) · ai-layers-b-20260929-0044 99 s (timeline) · ai-layers-b-20260929-0049 106.05 s (timeline) · ai-layers-b-20260929-0085 111 s (timeline) · ai-layers-b-20260929-0043 113.1 s (timeline) · ai-layers-b-20260929-0084 129 s (timeline) · ai-layers-b-20260929-0042 172.05 s (timeline) · ai-layers-b-20260929-0066 195 s (stress)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=219&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=219`); it opens the seed that parts earliest, and the dropdowns choose another.

