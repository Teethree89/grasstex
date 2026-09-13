# Battle AI Command Hierarchy Plan

## Goal

Eliminate competing-order and short-loop behavior by giving each layer one explicit responsibility and one authoritative output. The long-term hierarchy is:

**Force / Company Command decides WHAT -> Captain decides HOW LOCALLY -> Squad Orders organize the formation -> Engagement decides HOW EACH SOLDIER FIGHTS -> Soldier executes.**

No two layers should own the same class of decision.

## Step 1 - Make the current hierarchy truthful in the graph

Status: **implemented first; no behavior change.**

- Rename the current abstract `Commander Decision` graph node to **Force Command**.
- State its ownership explicitly: objective, route, command phase, doctrine action.
- Add a **Captain Leadership** node, but show it as an influence/status source rather than a second order authority.
- Show the captain's current real effects: normal vs captainless cohesion, extra corner delay, `captainDead` policy condition, formation slot, and voice callouts.
- State Squad Orders ownership: formation, order anchor, member slots / fireteam organization.
- State Engagement ownership: individual cover, stance, bounds, firing and personal combat movement.
- Keep the step observational so it cannot create another movement writer.

Definition of done: a person reading the graph can answer "who owns this decision?" without reading source code.

## Step 2 - Add order provenance and writer-conflict telemetry

Instrument the fields that currently define intent and movement:

- squad `commandPhase`
- squad `targetObjective` / `objective`
- squad `orderAnchor` / rally
- fireteam destination / prepared-post assignment
- soldier `orderDestination`
- soldier final `destination`

For every meaningful change record: value, owner/system, reason, timestamp and previous owner. Loop Watch should flag two systems alternately writing the same decision class even if the resulting positions are only a few meters apart.

Definition of done: every suspicious movement can be traced to the system that requested it and the system that finally executed it.

## Step 3 - Introduce one versioned SquadIntent contract

Force Command stops sharing mutable squad fields as its implicit API. It emits a versioned intent such as:

- mission / action
- objective id and command point
- route / approach
- strategic role
- commitment / urgency
- reason / rule id

Objective capture, prepared defense and engineer systems stop directly competing for the same command fields. They submit explicit constraints or advisories to the intent resolver instead.

Definition of done: there is one authoritative strategic intent per squad at a time.

## Step 4 - Convert overlapping timers into owned leases

Replace the ambiguous stack of raw timers with named leases/constraints that have:

- owner
- purpose
- priority
- start time / expiry
- release condition
- whether contact can interrupt it

Map the existing behavior rather than inventing new durations first: capture secure window, assault/defense plan commitment, defensive-post freeze, alert hold, bound cycle, engineer build and persistent garrison. The graph should show which lease is currently blocking an intent change.

Definition of done: an 18 s capture secure lease, 38 s plan lease and 45 s post lease cannot silently fight each other.

## Step 5 - Make Captain a real local tactical planner

This is the first major behavioral hierarchy change.

Force Command owns **WHAT**: take/defend/support objective X.

Captain owns **HOW LOCALLY** inside that mission:

- approach side / local axis
- formation choice
- rally / local anchor
- base-of-fire selection
- which fireteam bounds
- occupy building hardpoints / prepared defenses
- local secure / regroup decision within the mission

The captain may not replace the strategic objective or assign individual soldier cover points. If the captain is killed, deterministic degraded squad defaults take over and cohesion/coordination penalties remain visible.

Definition of done: captain behavior adds tactical execution without becoming a second Force Command.

## Step 6 - Harden Engagement as the sole individual movement/combat owner

Formalize the input contract to Engagement. Squad/Captain/Defense may provide tactical goals, posts, sectors and permission to assault; only Engagement may decide an individual soldier's final combat destination, cover, stance, bound and firing behavior.

Remove or migrate any remaining post-hoc `soldier.destination` writers outside setup/teleport initialization.

Definition of done: during live combat there is one writer for personal movement.

## Step 7 - Loop prevention and live execution trace

Upgrade Loop Watch from symptom detection to causal tracing:

- A <-> B and A -> B -> C -> A phase cycles
- repeated destination/post swaps
- low net progress with high travel
- lease/owner changes that trigger the loop
- active Force Intent -> Captain Plan -> Squad Order -> Engagement state chain

Add hysteresis/progress gates only where traces demonstrate a real loop. Normal fire-and-movement bounds remain recognized as intentional loops.

Definition of done: a position-seeking trap names the exact transition and owner that caused it.

## Step 8 - Long-term command hierarchy and larger-unit tactics

Once ownership is clean, expand upward rather than adding more peer writers:

- platoon/company command entities
- multiple squads under one commander
- reserve commitment and counterattack
- fallback sectors / withdrawal plans
- engineer tasking from command rather than opportunistic-only construction
- command casualties and succession
- communication / order delay and stale orders
- doctrine by echelon
- eventual armor/support/combined-arms tasking through the same intent contract

The invariant remains: higher echelon assigns mission; lower echelon chooses execution within that mission; Engagement owns the individual fight.

## Non-negotiable architecture rules

1. No two live systems own the same decision class.
2. Strategic objective selection never writes individual soldier movement.
3. Captain local planning never changes the strategic objective without a new Force Command intent.
4. Objective/defense modules constrain or inform; they do not secretly become alternate commanders.
5. Every timer/hold has an owner and a visible release condition.
6. Every loop diagnostic must distinguish intentional tactical repetition from pathological no-progress cycling.
