# Battle Sim / AI Roadmap — M3C

Current accepted live baseline before this candidate: **v139** (`df1a368debf0839d96259df672d8071db3f84011`).

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
- Movement Resolver arbitrates legitimate Meso vs Micro locomotion; it is not a garbage collector for redundant producers.

The desired runtime is conceptually:

`General / Force Command -> Captain / Squad Command -> Engagement state -> Combat Mobility (when needed) -> Movement Resolver -> Movement Execution -> Physical Navigation`

## World / navigation foundation

- [x] **One authoritative hedgerow definition.** Rendering, navigation, LOS, cover and ballistics derive from the same oriented 3D hedge record.
- [x] **Bocage-scale volume.** Initial authoritative hedge is 2.2 m wide and 2.2 m opaque above terrain.
- [x] **Terrain-following visuals without thousands of hot-path colliders.** Short visual chunks follow terrain; continuous chunks are coalesced into one conservative runtime hedge volume. v139 reduced the observed physical-volume count from ~6,125 to ~1,700–1,850 on the same map class.
- [x] **Ground navigation remains 2D but occupancy is body-sized.** A destination is a ground point; legality asks whether the soldier's 0.45 m body radius can occupy it.
- [x] **LOS and bullets use the true 3D hedge volume.** Stance-aware eye/shot rays cannot pass through the authoritative prism.
- [x] **Near-cover LOS bypass removed for authoritative hedges.** Shooting around/over cover must come from the real ray missing the volume.
- [x] **World Debug shows the physical invariant.** Final magenta destination ring represents the soldier body footprint; raw command intent remains separate.
- [x] **Illegal endpoint backtracking.** Final destinations overlapping hard geometry are backed down their incoming route/ray and committed tactical steps are rewritten to the legal point.

Freeze pathfinding/body-clearance geometry unless a deterministic regression demonstrates a real failure.

## Current Meso stabilization pass

v139 diagnostics showed that Micro Combat Mobility coalescing works, but the Meso layer remained the dominant source of churn. German defending was the clearest case: repeated hardpoint releases/reclaims and safe-door replans, plus roughly 934k `squad-stability` proposals for only ~3k actual changes.

- [x] **Captain-owned tactical positions.**
  - A hardpoint/window reservation is a Meso positional order.
  - Target loss/reacquisition, engagement-plan quiet closure, engagement-plan serial changes and other Micro contact churn cannot revoke it.
  - A position ends only for a material Captain-level change or physical reason: new command signature/objective/phase, regroup/retreat, death/incapacitation, invalid geometry or a proven unreachable station.

- [x] **Squad Command is the sole normal Meso locomotion producer.**
  - The useful Captain anchor/stride cadence remains.
  - The legacy `SquadAI.issueOrders()` individual formation producer is removed from the active wrapped update path instead of being generated and then counted as `formationShadowsIgnored`.
  - Committed fireteam slots are the Meso movement intent.

- [x] **Stable Meso order publishing is coalesced at the producer.**
  - A fireteam slot is published only when the command/fireteam identity or physical point materially changes, or for an urgent retreat.
  - Stable orders are retained without repeatedly calling the resolver.
  - Diagnostics expose `intentChecks`, `intentPublishes` and `intentCoalesced` under Squad Command.

- [x] **Directional cohesion keeps forward outrunners in the core.** Lagging soldiers can receive bounded catch-up treatment; soldiers who sprint ahead cannot be discarded as harmless stragglers.

- [ ] Run deterministic M3C regression gates and correct failures without adding another ownership layer.
- [ ] Visually validate the next deployed build in **German defending**, **US defending**, and **both sides attacking** scenarios.
- [ ] Compare movement requests, `formationShadowsIgnored`, tactical-position reassignments, ingress route churn, objective progress and squad spread against v139.

## Benchmark matrix

The benchmark is a scenario matrix rather than a meeting-engagement-only average.

- [x] **Both sides attacking / meeting engagement.**
- [x] **US prepared defense vs German attack.**
- [x] **German prepared defense vs US attack.**
- [x] Ten deterministic parallel shards per battle type.
- [x] Default 10 battles per shard = **100 battles/type, 300 total**.
- [x] Partial scenario/shard salvage remains enabled; healthy results are merged even if another job fails.
- [x] Merged JSON/CSV/Markdown identify battle type and report a separate health/stall/coordination row for each type in addition to the overall aggregate.
- [x] Benchmark source remains pinned to code already on `main`.

This separation is important: prepared defense has repeatedly exposed failures that a symmetric attack-vs-attack average hides.

## Next architectural simplification after this pass

- [ ] **Audit the remaining Commander -> Squad Command boundary.**
  - Commander owns objective/mission/route intent.
  - Captain owns formation/fireteam/defensive-post execution of that mission.
  - Remove any remaining writer that can mutate the same strategic/squad field from both layers.

- [ ] **Audit remaining destination ping-pong at the producer level.**
  - Stable formation orders remain stable while squad intent is stable.
  - Target reacquisition does not rewrite Meso locomotion unless the Micro movement mode actually changes.
  - No destination A -> B -> A within one AI tick.
  - Temporary Micro combat movement returns cleanly to the same stable Meso order.

- [ ] **Use resolver counters as architectural smoke detectors, not targets to game.**
  - `formationShadowsIgnored` should collapse because the redundant producer disappeared, not because the resolver got a stronger blocker.
  - Large rejected/no-op streams mean another upstream producer should be removed or merged.

## Recovery and routing contract

- [ ] **Keep recovery lean.** Preferred episode: detect -> confirm -> rebuild once -> observe -> alternate once -> observe -> unreachable.
- [ ] Recovery/progress observes physical execution failure; it must not become another strategic destination owner.
- [ ] Tactical routes may substitute local legal waypoints/cover/door approaches but must not replace or resurrect an obsolete Meso/Macro objective.
- [ ] Normal retreat traversal with a valid physical route must not be mislabeled as stuck/unreachable.

## Regression gates

- [ ] Stable Meso formation/fireteam order remains unchanged while squad intent is unchanged.
- [ ] Stable Meso fireteam orders are coalesced before the Movement Resolver.
- [ ] Defensive/hardpoint posts survive target/contact/engagement-plan flicker.
- [ ] Captain-level objective/phase changes still release obsolete positional assignments.
- [ ] Forward outrunners cannot be classified as ignorable cohesion stragglers.
- [ ] Engagement target reacquisition does not rewrite locomotion unless movement mode changes.
- [ ] No destination A -> B -> A within one AI tick.
- [ ] A valid reachable movement order continues unless the soldier is explicitly in a named stopping state.
- [ ] Temporary combat-state expiration returns to the stable squad order.
- [ ] A hedge prism blocks prone and standing LOS/ballistics when the ray crosses its volume, including from immediately beside the hedge.
- [ ] Soldier body disk at a destination does not overlap the projected hard hedge volume.
- [ ] Existing objective/navigation, tactical-position, impact-FX and all eight deterministic engagement-seed suites remain green.
- [ ] Re-run the benchmark after each material ownership simplification, not after every small implementation edit.

## Systems to keep separate

- [x] Tactical hardpoint/window reservation manager: unique reservation/ingress responsibility.
- [x] Personal-space separation: physical local correction, not command ownership.
- [x] Telemetry serialization: one request in flight, bounded batching/queue.
- [x] Combat Mobility: sole Micro combat-locomotion publisher.
- [x] Movement Execution: physical execution/routing of the winning intent, not strategic decision making.

## Broader tactical-AI work after locomotion ownership stabilizes

- [ ] Validate attacker/defender doctrine across the three benchmark modes and held-out deterministic seeds.
- [ ] Validate prepared-defender positioning and hardpoint use.
- [ ] Validate engineer fortification siting/work limits and LOS behavior.
- [ ] Validate objective assignment/spread and General doctrine without reintroducing decision-cycle churn.
- [ ] Preserve ammo/reload/stoppage behavior, window ingress, cover use, suppression, and fire-and-movement while simplifying orchestration.

## CI / housekeeping after gameplay stabilizes

- [ ] Clean up GitHub Actions deprecation warnings after gameplay architecture is stable.
- [x] Benchmark partial-shard salvage.
- [x] Three-type benchmark matrix.

## Completed milestones

- [x] v128 retained as the preferred/golden movement-feel reference.
- [x] v129-style episode recovery replaced pathological repeated recovery escalation.
- [x] Assault commitment survives brief target/LOS flicker.
- [x] v132 removed the worst legacy formation-shadow ownership fight without carrying the large v130 blocker stack.
- [x] v133/v134 established legal physical endpoints and eliminated recover -> return-to-impossible-point loops.
- [x] v135 reduced the overlapping tactical movement/control stack from roughly 10 modules to three primary owners.
- [x] v135 benchmark run #17 salvaged eight healthy shards into an 80-battle baseline and exposed the null assault-target race.
- [x] v136 made Combat Mobility the combat-locomotion publisher and added producer-side combat intent coalescing.
- [x] v137 introduced M3C authoritative hedge volumes and explicitly separated Macro/Meso/Micro responsibility.
- [x] v139 coalesced terrain-following hedge chunks into practical runtime volumes and restored physical-world performance.

## Architectural north star

M3C succeeds when each level can explain its own decision in one sentence:

- **Macro / General:** “This squad is defending Objective B.”
- **Meso / Captain:** “Alpha supports while Bravo holds the hedge line and Charlie remains local reserve.”
- **Micro / Soldier:** “My assigned position is blocked, so I use the nearest legal point on this side of the hedge and continue the same order.”

If diagnostics show enormous numbers of rejected/no-op requests, treat that as evidence of a redundant producer to remove, not a reason to add another interception layer.
