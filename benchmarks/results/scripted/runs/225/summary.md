# Benchmark run #225 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `rageLock=1&rageGuard=1` · **ON** flags: `rageLock=1&rageGuard=1&rageTrance=1`
- claude/project-thread-1msen6 @ 27262c6 · [run](https://github.com/APPARANYX/grasstex/actions/runs/36940874246) · build v29-dev

## Verdict

**WEAK: 35 of 100 pairs changed (median first part 297 s); 1 of 18 counters under p 0.05 (about 0.9 by chance); casualties +0.2% (p 0.7011)**

- Under 0.05 only: retreatSamples 116330 to 117898 (+1.3%, p 0.0201).

## Paired comparison (off against on)

- **100** pairs (unpaired: off 0, on 0) · identical in every field: **65** · runtime errors off 0 / on 0 · wall time on/off x0.999 (gate 1.25)
- the 35 changed records first part at simulated second: min 62.1, p10 197.1, median 297, p90 442.05, max 511.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 5904 | 5914 | 0.1 | 27 | 12 | 15 | 0.7011 |
| `usKills` | 2805 | 2798 | -0.07 | 30 | 17 | 13 | 0.5847 |
| `geKills` | 3099 | 3116 | 0.17 | 29 | 15 | 14 | 1 |
| `fire.total` | 48691 | 49882 | 11.91 | 32 | 19 | 13 | 0.3771 |
| `fire.hits` | 11442 | 11511 | 0.69 | 30 | 16 | 14 | 0.8555 |
| `retreatSamples` | 116330 | 117898 | 15.68 | 32 | 23 | 9 | 0.0201 |
| `movementResolver.changes` | 447075 | 451523 | 44.48 | 32 | 19 | 13 | 0.3771 |
| `movementStalls.length` | 49 | 51 | 0.02 | 1 | 1 | 0 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 270 | 283 | 0.13 | 25 | 14 | 11 | 0.69 |
| `loopAlerts.length` | 827 | 851 | 0.24 | 27 | 14 | 13 | 1 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 721 | 728 | 0.07 | 24 | 14 | 10 | 0.5413 |
| `stallOutcomes.wakes` | 434 | 427 | -0.07 | 15 | 5 | 10 | 0.3018 |
| `stallOutcomes.repeats` | 116 | 115 | -0.01 | 8 | 4 | 4 | 1 |
| `timeline.stalledOnsets` | 61 | 63 | 0.02 | 1 | 1 | 0 | 1 |
| `timeline.stalledSamples` | 2063 | 2474 | 4.11 | 1 | 1 | 0 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0024 62.1 s (timeline) · ai-layers-b-20260929-0023 67.05 s (timeline) · ai-layers-b-20260929-0015 180 s (timeline) · ai-layers-b-20260929-0025 197.1 s (timeline) · ai-layers-b-20260929-0022 223.05 s (timeline) · ai-layers-b-20260929-0028 226.05 s (timeline) · ai-layers-b-20260929-0035 229.05 s (stress) · ai-layers-b-20260929-0041 229.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=225&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=225`); it opens the seed that parts earliest, and the dropdowns choose another.

