# Battle Sim / AI Roadmap — M3C

Status baseline: **v136** (`2a82fef3d4c97ffd9d1f8be517baaa9987fdf603`)

The combat engine architecture is **M3C: Macro–Meso–Micro Combat**. The design rule is **one owner per responsibility, minimal module count, very little overlap, purpose-built behavior, and fixes at the producer/owner layer rather than another interception patch.**

## M3C command hierarchy

### Macro — General / Force Command

**Question:** *What are we trying to accomplish?*

Owns force-level intent only:
- objective selection and force allocation;
- attack / defend / hold / regroup / retreat priorities;
- broad axis / route and reserve employment;
- when strategic priorities materially change.

Macro may assign a mission to a squad. It must **not** choose a soldier's cover point, formation slot, obstacle detour or final destination.

### Meso — Captain / Squad Command

**Question:** *How will this squad accomplish the mission?*

Owns one stable local plan:
- squad/fireteam formation and task organization;
- approach / support-by-fire / maneuver / assault / defensive-post plan;
- cohesion and regroup decisions;
- authorization of bounds and local pauses;
- translation of the General's mission into stable fireteam orders.

A Meso order is a commitment, not a point republished every AI tick. Contact/target flicker must not silently rewrite a still-valid Captain plan.

### Micro — Soldier / Situation

**Question:** *How do I execute my part right now?*

Owns immediate execution:
- perception, target tracking, stance, fire/reload/stoppage;
- local cover and combat displacement through Combat Mobility;
- physical route/door/window/hedge avoidance through Movement Execution and Navigation;
- personal space and legal body placement;
- final physical execution of the currently winning Meso/Micro movement intent.

A soldier may alter the **local execution** of an order because of terrain, suppression or an immediate threat. The soldier does not choose a new strategic objective.

### M3C information contract

Intent flows **down**:

`General (Macro) -> Captain / Squad Plan (Meso) -> Soldier Situation (Micro)`

State flows **up**:

`Soldier status -> Squad status -> Force status`

No layer should continuously rewrite another layer's state. In particular:
- Macro does not micromanage soldier destinations.
- Meso does not perform obstacle avoidance.
- Micro does not select objectives.
- Engagement owns combat state, not an independent locomotion channel.
- Combat Mobility is the sole Micro combat-locomotion publisher.
- The Movement Resolver arbitrates legitimate Meso vs Micro locomotion; it is not a garbage collector for redundant producers.

The desired runtime is conceptually:

`General / Force Command -> Captain / Squad Command -> Engagement state -> Combat Mobility (when needed) -> Movement Resolver -> Movement Execution -> Physical Navigation`

## v137 M3C foundation pass — current work

The v136 visual runs exposed two independent problems: Meso plan instability (A -> B -> A defensive/formation orders and forward outrunners) and a world-model mismatch where hedges were different objects for rendering, navigation and LOS.

- [x] **1. One authoritative hedgerow definition.**
  - Hedge rendering, navigation, LOS, cover and ballistics consume the same short oriented terrain-prism records.
  - Remove the old combination of a visual box + navigation OBB + sampled giant LOS circles.

- [x] **2. Bocage-scale volume.**
  - Initial authoritative hedge volume is 2.2 m wide and 2.2 m opaque above terrain.
  - Hedge lines are split into short terrain-following chunks and buried slightly into the terrain so rolling ground cannot open a slit underneath them.

- [x] **3. Ground navigation remains 2D, but soldier occupancy is body-sized.**
  - Destination remains a ground point.
  - The physical question is whether the soldier's 0.45 m body radius can stand at that point against the projected hedge prism.
  - Do not replace grounded infantry navigation with destination spheres.

- [x] **4. LOS and bullets use the same 3D prism.**
  - Stance-aware eye/shot rays test the true horizontal footprint and vertical hedge extent.
  - A prone ray and a standing 1.55 m eye ray cannot pass through a 2.2 m bocage volume merely because navigation is 2D.

- [x] **5. Remove the near-cover LOS bypass.**
  - Being close to cover no longer makes the entire obstacle disappear from the sight test.
  - Seeing/shooting over or around cover must result from the actual 3D ray missing the volume.

- [x] **6. World Debug shows the occupancy invariant directly.**
  - Magenta final-destination ring is the actual soldier body radius centered on the final legalized destination.
  - Raw squad/fireteam intent remains separate as crosses.
  - Hedge cover/LOS debug uses the same oriented footprint as the authoritative hedge volume.

- [x] **7. Stabilize the Meso Captain plan.**
  - Defensive posts persist through transient contact instead of toggling formation -> post -> formation.
  - Fireteam commitment signatures no longer include engagement-plan serials.
  - Cohesion may temporarily forgive lagging stragglers, but never ignores forward outrunners; men sprinting ahead remain in the core cohesion calculation.

- [ ] Run deterministic M3C regression gates and correct any failures without adding a new ownership layer.
- [ ] Visually validate v137 in **German defending** and **both sides attacking** scenarios before accepting it over v136.
- [ ] After visual validation, run a fresh benchmark against the salvaged 80-battle v135 checkpoint and v136 diagnostics.

## Next architectural simplification

- [ ] **Finish simplifying the Commander -> Squad Command boundary.**
  - Commander owns strategic intent: objective/advance/hold/retreat/regroup.
  - Squad Command owns one stable squad/fireteam locomotion order per soldier.
  - A stable order should be published only when it materially changes, not every AI tick.
  - Audit overlapping responsibility in/around commander reconsideration, forward-progress observation and tactical-route substitution.
  - Delete or merge redundant producers rather than adding another resolver blocker.

- [ ] **Remove the remaining legacy formation-shadow producer upstream.**
  - `formationShadowsIgnored` was useful proof of the ownership conflict, not the desired steady-state architecture.
  - Once Squad Command owns fireteam slots, the legacy individual formation proposal should not be generated simply to be rejected.

- [ ] **Audit remaining destination ping-pong at the producer level.**
  - Stable formation orders remain stable while squad intent is stable.
  - Target reacquisition does not rewrite locomotion unless combat movement mode actually changes.
  - No A -> B -> A destination sequence within one AI tick.
  - Temporary Micro combat movement returns cleanly to the same stable Meso squad order.
  - Stable fireteam orders are not republished at ~6.7 Hz.

## Recovery and routing cleanup

- [ ] **Keep recovery lean.**
  - Preferred episode: detect -> confirm -> rebuild once -> observe -> alternate once -> observe -> unreachable.
  - Recovery/progress observes execution failure; it must not become another strategic destination owner.
  - Normal retreat traversal with a valid physical route should not be mislabeled as stuck/unreachable.

- [ ] **Keep tactical routing subordinate to Meso intent.**
  - Tactical routes may substitute local legal waypoints/cover/door approaches.
  - Tactical routing must not replace or resurrect an obsolete strategic objective.
  - Invalid final waypoints stay subject to the v134 overlap-backtracking invariant and are rewritten to the legal point rather than repeatedly recovered from.

## Systems to freeze unless a deterministic regression proves otherwise

- [x] **Soldier body-width / narrow-gap clearance.** Gaps smaller than the body-clearance envelope are rejected.
- [x] **Illegal destination backtracking.** Final destinations overlapping hard geometry are backed down the incoming route until legal; committed tactical steps are rewritten to the corrected point.
- [x] **Tactical hardpoint/window reservation manager.** Preserve its single-owner reservation/ingress behavior.
- [x] **Personal-space separation.** Keep separate from strategic/tactical locomotion ownership.
- [x] **Telemetry serialization.** One request in flight, small batches, bounded queue; do not reintroduce overlapping POST storms.

The v136 hedge/LOS regression explicitly reopened **hedgerow representation**, not the body-clearance/pathfinding algorithm. After the v137 authoritative-volume pass is deterministic and visually validated, freeze it again. Do not rewrite pathfinding or soldier body clearance absent a reproducible regression.

## Broader tactical-AI work after locomotion ownership stabilizes

- [ ] Validate attacker/defender doctrine across multiple deterministic seeds.
- [ ] Validate prepared-defender positioning and hardpoint use.
- [ ] Validate engineer fortification siting/work limits and LOS behavior.
- [ ] Validate objective assignment/spread and General doctrine without reintroducing decision-cycle churn.
- [ ] Preserve ammo/reload/stoppage behavior, window ingress, cover use, suppression, and basic fire-and-movement while simplifying surrounding orchestration.

## Regression gates to preserve/expand

- [ ] Stable Meso formation order remains unchanged while squad intent is unchanged.
- [ ] Defensive posts survive target/contact flicker.
- [ ] Forward outrunners cannot be classified as ignorable cohesion stragglers.
- [ ] Engagement target reacquisition does not rewrite locomotion unless movement mode changes.
- [ ] No destination A -> B -> A within one AI tick.
- [ ] A valid reachable movement order continues unless the soldier is explicitly in a named stopping state (hold/station/reload/cover/orient/etc.).
- [ ] Temporary combat-state expiration returns to the stable squad order.
- [ ] Stable fireteam order is not republished continuously.
- [ ] A hedge prism blocks prone and standing LOS/ballistics when the ray crosses its volume, including from immediately beside the hedge.
- [ ] The soldier body disk at a destination does not overlap the projected hard hedge volume.
- [ ] Existing objective/navigation, tactical-position, impact-FX, and all 8 deterministic engagement-seed suites stay green.
- [ ] Re-run the benchmark after each material ownership simplification, not after every small implementation edit.

## CI / housekeeping after gameplay stabilizes

- [ ] Clean up GitHub Actions deprecation warnings after gameplay architecture is stable.
- [x] Keep benchmark workflow partial-shard salvage behavior.
- [x] Keep benchmark source verification pinned to code already on `main`.

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

M3C succeeds when each level can explain its own decision in one sentence:

- **Macro / General:** “This squad is defending Objective B.”
- **Meso / Captain:** “Alpha supports while Bravo holds the hedge line and Charlie remains local reserve.”
- **Micro / Soldier:** “My assigned position is blocked, so I use the nearest legal point on this side of the hedge and continue the same order.”

If diagnostics show enormous numbers of rejected/no-op requests, treat that as evidence of a redundant producer to remove, not a reason to add another interception layer.