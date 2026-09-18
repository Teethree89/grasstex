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

## Imported FBX soldier (active backend)

`battle/modules/53-fbx-soldier-backend.js` renders every soldier as the rigged FBX character and
animates it with the shared Mixamo rifle clips, using Babylon's FBX loader: the same import path
as the FBX Motion Lab (`fbx-animation-lab.html`).

- **Sources.** Characters: `Assets/soldiers/{us,ge}-rifleman-rigged.fbx`. Clips:
  `Assets/animations/*.fbx` (animation-only, same rig). The deploy plan uploads both folders.
- **Engine.** The FBX loader ships in Babylon 9, so the page pins `babylonjs@9.27.1`; the backend
  loads the matching `babylonjs-loaders` bundle on demand.
- **No retargeting.** Model and clips share one rig (`Hips`, `Spine02/01/Spine`, `neck`, `Head`,
  `Left/RightShoulder/Arm/ForeArm/Hand`, `Left/RightUpLeg/Leg/Foot/ToeBase`), so channels bind by
  bone name. The loader's `*__fbx_inheritScale` helper nodes only duplicate their parent's
  channel and are dropped.
- **Conversion, once per page load.** Each clip is resampled to 30 fps typed arrays. Looping clips
  have the linear horizontal `Hips` drift removed (in place, sway kept); that drift is kept as the
  clip's natural ground speed. Non-looping clips (deaths, stance changes) keep their travel.
- **Scale and facing.** The model is scaled to `BODY.heightM` from its bind-pose bounds and hangs
  under `poseRoot`, so role and body-shape scaling still apply. The exporter's emissive copy of the
  albedo is removed at import.

### Who owns what

Navigation owns world position. The backend reads ground speed and direction from the root's
displacement each simulation step, then:

- **Lower layer (whole body):** idle / crouch idle / prone idle, or directional locomotion. Standing
  movement picks walk, run or sprint by the family whose natural speed is closest (with
  hysteresis), one of eight directions relative to facing, and a playback rate of
  `ground speed / clip speed` so feet do not skate. Crouch uses `walk crouching *`; prone uses
  `Prone Forward` / `Moving Backward In Prone Position`.
- **Upper overlay (spine, arms, head):** aim (`idle aiming`, `idle crouching aiming`), fire
  (single shot per `combat.fire`; LMG uses the automatic loop), reload (rate stretched to the
  weapon's reload time). The overlay's torso is re-expressed under the lower layer's hips, so
  walking legs do not twist the aim.
- **Stance changes:** kneel-to-prone and prone-to-kneel clips carry the body through the ground
  change; stand/crouch is a cross-fade.
- **Deaths:** `death.front` (forward collapse) plays the pack's "death from the back",
  `death.back` plays "death from the front", `death.side` plays "death from right"; crouched and
  prone soldiers use the crouching/prone deaths.
- **Weapon:** the rifle rides the right hand with an offset solved once from the aiming clip (barrel
  level along the model's forward, grip in the right palm). While aiming, a capped spine rotation
  (<= ~40 degrees) turns the barrel onto the target, which corrects the crouched and prone clips.
  The weapon stays at world scale 1 regardless of body-shape scaling.

Clip clocks advance on simulation time in `update()` (called from `animateWalk`), so animation
follows the sim's time scale and pauses with it. Poses are written once per rendered frame; a
paused or headless sim pays nothing for them. Measured with 100 soldiers: ~1 µs per `animateWalk`
call and ~0.7 ms per rendered frame for all poses, weapons and aim.

### Fallback: the procedural rig

`battle/soldier.js` keeps the articulated primitive soldier (`hips -> spine -> chest -> neck ->
head`, `chest -> shoulder -> upperArm -> forearm -> hand`, `hips -> thigh -> shin -> foot -> toe`,
a `weapon` socket, two-bone arm IK, hand-authored stance transitions). It is used:

- while the FBX assets load, or if they fail (the page waits at most 25 s, then starts anyway);
- whenever `BattleSoldierModel.setImportedEnabled(scene, false)` is in effect, which the trainer
  and the headless benchmark set so matches spend nothing on imported meshes.

An FBX-bound soldier has `rig === null` and its primitive body is disposed; code that poses the
procedural rig (for example `45-stance-transition-crawl.js`) must skip it.

The in-page **Motion Lab** loads the same FBX library into its own scene and previews every state:
standing, directional and crouched/prone locomotion, aim/fire/reload overlays, stance transitions
and deaths, labelled with the clip files that are playing.

### Adding clips

Drop the animation-only FBX (exported on the same rig, "without skin") into `Assets/animations/`
and add a key to `CLIPS` in the backend. `BattleFbxSoldier.status(scene)` and
`BattleFbxSoldier.clip(scene, key)` report what loaded and each clip's duration and natural speed.
`ANIMATION_CATALOG.md` lists the 31 clips not used yet (turns, prone rolls, kneel set, extra deaths,
moving fire and reloads, jumps) with lengths, travel and the gameplay signal each would need.

## Gameplay ownership

Gameplay controls *why* an animation happens:

- magazine empty -> reload state -> `combat.reload`
- shot fired -> `combat.fire`
- contact drill selects crouch/prone/crawl -> locomotion/stance tag changes
- death -> one death tag is selected

The model backend controls *how* that action looks. It must not decide tactical state, ammo, hit results, pathfinding, or objective logic.

## Building firing stations

Window occupation is also model-independent. `BattleNavigation` reserves a firing station inside a room; the soldier AI moves to that point and enters a crouched aiming state. A future skeletal model can add hand IK, window-height adjustment, and weapon-rest poses without changing the station-selection logic.
