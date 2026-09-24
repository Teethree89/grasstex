# Battle AI Command Hierarchy Plan

## Goal

Eliminate competing-order and short-loop behavior by giving each layer one explicit responsibility and one authoritative output.

The current target hierarchy is:

**Force / Company Command decides WHAT -> Captain decides HOW LOCALLY -> Squad Orders organize -> Engagement produces combat decisions/proposals -> Movement Resolver owns the final soldier destination -> Soldier executes.**

No two live systems should own the same decision class.

## Current status summary

| Step | Status | Current reality |
| --- | --- | --- |
| 1. Truthful hierarchy graph | **DONE** | Force Command, Captain Leadership, Squad Orders and Engagement ownership are represented in the AI graph. |
| 2. Order provenance | **DONE** | Strategic/movement writes are traceable; Loop Watch and Order Trace expose writer churn and diagnostics can be exported. |
| 3. Versioned `SquadIntent` | **PARTIAL / NEXT** | Capture Zone and Prepared Defense now publish constraints consumed by Force Command, but the general versioned intent contract and central constraint resolver do not yet exist. Other systems still use mutable compatibility fields. |
| 4. Owned leases | **DONE for squad command holds** | `BattleLeases` (squad-ai.js) holds every Captain/objective-security commitment as a named lease with owner, reason, expiry and release path; exports show live leases and which one holds each squad's mission. Not built: graph rendering, priority and progress tests. |
| 5. Captain local planner | **NOT DONE** | Captain is still primarily a leadership/status/voice influence, not a tactical planning agent. |
| 6. Final movement ownership | **DONE / SUPERSEDED ORIGINAL DESIGN** | `BattleMovementResolver` is now the sole normal-runtime writer of `soldier.destination`; Squad Orders and Engagement submit proposals. Preserve this architecture rather than moving final destination ownership back into Engagement. |
| 7. Causal loop prevention/trace | **PARTIAL** | Loop Watch, provenance, writer-conflict detection, exports, destination churn detection, a no-progress formation-renewal guard, and Force Command's targetless-route recovery now exist. Missing: full Force Intent -> Captain Plan -> Squad Plan -> Engagement -> Resolver causal chain and lease-aware causes. |
| 8. Larger command hierarchy | **PARTIAL FOUNDATION** | Attacker/defender doctrine, echelon metadata, sectors, reserve behavior, fallback metadata, prepared defenses and engineers exist. Active higher-command coordination, fallback/counterattack execution, succession/comms and combined arms remain future work. |

---

## Step 1 - Make the current hierarchy truthful in the graph

Status: **DONE.**

- Rename the abstract commander node to **Force Command**.
- State its ownership explicitly: mission/objective, route, command phase, doctrine action.
- Show **Captain Leadership** as an influence/status source rather than a second order authority.
- Show the captain's current real effects: normal vs captainless cohesion, additional corner delay, `captainDead` policy condition, formation slot and voice callouts.
- State Squad Orders ownership: formation, order anchor, member slots and fireteam organization.
- State Engagement ownership: cover choice, stance, bounds, firing behavior and combat-movement proposals.
- State Movement Resolver ownership: final live `soldier.destination` selection.

Definition of done: a person reading the graph can answer "who owns this decision?" without reading source code.

---

## Step 2 - Add order provenance and writer-conflict telemetry

Status: **DONE observationally.**

Tracked decision/movement state includes:

- squad `commandPhase`
- squad `targetObjective` / `objective`
- squad `orderAnchor` / rally
- fireteam destination / prepared-post assignment
- soldier `orderDestination`
- soldier final `destination`

For meaningful changes record value, owner/system, reason, timestamp and previous owner.

Existing implementation includes:

- order-provenance instrumentation and low-overhead owner contexts;
- Force Command, Capture Zone, Squad Stability, Prepared Defense, Building Hardpoints, Squad Orders, Engagement and Movement Resolver attribution;
- explicit marking of unattributed/in-place mutations rather than silently assigning blame;
- `A -> B -> A` writer-ping-pong and multi-owner churn detection;
- Loop Watch cards enriched with order provenance;
- Order Trace UI;
- loop, order and combined diagnostics JSON exports.

Definition of done: every suspicious movement can be traced to the system that requested it and the system that finally executed it.

---

## Step 3 - Introduce one versioned `SquadIntent` contract

Status: **PARTIAL / NEXT IMPLEMENTATION STEP.**

### Already migrated

Capture Zone no longer needs to become a second strategic commander. It publishes a short objective-security request (`_captureZoneDefenseRequest`), and Force Command decides whether to accept that request and remains the writer of the squad's strategic objective/phase/target fields.

Prepared Defense now follows the same boundary: it publishes a persistent garrison/post request (`_preparedDefenseRequest` and per-soldier `_preparedDefensePost`). Force Command accepts the strategic garrison intent, while Squad Stability turns the fixed post constraint into the live formation proposal. Prepared Defense no longer rewrites a defender's live order before and after the squad update.

This is the migration pattern Step 3 should generalize.

### Validated recovery slice

Force Command now consumes the existing coordination-health signal for one bounded case: a
non-garrison squad that has reached the end of its route without an objective target. A terminal
`clear-town` fallback is immediately converted to an explicit `assault` or `capture` intent; a
targetless squad stranded away from town is recovered only once the side has a genuine stalled or
missing-assignment health signal. The recovery is recorded as `decision-objective-recovery`, shown
on the Force Command graph node, and exported with route state and the recovery cause.

This closes the observed failure where a squad stopped outside a capture radius with no owner for
the final approach. It is not the general `SquadIntent` resolver yet: compatibility fields remain
the current Force Command output until Step 3A.

### Still required

Force Command must stop using mutable squad fields as its implicit strategic API and instead emit one versioned intent object, for example:

```js
{
  version,
  issuedAt,
  owner: 'force-command',
  mission,              // assault | defend | hold | support | regroup | reserve ...
  objectiveId,
  commandPoint,
  route,
  approach,
  strategicRole,
  commitment,
  urgency,
  ruleId,
  reason,
  constraints: []
}
```

Add one authoritative resolver/API for strategic intent:

- Force Command publishes/replaces the current intent.
- Objective Capture submits an objective-security constraint/request.
- Prepared Defense submits garrison/post/sector constraints rather than rewriting strategic state.
- Engineers submit task/readiness constraints rather than becoming alternate commanders.
- Squad Stability commits or rejects intent changes through the same API instead of restoring raw fields after another writer changes them.
- Existing compatibility fields (`commandPhase`, `objective`, `targetObjective`, etc.) may remain temporarily as **derived mirrors** during migration, but only one intent resolver writes them.

Definition of done: there is one authoritative versioned strategic intent per squad at a time, and normal-match provenance reports no peer systems competing over strategic fields.

---

## Step 4 - Convert overlapping timers into owned leases

Status: **DONE for squad command holds (2026-09-24). Graph rendering, lease priority and progress tests are not built.**

### What exists

`root.BattleLeases` in `squad-ai.js` keeps one table per squad (`sq._leases`): each live lease has `kind`, `owner`,
`since`, `until` (absolute sim time, `Infinity` while a condition rather than the clock holds it), `reason`, `release`
(what ends it) and optional `data`; ended leases keep `endedAt`/`endReason` in a short log. `holds(sq,kind,t)` is
`t < until`, the exact test the old timers used, so the migration kept every timing unchanged (same-seed replays
identical, Macro on and off).

| Lease | Owner | Replaces | Released by |
| --- | --- | --- | --- |
| `tactical-plan` | captain | `_engagementPlan.until` / `quietSince` | 26 s / 38 s expiry while staged; held open by contact; 9 s quiet; intent replaced; retreat |
| `regroup` | captain | `_regroupHysteresis.accepted` / `enteredAt` / `anchor` | cohesion restored after 2.4 s, contact, or 18 s |
| `regroup-cooldown` | captain | `_regroupHysteresis.cooldownUntil` | 4 s expiry |
| `regroup-bypass` | captain | `_regroupBypassUntil` | expiry (firefight 1.25 s, stragglers 2.8 s, after release 4 s / 14 s) |
| `corner-hold` | captain | `commandHoldUntil` | expiry, new mission, regroup release, route assignment |
| `bound` / `bound-cycle` | captain | `_boundUntil` / `_nextBoundAt` / `_boundTeam` | 3.6 s window or contact broken / 9 s cycle |
| `objective-security` | capture-zone | `_captureZoneSecureUntil` | 18 s with no enemy present, leaving or losing the zone, retreat |

The Captain records which lease is holding each squad's mission execution this tick (`sq._missionHold`:
`regroup`, `tactical-plan` or `corner-hold`), and the session export lists every squad's live leases, recently
ended leases and `missionHeldBy`. `tools/ai-sim-harness/lease-check.js` covers the primitive and the plan and
regroup lifecycles.

### Deliberately not leases

- ~12 s fireteam order renewal stays on the fireteam order record (`_fireteamOrders[team].until`): the anchor,
  frame, signature and renewal time are one Captain-only record and splitting it would add indirection.
- Persistent garrison (`_preparedDefenseRequest`) is a standing constraint with no timer; it belongs to Step 3's
  intent/constraint contract.
- The ~45 s defensive-post commitment no longer exists as a timer: a settled post is released only when the
  defensive command signature changes.
- Engagement state durations, engineer build time, Movement Resolver commit/TTL and firing-station grace are
  execution timing inside one owner, not command commitments that can block another layer's intent.

### Original brief

Do **not** invent new timings first. Preserve and migrate the timings already governing the simulation, including:

- ~18 s objective-security window;
- ~26 s assault-plan commitment;
- ~38 s defensive-plan commitment;
- ~12 s fireteam/order renewal;
- ~45 s defensive-post commitment;
- persistent strategic garrison behavior;
- commander regroup/support/corner holds;
- Engagement alert/review/bound timing;
- engineer construction time;
- Movement Resolver proposal TTL/commit timing;
- firing-station/contact grace timing.

Create a named lease/constraint contract such as:

```js
{
  id,
  owner,
  kind,
  intentVersion,
  priority,
  startedAt,
  expiresAt,
  interruptibleByContact,
  progressTest,
  releaseCondition,
  reason,
  status
}
```

The central resolver must be able to answer:

- which lease currently prevents an intent change;
- which system owns it;
- why it remains active;
- whether progress is being made;
- what event releases or supersedes it.

The graph should render active leases and remaining time.

Definition of done: objective security, plan commitment, defensive-post commitment and garrison behavior cannot silently fight each other, and each hold has one visible owner/release path.

---

## Step 5 - Make Captain a real local tactical planner

Status: **NOT DONE.**

This is the first major hierarchy behavior addition after intent/lease ownership is clean.

Force Command owns **WHAT**:

- assault/defend/support/hold objective X;
- strategic priority and commitment;
- broad route/role.

Captain owns **HOW LOCALLY** within the accepted Force Intent:

- local approach side / axis;
- formation selection;
- rally / local anchor;
- base-of-fire selection;
- maneuver/support/security task allocation;
- which fireteam bounds;
- building/door/window/hardpoint usage;
- prepared-defense occupation;
- local secure/recover/handoff decision that remains within the parent mission.

The Captain may **not**:

- replace the strategic objective;
- write an individual soldier's final destination;
- assign personal cover points directly;
- silently extend a strategic lease.

When the captain is killed:

1. retain the last still-valid local plan while its lease remains valid;
2. expose degraded coordination/cohesion;
3. fall back to deterministic conservative squad behavior until Force Command issues a replacement intent or command succession is implemented.

Definition of done: Captain behavior materially changes local execution without becoming a second Force Command or another movement writer.

---

## Step 6 - Preserve and harden Movement Resolver as the sole final movement authority

Status: **DONE IN NORMAL RUNTIME; ORIGINAL STEP SUPERSEDED.**

The architecture has evolved past the original plan that placed final personal movement ownership inside Engagement.

Current correct model:

```text
Squad Orders ───────┐
                    ├─> Movement Resolver -> soldier.destination
Engagement proposal ┘
```

- Squad Orders submits stable formation/fireteam/order proposals.
- Engagement owns individual combat logic: cover, stance, bounds, firing-station use, fire decisions and short-lived combat-movement proposals.
- `BattleMovementResolver` chooses the winning proposal and is the sole normal-runtime writer of `soldier.destination`.
- Setup/teleport initialization may set a destination directly before normal live ownership begins.
- Fallback direct writes in Squad AI / Engagement are allowed only for deployments where Movement Resolver failed to load and must remain outside the healthy runtime path.

Remaining work here is enforcement, not redesign:

- add assertions/telemetry if a live non-initialization system directly writes final destination;
- include winning proposal owner/kind in graph/live diagnostics;
- keep navigation/pathfinding downstream of the selected destination rather than making navigation another command writer.

Definition of done: healthy live combat has exactly one final destination writer, and violations are immediately observable.

---

## Step 7 - Finish causal loop prevention and live execution tracing

Status: **PARTIAL - substantial diagnostics already exist.**

Already implemented:

- repeating 2-3 step command-cycle detection;
- squad order churn detection;
- soldier position-seeking detection using high travel / low net progress;
- writer ping-pong and multi-owner provenance conflicts;
- graph-path highlighting;
- loop/order/combined diagnostic exports;
- movement-resolver ownership summaries;
- a progress gate on fireteam-order renewal so a non-progressing team does not receive endlessly shifted formation slots.
- targetless terminal-route recovery from coordination health, with the selected objective and cause in the graph/diagnostics.

Also preserve role allocation across defense-plan reset. The reset previously cleared every
non-defender `commandRole` after routes were allocated, which made the health monitor report
missing roles and degraded objective recovery context in ordinary meeting engagements.

Finish the causal chain once Steps 3-5 exist:

```text
Force Intent
  -> active strategic constraint/lease
  -> Captain Local Plan
  -> Squad / Fireteam Plan
  -> Engagement proposal
  -> Movement Resolver winner
  -> Navigation path / waypoint queue
  -> observed progress
```

Add/finish diagnostics for:

- `A <-> B` and `A -> B -> C -> A` strategic/tactical state cycles;
- repeated post/window/cover swaps;
- intent-version churn;
- lease acquire/release/supersede cycles;
- Captain-plan churn;
- resolver proposal ping-pong;
- no-progress route/path replans;
- progress since lease/plan start;
- intentional fire-and-movement loops distinguished from pathological loops.

Only add hysteresis or progress gates where the trace demonstrates an actual pathological cycle.

Definition of done: a position-seeking or decision trap names the exact intent, plan, lease, proposal and transition that caused it.

---

## Step 8 - Expand the higher command hierarchy and larger-unit tactics

Status: **PARTIAL FOUNDATION.**

Already present as useful groundwork:

- attacker/defender asymmetry;
- command-echelon metadata (`sergeant`, `lieutenant`, `captain`, `major`, `general`);
- contact/security/main/depth defensive sectors;
- defender span-of-control limits;
- fallback-sector metadata;
- reserve-sector metadata;
- an actual Force Command reserve role with release logic;
- prepared defensive works and post claiming;
- engineer soldier role and runtime fortification;
- objective/sector control and command telemetry.

Still to implement after Steps 3-7 stabilize ownership:

- explicit platoon/company command entities above squads;
- several squads intentionally coordinated under one commander/main effort;
- active reserve commitment tied to Force Intent and leases;
- counterattack plans;
- active fallback/withdrawal execution through fallback sectors;
- engineer tasking from command rather than opportunistic-only construction;
- command casualty succession;
- communications, acknowledgement, delay and stale-order behavior;
- doctrine by echelon;
- support requests/effect windows;
- armor, indirect fire, reconnaissance and eventual combined-arms coordination through the same intent/lease architecture.

The invariant remains: higher echelon assigns mission and priority; lower echelon chooses bounded execution; asset controllers own their assets; Movement Resolver owns the infantry final destination; Engagement owns the individual fight.

---

## Comparative benchmark and historical quality bar

The detailed research record is in [`AI_COMPARATIVE_BENCHMARKS.md`](./AI_COMPARATIVE_BENCHMARKS.md).

The score below is an **architecture-coverage score, not a claim that one game's AI is better than another**. Each system is scored 0-5 across seven dimensions: individual adaptation, squad coordination, hierarchy, physical navigation/positioning, systemic/world simulation, decision explainability, and developer observability. A low score can mean that a capability was outside the game's scope or is not publicly documented.

| System | Coverage / 35 | Dimensions scoring >=4 |
| --- | ---: | ---: |
| F.E.A.R. | **19** | **3 / 7** |
| Halo 2 | **24** | **3 / 7** |
| Arma 3 | **21** | **2 / 7** |
| S.T.A.L.K.E.R.: Shadow of Chernobyl | **20** | **2 / 7** |
| Alien: Isolation | **18** | **2 / 7** |
| **Battle Sim - current architecture** | **28** | **5 / 7** |
| **Battle Sim - roadmap target** | **34** | **7 / 7** |

Useful quantified reference points recorded in the benchmark document:

- **F.E.A.R.** used a three-state FSM with A* used for action planning as well as paths; its GDC material describes coordinated suppression, advance, formation/search behavior and dynamic replanning.
- **Halo 2** documented a core behavior DAG on the order of 50 behaviors, with squad `orders` exposing groups of firing positions and broad behavior/style constraints.
- **Arma 3** exposes five named group combat modes plus waypoint, formation, behavior and High Command semantics.
- **S.T.A.L.K.E.R.** documented two simulation modes (online/offline), usually about a 150 m detailed-online radius, global offline movement/goals, and a development philosophy of per-component debug drawing for paths, visibility and cover.
- **Alien: Isolation** used two distinct macro/micro AI systems; public descriptions put the Alien behavior tree at more than 100 nodes with roughly 30 high-level selectors.

The comparison is useful because the Battle Sim target is not to copy one predecessor. The design is deliberately combining **F.E.A.R.-style tactical adaptation**, **Halo-style squad/order abstraction**, **Arma-style military command semantics**, **S.T.A.L.K.E.R.-style systemic/debug thinking**, and **Alien-style macro/micro authority separation**, while making ownership and causality explicit through `SquadIntent`, leases, Movement Resolver, provenance and Loop Watch.

By the end of Steps 3-7, the architecture target is also quantitatively testable:

- **1** authoritative strategic `SquadIntent` per squad;
- **1** final normal-runtime writer of `soldier.destination`;
- **0** normal-match strategic-field ownership conflicts;
- **100%** of active command holds represented by named owner-visible leases/constraints;
- **100%** of Captain local plans linked to a parent Force Intent version;
- **100%** of resolver winners attributable to an order or combat proposal;
- loop diagnostics able to identify the active intent, lease, local plan, proposal owner and no-progress condition that produced a pathological cycle.

These are internal engineering targets, not marketing claims. Actual AI quality still has to be validated through fixed-seed regression battles and player-observable behavior.

---

## Recommended implementation order from current `main`

1. **Step 3A:** create `BattleSquadIntent` contract/resolver and mirror current Force Command output into it without changing behavior.
2. **Step 3B:** migrate remaining strategic peer writers/task systems into constraints/advisories; preserve the already-migrated Capture Zone and Prepared Defense request model.
3. **Step 3C:** migrate Squad Stability from raw-field restore behavior into intent commitment/acceptance semantics.
4. **Step 4A:** introduce the generic named lease registry and migrate existing durations one system at a time without changing their values.
5. **Step 4B:** render active leases, owner, reason and expiry in AI Graph and diagnostics export.
6. **Step 5:** add Captain Local Plan on top of stable Force Intent + leases.
7. **Step 6 enforcement:** assertions/telemetry for illegal final-destination writers; otherwise leave Movement Resolver architecture intact.
8. **Step 7:** connect Loop Watch/provenance to intent versions, Captain plans and leases; add only evidence-based anti-loop gates.
9. **Step 8:** expand higher-command coordination, fallback/counterattack and combined arms.

---

## Non-negotiable architecture rules

1. No two live systems own the same decision class.
2. Strategic objective selection never writes individual soldier movement.
3. Force Command owns the authoritative strategic `SquadIntent`.
4. Captain Local Plan may interpret an intent locally but may not replace its strategic objective.
5. Objective/defense/engineer modules publish constraints, opportunities or task requests; they do not secretly become alternate commanders.
6. Squad Orders publishes organization/order proposals, not final physical movement.
7. Engagement owns individual combat decisions and combat-movement proposals, not the final destination field.
8. Movement Resolver is the sole normal-runtime writer of `soldier.destination`.
9. Navigation/pathfinding consumes the resolved destination; it does not become another command authority.
10. Every timer/hold becomes a named owner-visible lease with a release/progress condition.
11. Every loop diagnostic must distinguish intentional tactical repetition from pathological no-progress cycling.
12. Existing working movement/navigation behavior should be preserved while command ownership is migrated above it.
