# Sides: attacker and defender

Why the battle needed this, what each file owns, and what the operator actually picks.

## The problem

Both forces ran the same code. Two mirrored columns marched at the same objectives from opposite
ends of a 1200 m field, met in the middle, and fought over whichever objective they reached first.
Nobody was ever *already* somewhere. That produced two visible symptoms:

- Every battle was decided by arrival order, so scenario and doctrine barely mattered.
- **Position hunting inside objectives.** A squad that reached an objective had no assigned ground
  on it. Engagement re-opened the cover question every `ENGAGE_REVIEW` seconds, the squad ran a
  bound every `BOUND_CYCLE` seconds, and the fireteam slots those men were pulled back to moved
  every time the anchor did. Ten men therefore orbited a capture point permanently, each hunting a
  marginally better rock.

A defence is the missing half of the model. Once one side is standing on prepared ground, "where
should I be" has an answer, and the answer does not change every four seconds.

## Ownership

| Layer | File | Owns |
| --- | --- | --- |
| Sides | `battle-sides.js` | who defends, the attack axis, sector depth roles, span of control |
| Plan | `defense-plan.js` | what gets built, where, and what it costs; post claims |
| Runtime | `modules/21-defense-works.js` | the plan in the live battle: obstacles, meshes, deployment, ownership, attacker strength |
| Engineers | `modules/22-engineer-works.js` | what a pioneer builds during the battle and where |
| Posts | `modules/16-squad-plan-stability.js` | handing a soldier a position and making it stick |
| Behaviour | `engagement.js` | the `post` and `fortify` states; not re-deciding while posted |
| Intent | `commander-ai.js` | the `garrison` command role and its release |

`battle-sides.js` and `defense-plan.js` are plain data and have no Babylon dependency, so the whole
model is exercised headless by `tools/ai-sim-harness/run.js`.

## What the operator picks

A **defend** checkbox next to the US and GER lines in the HUD, ticked before the battle starts.
Neither ticked is a meeting engagement — exactly the battle the sim ran before this feature, with
no works, no deployment and no ownership changes. The choice travels in the URL (`?defender=ge`)
beside the seed and is remembered in `localStorage`, because it is part of the scenario.

Changing it re-lays the battle, so before the first shot it triggers a restart. Changed mid-battle,
it is remembered and applied at the next restart; the HUD says so.

## The model

Ported from ww2fps `js/defenses.js`, which already had the useful parts:

**Attack axis and frame.** `approach` is the unit vector from the attacker's start line to a point;
`front` is its negation — the direction the defender faces and the attack arrives from; `left` is
the lateral axis. `offsetPoint(p, frame, rear, lateral)` takes a *positive* rear distance to move
behind an objective. All the ported siting maths reads in those terms.

**Depth bands.** `contact` / `security` / `main` / `depth`, by how deep an objective sits along the
axis. One adaptation was needed: a ww2fps map spreads objectives most of the way between the start
lines, while this battlefield puts every objective in one settlement in the middle, so raw axis
progress reads ~0.5 for all of them and the whole position comes out "main line". The bands are
therefore applied to depth *within the objective set*, rescaled into `DEPTH_FLOOR..+DEPTH_SPAN` —
short of the ends on purpose, so the most forward objective is not automatically in the contact
zone on every map.

**Span of control.** A `captain` prepares three sectors, a `sergeant` one, a `general` the map. The
rest are marked `unoccupied` **with a reason**, because a silent omission reads as a bug in the
operator readout. This is what keeps the attack winnable.

## What gets built

`defense-plan.js` sites works against the real ground, not at fixed offsets: a siting score per
work type (high ground for anything that observes, cover for anything that fights, flat for
anything that needs a stable base), a ring of candidate offsets, and hard validation — nothing
inside a building, nothing on top of another work, and every firing position must prove a clear
line `LOS_PROOF` metres down the approach it claims to cover, terrain included.

A budget in men and engineer effort, with per-type and per-sector caps, decides how much of the
plan survives. Omissions are recorded with a reason.

Each work produces three things:

- `work.obstacles` — plain circular cover entries appended to the same array
  `terrain-features.js` fills. A sandbag parapet is then cover to exactly the code that already
  treats a hedge as cover, with no new code in the sight or cover maths. Wire is the exception: it
  registers `cover:1` (no protection at all) and is registered anyway because obstacles steer
  movement, so a wire belt makes an attacker walk around it.
- `work.posts` — manned fighting positions, claimed one man each.
- `work.render` — enough geometry for `modules/21-defense-works.js` to draw it.

**Not ported, on purpose:** anti-tank guns, tank destroyers, hull-down armour positions, minefields,
dragon's teeth and mortar pits. The battle sim has no vehicles and no indirect fire, so those works
would be scenery costing budget a rifle position could have spent. They come back the day armour
does.

## Deployment and ownership

The defending force is placed on its sectors, facing the attack, with `commandRole:'garrison'`. A
defender who has to walk to his own objective is not a defender.

He starts owning the sectors he occupies. The attacker starts owning nothing.

Two consequences had to be handled explicitly:

- **Victory.** "Held every objective for `OBJECTIVE_HOLD_WIN` seconds" is an *attacker's* condition.
  On a small map the defender can start holding everything, which would declare him the winner 35
  seconds in. That rule is now attacker-only when sides are set; the defender wins on the time
  limit, which already scores objectives held plus force remaining.
- **Force ratio.** An attack at parity against a prepared, dug-in defender is not a scenario. The
  first headless runs ended 49 defenders alive to 16 attackers on every seed. The attacker is
  brought up to `ATTACKER_SUPERIORITY` (1.7x squads) through the same infantry-squad module the
  operator's reinforcement button uses. That is deliberately gentler than the historical three to
  one, because this defender has no artillery to be shelled by and the attack still has to be able
  to lose.

A garrison squad is released back to normal doctrine when its objective is actually lost, and
rejoins as a counterattack.

## Posts: the position-hunting fix

A **post** is a position a soldier has been given and is expected to stay on. Two things about the
previous implementation were wrong:

1. Posts were dropped the moment the squad made contact (`DEFENSIVE[phase] && !sq.inContact`) —
   precisely backwards. Being shot at is when you want men to stay in their holes. A post now
   survives contact and is released only when the squad stops defending, retreats or regroups.
2. A post was "wherever the man stood when he arrived at a moving fireteam slot", which he often
   never did, because the slot moved. A post now comes from the prepared plan when there is one,
   and otherwise from the position `engagement.js` actually settled on to fight from. Engagement
   decides where a man fights; module 16 makes that decision stick.

`engagement.js` then stops asking the question:

- `decide()` — a man with a post fights from it. He may walk back onto it; he may not go looking
  for something better.
- `engage()` — the periodic cover review is skipped while posted.
- `updateSquad()` — a squad in a holding phase (`defend`, `hold`, `support-hold`, `reserve`,
  `regroup`) issues no bounds at all, and a man on a post is never a mover in one. Fire and
  movement is how you cross ground you do not own.

Measured on one seed, a defending squad under attack went from 15–30 m of wandering per man per
40 s to 0–4 m, and from `bound`/`advance` states to `post`/`engage`.

Two new engagement states carry this:

- **post** — manning a position with nobody in sight: down behind the work, watching the arc it was
  dug to cover, machine gun emplaced *before* the first man appears rather than 1.4 s after. There
  was previously no way to express this; a force that had already arrived kept marching on the spot.
- **fortify** — see below.

## Engineers

Every squad now carries one pioneer (`SquadAI.ROLES.engineer`, slot 9, carbine). He fights like a
slightly worse rifleman on purpose: his value is that he is the only man who can turn ground the
squad is standing on into ground it can hold.

When his squad is sitting on an objective his side owns and nobody is shooting, he picks what the
position is most obviously missing — a fighting position if there is none, then a parapet, then
wire out in front — sites it with the same terrain scoring the prepared plan used, walks to it and
digs. The finished work joins the cover field and its posts join his side's plan, so the next man to
dig in there has somewhere prepared to stand.

Three constraints:

- He never digs while the squad is in contact. The clock lives in engagement's `fortify` state and
  only runs while he is actually on the site, so an interrupted job resumes where it stopped rather
  than restarting or completing itself while its engineer was face down fifty metres away.
- He works to a budget, so a long battle does not end with the map paved in sandbags.
- He sites against the *current* threat direction. When the attacker takes an objective, his
  engineers fortify it facing back the way they came, because that is where the counterattack is
  coming from. This falls out of asking `BattleSides` for a model with the occupier as defender.

There is one plan per faction: the defender's is the prepared one, the attacker's starts empty and
his engineers fill it in on ground he takes. Both are claimed through the same path.

## Testing

`node tools/ai-sim-harness/run.js` builds a whole seeded battlefield with sides and asserts:
the span of control caps preparation and every skipped sector says why; the plan stays inside its
budget; a fighting position is genuinely cover to the obstacle field; a meeting engagement builds
nothing and deploys nobody; the defender starts on his sectors and owns exactly those; a man
holding ground commits to one position rather than a new one every few seconds and is still
standing in it while the attack comes in; a defending squad never bounds; and engineers start,
finish and field a work without digging through a firefight.

Sweep seeds before trusting a change — see the harness README.
