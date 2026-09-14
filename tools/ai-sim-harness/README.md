# AI sim harness

Runs the battle AI decision stack in node, with no Babylon and no browser.

```
node tools/ai-sim-harness/run.js
```

`harness.js` loads the shipping sources (`battle/obstacle-field.js`, `battle/squad-ai.js`,
`battle/engagement.js`, `battle/modules/16-squad-plan-stability.js`, plus `battle/weapons.js` behind a
tiny BABYLON stub so the weapon stats are the real ones) and supplies two things the browser would
normally provide:

- a fake world: flat or supplied terrain, a plain obstacle list, squads of real `SquadAI` soldiers
  whose `root.position` / `root.rotation` are plain objects;
- a movement integrator that mirrors `stepMovement()` in `battle/battle-sim.js` — speed ramp, crouch
  and crawl speed factors, turn rates, prone cannot walk. **If that function changes, change this
  one too**, or the harness will test behavior the game does not have.

`run.js` asserts the engagement contract (see `battle/AI_ENGAGEMENT.md`) and exits non-zero on
failure, so it is usable as a pre-commit or CI check.

`objective-nav-check.js` is the second suite. It loads the scenario generator, navigation graph,
objective system and commander doctrine instead of the engagement pipeline, and asserts the three
defects the first three 100-battle benchmark runs exposed:

- a soldier is never permanently refused a step against a building (the planner and the movement
  integrator have to agree about which walls are in the way);
- Force Command never sends every squad on a side to the same objective;
- capture progress survives an interrupted hold instead of resetting to zero.

It runs against the worst seeds from `benchmarks/results/runs/{1,2,3}` on the `benchmark-results`
branch, so it reproduces real failing battles rather than invented ones, and it needs no seed sweep:
the scenarios are fixed and the assertions are about mechanism. Both suites run in the deploy
workflow.

The navigation suite also exercises buffered mesh routing, obstructed formation slots, precise
window arrival through doors, and the interaction between regroup timeout and cohesion hysteresis.
Its final movement probes execute the shipping `stepMovement()` with rendering stubbed out,
including checks for smooth aim changes and angle wrapping.

`node tools/ai-sim-harness/impact-fx-check.js` checks ballistic impact materials, cosmetic callback
chaining, blood placement on terrain/building floors, effect budgets, fading, and restart cleanup.
It uses a rendering stub; inspect the effects in Babylon for visual tuning.

**Determinism and the seed sweep.** A run is byte-for-byte reproducible: the harness pins
`Math.random` while sources load and while soldiers are created, because the shipping code seeds a
couple of per-soldier cooldowns from it and one of those decides whether a callout fires — and a
callout draws from the battle's seeded RNG, so a single unseeded value diverges the whole battle.
Soldier ids also reset per scenario so a test cannot depend on how many tests ran before it.

Reproducible is not the same as robust. `HARNESS_SEED=<n>` runs the whole suite against a different
battle; sweep it before trusting a new check:

```
for seed in $(seq 1 40); do HARNESS_SEED=$seed node tools/ai-sim-harness/run.js || break; done
```

A check that passes on one seed and fails on another is testing the dice, not the code. Write
assertions about the mechanism — "a squad that could bound, did", "stance does not oscillate" —
rather than about an outcome the dice control, such as "somebody bounded during these 40 seconds"
(they legitimately might not, if the squad spent them pinned). CI sweeps eight seeds. It also prints the outcome of a 10-v-10 fight
so a change in lethality is visible even when every assertion still passes.

Useful for ad-hoc work as well: `bootstrap()` returns the loaded globals, so a throwaway script can
scatter a real cover field, stand up five squads a side, run a few hundred simulated seconds and
print state histograms without opening a browser.
