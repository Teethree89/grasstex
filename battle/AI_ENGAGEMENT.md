# Engagement contract

How an individual soldier fights, and who is allowed to decide what. Written down because the
previous arrangement — four modules each wrapping `SquadAI.updateSoldier` and each writing
`destination` / `prone` / `tacticalCrouch` on the same tick — had no owner, and the last writer won.
The visible result was soldiers walking to formation slots while pointing rifles: they never
recognised a target, never initiated contact, never got down.

## Ownership

| Layer | File | Owns | Must not touch |
| --- | --- | --- | --- |
| Perception | `squad-ai.js` | who can see whom, shot resolution, formations, squad state | individual stance or destination during combat |
| Individual combat | `engagement.js` | movement proposals, `prone` / `crawling` / `tacticalCrouch`, permission to fire | reservations, physical destination, commander intent |
| Squad stability | `modules/16-squad-plan-stability.js` | committed plans, fireteam slots, defensive posts | stance, cover, firing |
| Tactical positions | `modules/20-building-hardpoints.js` | reservation registry, assignment lifecycle, committed ingress route | personal target, physical destination |
| Tactical routing | `modules/52-survival-tactical-route.js` | safe ingress construction, suppressed cover detours | reservation lifecycle, physical destination |
| Navigation | `battle-navigation.js`, `modules/39-navigation-physicality-debug.js` | static stations, doors, physical pathfinding and collision | task assignment or release |
| Movement resolver | `movement-resolver.js` | final physical destination, selection of command/combat/position waypoint | command task or reservation lifecycle |
| Commander | `commander-ai.js` + `commander-doctrine.js` + `commander-routes.js` | route, phase, objective | anything per-soldier |

Modules supply **inputs** to the engagement pipeline (`orderDestination`, `_fireteamDestination`,
`BattleTacticalPositions.current(soldier)`, `squad.commandPhase`). They do not override its **outputs**. A new module that
needs a soldier somewhere should express that as a position input, not as a post-hoc assignment to
`soldier.destination`.

## Persistent positional tasks

`BattleTacticalPositions` is the only reservation API: `claim(soldier, sim, station, threat)`,
`current(soldier)`, `station(soldier)`, `release(soldier, sim, reason)`. The registry keys assignees
by object identity (including numeric id zero); station IDs come from canonical navigation geometry.
There are no `_firingStation` / `_windowSlot` mirrors or navigation claim/release methods.

Tasks progress `assigned → ingress → occupying → holding → released`. Command/fireteam jobs
(`support-by-fire`, defensive holds, security) determine eligibility. Normal window candidates are
gunners and riflemen. Captains retain their command formation and seek protected cover within
18 metres of their command slot. Maneuver teams remain available to maneuver.

Personal target loss, target direction changes, reload and stoppage do not release a task. An
occupied soldier watches the stored sector and fires at valid targets facing that window. The
resolver reads the persistent assignment even when engagement's temporary proposals expire;
weapon cycles pause at the current point and then resume the same ingress route.

The router scores door exposure to the known threat and checks a bounded shortlist. It returns a
complete, exact route through door outside → door inside → station, stored on the task. Repeated
AI ticks consume waypoints without rescheduling doors or repeating path searches. Static geometry
changes invalidate that route; a replacement is built once or the manager releases an unreachable
station. Short rolling navigation queues are not used as proof that an ingress destination is reachable.

Death/incapacitation, retreat/regroup, command task/objective/plan replacement, invalid geometry,
confirmed unreachability, and battle end release assignments. The engagement plan owns its existing
quiet-close period; stripped runtimes without plans use squad quiet. No personal LOS grace timer
owns the station. Physical occupancy caches follow the registry revision, so releases are immediately
available to a new assignee. Personal-space correction anchors occupied tasks, not ingress soldiers.

Full-session exports contain `tacticalPositions` totals, role counts, release reasons, lifetimes,
current tasks/routes, and the last 80 releases; each soldier includes `positionalTask`. Counters
cover the full session, while release details are bounded. `averageAssignmentLifetime` includes the
current age of live assignments; `averageReleasedLifetime` includes only completed lifetimes.

Run `node tools/ai-sim-harness/tactical-positions-check.js` for the ownership and ingress regressions.

## The state machine

`engagement.js` runs exactly one state per soldier per AI tick. State is in `soldier.eng`
(`BattleEngagement.stateOf(soldier)`).

```
advance ──contact──> orient ──> (decide) ──> bound ──arrived──> engage
   ^                   ^                       |                 |  ^
   |                   |                       +--- timeout -----+  |
   |                   +----------------- re-acquire ---------------+
   |                                                             |
   +--- sector clear --- alert <--- target lost -----------------+

engage ──suppressed in the open──> pinned ──suppression lifts──> (decide)
engage ──ordered bound──> bound
engage ──authorised assault, no cover, close──> assault ──> engage
any ──squad retreating──> withdraw          any ──station claimed──> station
```

- **orient** is the beat that was missing: halt, turn onto the threat, weapon up. No shot is
  resolved during it (`REACT` per role, 0.45 s for a scout to 0.85 s for a gunner).
- **decide** answers "so what do I do about this enemy": already in cover → fight from here; cover
  within reach → bound to it; nothing to hide behind → go to ground and shoot, or assault if the
  squad has authorisation and the enemy is close.
- **engage** is static. Destination is pinned to the soldier's own position and the stance is
  committed for several seconds, so stance cannot churn frame to frame.
- **pinned** is prone and still while suppressed, firing only in the gaps.
- **alert** holds the threat sector for `ALERT_HOLD` after contact breaks instead of instantly
  resuming the march. Without it, intermittent line of sight produces the old walk/aim/walk cycle.

## Fire discipline

A shot is resolved only when all of these hold (`BattleEngagement.fireAllowed`):

- a live target, not reloading;
- past `eng.fireReadyAt` — re-armed by acquisition, a major retarget and every stance change;
- not moving faster than 12 % of top speed, and not crawling;
- facing the target within `AIM_CONE` (~12.6°);
- a gunner in `engage` has finished emplacing (`GUNNER_SETUP`).

## Shared contact and suppressing fire

`squad.contact` is one record per squad: `{unit, x, z, at, seenBy, stance}`, written by
`SquadAI.shareContact` for the enemy **nearest the squad's order anchor** that any member can
currently see, and read through `SquadAI.squadContact(squad, battle)`, which expires it after
`CONTACT_MEMORY` seconds — or after a third of that once the tracked man is confirmed dead. Killing
him decays the record faster (the reason for it is gone) but must not erase it: there are usually
nine more enemies in the same place, and wiping the squad's picture because it scored a hit left it
blind at the moment it was winning. Last-writer-wins was wrong: a
scout sees 175 m and would repeatedly point the whole squad at a contact a rifleman cannot reach, so
a fresher-than-`CONTACT_REFRESH` record is only displaced by something closer.

It does three things:

- `alert` faces it in preference to the man's own last sighting — somebody else may have eyes on now;
- `reactTime()` shortens recognition to `PREWARNED_REACT` of normal for anyone who did not find the
  enemy himself, so the squad that was told reacts faster than the man who found them;
- it is the aim point for suppressing fire.

`SquadAI.areaFire(shooter, point, battle)` puts rounds on a position rather than a man. It **deals no
damage on purpose**: the shooter has no line of sight to a body, so a round that would have hit is
stopped by whatever is hiding him — and no damage means it can never be used to farm kills through
cover. What it does is set `suppressedUntil` on everyone within a distance-scaled spread, which is
the whole tactical point. `SquadAI.canSuppress` gates it on weapon range and a clear shot at the
point itself (the obstacle field's used-as-cover exception means he can shoot at the hedge a man is
behind, but not through a hill).

`squad.inContact` means **shooting at somebody, or shooting at where they are** — never merely
knowing a position exists. Both halves of that are load-bearing and each was got wrong once:
counting only visible targets let one blink of line of sight clear the firefight state and reset the
bound cycle, so a squad trading fire through a hedgerow behaved as if the battle ended every couple
of seconds; but counting bare knowledge deadlocked the field, because a squad that knows about an
enemy 220 m away can neither shoot at it nor bound toward it (a bound needs a base of fire) and so
froze in place forever. Suppressor assignment already answers the question that matters — can
anybody here actually put rounds on it — so `inContact` is `contactCount > 0 || suppressors > 0`.
For the same reason a suppressing man counts toward `effectiveCount`, the base of fire a bound
requires: putting rounds on the position *is* being the base of fire.

`BattleEngagement.assignSuppressors` picks at most `MAX_SUPPRESSORS` men per squad, preferring the
machine gun, then whoever held the job last tick, then by slot. Excluded: men with their own target,
men moving/pinned/withdrawing/assaulting, men holding a firing station, men currently suppressed, the
movers during a bound, and — importantly — anyone who cannot reach the position, who is left to get
on with the advance rather than stood in the open pointing at something 180 m away. It runs *before*
the in-contact early-out in `updateSquad`, because suppression matters most in the gap where nobody
can see anyone.

A suppressor holds the firing line while the contact is current instead of lapsing out of `alert`
mid-burst, and fires in bursts of `SUPPRESS_BURST` with a `SUPPRESS_PAUSE` gap so a firefight has a
rhythm. `battle.onSuppressiveShot` draws the tracer to the aimed position, so the operator can see a
soldier is firing at a place and not at nothing.

## Fire and movement

`BattleEngagement.updateSquad` counts contacts, effective shooters and pinned men and reports them
up. The decision is the Captain's: `fireAndMovement` in `modules/16-squad-plan-stability.js`
authorises assault only in an assault phase (`assault`, `capture`, `clear-town`) and, every
`BOUND_CYCLE` seconds, if at least two men are shooting and not everyone is pinned, sends one
fireteam forward for `BOUND_DURATION` seconds through `BattleEngagement.orderBound`. Engagement only
executes the order it is given. While a squad is in contact the Captain's order anchor stops creeping
forward except during a bound: the squad is a base of fire, not a marching column. The machine
gunner is never a mover.

## Why stance matters mechanically

`obstacle-field.js` answers sight and cover questions per stance, using each obstacle's physical
height. A knee-high rock hides a prone man and not a standing one; `squad-ai.js` also scales
detection range by the target's stance and movement. So going prone genuinely reduces both being
seen and being hit, which is what gives the pipeline something to gain from getting down rather than
just a pose to play. Cover density comes from `terrain-features.js`, which scatters a hedgerow
network plus low cover across the whole field — mean distance to usable cover is about 20 m.

## Testing

`node tools/ai-sim-harness/run.js` runs the whole pipeline headless (no Babylon) and asserts the
claims above: contact is oriented on before it is shot at, men in contact are crouched or prone,
cover is used when present, a squad in contact stops marching, suppression pins men flat, stance
does not churn, and a full 10-v-10 fight still resolves. Add a check there for any behaviour you
rely on.

## Tuning

All engagement constants live at the top of `engagement.js` and are readable at runtime via
`BattleEngagement.tuning`. They are deliberately not part of the policy genome yet: the genome tunes
commander doctrine, and letting training also move reaction times would mix "what should this force
do" with "how quickly can a man react".
