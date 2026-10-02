# Benchmark run #226 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1&rageGuard=1` · **ON** flags: `rageLock=1&rageGuard=1&rageTrance=1`
- claude/project-thread-1msen6 @ c1a4902 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36943396276) · build v29-dev

## Verdict

**QUIET: 41 of 100 pairs changed (median first part 248.1 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties -0.5% (p 0.6177)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **59** · runtime errors off 0 / on 0 · wall time on/off x1.007 (gate 1.25)
- the 39 changed records first part at simulated second: min 99, p10 145.05, median 248.1, p90 429.15, max 555

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5827 | 5795 | -0.32 | 36 | 20 | 16 | 0.6177 |
| `usKills` | 2716 | 2678 | -0.38 | 34 | 16 | 18 | 0.8642 |
| `geKills` | 3111 | 3117 | 0.06 | 33 | 19 | 14 | 0.4869 |
| `fire.total` | 49157 | 48301 | -8.56 | 38 | 23 | 15 | 0.2559 |
| `fire.hits` | 11351 | 11416 | 0.65 | 37 | 21 | 16 | 0.5114 |
| `retreatSamples` | 120560 | 121575 | 10.15 | 38 | 19 | 19 | 1 |
| `movementResolver.changes` | 442868 | 443295 | 4.27 | 38 | 19 | 19 | 1 |
| `movementStalls.length` | 22 | 20 | -0.02 | 2 | 0 | 2 | 0.5 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 297 | 315 | 0.18 | 30 | 15 | 15 | 1 |
| `loopAlerts.length` | 804 | 807 | 0.03 | 32 | 16 | 16 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 699 | 710 | 0.11 | 28 | 15 | 13 | 0.8506 |
| `stallOutcomes.wakes` | 428 | 435 | 0.07 | 16 | 9 | 7 | 0.8036 |
| `stallOutcomes.repeats` | 120 | 121 | 0.01 | 8 | 5 | 3 | 0.7266 |
| `timeline.stalledOnsets` | 30 | 30 | 0 | 3 | 1 | 2 | 1 |
| `timeline.stalledSamples` | 285 | 356 | 0.71 | 3 | 2 | 1 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0073 99 s (timeline) · ai-layers-20260929-0060 112.05 s (timeline) · ai-layers-20260929-0074 127.05 s (timeline) · ai-layers-20260929-0075 145.05 s (timeline) · ai-layers-20260929-0042 147 s (timeline) · ai-layers-20260929-0035 174 s (timeline) · ai-layers-20260929-0043 180 s (timeline) · ai-layers-20260929-0033 184.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=226&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=226`); it opens the seed that parts earliest, and the dropdowns choose another.

