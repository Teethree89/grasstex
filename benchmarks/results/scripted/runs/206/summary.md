# Benchmark run #206 · 100 seeds from `ai-layers-b-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- claude/epic-goldberg-dr09q0 @ 9d5c63c · [run](https://github.com/APPARANYX/grasstex/actions/runs/36886522914) · build v29-dev

## Verdict

**MOVED: 80 of 80 pairs changed (median first part 134.55 s); 5 of 18 counters under p 0.05 (about 0.9 by chance), 4 under 0.0028; casualties -2.9% (p 0.5764)**

- Clears the Bonferroni line (p < 0.0028): retreatSamples 49291 to 305731 (+520.3%, p 0); regroups.entries 869 to 1556 (+79.1%, p 0); movementResolver.changes 406642 to 364360 (-10.4%, p 0.0001); loopAlerts.length 929 to 1109 (+19.4%, p 0.0001).
- Under 0.05 only: stallOutcomes.repeats 50 to 72 (+44.0%, p 0.0309).

## Paired comparison (off against on)

- **80** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.058 (gate 1.25)
- the 80 changed records first part at simulated second: min 65.1, p10 91.05, median 134.55, p90 158.1, max 196.05

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 4736 | 4599 | -1.7125 | 80 | 37 | 43 | 0.5764 |
| `usKills` | 2211 | 2188 | -0.2875 | 78 | 37 | 41 | 0.7343 |
| `geKills` | 2525 | 2411 | -1.425 | 74 | 29 | 45 | 0.0805 |
| `fire.total` | 90476 | 86206 | -53.375 | 80 | 37 | 43 | 0.5764 |
| `fire.hits` | 8922 | 8781 | -1.7625 | 80 | 45 | 35 | 0.3143 |
| `retreatSamples` | 49291 | 305731 | 3205.5 | 80 | 80 | 0 | 0 |
| `movementResolver.changes` | 406642 | 364360 | -528.525 | 80 | 22 | 58 | 0.0001 |
| `movementStalls.length` | 23 | 23 | 0 | 16 | 8 | 8 | 1 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 244 | 255 | 0.1375 | 66 | 31 | 35 | 0.7122 |
| `loopAlerts.length` | 929 | 1109 | 2.25 | 73 | 53 | 20 | 0.0001 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 869 | 1556 | 8.5875 | 72 | 55 | 17 | 0 |
| `stallOutcomes.wakes` | 227 | 255 | 0.35 | 31 | 21 | 10 | 0.0708 |
| `stallOutcomes.repeats` | 50 | 72 | 0.275 | 18 | 14 | 4 | 0.0309 |
| `timeline.stalledOnsets` | 35 | 34 | -0.0125 | 18 | 9 | 9 | 1 |
| `timeline.stalledSamples` | 756 | 1126 | 4.625 | 19 | 10 | 9 | 1 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-b-20260929-0074 65.1 s (timeline) · ai-layers-b-20260929-0072 67.05 s (timeline) · ai-layers-b-20260929-0033 71.1 s (timeline) · ai-layers-b-20260929-0044 74.1 s (timeline) · ai-layers-b-20260929-0075 87 s (timeline) · ai-layers-b-20260929-0058 88.05 s (timeline) · ai-layers-b-20260929-0032 90 s (timeline) · ai-layers-b-20260929-0080 91.05 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=206&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=206`); it opens the seed that parts earliest, and the dropdowns choose another.

