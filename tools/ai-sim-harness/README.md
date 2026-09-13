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

**Whole battlefields.** `bootstrap({sides:true})` additionally loads the scenario generator, the
module registry, the objective service and the attacker/defender stack (`battle-sides.js`,
`defense-plan.js`, capture zones, defence works, engineers). `battlefield(root, {seed, defender})`
then builds what `battle_sim.html` plus `commander-ai.js` would: a generated scenario, a cover
field, five squads a side on the spawn lanes, objectives attached and the module hooks fired. It
stands in for `modules/10-infantry-squad.js`, whose real spawn needs Babylon soldier models, so the
attacker-strength top-up still runs. `runCommanded(root, world, seconds)` steps AI ticks and
commander ticks in the same ratio the live sim does, so objective capture, garrison intent and
engineer jobs actually fire.

Rendering in the shipping modules is guarded on `sim.scene`, which the fake battle does not have,
so none of this needs a renderer. Squads are deliberately *not* given commander routes: a test that
needs intent sets the phase it is testing, which keeps each check about one mechanism. See
`battle/AI_SIDES.md` for the contract these checks cover.

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
(they legitimately might not, if the squad spent them pinned). CI sweeps eight seeds; the sides and engineer checks were swept over forty before landing. It also prints the outcome of a 10-v-10 fight
so a change in lethality is visible even when every assertion still passes.

Useful for ad-hoc work as well: `bootstrap()` returns the loaded globals, so a throwaway script can
scatter a real cover field, stand up five squads a side, run a few hundred simulated seconds and
print state histograms without opening a browser.
