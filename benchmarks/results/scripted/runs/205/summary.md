# Benchmark run #205 · 100 seeds from `ai-layers-20260929` (meeting), windows `contact+480`

- **OFF** flags: `none` · **ON** flags: `stressAct=flee`
- claude/epic-goldberg-dr09q0 @ 9d5c63c · [run](https://github.com/APPARANYX/grasstex/actions/runs/36886517716) · build v29-dev

## Verdict

**MOVED: 85 of 85 pairs changed (median first part 140.1 s); 5 of 18 counters under p 0.05 (about 0.9 by chance), 3 under 0.0028; casualties -3.4% (p 0.2299)**

- Clears the Bonferroni line (p < 0.0028): retreatSamples 52388 to 327691 (+525.5%, p 0); movementResolver.changes 423317 to 378595 (-10.6%, p 0); regroups.entries 920 to 1662 (+80.7%, p 0).
- Under 0.05 only: loopAlerts.length 997 to 1184 (+18.8%, p 0.0059); fire.total 97761 to 93678 (-4.2%, p 0.0295).

## Paired comparison (off against on)

- **85** pairs (unpaired: off 0, on 0) · identical in every field: **0** · runtime errors off 0 / on 0 · wall time on/off x1.078 (gate 1.25)
- the 85 changed records first part at simulated second: min 83.1, p10 103.05, median 140.1, p90 168, max 185.1

| counter | off | on | mean diff per pair | pairs changed | on more | on fewer | sign p |
|---|---:|---:|---:|---:|---:|---:|---:|
| `casualties` | 4990 | 4819 | -2.0118 | 84 | 36 | 48 | 0.2299 |
| `usKills` | 2443 | 2372 | -0.8353 | 83 | 40 | 43 | 0.8264 |
| `geKills` | 2547 | 2447 | -1.1765 | 82 | 40 | 42 | 0.9122 |
| `fire.total` | 97761 | 93678 | -48.0353 | 85 | 32 | 53 | 0.0295 |
| `fire.hits` | 9298 | 9191 | -1.2588 | 85 | 40 | 45 | 0.6646 |
| `retreatSamples` | 52388 | 327691 | 3238.8588 | 85 | 85 | 0 | 0 |
| `movementResolver.changes` | 423317 | 378595 | -526.1412 | 85 | 20 | 65 | 0 |
| `movementStalls.length` | 37 | 33 | -0.0471 | 14 | 9 | 5 | 0.424 |
| `routeStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `targetlessStalls.length` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `vacantObjectiveStalls.length` | 242 | 240 | -0.0235 | 68 | 33 | 35 | 0.9036 |
| `loopAlerts.length` | 997 | 1184 | 2.2 | 77 | 51 | 26 | 0.0059 |
| `writerConflicts` | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| `regroups.entries` | 920 | 1662 | 8.7294 | 79 | 63 | 16 | 0 |
| `stallOutcomes.wakes` | 336 | 321 | -0.1765 | 34 | 17 | 17 | 1 |
| `stallOutcomes.repeats` | 77 | 82 | 0.0588 | 15 | 8 | 7 | 1 |
| `timeline.stalledOnsets` | 42 | 38 | -0.0471 | 15 | 9 | 6 | 0.6072 |
| `timeline.stalledSamples` | 693 | 1208 | 6.0588 | 16 | 10 | 6 | 0.4545 |

With this many counters a p of 0.05 is expected by chance in about one of twenty: read the size and the direction across counters, not one p.

## The 8 seeds that part earliest (simulated seconds)

ai-layers-20260929-0070 83.1 s (timeline) · ai-layers-20260929-0054 88.05 s (timeline) · ai-layers-20260929-0058 92.1 s (timeline) · ai-layers-20260929-0069 92.1 s (timeline) · ai-layers-20260929-0024 98.1 s (timeline) · ai-layers-20260929-0050 98.1 s (timeline) · ai-layers-20260929-0097 101.1 s (timeline) · ai-layers-20260929-0091 102 s (timeline)

## Viewer

[Open both arms in the 3D map](https://test.ivandpopov.com/grasstex/ai_flow_live.html?bench=205&view=brain3d)

The viewer loads `off.json` and `on.json` from the `benchmark-results` branch (`?bench=205`); it opens the seed that parts earliest, and the dropdowns choose another.

