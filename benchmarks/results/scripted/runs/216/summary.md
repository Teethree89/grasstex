# Benchmark run #216 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `rageLock=1`
- claude/project-thread-1msen6 @ e66cfc1 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36937482365) · build v29-dev

## Verdict

**QUIET: 12 of 100 pairs changed (median first part 290.1 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties -0.2% (p 0.4531)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **88** · runtime errors off 0 / on 0 · wall time on/off x0.998 (gate 1.25)
- the 8 changed records first part at simulated second: min 187.05, p10 187.05, median 290.1, p90 507, max 507

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5640 | 5629 | -0.11 | 7 | 2 | 5 | 0.4531 |
| `usKills` | 2520 | 2522 | 0.02 | 6 | 2 | 4 | 0.6875 |
| `geKills` | 3120 | 3107 | -0.13 | 5 | 2 | 3 | 1 |
| `fire.total` | 46992 | 46871 | -1.21 | 7 | 3 | 4 | 1 |
| `fire.hits` | 10784 | 10812 | 0.28 | 6 | 4 | 2 | 0.6875 |
| `retreatSamples` | 118473 | 119717 | 12.44 | 8 | 4 | 4 | 1 |
| `movementResolver.changes` | 452130 | 450673 | -14.57 | 12 | 4 | 8 | 0.3877 |
| `movementStalls.length` | 28 | 28 | 0 | 0 | 0 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 277 | 276 | -0.01 | 5 | 2 | 3 | 1 |
| `loopAlerts.length` | 796 | 794 | -0.02 | 8 | 4 | 4 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 785 | 785 | 0 | 6 | 3 | 3 | 1 |
| `stallOutcomes.wakes` | 383 | 385 | 0.02 | 2 | 1 | 1 | 1 |
| `stallOutcomes.repeats` | 121 | 125 | 0.04 | 2 | 2 | 0 | 0.5 |
| `timeline.stalledOnsets` | 39 | 39 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledSamples` | 755 | 755 | 0 | 0 | 0 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0025 187.05 s (stress) · ai-layers-20260929-0071 197.1 s (timeline) · ai-layers-20260929-0002 244.05 s (timeline) · ai-layers-20260929-0072 245.1 s (stress) · ai-layers-20260929-0051 335.1 s (stress) · ai-layers-20260929-0049 447 s (timeline) · ai-layers-20260929-0043 459 s (stress) · ai-layers-20260929-0008 507 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=216&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=216`); it opens the seed that parts earliest, and the dropdowns choose another.

