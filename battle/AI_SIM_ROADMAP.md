# Battle Sim / AI Roadmap

Status baseline: **v136** (`2a82fef3d4c97ffd9d1f8be517baaa9987fdf603`)

This is the working checklist for the Battle Sim / AI simplification effort. The design rule is **one owner per responsibility, minimal module count, very little overlap, purpose-built behavior, and fixes at the producer/owner layer rather than another interception patch.**

## Immediate sequence

- [ ] **Visually validate v136 at 8x.**
  - Watch for inexplicable stops.
  - Watch for destination A -> B -> A ping-pong.
  - Watch for abandoned/idle stragglers.
  - Confirm soldiers resume movement after combat.
  - Confirm bounding still looks natural rather than stop/start mechanical.
  - Confirm no obstacle/hedgerow destination loops have returned.
  - Export a full diagnostic after a representative full run.

- [ ] **Measure whether v136's combat-locomotion ownership change worked.**
  - Compare `intentRequests`, `intentPublishes`, and `intentCoalesced` in Combat Mobility.
  - Confirm Engagement is no longer a normal destination writer.
  - Track movement-resolver requests vs actual destination changes.
  - Track writer conflicts and position-seeking alerts.
  - Track route stalls, movement stalls, recoveries, unreachable flags, and active-stuck count.
  - Preserve visual behavior as the primary acceptance criterion; low alert counts are not proof of good movement by themselves.

- [ ] **Run a fresh 100-battle v136 benchmark.**
  - Compare against the salvaged 80-battle v135 checkpoint.
  - Primary comparison metrics: strategic health, cohesion, objective spread/progress, writer conflicts, loop alerts, movement stalls, route stalls, resolver changes, runtime errors, and outcomes.
  - Benchmark infrastructure now merges healthy shards even when another shard fails and records the result as partial.

## Next architectural simplification

- [ ] **Simplify the Commander -> Squad Command side of the stack.**
  - Commander owns strategic intent: objective/advance/hold/retreat/regroup.
  - Squad Command owns one stable squad/fireteam locomotion order per soldier.
  - A stable order should be published only when it materially changes, not every AI tick.
  - Audit overlapping responsibility in/around:
    - `16-squad-plan-stability`
    - commander lease/reconsideration behavior
    - regroup handling
    - `43-squad-forward-progress`
    - `52-survival-tactical-route`
    - any remaining code that can mutate squad intent or republish formation destinations
  - Delete or merge redundant producers rather than adding another resolver blocker.

- [ ] **Finish the intended locomotion ownership model.**
  - **Squad Command:** normal strategic/formation locomotion.
  - **Engagement:** combat state, target selection/reacquisition, stance, suppression/fire control; no direct locomotion ownership.
  - **Combat Mobility:** sole combat-locomotion owner (hold, cover displacement, authorized bound, assault movement, urgent displacement).
  - **Movement Resolver:** arbitrate legitimate Squad Command vs Combat Mobility intent; do not act as a garbage collector for redundant producers.
  - **Movement Execution:** route and physically execute the winning intent; no strategic decision ownership.

- [ ] **Audit remaining destination ping-pong at the producer level.**
  - Stable formation orders must remain stable while squad intent is stable.
  - Target reacquisition must not rewrite locomotion unless combat movement mode actually changes.
  - No A -> B -> A destination sequence within one AI tick.
  - Temporary combat movement must return cleanly to the same stable squad order.
  - Stable fireteam orders should not be republished at ~6.7 Hz.

## Recovery and routing cleanup

- [ ] **Keep recovery lean.**
  - Preferred episode: detect -> confirm -> rebuild once -> observe -> alternate once -> observe -> unreachable.
  - Recovery/progress code observes execution failure; it must not become another strategic destination owner.
  - Normal retreat traversal with a valid physical route should not be mislabeled as stuck/unreachable.

- [ ] **Keep tactical routing subordinate to strategic intent.**
  - Tactical routes may substitute local legal waypoints/cover/door approaches.
  - Tactical routing must not replace or resurrect an obsolete strategic objective.
  - Invalid final waypoints stay subject to the v134 overlap-backtracking invariant and are rewritten to the legal point rather than repeatedly recovered from.

## Systems to freeze unless a deterministic regression proves otherwise

- [x] **Hedgerow/body-width physical clearance.** Narrow gaps smaller than the soldier clearance envelope are rejected.
- [x] **Illegal destination handling.** Final destinations overlapping hard geometry are backed down the incoming route until legal; committed tactical steps are rewritten to the corrected point.
- [x] **Tactical hardpoint/window reservation manager.** Preserve its single-owner reservation/ingress behavior.
- [x] **Personal-space separation.** Keep separate from strategic/tactical locomotion ownership.
- [x] **Telemetry serialization.** One request in flight, small batches, bounded queue; do not reintroduce overlapping POST storms.

Do **not** rewrite pathfinding, obstacle thickness, soldier body clearance, or hedge micro-gap logic unless a deterministic regression demonstrates a real failure.

## Broader tactical-AI work after locomotion ownership stabilizes

- [ ] Validate attacker/defender doctrine across multiple deterministic seeds.
- [ ] Validate prepared-defender positioning and hardpoint use.
- [ ] Validate engineer fortification siting/work limits and LOS behavior.
- [ ] Validate objective assignment/spread and commander doctrine without reintroducing decision-cycle churn.
- [ ] Preserve ammo/reload/stoppage behavior, window ingress, cover use, suppression, and basic fire-and-movement while simplifying surrounding orchestration.

## Regression gates to preserve/expand

- [ ] Stable formation order remains unchanged while squad intent is unchanged.
- [ ] Engagement target reacquisition does not rewrite locomotion unless movement mode changes.
- [ ] No destination A -> B -> A within one AI tick.
- [ ] A valid reachable movement order continues unless the soldier is explicitly in a named stopping state (hold/station/reload/cover/orient/etc.).
- [ ] Temporary combat-state expiration returns to the stable squad order.
- [ ] Stable fireteam order is not republished continuously.
- [ ] Existing objective/navigation, tactical-position, impact-FX, and all 8 deterministic engagement-seed suites stay green.
- [ ] Re-run the benchmark after each material ownership simplification, not after every small implementation edit.

## CI / housekeeping after gameplay stabilizes

- [ ] Clean up GitHub Actions deprecation warnings (for example older Node-targeted action versions) after gameplay architecture is stable.
- [ ] Keep benchmark workflow partial-shard salvage behavior.
- [ ] Keep benchmark source verification pinned to code already on `main`.

## Completed milestones

- [x] v128 retained as the preferred/golden movement-feel reference.
- [x] v129-style episode recovery replaced pathological repeated recovery escalation.
- [x] Assault commitment survives brief target/LOS flicker.
- [x] v132 removed the worst legacy formation-shadow ownership fight without carrying the large v130 blocker stack.
- [x] v133/v134 established legal physical endpoints and eliminated the recover -> return-to-impossible-point loop.
- [x] v135 reduced the overlapping tactical movement/control stack from roughly 10 modules to 3 primary owners and substantially improved stuck/route behavior.
- [x] Benchmark run #17's eight healthy shards were salvaged into an 80-battle v135 baseline; shard crashes exposed and led to a fix for the null assault target race.
- [x] Benchmark workflow now merges available healthy shards rather than discarding the entire run.
- [x] v136 makes Combat Mobility the combat-locomotion publisher; Engagement delegates movement requests instead of acting as an independent destination writer.
- [x] Combat Mobility coalesces repeated materially identical combat movement intents before publishing them to the resolver.

## Architectural north star

The desired runtime is conceptually:

`Commander -> Squad Command -> (Combat state -> Combat Mobility when needed) -> Movement Resolver -> Movement Execution -> Physical Navigation`

Each arrow should represent a clear ownership boundary. If diagnostics show enormous numbers of rejected/no-op requests, treat that as evidence of a redundant producer to remove, not a reason to add another interception layer.
