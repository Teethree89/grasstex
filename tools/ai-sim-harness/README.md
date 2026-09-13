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
failure, so it is usable as a pre-commit or CI check. It also prints the outcome of a 10-v-10 fight
so a change in lethality is visible even when every assertion still passes.

Useful for ad-hoc work as well: `bootstrap()` returns the loaded globals, so a throwaway script can
scatter a real cover field, stand up five squads a side, run a few hundred simulated seconds and
print state histograms without opening a browser.
