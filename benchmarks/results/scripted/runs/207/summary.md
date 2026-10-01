# Benchmark run #207 · 100 seeds from `window-port-20261001` (meeting), windows `contact+120`

- **OFF** flags: `windowPort=0` · **ON** flags: `none`
- main @ 515d1af · [run](https://github.com/APPARANYX/grasstex/actions/runs/36933925909) · build v29-dev

## Verdict

**QUIET: 98 of 100 pairs changed (median first part 130.05 s); 0 of 18 counters under p 0.05 (about 0.9 by chance); casualties +9.4% (p 0.097)**

- No counter has a sign test under 0.05: no detectable effect on these counters at this many seeds.

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **2** · runtime errors off 0 / on 0 · wall time on/off x0.996 (gate 1.25)
- the 98 changed records first part at simulated second: min 81, p10 105, median 130.05, p90 164.1, max 200.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 1454 | 1590 | 1.36 | 82 | 49 | 33 | 0.097 |
| `usKills` | 688 | 751 | 0.63 | 74 | 37 | 37 | 1 |
| `geKills` | 766 | 839 | 0.73 | 80 | 45 | 35 | 0.3143 |
| `fire.total` | 12981 | 12786 | -1.95 | 90 | 44 | 46 | 0.9161 |
| `fire.hits` | 2789 | 3070 | 2.81 | 88 | 53 | 35 | 0.0693 |
| `retreatSamples` | 3439 | 4034 | 5.95 | 81 | 49 | 32 | 0.0748 |
| `movementResolver.changes` | 195296 | 198143 | 28.47 | 98 | 57 | 41 | 0.1293 |
| `movementStalls.length` | 11 | 8 | -0.03 | 4 | 2 | 2 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 6 | 4 | -0.02 | 6 | 2 | 4 | 0.6875 |
| `loopAlerts.length` | 204 | 189 | -0.15 | 56 | 27 | 29 | 0.8939 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 317 | 310 | -0.07 | 21 | 8 | 13 | 0.3833 |
| `stallOutcomes.wakes` | 240 | 240 | 0 | 0 | 0 | 0 | 1 |
| `stallOutcomes.repeats` | 68 | 68 | 0 | 0 | 0 | 0 | 1 |
| `timeline.stalledOnsets` | 16 | 12 | -0.04 | 5 | 2 | 3 | 1 |
| `timeline.stalledSamples` | 139 | 120 | -0.19 | 5 | 2 | 3 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

window-port-20261001-0090 81 s (timeline) · window-port-20261001-0080 90 s (timeline) · window-port-20261001-0042 92.1 s (timeline) · window-port-20261001-0046 92.1 s (timeline) · window-port-20261001-0071 100.05 s (timeline) · window-port-20261001-0099 100.05 s (timeline) · window-port-20261001-0032 103.05 s (timeline) · window-port-20261001-0051 104.1 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=207&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=207`); it opens the seed that parts earliest, and the dropdowns choose another.

