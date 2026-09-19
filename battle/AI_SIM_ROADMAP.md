# Battle Sim / AI Roadmap — M3C

Accepted baseline before the M3C ownership sweep: **v139** (`df1a368debf0839d96259df672d8071db3f84011`).
The sweep is merged; `main` has carried it since `3d3e805` (2026-09-18). Sections below that still
read as "the candidate" or "the branch" describe that merged work.

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

## Mission command contract (sweep 2026-09-17)

The mission brief is the only contract between Macro and Meso.

- **General (`commander-ai.js`)** owns `_macroMission` {intent, action, objectiveId, point, flank leg, requestKey, status} plus `targetObjective` / `commandRole`. It never writes `commandPhase`, `objective`, `route` legs or `routeIndex`.
- **Lifecycle:** `issued` -> `executing` (Captain accepts) -> `completed` | `invalid` | `failed` (retreat/destroyed) | `superseded` (new brief). Doctrine is decided once, when a brief is issued, and the brief goes straight for its objective.
- **General wakes only for:** initial brief, mission complete (capture) / invalid (objective gone), reserve due, a defense request that changes the task, objective vacated or control change on a defend brief, a strategic stall (120 s, keyed to the progress epoch) against a brief older than 120 s, or a Captain escalation (`doctrine-review` when a hold/support/regroup plan lease closes). Wakes, reasons and recent wakes are exported under `macroCommand`.
- **Captain (`modules/16-squad-plan-stability.js`)** executes the brief in `executeMission`: flank leg, corner pauses, objective phase (assault/capture/defend), doctrine holds, reserve hold. Regroup is the Captain's own cohesion decision. Contact freezes legs and phase under the same brief version. Macro OFF: no brief; the Captain walks the assigned approach route.
- Deleted duplicate writers: `advanceRoute`/`applyDoctrine`/`recoverTargetlessObjective`, `holdCommittedPlan`, `restoreForward`, `progressRecovery`, `protectActivePlans`, the vacant-objective tick writer, Engagement's per-tick order republish and the assault-bound-push producer.

## Open issues after the 2026-09-17 ownership sweep

Evidence: paired deterministic replays (`scripts/run_m3c_replay.cjs`). Superseded by a 300-run paired sample (100 each: main `5c0e0f3`, branch `42a30cf`, branch `0eafc66`) split 40 meeting / 30 US-defend / 30 GE-defend. Distilled per-run data is on `evidence/m3c-sweep-20260917`; findings in `M3C_STRUCTURAL_SWEEP_TESTING_SUMMARY.md`.

- [x] **Win split: no measurable change.** The large sample closed this. Per scenario, US wins on main vs branch `0eafc66`: meeting 19/40 vs 18/40 (p=1.000), US-defend 28/30 vs 29/30 (p=1.000), GE-defend 3/30 vs 1/30 (p=0.612). Pooled defender advantage 55/60 vs 58/60 (p=0.439). Nothing is distinguishable from noise. The 10/12 vs 5/12 that opened this item was a 12-seed artifact, and an intermediate reading of GE-defend as 3/30 -> 0/30 "never succeeds" was likewise an over-read of a four-run swing. These scenarios need ~216 runs/arm to call a 10% vs 3.3% difference; do not spend that unless the answer changes a decision.
- [ ] **Personal-space volume is down; two clean invariants have regressed.** Re-measured 2026-09-19 over the same 10 replays. Pair corrections average **8.1k/battle**, roughly half the 17.4k this item was opened on — the cover-slot and personal-space work since the sweep (`3ff777c`, `b1e12cc`, `b530e73`) is the likely cause, and the volume concern is closed. But the two counters the sweep recorded as **0** no longer are: `exactOverlaps` averages 15 (present in 7 of 10 runs) and `blockedCorrections` averages 13.3 (one run at 103). `exactOverlaps` lands on almost exactly 20 in six separate runs and 30 in a seventh, which is too quantized for continuous drift and points at one repeatable event (spawn or ingress stacking) rather than general crowding. Root-cause the quantization first — it is a much narrower target than "crowding". `destinationUnresolved` is 0 in all 10 runs, so the destination-reservation layer added by `3ff777c` is resolving everything it is asked to.
- [ ] **Window / ingress crowding: the instability is the finding.** Re-measured 2026-09-19. `claimCollisionsPrevented` averages **674/battle across a 2 -> 2320 range** — not the 73 this item was opened on, and swinging by three orders of magnitude between runs, which reproduces the same instability the live captures showed (`M3C_STRUCTURAL_SWEEP_TESTING_SUMMARY.md`, tactical position assignments: 23 / 3,838 / 970 on one seed). `ingressRoutesInvalidated` is now non-zero (mean 10.8) where all three live captures recorded 0. Separately, only ~65% of created assignments are ever occupied (mean 14.2 occupied against 22.0 created). Reservation churn and physical occupancy are still not separated; the occupancy shortfall is the more tractable end to pull.
- [ ] **Regroup churn is the sweep's one robust behavioural change.** It does have a baseline: the `regroup` object is present on all 300 baseline squads, and position releases attributed to regroup give a clean comparison. Main vs branch: GE-defend 17 -> 154, US-defend 30 -> 182, meeting 146 -> 207. Six- to nine-fold in the defend scenarios and consistent across both branch builds, so far too large to be sampling noise. Yet only 2 squads sit in regroup at the final snapshot against 13 on main: the sweep enters regroup constantly and leaves quickly where main enters rarely and stays. The merge benchmark corroborates this independently — `longRegroups` fell 1.21 -> 0 per battle, so regroup stopped being *long*, not *frequent*. No outcome consequence has been shown, so treat this as behaviour to understand, not a regression to revert.

  **Instrumented and measured (2026-09-19).** `cohesionState` now records an entry reason, an exit reason, and whether the release condition already held at the moment of entry; `modules/99-session-diagnostics-export.js` exports the full counter set per squad and `_regroupHysteresisSummary.churn` aggregates it. Measured over 10 deterministic 600 s replays on `main` (4 GE-defend, 3 US-defend, 3 meeting, seeds `m3c-regroup-1..4`):

  | | total |
  |---|---|
  | regroup requests | 573 |
  | suppressed | 519 (303 of them straggler suppressions) |
  | accepted entries | 54 |
  | exits | 53 |

  | entry clause | n | | exit reason | n |
  |---|---|---|---|---|
  | `core-spread` | 49 | | `contact` | 32 |
  | `outrunners` | 41 | | `max-age` | 11 |
  | `laggards-over-allowance` | 14 | | `closed-up` | 10 |

  **A rawSpread/coreSpread hysteresis gap was proposed as the mechanism and is ruled out.** Entry tests `rawSpread > limit` while release tests `coreSpread <= limit * 0.78`, and `coreSpread` is structurally the smaller quantity, so a regroup could in principle commit already satisfying its own release test. It does not happen: `releasableAtEntry` is **0 of 54**. Mean `coreSpread` at entry is 46.6 against a release threshold of 26.52 — far outside the band. The asymmetry is real in the code and inert in practice. Do not spend more time on it.

  **What the data does say, and it is a different problem.** Only 10 of 53 regroups (19%) end because the squad closed up. 32 end on contact and 11 on `REGROUP_MAX`. Across 27 matched enter/exit pairs, mean `coreSpread` moves 46.6 -> 42.7 — the squad is still well above the `limit` of 34 that triggered the regroup — and 14 of the 27 end *more* scattered than they began. Regroup is being entered on a genuine cohesion failure (`core-spread` is in 49 of 54 entries) and then predominantly abandoned without achieving cohesion.

  Exit-on-contact is defensible doctrine on its own: a squad that makes contact should fight rather than keep closing up. The sharper questions are the 11 `max-age` timeouts and the fact that spread barely improves while regrouping at all — that is a regroup that does not work, not a regroup that churns.

  **Resolved 2026-09-19. The expiry is gone and the concept is now `rally`.** A rally ends because the squad closed up, or because an outside factor took the decision away (contact, an engagement plan, retreat, or a new mission brief). It never ends on a clock. The timeout was releasing squads that were still scattered, straight back into the condition that opened the rally, which re-requested it a cooldown later — that is where the loop came from.

  Removing it exposed a real bug that the timeout had been hiding. `commandForward` is the axis that separates a man who lagged behind from a man who ran ahead, and it is derived from `sq.objective` — which an accepted rally overwrites with its own anchor. So the axis pointed at the squad's own centre, and a straggler who happened to be beyond the anchor scored as an **outrunner**. Outrunners are never trimmable, so one distant man pinned `coreSpread` above the release threshold forever. With the timeout in place this was invisible; without it, one squad sat in a rally for 510 s of a 600 s battle. The rally now commits its frame at entry (`lastForward`, a field that already existed unused) and is judged in the frame that opened it.

  Matched on 10 seeds, 600 s each:

  | arm | entries | exits | `closed-up` | `contact` | `max-age` | open at end | worst |
  |---|---|---|---|---|---|---|---|
  | expiry (previous `main`) | 54 | 53 | 10 (19%) | 32 (60%) | 11 | 0 | — |
  | no expiry | 39 | 36 | 13 (36%) | 19 (53%) | 0 | 3 | 510.6 s |
  | no expiry + committed frame | 35 | 34 | **18 (53%)** | 13 (38%) | 0 | 1 | 91.6 s |

  Entries fall 35%, and a rally that completes went from the rarest outcome to the most common one. Winners differ on 2 of the 10 seeds (both GE→US); at n=10 that says nothing about balance either way — per the sample-size arithmetic in `M3C_STRUCTURAL_SWEEP_TESTING_SUMMARY.md` a win-split call needs roughly 200+ runs per arm, so run the standard benchmark before reading anything into it.

  **Also: the 17 -> 154 figure is a proxy and should not be quoted as regroup frequency.** It counts tactical-position releases attributed to regroup, not regroup entries. Direct entry counts here are 2-16 per battle. Across these same 10 runs, regroup accounts for 67 of 165 position releases against only 54 entries, so the fan-out is nowhere near large enough to reconcile the two numbers. These runs are single-arm on current `main` and cannot reproduce the paired main-vs-branch comparison, so this does not retract the sweep finding — but any future work should measure entries directly now that the counter exists.
- [ ] **Strategic stall wakes are usually no-ops.** Most `strategic-stall` wakes re-select the same objective (`decisionsUnchanged`). That is an objective-selection/doctrine limitation, not an ownership fault: the General has no alternative plan to offer.
- [ ] **Broad axes are no longer part of the brief.** Walking the approach route before the objective cut captures (3.2 vs 3.8). If axes should be a strategic concept again they need a design that does not delay objective commitment.
- [ ] **Hot path is now navigation and LOS.** Profile (live seed): physical replans ~3.3 s and `sightBlocked` ~3.5 s of ~13.7 s simulated-battle wall time. Profile further before optimizing; no ownership fault found there.
- [ ] **Movement Progress still ignores retreat.** Both stationary-retreat causes were navigation bugs (fixed); retreat remains unobserved by stuck detection by design. The new `movementStopReason` export is the observable if it recurs.

### Validation order for this sweep
1. [x] Visual check on the branch preview (`/grasstex/preview/m3c-ownership-sweep-20260917/battle_sim.php`, plus `?defender=us` / `?defender=ge`): coherent missions, no General twitching, cover without strategic backtracking, window/ingress stacking, retreaters leaving, sensible orders after captures.
2. [x] Standard 60 meeting / 20 US-defend / 20 GE-defend benchmark on the branch. Run against main `5c0e0f3` over 100 seed-paired battles per arm; `writerConflicts` 75.82 -> 0 per battle, health 71.8 -> 79.7. Recorded on the merge commit `3d3e805`.
3. [x] Large paired seed sample (main vs branch) by scenario type. Done at 300 runs; see above.

All three validation steps are complete. The sweep merged to `main` as `3d3e805` on 2026-09-18.

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

- [x] Run deterministic M3C regression gates and correct failures without adding another ownership layer. All 17 gates pass on `main` as of 2026-09-19 (12 `tools/ai-sim-harness` suites, 5 `scripts/check-*.cjs` ownership gates); there were no failures to correct. Eight of them ran in no workflow and are now wired into `validate-simplify.yml` — see **CI / housekeeping**.
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

- [x] **Audit the remaining Commander -> Squad Command boundary.** (mission command contract above)
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

- [ ] A rally ends only because the squad closed up or an outside factor intervened — never on a timer. No exit is ever attributed to an expiry.
- [ ] A rally is judged in the frame it committed to, so an accepted rally overwriting `sq.objective` cannot invert the lagging/outrunner classification.
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
- [x] **Restore the pre-merge validation gate.** `validate-simplify.yml` triggered on `push: branches: [simplify-v134]`, a branch that no longer exists on the remote, so the entire suite had been firing nowhere. It now runs on `pull_request` and `push`. Eight checks that ran in no workflow at all were added to it: the five `scripts/check-*.cjs` M3C ownership gates (which assert exactly the Macro/Meso/Micro boundaries the sweep established, and are plain Node with no extra dependencies) plus `movement-state-check`, `movement-recovery-check` and `macro-command-toggle-check`. Before this, the only place any check ran was `deploy-50webs-php.yml` — post-merge, on the way to production.

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
