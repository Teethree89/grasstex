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

The primitive model exposes named semantic joints under `soldier.rig`:

- `pelvis`, `spine`, `neck`, `head`
- `shoulderL/R`, `elbowL/R`, `handL/R`
- `hipL/R`, `kneeL/R`
- `weapon`

This rig is only a rendering backend. AI must not branch on these nodes.

## Replacing the soldier with a skeletal GLTF

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

The imported model should expose a `weaponSocket` attached to the appropriate hand/bone so `BattleWeapons.attachWeapon()` remains unchanged.

## Gameplay ownership

Gameplay controls *why* an animation happens:

- magazine empty -> reload state -> `combat.reload`
- shot fired -> `combat.fire`
- contact drill selects crouch/prone/crawl -> locomotion/stance tag changes
- death -> one death tag is selected

The model backend controls *how* that action looks. It must not decide tactical state, ammo, hit results, pathfinding, or objective logic.

## Building firing stations

Window occupation is also model-independent. `BattleNavigation` reserves a firing station inside a room; the soldier AI moves to that point and enters a crouched aiming state. A future skeletal model can add hand IK, window-height adjustment, and weapon-rest poses without changing the station-selection logic.
