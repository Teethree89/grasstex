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
| Individual combat | `engagement.js` | `destination`, `prone` / `crawling` / `tacticalCrouch`, permission to fire | commander intent, objectives |
| Squad stability | `modules/16-squad-plan-stability.js` | committed plans, fireteam slots, defensive posts | stance, cover, firing |
| Hardpoints | `modules/20-building-hardpoints.js` | who claims a building firing station | how that soldier moves or shoots |
| Prepared positions | `defense-plan.js` + `modules/21-defense-works.js` | where a defence is built and who may claim each post | how a soldier behaves on one |
| Engineers | `modules/22-engineer-works.js` | what a pioneer builds and where | how he behaves while building it |
| Commander | `commander-ai.js` + `commander-doctrine.js` + `commander-routes.js` | route, phase, objective | anything per-soldier |

Modules supply **inputs** to the engagement pipeline (`orderDestination`, `_fireteamDestination`,
`_firingStation`, `_defensePost`, `_fortifyJob`, `squad.commandPhase`). They do not override its
**outputs**. A new module that needs a soldier somewhere should express that as a position input,
not as a post-hoc assignment to `soldier.destination`.

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

advance ──holds a post──> post ──contact──> orient     post ──post lapses──> advance
engage ──suppressed in the open──> pinned ──suppression lifts──> (decide)
engage ──ordered bound──> bound
engage ──authorised assault, no cover, close──> assault ──> engage
any ──squad retreating──> withdraw          any ──station claimed──> station
any ──engineer with a job, out of contact──> fortify ──> advance
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
- **post** is manning a prepared or committed position with nobody in sight: down behind the work,
  watching the arc it covers, and - if he is the gun - emplaced before the first man appears rather
  than 1.4 s after. There was previously no way to express "already in position", so a force that
  had arrived kept marching on the spot.
- **fortify** is an engineer digging. The clock only runs while he is on the site, so an
  interrupted job resumes rather than restarting; one enemy in sight and he puts the spade down.

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

`BattleEngagement.updateSquad` counts contacts, effective shooters and pinned men. While a squad is
in contact, `issueOrders` in `squad-ai.js` stops creeping the order anchor forward: the squad is a
base of fire, not a marching column. Every `BOUND_CYCLE` seconds, if at least two men are shooting
and not everyone is pinned, one fireteam is authorised to bound for `BOUND_DURATION` seconds. The
machine gunner is never a mover, and neither is a man on a post.

A squad in a **holding** phase (`defend`, `hold`, `support-hold`, `reserve`, `regroup`) issues no
bounds at all. A bound needs somewhere to be going; bounding anyway was the squad-level half of
position hunting, because every `BOUND_CYCLE` a fireteam got up out of its prepared positions and
moved forward inside its own objective.

## Posts

A post is a position a soldier has been given and is expected to stay on - either from the
defender's prepared plan or from wherever engagement settled him to fight. `POST_RADIUS` is how
close counts as being on it. While a man holds one, `decide()` sends him back to it rather than
looking for cover, and `engage()` skips the periodic `ENGAGE_REVIEW` re-decision entirely. That
re-decision, plus the bound cycle above, plus fireteam slots that moved underneath him, is what
made a squad orbit a capture point permanently. See `AI_SIDES.md`.

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
does not churn, a man holding ground stays in one position, engineers fortify what their side
occupies, and a full 10-v-10 fight still resolves. Add a check there for any behaviour you rely on.

## Tuning

All engagement constants live at the top of `engagement.js` and are readable at runtime via
`BattleEngagement.tuning`. They are deliberately not part of the policy genome yet: the genome tunes
commander doctrine, and letting training also move reaction times would mix "what should this force
do" with "how quickly can a man react".
