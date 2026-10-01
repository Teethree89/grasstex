# Benchmark run #224 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1&rageGuard=1` · **ON** flags: `rageLock=1&rageGuard=1&rageTrance=1`
- claude/project-thread-1msen6 @ 27262c6 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36940871355) · build v29-dev

## Verdict

**QUIET: 39 of 100 pairs changed (median first part 269.1 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties -0.7% (p 0.3771)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **61** · runtime errors off 0 / on 0 · wall time on/off x0.971 (gate 1.25)
- the 39 changed records first part at simulated second: min 86.1, p10 147, median 269.1, p90 458.1, max 561.15

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5827 | 5785 | -0.42 | 32 | 19 | 13 | 0.3771 |
| `usKills` | 2716 | 2693 | -0.23 | 33 | 18 | 15 | 0.7283 |
| `geKills` | 3111 | 3092 | -0.19 | 30 | 17 | 13 | 0.5847 |
| `fire.total` | 49157 | 49520 | 3.63 | 36 | 22 | 14 | 0.243 |
| `fire.hits` | 11351 | 11368 | 0.17 | 34 | 21 | 13 | 0.2295 |
| `retreatSamples` | 120560 | 119287 | -12.73 | 34 | 13 | 21 | 0.2295 |
| `movementResolver.changes` | 442868 | 444252 | 13.84 | 36 | 23 | 13 | 0.1325 |
| `movementStalls.length` | 22 | 24 | 0.02 | 2 | 2 | 0 | 0.5 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 297 | 304 | 0.07 | 28 | 13 | 15 | 0.8506 |
| `loopAlerts.length` | 804 | 806 | 0.02 | 31 | 17 | 14 | 0.7201 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 699 | 724 | 0.25 | 27 | 15 | 12 | 0.7011 |
| `stallOutcomes.wakes` | 428 | 456 | 0.28 | 14 | 9 | 5 | 0.424 |
| `stallOutcomes.repeats` | 120 | 135 | 0.15 | 7 | 6 | 1 | 0.125 |
| `timeline.stalledOnsets` | 30 | 31 | 0.01 | 3 | 2 | 1 | 1 |
| `timeline.stalledSamples` | 285 | 423 | 1.38 | 3 | 2 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0012 86.1 s (timeline) · ai-layers-20260929-0097 106.05 s (timeline) · ai-layers-20260929-0060 112.05 s (timeline) · ai-layers-20260929-0042 147 s (timeline) · ai-layers-20260929-0020 167.1 s (timeline) · ai-layers-20260929-0043 180 s (timeline) · ai-layers-20260929-0033 184.05 s (timeline) · ai-layers-20260929-0086 187.05 s (stress)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=224&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=224`); it opens the seed that parts earliest, and the dropdowns choose another.

