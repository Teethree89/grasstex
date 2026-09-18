# Soldier animation catalog

All 85 clips in `Assets/animations/` share the soldier rig (see `ANIMATION_CONTRACT.md`), so any of
them can be added to `CLIPS` in `battle/modules/53-fbx-soldier-backend.js` without conversion work.
Durations and travel were measured through the FBX loader at the soldier's 1.70 m scale. Travel is
the net hips displacement over one playthrough; the backend removes it from looping clips and uses
it as the natural ground speed.

## In use (54)

| Use | Clips |
| --- | --- |
| Idle / aim | `idle`, `idle aiming`, `idle crouching`, `idle crouching aiming`, `Rifle Prone Idle` |
| 8-way locomotion (incl. strafes, diagonals, backpedal) | `walk *`, `run *`, `sprint *`, `walk crouching *` (forward, forward left/right, left, right, backward, backward left/right) |
| Prone movement | `Prone Forward`, `Moving Backward In Prone Position` |
| Fire | `Fire Rifle Single Shot`, `... Crouched Kneel`, `... Prone`, `Fire Rifle Automatic Standing`, `... Prone` (LMG) |
| Reload | `Rifle Reload Standing`, `... Crouched`, `... Prone` |
| Stance changes | `Rifle Kneel To Prone`, `Rifle Prone To Kneel` |
| Deaths | `death from the back` (front collapse), `death from the front` (back collapse), `death from right`, `death crouching headshot front`, `Prone Death` |

Strafing is already live: a soldier who moves sideways or backwards relative to his facing (for
example walking while aiming at a target off his path) plays the matching directional clip.

## Available, not yet used (31)

| Clip | Length | Travel | What it could depict | Gameplay signal that already exists / is needed | Value |
| --- | --- | --- | --- | --- | --- |
| `Prone Roll Right Fast` | 1.70 s | 1.0 m right | Rolling out of a fire lane | Micro/Combat Mobility lateral displacement while prone | High |
| `Prone Roll Right` | 3.27 s | 1.0 m right | Slower, deliberate roll | same | Medium |
| `turn 90 left` / `turn 90 right` | 1.00 s | in place | Stepping round to a new facing | Standing, not moving, yaw change > ~45 deg (`turnToward`) | High |
| `crouching turn 90 left` / `right` | 1.27 s | in place | Same, crouched | Crouched, not moving, large yaw change | High |
| `Prone Left Turn` / `Prone Right Turn` | 1.03 / 1.30 s | in place | Pivoting on the ground | Prone, not moving, large yaw change | Medium |
| `Rifle Kneel Idle` | 1.70 s | in place | Proper one-knee firing position | Holding cover / window firing station (a kneel state distinct from crouch-walk) | Medium |
| `Rifle Stand To Kneel` / `Rifle Kneel To Stand` | 0.93 / 1.23 s | small | Dropping to / rising from a knee | Enter/leave that kneel state | Medium |
| `Rifle Kneel To Aim` / `Rifle Aim To Kneel` | 0.80 s each | small | Rising from knee to shoulder the rifle | Kneeling soldier acquires / drops a target | Low |
| `Rifle Crouch Walk To Kneel` | 2.73 s | 1.2 m | Crouch-run that ends on a knee | Arrival at a cover slot | Low |
| `death from back headshot` / `death from front headshot` | 3.70 / 2.83 s | ~0.9 / 0.3 m | More death variety | Existing death tags (pick a variant at random) | Medium, trivial |
| `Rifle Kneel Hit To Back` | 1.90 s | 1.1 m back | Kneeling soldier knocked flat | Crouched death variant, or a non-lethal knock-down if one is added | Medium |
| `Rifle Reload Walking` | 4.10 s | 0.84 m/s | Reload on the move | Reloading while moving (today: standing reload over walking legs) | Low |
| `Rifle Reload Run` | 3.67 s | 2.7 m/s | Reload at a run | Reloading while running | Low |
| `Fire Rifle Single Shot Regular Walk` | 1.37 s | 0.85 m/s | Shooting while advancing | Firing while walking (today: layered, already acceptable) | Low |
| `Fire Rifle Automatic Slow / Regular / Fast Walk` | 3.27 / 1.33 / 1.00 s | 0.28 / 0.87 / 1.32 m/s | Marching fire (LMG, assault) | Gunner firing while moving | Low |
| `Fire Rifle Automatic Crouch Walk` | 1.17 s | 1.04 m/s | Crouched marching fire | Gunner firing while crouch-moving | Low |
| `Prone Forward Stop` / `Prone Backwards Start` / `Prone Backwards Stop` | 1.37 / 0.63 / 1.23 s | small | Crawl start/stop polish | Prone crawl begin/end | Low |
| `Crawl Backwards In Prone` | 0.97 s | 0.36 m back | Alternate backward crawl | Prone retreat | Low |
| `jump up` / `jump loop` / `jump down` | 0.53 / 1.00 / 0.67 s | small | Vaulting walls or hedges | Needs a navigation "vault" edge; none exists | Not yet |

### Notes before wiring any of these

- **Ownership.** Rolls and kneel/cover choices are Micro decisions (Combat Mobility / tactical
  positions). The animation backend must only depict a displacement or stance that gameplay already
  chose; it must not start a roll or a turn on its own. Turns-in-place are the exception that fits
  the backend: they only depict a yaw change the sim is already making.
- **Rolls only go right.** A left roll needs the right-roll clip mirrored: swap `Left*`/`Right*`
  bone channels and reflect the rotations across the character's sagittal plane. That is a small
  conversion step at load, but it has to be verified visually.
- **Missing from the pack entirely:** prone sideways crawl, left roll, crouch-run, grenade throw,
  melee, wounded/limp locomotion, climbing, and window-lean poses.

## Suggested order

1. Turn-in-place (standing, crouched, prone): purely visual, removes the foot-skate when soldiers
   pivot on the spot.
2. Extra death variants: two lines in `CLIPS`, more variety immediately.
3. Prone rolls, once Combat Mobility emits a lateral prone displacement (plus the mirrored left roll).
4. Kneel as a distinct cover/firing-station pose, with its stand/kneel/aim transitions.
