# Soldier animation contract

The battle lab deliberately separates gameplay/AI state from the rendered soldier model. AI and combat code request **semantic animation tags**; the active model backend decides how to render them.

## Stable tags

| Tag | Meaning |
| --- | --- |
| `locomotion.idle` | standing idle |
| `locomotion.walk` | upright movement |
| `locomotion.crouch-walk` | crouched movement / short rush |
| `locomotion.prone-crawl` | prone movement |
| `combat.aim` | shouldered weapon / target tracking |
| `combat.fire` | one firing impulse / recoil event |
| `combat.reload` | weapon reload cycle |
| `stance.stand` | standing stance |
| `stance.crouch` | crouched stance |
| `stance.prone` | prone stance |
| `death.front` | forward collapse |
| `death.back` | backward collapse |
| `death.side` | lateral collapse |

`BattleSoldierModel.TAGS` is the runtime source of truth.

## Current procedural rig

The procedural test soldier uses a parented humanoid hierarchy instead of independent limb pieces:

- `hips -> spine -> chest -> neck -> head`
- `chest -> shoulder -> upperArm -> forearm -> hand`
- `hips -> thigh -> shin -> foot -> toe`
- `weapon` socket on the chest

Runtime names are exposed through `soldier.rig`, including compatibility aliases for the earlier `hip/knee/elbow` names. The body is normalized around the ~1.7 m on-foot body scale used by ww2fps.

This hierarchy is only a rendering backend. AI must not branch on these nodes.

## Human Soldier Animations FREE reference pack

The supplied **Human Soldier Animations 2.0 FREE** package is a useful replacement/reference rig. Its male model exposes the same major semantic chain:

- `B-hips`, `B-spine`, `B-chest`, `B-neck`, `B-head`
- `B-shoulder.L/R`, `B-upperArm.L/R`, `B-forearm.L/R`, `B-hand.L/R`
- `B-thigh.L/R`, `B-shin.L/R`, `B-foot.L/R`, `B-toe.L/R`

Useful clips in the free pack include military idle, eight-direction walk/run, rifle aim/fire/reload, damage, grenade throw and three death animations. The free pack **does not include crouch or prone/crawl locomotion**, so those states remain procedural until we add suitable clips or author them.

For the AI lab, prefer the **in-place** walk/run clips, not the `[RM]` root-motion variants. Navigation/pathfinding owns soldier world position; animation should depict that motion rather than independently moving the actor.

The package PDF identifies the license as the Standard Asset Store EULA: royalty-free/commercial use allowed, resale not allowed, attribution not required. Keep the source package out of the repository unless we intentionally add converted runtime assets.

## Active baked procedural backend

`battle/soldier.js` contains rig-local joint-rotation tracks made from the user-supplied Human
Soldier Animations FREE package. It drives the existing low-poly procedural body, rather than
replacing that body with a skinned model. The baked tracks (format `version: 2`) contain:

- `idle`, `walk`, `aim`, `fire`, `reload`
- `death.front`, `death.back`, `death.side`

Each frame stores one parent-relative quaternion per procedural joint plus the pelvis offset.
The runtime applies them directly; it does not layer them over procedural poses.

Regenerate the embedded tracks with `tools/build-procedural-soldier-animations.py` and the
extracted package (`--inline-soldier battle/soldier.js`). The package FBX files do **not** share
one rest pose (the idle/walk files and the rifle files differ), so the converter never exports
`matrix_basis` deltas. It reads each bone's posed world orientation, converts it to soldier space
(X right, Y up, Z forward), rebuilds the matching procedural joint frame (limbs hang along -Y,
torso bones point along +Y, +Z faces forward) and stores the local rotation. It never exports a
mesh, skeleton, or inverse-bind matrix.

Runtime rules:

- **Layering.** Legs and pelvis play `walk` while moving; the torso, neck and head play the combat
  clip (`aim`, `fire`, `reload`). Standing still, both halves play the same clip.
- **Cross-fades.** When the lower or upper clip changes, that half of the pose is snapshotted and
  eased into the new clip over 0.3 s, so a single shot never interrupts the walking legs.
- **Deaths.** The clip's pelvis travel lowers the body to the ground. The pose root is not also
  tipped over, which is what previously over-rotated deaths.
- **Weapon hold (all living states, baked or procedural).** The weapon pose is chosen in body space,
  with the butt anchored to the right shoulder: port-arms carry for idle/walk/crouch,
  shouldered for aim/fire and prone, and tilted for reload. Two-bone IK then puts the right hand on
  the grip and the left hand on the fore-end, or on the magazine well during reload. Package arm
  tracks are used only for deaths, and there the rifle follows the right forearm.
- Crouch and prone/crawl stay hand-authored because the free package has no such clips. A crouched
  soldier with a target blades the torso so the support hand can reach the fore-end.

Babylon zeroes a node's Euler `rotation` whenever `rotationQuaternion` is assigned. Returning from
package clips to the Euler-driven crouch/prone poses therefore converts each joint's quaternion
back to Euler first.

The trainer can deliberately disable baked tracks so a 24-match generation spends no time
interpolating cosmetic pose data. The weapon-hold IK still runs in that mode.

The in-page **Motion Lab** exposes every package track, the layered walk + aim state, and the
procedural crouch/crouch-aim/prone states. One-shot clips replay automatically. Use it to review a
pose independently of live combat before enabling a new retarget mapping.

## Replacing the soldier with another skeletal GLTF

Keep the soldier runtime record (`root`, `weaponSocket`, faction/role metadata) and bind a backend with:

```js
BattleSoldierModel.bindAnimationBackend(soldier, {
  backend: 'gltf-skeleton',
  play(tag, data, soldier) {
    // map semantic one-shot tags such as combat.fire/death.side
    // to AnimationGroups or skeletal actions
  },
  update(soldier, state, dt, tags) {
    // `state.tag` is the current semantic locomotion/stance/combat state.
    // Blend the matching AnimationGroup and aim/look IK here.
  }
});
```

A future importer can map the free pack approximately as follows:

| Semantic tag | Candidate pack clip |
| --- | --- |
| `locomotion.idle` | `HumanM@MilitaryIdle01` |
| `locomotion.walk` | `HumanM@Walk01_Forward` (in-place) |
| `combat.aim` | `HumanM@Rifle_Aim01` / `HumanM@WeaponHold_Rifle01` |
| `combat.fire` | `HumanM@Rifle_Aim01_Shoot01` |
| `combat.reload` | `HumanM@Rifle_Reload01` |
| death tags | `HumanM@Death01/02/03` |

The imported model should expose a `weaponSocket` attached to the appropriate hand/bone so `BattleWeapons.attachWeapon()` remains unchanged. Hand IK or a second support-hand target can then keep the left hand on the fore-end.

## Gameplay ownership

Gameplay controls *why* an animation happens:

- magazine empty -> reload state -> `combat.reload`
- shot fired -> `combat.fire`
- contact drill selects crouch/prone/crawl -> locomotion/stance tag changes
- death -> one death tag is selected

The model backend controls *how* that action looks. It must not decide tactical state, ammo, hit results, pathfinding, or objective logic.

## Building firing stations

Window occupation is also model-independent. `BattleNavigation` reserves a firing station inside a room; the soldier AI moves to that point and enters a crouched aiming state. A future skeletal model can add hand IK, window-height adjustment, and weapon-rest poses without changing the station-selection logic.
