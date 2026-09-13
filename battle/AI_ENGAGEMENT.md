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
| Commander | `commander-ai.js` + `commander-doctrine.js` + `commander-routes.js` | route, phase, objective | anything per-soldier |

Modules supply **inputs** to the engagement pipeline (`orderDestination`, `_fireteamDestination`,
`_firingStation`, `squad.commandPhase`). They do not override its **outputs**. A new module that
needs a soldier somewhere should express that as a position input, not as a post-hoc assignment to
`soldier.destination`.

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

## Fire and movement

`BattleEngagement.updateSquad` counts contacts, effective shooters and pinned men. While a squad is
in contact, `issueOrders` in `squad-ai.js` stops creeping the order anchor forward: the squad is a
base of fire, not a marching column. Every `BOUND_CYCLE` seconds, if at least two men are shooting
and not everyone is pinned, one fireteam is authorised to bound for `BOUND_DURATION` seconds. The
machine gunner is never a mover.

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
