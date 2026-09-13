# Tactical AI Outline

## Purpose and scope

This is a design outline for the **game simulation**, not a literal training procedure. It turns the
ideas in *MCDP 1-3, Tactics* into observable, bounded AI behavior for a small-unit battle: taking
ground, contesting structures and streets, securing objectives, reacting to contact, and exploiting
a local advantage.

The doctrinal source is intentionally conceptual rather than prescriptive. Its recurring ideas are:

- achieve a clear decision rather than merely accumulate activity;
- gain advantage through maneuver, terrain, complementary forces, surprise, and asymmetry;
- be faster in the relevant decision cycle, not simply move faster;
- adapt to uncertainty through intent and local initiative;
- cooperate laterally; and
- consolidate, exploit, or pursue after success rather than stopping at first contact.

Sources: [MCDP 1-3, *Tactics*](https://www.marines.mil/portals/1/publications/mcdp%201-3%20tactics.pdf),
chapters 1–7; the locally supplied *MCTP 12-10B, Urban Operations* (July 2022); and the locally
supplied [MCWP 3-35.3, *Military Operations on Urbanized Terrain*](https://www.marines.mil/portals/1/mcwp%203-35.3.pdf)
(1998). The local MCDP PDF and RTF are the same 145-page publication.

### Source boundary

MCDP 1-3 is deliberately conceptual. MCTP 12-10B adds the urban operating framework—urban
terrain/infrastructure/population, continuous reconnaissance, isolation, offensive and defensive
operations, consolidation, and transition. MCWP 3-35.3 supplies the small-unit building and street
operation structure. This outline translates those sources into **game AI state, ownership, and
evaluation requirements**; it intentionally does not reproduce real-world weapon, explosive,
breaching, or room-entry procedures.

## Architecture invariant

Keep one owner per decision class. The existing hierarchy remains the foundation:

```
Force Command: mission, objective, priority, commitment
        ↓
Captain Local Plan: approach, local axis, fire/support positions, task allocation
        ↓
Squad Plan: formation, fireteam anchors, order slots, bounded plan lease
        ↓
Movement Resolver: chooses one final movement proposal
        ↓
Engagement: cover, stance, bound, firing station, individual fight
```

Objective, building, navigation, and diagnostic modules may provide constraints, opportunities, or
telemetry. They must not quietly become alternate command layers. The AI graph must render this
chain, the active leases, and the reason for each transition.

## Reference-to-AI ownership map

Use each publication where its scope is strongest. Newer Marine Corps sources describe modern
organizations and equipment, so the game should adapt their command, perception, and coordination
ideas to WWII-era roles, weapons, and communications rather than copy their contemporary details.

| AI layer | Primary sources | Use in this simulation |
|---|---|---|
| Force Command | MCDP 1-3; MCWP 3-01 | Decisive point, main effort, reserve, offensive/defensive transition, success exploitation |
| Captain / platoon coordinator | MCTP 12-10B; MCRP 3-10A.3; MCWP 3-01 | Local mission plan, squad cooperation, control measures, support allocation, handoff and consolidation |
| Squad / fireteam | MCRP 3-10A.4; MCWP 3-35.3 | Fireteam organization, local formation, support/security/assault tasks, contact response, patrol and urban task structure |
| Scout / information input | MCTP 3-01A | Observation, route confidence, contact reports, information aging, patrol/recon task state |
| Automatic-weapon specialist | MCTP 3-01C | Sustainable support state, sector coverage, position suitability, ammunition and heat/readiness abstraction |
| Individual soldier / engagement | MCRP 8-10B.2 | Detection, target confidence, firing-position suitability, target priority, weapon readiness, and accurate-versus-hasty fire tradeoffs |

No source gets a new movement writer. The references define decisions and evidence; existing
`Movement Resolver` remains the sole final-destination arbiter and `Engagement` remains the sole
individual-combat owner.

## WWII combined-arms expansion

The same hierarchy applies when a battle adds vehicles, fire support, and aircraft. They are not
"larger soldiers" and they must not become omniscient shortcuts around the infantry plan. Each arm
contributes a bounded capability, has its own constraints and readiness, and reports evidence back
to the shared tactical picture. Infantry remains the authority for close terrain control and final
objective confirmation; a vehicle or aircraft may enable that control but does not silently claim it.

### Combined-arms ownership

Add a read-only `CombinedArmsCoordinator` beside Force Command. It schedules scarce assets and
translates effect requests into status, availability, and observed results. It is deliberately not a
second commander and not a movement writer.

```
Force Command ── declares main effort, priority, and desired effect
        │
        ├── Captain Local Plan ── requests/coordinates local support
        │
        └── CombinedArmsCoordinator ── validates capacity, timing, constraints, and acknowledgement
                 ├── Armor AI ───────── vehicle route, position, direct-fire task, self-preservation
                 ├── Fires Controller ─ mortar/artillery target effect and scheduling
                 ├── Air Controller ─── sortie timing, air route, observation/strike result
                 ├── Transport/Service ─ delivery, recovery, evacuation, repair state
                 └── Signals Network ── message delay, reachability, acknowledgement

Squad Plan → Movement Resolver → Engagement
```

- **Force Command** chooses which objective and effort receives scarce support. A main-effort shift
  is invalid unless its support and reserve commitments change with it.
- **Captain Local Plan** asks for a bounded effect at a named location and time window; it never
  drives a tank, aircraft, or artillery piece by writing infantry destinations.
- **Asset controllers** own their asset's route, position, readiness, and execution. They can refuse
  an impossible request and must expose why.
- **Movement Resolver** remains the only final movement arbiter for soldiers. A vehicle navigation
  resolver, when added, is the equivalent sole arbiter for vehicles; neither resolver writes into
  the other domain.
- **Objective/structure control** still requires current friendly observation and appropriate ground
  presence. Effects change risk and opportunity, not the truth of control.

### Common capability and request contracts

Model assets by capability rather than hard-coding unit names. This lets the same scenario express
different WWII national rosters while preserving distinct limitations.

```js
{
  id, kind, faction, controllerId,
  capabilities: ['observe', 'direct-support', 'suppress', 'interdict'],
  mobility: { domain: 'foot' | 'road' | 'tracked' | 'air', routeConfidence },
  readiness: { available, ammo, fuel, damage, crew, maintenance },
  limits: { weather, visibility, terrain, bridgeClass, communication, friendlyRisk },
  status: 'ready' | 'tasked' | 'enroute' | 'executing' | 'recovering' | 'unavailable'
}

{
  id, requesterId, intentVersion, priority,
  effect: 'observe' | 'screen' | 'direct-support' | 'suppress' | 'obscure' |
          'interdict' | 'route-clear' | 'protect' | 'resupply' | 'recover' | 'evacuate',
  targetRef, earliestAt, expiresAt, confidence, constraints, reason,
  status: 'requested' | 'accepted' | 'enroute' | 'executing' |
          'complete' | 'denied' | 'expired' | 'cancelled',
  result: { observedAt, effectConfidence, reason }
}
```

Every result must distinguish a requested effect from an observed effect. For example, a support
request may be accepted but late, ineffective, cancelled for friendly-risk, or successful only for a
short window. This keeps the AI graph and diagnostics causal rather than cosmetic.

### Arm and service role catalogue

The catalogue below is a game-design vocabulary, not a prescribed real-world order of battle.
Individual nations can map their available unit classes onto these roles.

| Arm or service | WWII-era classes to model | Primary game jobs | Important constraints and evidence |
|---|---|---|---|
| Command and signals | Force HQ, company/platoon command, radio/runner/visual links | Issue intent, allocate priority, synchronize a handoff, preserve a common picture | Range, relay path, delay, message loss, commander availability, acknowledgement age |
| Reconnaissance | Scouts, patrols, mounted scouts, armored cars, observation aircraft | Observe routes, identify likely resistance, screen a flank, refresh stale information | Must report confidence/source/time; observation is not permanent control |
| Rifle infantry | Rifle squads, assault elements, security elements, automatic-weapon teams | Hold, seize, verify close terrain, protect routes, finish an objective handoff | Cohesion, cover, suppression, ammunition, local visibility, parent intent |
| Engineers | Pioneer/combat engineer teams, construction/repair elements | Clear simulated obstacles, improve a route, repair/deny infrastructure, prepare defensive works | Task time, tools/materials, exposure, route access, support requirement; use abstract game actions rather than physical procedures |
| Armor | Light, medium, and heavy tanks; cavalry/infantry tanks where a roster needs them | Mobile protected direct support, breakthrough pressure, exploitation, counterattack, mobile reserve | Road/ground/bridge access, visibility, fuel, damage, infantry support, anti-armor threat confidence |
| Specialized armored fighting vehicles | Assault guns, self-propelled guns, tank destroyers, flame/support variants only if the game models their effects | Direct support from a suitable position, mobile anti-armor, limited obstacle/strongpoint pressure | Narrow capability profile, arcs/terrain, ammunition, vulnerability outside its intended role |
| Anti-armor defense | Towed/self-propelled anti-tank guns, infantry anti-armor teams, vehicle obstacles | Deny vehicle routes, protect a sector, force armor rerouting, warn Force Command of armor risk | Concealment/observation confidence, firing sector, mobility, ammunition, exposure after engagement |
| Mortars | Light/medium/heavy mortar sections or off-map abstracted battery | Responsive local suppression, obscuration, screening, short-range interdiction | Observer confidence, ammunition, setup/readiness, minimum/maximum range abstraction, friendly-risk constraint |
| Field artillery | Towed batteries, self-propelled artillery, corps/army support abstracted by scenario | Scheduled suppression, route interdiction, obscuration, defensive fires, shaping a decisive point | Request latency, communications, target confidence, ammunition, weather/visibility, friendly-risk, limited duration |
| Air defense | AA guns, air-defense sections, fighters on patrol | Reduce hostile air freedom, protect a sector/asset, create an air-risk picture | Detection and coverage, ammunition/readiness, limited engagement window; it does not guarantee safety |
| Air power | Reconnaissance aircraft, artillery-observation aircraft, fighters, fighter-bombers, medium/heavy bombers when scenario scale supports them | Observe, spot, cover friendly air, interdict movement, strike a designated area, disrupt rear support | Sortie availability, weather, daylight/visibility, identification confidence, approach time, air-defense risk, result delay |
| Naval/coastal/amphibious (scenario-dependent) | Landing craft, coastal patrol, naval gunfire liaison, shore-fire support abstracted at map edge | Deliver a force, support a coastal objective, screen an approach, or provide delayed shaping effects | Shore/sea access, tides/weather if modeled, communications, fire-support availability, friendly-risk, and off-map delay |
| Mobility and sustainment | Trucks, jeeps, motorcycles, half-tracks, tractors, fuel/ammunition vehicles, recovery vehicles | Move reserves and supplies, tow/position support assets, recover damaged vehicles, maintain operational tempo | Road capacity, congestion, fuel, damage, exposure, loading delay, no safe arrival guarantee |
| Medical and personnel services | Medics, aid stations, evacuation vehicles, replacement flow if scenario scale supports it | Stabilize abstract casualty/readiness state, evacuate, preserve unit availability | Access route, time, capacity, communications, threat; never turn casualty removal into free replenishment |
| Static defense and obstacles | Fortifications, roadblocks, mines/obstacles as map entities, observation posts | Channel movement, delay, deny routes, protect a sector, create an information advantage | Must be discovered/observed to be known; damage, clearance, and control are explicit state changes |

### Armor as an independent but cooperating arm

Use broad capability profiles rather than assuming every tank has the same job. A scenario can give a
vehicle class different values for mobility, protection, direct-fire effectiveness, observation, and
reliability without importing modern capabilities or exact weapon specifications.

| Armor role | Suitable asset profiles | AI task | Completion evidence |
|---|---|---|---|
| Reconnaissance screen | Armored car, light tank, fast tracked vehicle | Refresh route/threat confidence, screen an exposed axis, disengage on unacceptable risk | Report delivered; route state updated; asset remains recoverable |
| Infantry direct support | Medium/heavy tank, assault gun, infantry-support vehicle | Occupy a compatible support position and apply bounded pressure while infantry executes its task | Support sector acknowledged; requested effect observed; infantry reports progress or request changes |
| Breakthrough / shock | Concentrated armor with infantry and engineer support available | Create a temporary advantage on the selected axis and open a route for the main effort | Route/sector changes from blocked or contested to usable with evidence; not merely vehicle arrival |
| Mobile reserve / counterattack | Available armor near a viable route | Hold readiness, then respond to an enemy thrust or exploitation opportunity under Force intent | Threat or opportunity is contained/exploited; reserve commitment is explicitly released or renewed |
| Anti-armor overwatch | Tank destroyer, suitable tank, towed gun if mobile enough | Deny a vehicle approach and protect friendly armor/infantry from a known vehicle threat | Sector coverage and observation remain current; no claim of a destroyed threat without evidence |
| Exploitation | Mobile armor with supply/route confidence | Extend success through an open axis while preserving a return/recovery condition | New decisive point is reached or a handoff occurs; route and fuel state remain viable |

Armor controller rules:

- A vehicle follows a `VehicleTask` lease with a route, position purpose, engagement sector, abort
  condition, fuel/readiness budget, and return/recovery condition.
- It publishes vehicle-route viability, observed threat, damage, and support-effect confidence to the
  common picture; it does not declare structures secured or choose infantry room/cell movement.
- Infantry planners treat armor as a capability with a location and availability window, never as a
  permanent nearby bonus. Dense streets, rubble, unsuitable bridges, and uncertain anti-armor risk
  can make a requested position invalid.
- A vehicle that loses communications retains only a conservative local task until lease expiry, then
  withdraws/recovers according to its scenario policy rather than pursuing an obsolete objective.

### Indirect fire and artillery

Mortars and artillery should be represented as time-bounded area effects with uncertainty, not as
instant precision damage. The controller evaluates a request against observer confidence, friendly
risk, readiness, ammunition, priority, and request expiry. It then returns an explicit status and
effect window.

Supported effect cards:

- **suppress:** temporarily lowers hostile freedom of movement/effective observation in a bounded
  area; it does not certify that enemies are gone.
- **obscure:** changes visibility or route confidence for a short duration, with a cost to both sides
  if the simulation supports it.
- **interdict:** makes a route, junction, or staging area less attractive or temporarily unusable;
  its impact must be measured from actual movement/control events.
- **protect:** reserves responsive support for a friendly sector or withdrawal route, subject to
  latency and availability.
- **shape:** scheduled support that creates a time window for the already-declared main effort.

The Fires Controller owns effect scheduling and cancellation. Captain Local Plan decides whether a
returned window is still useful; Squad Plan and Engagement respond to the resulting observed state.
No fire-support module changes a squad's movement intent or claims a capture outcome.

### Air operations at WWII battle scale

Aircraft should normally be a mission-level, delayed asset rather than a continuously controllable
unit. At tactical map scale, represent its result through a sortie lifecycle:

```
requested → allocated → assembling/enroute → on-station → effect observed → returning/reset
```

| Air mission | Desired game effect | Must model as constraints |
|---|---|---|
| Tactical reconnaissance | Refresh a broad route/sector picture and expose confidence, not perfect enemy positions | Weather, daylight, cloud/visibility, enemy air/AA risk, reporting delay, information decay |
| Artillery observation / spotting | Improve a Fires Controller target-confidence score for a limited window | Line of sight/weather, communications, task priority, no guarantee of a successful correction |
| Fighter cover / air superiority | Reduce hostile air freedom over an area for a time window | Sortie timing, opposing aircraft availability, range/endurance abstraction, uncertain outcome |
| Close support / fighter-bomber strike | Apply a bounded disruption or suppression effect against a verified area/asset | Target identification, friendly-risk, approach delay, AA/weather risk, limited passes and ordnance/readiness |
| Interdiction | Disrupt a route, bridge, convoy, or rear-area node and alter logistics/route confidence | Target persistence, damage assessment uncertainty, repair/recovery, mission availability |
| Operational strike | At a larger scenario scale, delay enemy reinforcement or reduce support availability | Long delay, coarse effects, imperfect assessment; do not use it as an instant tactical answer |

Air Controller owns flight path, sortie state, availability, and result confidence. Ground command
only requests an effect and can cancel it before execution if the situation changes. A visible target
marker is a hypothesis with time and confidence, not an authorization to treat every nearby entity as
identified.

### Vehicles, logistics, and recovery

Model service vehicles because they make operational tempo meaningful. Trucks and half-tracks move
people and supplies; tractors/tows make artillery movement possible; recovery assets restore or
remove disabled vehicles; command vehicles improve a communications node. They have an independent
route and loading/unloading state, and must respect congestion, bridge limits, damage, fuel, and
contact risk.

Use a compact `SustainmentState` for every formation and major asset:

```js
{
  ammo, fuel, maintenance, medicalCapacity,
  routeToSupply: { state, confidence, observedAt },
  resupplyRequestId, recoveryRequestId, unavailableReason
}
```

This should create decisions—pause, reroute, use a reserve, protect a convoy, or reduce a mission's
ambition—not busywork. At the current simulator scope, numbers may remain abstracted into readiness
bands instead of copying real load tables.

### WWII authenticity adapters

Modern source material supplies decision concepts, but the implementation should deliberately use a
WWII-era information and capability model:

- messages can be delayed, lost, relayed, or acknowledged late; local leaders act under the last
  valid intent when disconnected;
- reconnaissance and aircraft create time-stamped, decaying observations rather than live universal
  vision;
- tanks depend on roads, ground, bridges, fuel, recovery, crew condition, and infantry cooperation;
- fire support and air missions have preparation, response, and assessment delays;
- target identification and battle-damage assessment remain uncertain;
- commander loss causes a visible succession/degraded-control state rather than perfect continuity;
- terrain damage, congestion, smoke, weather, daylight, and logistics influence availability; and
- individual weapons and platform effects are represented by balanced game capability profiles, not
  literal weapon drills or contemporary technical data.

### Combined-arms graph and diagnostics

The AI graph needs a visible companion branch, linked to but separate from the infantry decision
chain:

```
Force Intent → Captain Plan → Support Request → Asset Controller → Effect Window → Observed Result
       │              │                                                        │
       └──────────────┴────── reassessment / next intent ──────────────────────┘
```

For each asset/request, render: requester, parent intent version, priority, target confidence,
allocation reason, availability, route/sortie state, scheduled window, acknowledgement, effect
confidence, cancellation/denial reason, and expiry. Diagnostics must also show:

- asset contention and which main effort won the allocation;
- vehicle route failure, bridge/terrain constraint, recovery state, and fuel/readiness band;
- fire/air latency from request to effect, plus friendly-risk rejections;
- observation source, age, and confidence before and after a recon or air mission;
- support-induced route/control change versus a merely requested effect; and
- zero cross-domain ownership violations: infantry orders never written by an asset controller and
  vehicle movement never written by a squad planner.

## Urban operating picture

MCTP 12-10B treats an urban area as an interdependent system rather than a flat map. Model the
simulation with an `UrbanOperatingPicture` that is updated from navigation, objectives, sensors, and
events. It is a shared read-only input to planners—not another order writer.

### Urban triad

| Layer | Game representation now | Extension when the simulation adds it |
|---|---|---|
| Terrain | Streets, junctions, buildings, cover, elevation, roofs, and tunnels | Damage, rubble, weather, visibility, and mobility changes |
| Infrastructure | Bridges, routes, objectives, utility/transport nodes, and building connectivity | Functional consequences when a node is blocked, damaged, or restored |
| Population | Explicitly absent in the current combat-only sim | Civilian presence, safe areas, movement patterns, and protected-site constraints |

Do not simulate population effects implicitly. Until civilians and constraints exist as real simulation
data, the AI must label that layer `not-modeled` instead of behaving as though it knows it.

### Spatial layers

Every tactical node must be addressable by layer, because a street-level result is not proof of overall
control:

```
surface       streets, parks, ground floors, bridges, open approaches
supersurface  upper floors, roofs, windows, elevated observation/firing nodes
subsurface    basements, garages, tunnels, drains, service passages
```

A building or objective stores its accessible layers, entrances/exits, connections, observation state,
and control confidence. Unknown layers remain unknown. This makes the existing hardpoint and
navigation systems inputs to planning rather than detached visual details.

### Urban operation state

The force-level operation uses MCTP’s planning/execution framework:

```
understand → shape → engage → consolidate → transition
                  ↘ reassess / change branch ↗
```

- **understand:** collect and age observations of routes, building layers, objective sectors, and
  threats; identify candidate decisive points.
- **shape:** create favorable conditions using route control, support positions, observation, and
  force allocation. In game terms, *isolation* means controlling the relevant reinforcement and exit
  connections to a sector; it is not assumed from proximity alone.
- **engage:** execute the current seizure, security, or defensive plan under the parent intent.
- **consolidate:** turn temporary control into enduring control: verify routes, retain necessary
  sectors, replace depleted units, and establish a successor or reserve.
- **transition:** hand the sector/mission to the next force, authority, or objective plan only after
  acknowledgement and a valid local picture transfer.

Each state has an owner, entry condition, progress signal, timeout, abort condition, and explicit next
state. The AI graph shows the active operation state above individual squad phases.

## Doctrine-derived design constraints

The detailed text reinforces constraints that should govern every tactic card and learned policy:

- **No formula masquerading as judgment.** A tactic library proposes bounded options; it must not
  hard-code “if X, always do Y.” Candidate plans are evaluated against the current situation,
  confidence, and the parent intent.
- **Ask what is decisive repeatedly.** Reassess the decisive point after material contact, route
  failure, control change, casualty/cohesion threshold, or expiry of a commitment—not on every
  simulation tick.
- **Model a critical vulnerability as a game opportunity.** Examples include a weakly held approach,
  an unobserved route, a broken opposing formation, or a newly opened objective sector. It must have
  a confidence score, an expected mission effect, and a timeout; it is never treated as omniscient
  enemy knowledge.
- **A main-effort change must be material.** If Force Command shifts priority to another squad, it
  must also reassign the relevant support, reserve, and objective-security commitments. Relabeling a
  squad without moving support is not a real decision.
- **Branches and sequels are few and explicit.** Each local plan should carry one or two branches
  (for example `route-blocked` or `unexpected-contact`) and one sequel (`secure`, `exploit`, or
  `recover`). This prevents both fragile scripts and an unbounded plan tree.
- **Tempo is accurate decision speed.** Measure detection-to-coherent-action and successful
  handoffs, not movement scale alone. A fast invalid order or a fast loop is a failure.
- **Control is reciprocal feedback.** Local plans publish observed effects upward and laterally;
  Force Command adjusts intent from that feedback. It should not prescribe individual execution.

## Shared tactical vocabulary

Implement these as a small, explicit `TacticalSituation` snapshot on each commander tick. It should
contain confidence as well as observations; unknown is a valid value, not a zero.

| Concept | Simulation representation | Primary consumer |
|---|---|---|
| Decisive point | Objective, route junction, building, or corridor whose control changes the local balance | Force Command |
| Main effort | The squad/task given the current priority and commitment budget | Force Command |
| Supporting effort | Squad that protects a route, fixes pressure, holds ground, or enables the main effort | Captain / Force Command |
| Local advantage | Friendly/enemy strength, cover, LOS, cohesion, position, and initiative score with confidence | Captain |
| Control | Observed occupancy and line-of-sight influence over a structure, street segment, or objective sector | Captain / Objective system |
| Tempo | Time from contact or opportunity to a coherent, valid plan—not raw walking speed | All layers |
| Commitment | A named lease with owner, expiry, release conditions, and progress test | Intent resolver |
| Success | A threshold event: objective captured, route opened, enemy displaced, or pressure broken | Force Command |
| Enemy hypothesis | Likely next enemy action and its confidence, derived from recent observations | Force / Captain |

Every decision records `reason`, `confidence`, `expectedProgress`, `reassessAt`, and `abortConditions`.
That makes tactical behavior inspectable and prevents a score from looking like certainty.

## Force-level objective cycle

### 1. Frame the decision

For each candidate objective or decisive point, calculate a value from mission effect, enemy control,
route access, nearby cover/buildings, friendly travel time, and whether holding it protects another
objective. A decisive point may be an objective, a single building, a limited sector, a junction, or
an infrastructure node; it is not necessarily the whole town.
Pick one **main effort** and at most one supporting effort. Keep a reserve when the local situation
is uncertain or the force is already committed elsewhere. Include a small enemy hypothesis in the
evaluation so a route is judged against both known control and the most credible near-term response.

Force Command emits a versioned `SquadIntent`, not mutable ad-hoc fields:

```js
{
  id, version, issuedAt, expiresAt,
  mission: 'seize' | 'secure' | 'screen' | 'support' | 'reserve' | 'withdraw',
  objectiveId, priority, commitment,
  successCondition, abortConditions,
  reason, confidence
}
```

### 2. Shape the local advantage

Before a direct push, prefer a low-risk way to improve position: gain a useful observation point,
control a route junction, occupy cover overlooking the objective, or move a support squad to a
position that makes the main effort safer. Do not issue a new intent unless this changes expected
progress materially.

### 3. Seize and confirm

Move from `approach` to `seize` only when the plan has an achievable entry/control route. Do not
declare success merely because a unit reached the center marker: require objective progress plus
control of its relevant sectors for a short confirmation window.

### 4. Secure, exploit, or release

After a capture, choose explicitly:

- **secure:** retain a garrison/perimeter when the objective remains threatened;
- **exploit:** advance the available squad or reserve through the newly opened route when pressure
  has collapsed and the next decisive point is reachable;
- **release:** hand responsibility to another squad and reassign the first unit only after the
  handoff is confirmed.

This is the important “finish” loop: no indefinite orbiting around a captured marker and no whole
force freezing after one success.

## Structure-control model (house clearing abstraction)

Treat a house as a navigable game-space graph, not as an opaque point or a literal real-world drill.
Buildings expose exterior approaches, entry nodes, interior cells, firing stations, windows, and
exits. A building state is:

```
unknown → observed → contested → controlled → secured → released
```

`controlled` means the AI has local positional influence; `secured` means the relevant cells have
been checked, no hostile contact remains within a timed confidence window, and an assigned unit can
hold the position. Confidence decays when line of sight is lost or an enemy is reported nearby.

Control must be evidence-based: who last observed the node, when, from which spatial layer, whether
friendly access remains open, and whether a confirmed hostile route still connects to it. Arrival at a
building center or a short-lived firing-station claim is not enough to call it controlled.

### Building mission state and roles

MCWP 3-35.3 gives the AI a useful operation-level sequence. Represent it as a bounded, replayable
state machine rather than a scripted physical drill:

```
reconnoiter → isolate → foothold → systematic control → reorganize/consolidate → handoff or exploit
```

- **reconnoiter:** obtain and age evidence for approaches, accessible layers, connectors, exits,
  likely opposing positions, and adjacent support positions.
- **isolate:** assign observation/control sectors over the building’s graph connections so unknown or
  hostile movement cannot silently reinforce the target.
- **foothold:** establish a confirmed friendly control node that permits the local plan to continue.
- **systematic control:** process reachable cells and critical connectors under a plan lease; retain
  current control evidence and do not skip an unresolved connection.
- **reorganize/consolidate:** refresh cohesion, supplies/readiness if modeled, ownership, and sector
  coverage before the next task.
- **handoff or exploit:** transfer a verified building picture to its holder, or use the controlled
  structure to enable the next decisive point.

For every building plan, Captain Local Plan allocates three **intent roles**: `assault` (advances the
control plan), `support` (enables the plan from a compatible position), and `security` (guards graph
connections and the local rear/flanks). These are task assignments, not competing destination
writers. Squad Orders turns them into formation/order proposals; Movement Resolver and Engagement
retain their existing physical-movement ownership.

### Local planner phases

1. **Assess.** Build an observation summary: known enemy contact, blocked routes, usable positions,
   friendlies, and uncertainty. If no safe/viable approach is known, request observation or choose
   a different task rather than cycling between entry points.
2. **Isolate.** Allocate local sectors around the structure so movement into and out of it is visible
   in the simulation. This is a positioning constraint, not an individual destination writer.
3. **Gain access.** Choose an approach with the best combined route safety, cover, exposure, and
   expected progress. Persist it for a plan lease; change only on blocked path, decisive new contact,
   casualty/cohesion failure, or expiry.
4. **Clear by cells.** Advance the local plan one navigable cell at a time. A cell changes state only
   after presence/observation confirmation; it is never “cleared” simply because a squad objective
   points at it.
5. **Confirm and assign.** On control, decide whether the building contributes to objective security,
   street control, or the next route. Claim only the necessary firing stations and release stale
   claims promptly.
6. **Handoff or continue.** Keep a small holder only when it materially protects the mission;
   otherwise free the squad for the next decisive point.

### Data contract

```js
{
  buildingId, cells: [{ id, state, observedAt, confidence, occupantFaction }],
  approaches: [{ id, from, exposure, blocked, observedAt }],
  connectors: [{ id, fromCellId, toCellId, layer, state, observedAt, confidence }],
  sectors: [{ id, ownerSquadId, purpose: 'observe' | 'hold' | 'approach' }],
  control: { faction, confidence, since, contested },
  plan: { phase, selectedApproachId, currentCellId, leaseId, roles: {} }
}
```

The future `Captain Local Plan` owns this data. `engagement.js` still owns each soldier’s cover,
stance, firing decision, and final combat movement.

## Street and route-control model

Represent streets as directed segments between junctions, with adjacent cover, exposure, visibility,
blocked state, and controlling faction confidence. Treat a crossing as a **route transition** with a
plan, not as a generic formation move.

```
observe route → establish local support → transition → confirm far-side control → continue or hold
```

The captain assigns maneuver, support, and local-security roles at fireteam granularity. The active
movement team receives a short progress-bound lease; support holds a sector until a release condition
is met; local security maintains route/connection observation. Rotate the active role only after a
valid transition or a measured readiness/exposure reason. If the transition cannot progress, the
captain should choose `reroute`, `regroup`, or `request-support`—not repeatedly reissue the same
point.

Useful route-control signals:

- time since last safe observation;
- known threat direction and confidence;
- friendly/enemy influence by segment;
- travel progress versus expected progress;
- open/blocked navigation result;
- whether an alternate route reduces exposure enough to justify delay.

Like MCTP’s route/area-clearance concept, a game route is considered usable only while it remains
under friendly control or recent observation. A past transition does not permanently clear a segment;
loss of control reopens it as an uncertainty that needs reconnaissance or a new plan.

## Fireteam and individual execution contracts

### Fireteam: coordinated local executor

MCRP 3-10A.4 makes the fireteam the smallest coordinated fire/maneuver unit. In this simulation, a
fireteam consumes one parent squad task and publishes a `FireteamExecutionState`; it does not choose
the force objective or issue final individual destinations.

```js
{
  task: 'recon' | 'move' | 'support' | 'secure' | 'recover',
  leaderId, members: [],
  localAnchor, observationSector, formation,
  contact: { known, confidence, reportedAt, direction },
  readiness: { cohesion, ammo, suppression, fatigue: 'not-modeled' },
  progress: { state, expected, actual, blockedReason },
  request: 'none' | 'support' | 'relief' | 'reroute'
}
```

The leader uses this state to keep the team coherent, share observations, maintain its assigned
sector, and request help or a new route. `support`, `security`, and `assault` remain parent-plan
roles; `recon`, `move`, `secure`, and `recover` are executable local tasks. A different fireteam
may temporarily become the squad’s base/reference team for formation and progress, but this is a
control aid—not an alternate commander.

### Soldier: perception and engagement executor

The soldier layer is intentionally narrower. It receives the fireteam task, formation/anchor proposal,
current contact picture, and any claimed firing station. It owns only:

- perception and report confidence;
- target selection and target-memory expiry;
- weapon readiness, reload, and fire discipline;
- stance/cover/firing-station choice under the active plan;
- a short-lived combat-movement proposal to Movement Resolver; and
- animation state derived from those decisions.

It reports `contact`, `observation`, `suppression/readiness`, `blocked`, and `task-complete` upward.
It may protect itself or react to immediate contact, but it cannot silently change its fireteam task,
squad objective, or Force Intent. This preserves decentralized initiative without reintroducing the
writer conflicts already fixed in the simulator.

## Objective security and defense

Replace a single capture-circle mindset with **sectors and responsibilities**.

1. Partition an objective into approach sectors derived from terrain, streets, and structures.
2. Assign only enough defenders to cover the threatened sectors; avoid placing every soldier at the
   objective center.
3. Maintain a small reaction element or reserve when force size allows.
4. Measure security using contested time, observed approaches, garrison cohesion, and control of
   relevant sectors—not only presence count.
5. Release the security lease when threat confidence falls, the minimum confirmation window ends,
   and a successor/adjacent force can cover the exposed route.

The existing capture-zone module can remain the win-state authority. A new tactical-security module
should submit sector constraints to the Captain plan rather than overwrite `commandPhase` or
`objective` itself.

## Contact, adaptation, and tempo

Use a small common state machine across missions:

```
plan → execute → contact/constraint → assess → adapt → execute
                    └→ abort/recover → replan
```

Contact does not automatically mean retreat or a whole-squad regroup. The captain evaluates local
advantage and chooses one bounded response: hold, gain cover, shift approach, request support,
continue under a valid plan, or recover. Force Command changes the mission only when the tactical
change affects the objective decision.

Tempo metrics should favor coherent action:

- contact-to-valid-plan time;
- observation-to-confidence-qualified opportunity time;
- order changes per meter of net progress;
- plan completion/abort ratio;
- time an objective remains contested after a successful entry;
- time from capture to secure/exploit/release decision;
- stale-observation and stale-intent counts.

Do not use casualties or kills as the primary learned-policy reward. The central outcome is mission
effect: decisive objective control, route access, a secure handoff, or a favorable next decision.

## Cooperation and communication

Cooperation should be modeled as shared, time-stamped facts rather than synchronized scripts:

- sightings and confidence;
- route/blockage reports;
- building-cell state;
- support-ready and transition-complete acknowledgements;
- objective-sector ownership;
- intent version and lease status.

Allow bounded order delay and stale information later, but make it visible. A recipient may act on a
local opportunity within the parent intent; it cannot silently replace the strategic objective.

## Implementation sequence

### Phase A — Instrument and model (behavior-neutral)

- Add `TacticalSituation` plus an `UrbanOperatingPicture`: triad layer flags, surface/supersurface/
  subsurface nodes, street segments, building cells, sector visibility, and confidence decay.
- Add enemy hypotheses and opportunity records with evidence, confidence, expected effect, and
  expiry; expose both confirmed facts and inferences distinctly.
- Extend diagnostics export and AI graph with: urban operation state; Force Intent → Captain Plan →
  Squad Plan → Movement Resolver → Engagement; selected approach/route; active lease; progress;
  abort reason; confidence.
- Add counters for plan churn, no-progress transitions, cell-control confidence, secure handoffs, and
  exploit decisions.

**Done when:** a replay explains why a squad selected a route/structure and who owned each order.

### Phase B — Versioned intent and leases

- Implement the `SquadIntent` contract from the command-hierarchy plan.
- Convert plan holds, objective security, station claims, and route transitions to named leases with
  owner, priority, expiry, progress test, and release condition.
- Make incompatible intents resolve centrally; never use write/restore races.

**Done when:** conflict telemetry reports zero strategic-field ownership conflicts in a normal match.

### Phase C — Captain local planner

- Create a `captain-local-plan` module that consumes Force Intent plus `TacticalSituation`.
- Implement local tasks: approach, support, route-transition, structure-control, objective-security,
  recover, and handoff.
- Degrade predictably when the captain is unavailable: retain the current valid plan, then use a
  conservative squad fallback.

**Done when:** Force Command selects *what* to seize/secure and Captain selects *how locally*
without changing the strategic objective.

### Phase D — Streets and structures

- Add street segment graph and layered building-cell graph from existing navigation/building data.
- Model entrances, exits, layer connections, route ownership, and observation age. Do not claim a
  building or route is clear without current control evidence.
- Add route-transition and structure-control plans with the state machines above.
- Integrate building hardpoints as optional local-plan resources, while Engagement retains station
  movement and firing behavior.

**Done when:** squads stop oscillating at corners/windows, can confirm structure control, and can
explain reroutes or aborts.

### Phase E — Secure and exploit

- Add sectorized security, successor handoff, reserve commitment, and exploit-after-success logic.
- Give Force Command a post-capture deadline: choose secure, exploit, or release with a reason.

**Done when:** captured objectives receive appropriate coverage while available units continue toward
the next decisive point.

### Phase F — Train, evaluate, tune

- Build deterministic scenario tests: open-ground objective, contested intersection, blocked street,
  single structure, multi-structure objective, hidden upper/lower route, counterattack, loss of
  captain, and post-capture exploitation.
- Score mission completion, casualties, time, plan churn, invalid movement ownership, and objective
  security; do not optimize only for kills or walking speed.
- Keep a replay corpus and compare policy revisions against the same seeds.

**Done when:** a new policy improves mission score without increasing loops, stale orders, or
unexplained order conflicts.

### Phase G — Combined-arms control plane (behavior-neutral)

- Add an asset registry, `SupportRequest`, request lifecycle, `VehicleTask`, and abstract
  `SustainmentState`; do not add combat effects yet.
- Add the `CombinedArmsCoordinator` as a scheduler that can accept, deny, expire, and trace requests
  while leaving current infantry behavior unchanged.
- Extend the AI graph and diagnostics with the support-request branch, asset availability, request
  causality, communication/observation age, and cross-domain ownership checks.
- Seed fixed test scenarios with competing support requests and delayed/lost acknowledgements.

**Done when:** a replay can explain which main effort received a scarce asset, why another request
was denied or delayed, and that no asset controller changed an infantry destination.

### Phase H — Ground vehicles and anti-armor

- Build a separate vehicle navigation/reservation layer, terrain/road/bridge constraints, recovery,
  fuel/readiness bands, and `VehicleTask` leases.
- Introduce one direct-support armor profile and one anti-armor profile before expanding the roster.
  Validate approach, reserve, withdrawal/recovery, and route-denial behavior against fixed seeds.
- Teach Captain Local Plan to request a vehicle effect/position window, never to command a vehicle
  path or use vehicle proximity as proof of objective control.

**Done when:** vehicles support or constrain a local plan without colliding with infantry movement
ownership, and failed mobility is visible as a reasoned state rather than a stalled unit.

### Phase I — Mortars, artillery, and air as delayed effects

- Implement one common Fires Controller with suppress, obscure, interdict, and protect effect cards;
  test status, latency, cancellation, friendly-risk, result confidence, and expiry before tuning
  damage/effect values.
- Implement recon/spotting first, then one bounded air-support mission. Model sortie availability,
  weather/visibility, air-defense risk, request delay, and observation decay.
- Require every effect to feed an observed result back to the common picture; requests alone never
  update route or objective control.

**Done when:** planners wait for, adapt to, or abandon delayed support rationally, and the graph can
separate a requested effect from an observed mission advantage.

### Phase J — Sustainment, service, and roster breadth

- Add transport, towing, resupply, medical evacuation, maintenance, recovery, and static-obstacle
  state only where each changes a tactical or operational choice.
- Add roster variants (light/medium/heavy armor, armored cars, assault guns, tank destroyers, mortar
  and artillery classes, fighter/recon/strike aircraft, and scenario-appropriate naval/coastal
  support) as capability data rather than new command code paths.
- Add larger-scope scenarios: armored exploitation, delayed counterattack, bridge loss, convoy
  disruption, contested airspace, artillery allocation, and combined-arms objective handoff.

**Done when:** scenario designers can compose historically flavored forces through data while the
same command, request, vehicle, and effect contracts remain valid.

## Immediate first implementation slice

Start with Phase A plus the smallest part of Phase B:

1. Add `TacticalSituation` and a read-only `street/building control` diagnostic snapshot.
2. Render it in the existing AI graph and diagnostics exporter.
3. Add `SquadIntent` version/reason/confidence alongside current command fields, without changing
   behavior.
4. Add one named `route-transition` lease and trace its progress/abort reason.
5. Validate on fixed seeds before enabling any new route or structure behavior.

This gives us a visible, testable control plane before teaching the AI new movement patterns.
