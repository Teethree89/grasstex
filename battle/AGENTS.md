# Battle Sim / M3C Engineering Instructions

These instructions apply to work under `battle/` and to Battle Sim harness/benchmark code that exists to validate it.

## Prime directive: do not patch symptoms into oblivion

The Battle Sim is being simplified into **M3C — Macro / Meso / Micro Combat**. Prefer finding the owner of a bad behavior and correcting the invariant at that owner. Do **not** accumulate cooldowns, bypasses, blockers, hysteresis, retries, special cases, or extra movement writers merely because they make one diagnostic counter improve.

A fix is good when it makes the architecture easier to explain after the change, not harder.

## Evidence-first workflow

For any behavioral or performance regression, use this order:

1. **Reproduce the exact failure.** Prefer the user's seed/scenario and the scenario class that exposes it most reliably.
2. **Measure before editing.** Inspect full diagnostics, destination history, ownership/provenance, route state, movement state, tactical-position state, and relevant performance counters.
3. **Name the broken invariant.** Write one sentence such as: "A soldier in retreat with a legal destination must continue moving unless a named physical stop state exists."
4. **Identify the owning M3C layer and one owning subsystem.** Macro, Meso, Micro, or Physical Execution. If two systems appear to own the same thing, treat the overlap itself as a likely bug.
5. **Trace the producer, not only the resolver/consumer.** High rejected/no-op counts mean find who is producing them. Do not make the resolver smarter just to absorb bad upstream behavior.
6. **Create or extend a deterministic regression test that demonstrates the failure before the fix whenever practical.** The test should assert behavior/invariants, not implementation trivia.
7. **Make the smallest structural fix at the owner.** Prefer deleting/replacing redundant logic over adding another layer.
8. **Re-run the exact same seed/test and compare before/after metrics.** Do not infer success from green CI alone.
9. **Then run the broader regression suite.** Objective/navigation, tactical positions, engagement seeds, impact tests, and relevant M3C checks.
10. **Benchmark only after a material ownership/behavior change is stable.** Use the standard 60 meeting / 20 US-defend / 20 GE-defend benchmark for routine checkpoints; reserve the 300-battle matrix for major milestones.

## Benchmark performance is a regression gate

Benchmark wall time is evidence about the runtime, not merely CI inconvenience. A standard shard currently represents **10 full 600-second battles at a fixed 0.15-second simulation step**. Reducing the number of shards changes total sample size/runner cost but does not make an individual 10-battle shard cheaper.

When benchmark runtime rises materially:

- **Do not hide the regression** by increasing the fixed simulation step, shortening battles, disabling gameplay systems, weakening diagnostics, or reducing the battle count before the cause is understood.
- Compare **per-battle wall seconds**, median/p95 wall time by scenario, and simulated-seconds-per-wall-second against an accepted baseline using the same seed/profile.
- Treat roughly **>25% median slowdown on the same benchmark profile** as a stop-and-profile condition unless there is an understood intentional cost.
- Profile in the **benchmark harness first**, preferably by wrapping existing hot functions without changing production behavior. Measure call count and inclusive wall time for at least: obstacle-field LOS/cover/nearby queries, navigation/path search, Movement Resolver (including combat-intent coalescing), Squad Command, tactical-position ingress, personal-space correction, and Commander updates.
- If one subsystem dominates, fix its algorithm/data representation/caching at the owning layer. Do not add a new runtime module merely to make the profiler quieter.
- Preserve determinism and gameplay semantics while optimizing. A faster benchmark that simulates different behavior is not a valid optimization.
- Keep benchmark setup/install time separate from battle wall time; the benchmark already records each battle's `wallSeconds`, which is the primary simulation-performance measurement.

A benchmark performance regression should end with the same root-cause chain as a behavioral bug: **observed slowdown -> measured hot path -> owning subsystem -> broken performance invariant -> structural optimization -> same-seed before/after wall time + behavior checks**.

## Anti-patch rules

- **One owner per responsibility.** Never introduce a second normal writer for a field or movement intent already owned elsewhere.
- **No new module for a one-off symptom** unless the new responsibility is genuinely unique and cannot live at an existing M3C owner.
- **No new blocker/interceptor** merely to suppress a producer that can be removed or corrected upstream.
- **A command hold is a lease.** A new commitment that blocks another layer's intent change (hold, wait, cooldown, commitment window) is granted through `BattleLeases` with an owner, reason and release path, not stored as a new `...Until` field. See Step 4 in `AI_COMMAND_HIERARCHY_PLAN.md`.
- **No silent state machines.** Any new persistent state must have a clearly named lifecycle: who creates it, who owns it, what invalidates it, and how it is observed in diagnostics.
- **No broad cooldown/hysteresis fix without evidence.** A timing gate must correspond to a real doctrinal/physical commitment, not mask oscillation.
- **No duplicate recovery systems.** Physical recovery remains a bounded execution concern; it must not become another command layer.
- **Do not modify path clearance/body-width/hedgerow geometry to fix command churn.** Those systems are frozen unless a deterministic physical-navigation regression proves they are wrong.
- **Do not optimize diagnostic scores directly.** Improve the underlying behavior; counters are evidence, not goals.
- **Do not preserve compatibility code indefinitely if it still produces runtime work.** Compatibility views may expose old metric names, but dead ownership paths should be deleted.
- **Keep the M3C behaviour files formatted.** Command, squad, engagement, movement and weapon-rule files are Prettier-formatted with the repo's `.prettierrc.json` (`npx prettier@3 --write <file>`), so logic reads one statement per line. Do not hand-compress them back into long single lines.
- **Extend AI behaviour through declared slots, never by replacing a function.** `SquadAI` (fire gates, shot model, after-shot, before/after soldier tick) and `BattleEngagement` (after-drill) declare their extension points and the order they run in; add a new id to that declared order and attach with `extend(stage,id,fn)`. Reassigning `SquadAI.tryFire`, `updateSoldier` and the like makes behaviour depend on module file order - `14-z-ballistic-raycast.js` once silently discarded the LOS gate that way. `tools/ai-sim-harness/extension-order-check.js` guards this.

## Stop-and-reassess triggers

Stop coding and re-evaluate ownership before adding more logic if any of these are true:

- the proposed fix requires guards in two or more unrelated runtime modules;
- a fix introduces a new timer/cooldown to counter another timer/cooldown;
- A -> B -> A destination churn remains but the proposed change is in Movement Resolver rather than the producer;
- a soldier has a legal destination but is stationary and diagnostics say `stuck=false` — first find the exact movement gate holding him;
- tactical-position reservations are unique but bodies still stack — distinguish reservation ownership from physical ingress/occupancy before editing either;
- benchmark runtime rises sharply — profile per-battle wall time and hot counters before simplifying or adding geometry;
- a change improves metrics but looks visibly worse than the accepted movement feel;
- the explanation of the system gets longer after the fix.

When one of these occurs, produce a short root-cause note containing: **observed behavior -> evidence -> owner -> broken invariant -> proposed structural fix -> regression test**. Do not implement until that chain is coherent.

## Change discipline / avoiding repeated detach-revert cycles

For material architecture changes:

- preserve an accepted baseline commit/tag before the change;
- make one conceptual change per commit where possible;
- use a temporary branch when the change crosses an M3C ownership boundary or touches multiple hot-path systems;
- validate deterministically and with the same live seed before merging;
- never claim visual/browser validation unless it was actually performed;
- if a candidate regresses movement feel badly, revert the candidate as a unit rather than layering compensating patches on top of it.

Small, isolated bug fixes with a proven root cause may still go directly to `main`.

## M3C ownership contract

### Macro — General / Force Command
Owns mission/objective selection, force allocation, attack/defend/hold/regroup/retreat intent, broad route/axis, and strategic priority changes.

Macro must not choose soldier cover, formation slots, local obstacle detours, or final soldier destinations.

### Meso — Captain / Squad Command
Owns the stable squad plan: fireteam organization, formation/tasks, defensive posts, cohesion/regroup decisions, bounds, local pauses, and translation of Macro intent into committed fireteam orders.

Meso orders are commitments. Contact flicker must not continuously rewrite them.

### Micro — Soldier / Situation
Owns perception, target state, stance, firing/reload/stoppage, local cover, suppression response, and combat displacement proposed straight to the Movement Resolver.

Micro may alter local execution but must not choose a new strategic objective or erase a still-valid Captain plan.

### Physical execution
Movement Resolver chooses between legitimate Meso and Micro locomotion intents. Movement Execution/Navigation routes and physically executes the winner. Personal space and body legality remain local physical invariants.

The desired chain is:

`General -> Captain/Squad Plan -> Soldier Situation/Engagement -> Movement Resolver -> Movement Execution -> Navigation`

## Current diagnostic lesson (v140)

Do not assume the latest Meso cleanup solved every symptom. The current German-defense diagnostics show several distinct issues that must be investigated separately rather than patched together:

- tactical-position **reassignments are already 0**, yet reservation collisions and visible window/ingress crowding remain high — reservation ownership and physical stacking are different problems;
- personal-space diagnostics recorded exact overlaps, so visible multi-stacks require physical/ingress analysis rather than another hardpoint ownership rule;
- multiple retreating soldiers had distant, legal `squad-command/retreat` destinations while `moving=false` / `moveSpeed=0`, but Movement Progress reported no active stuck state — find the exact movement gate before changing retreat command logic;
- `formationShadowsIgnored` collapsed to 0, proving one redundant producer was removed (the legacy `SquadAI.issueOrders` producer and the resolver's shadow guard were deleted on 2026-09-24), but `squad-stability` still accounts for a large request stream — trace what still calls the resolver rather than adding another suppression counter.

These are measurements to investigate, not invitations to add four patches.

## Reference

See `battle/AI_SIM_ROADMAP.md` for the current M3C roadmap, accepted milestones, frozen systems, regression gates, and benchmark plan.
