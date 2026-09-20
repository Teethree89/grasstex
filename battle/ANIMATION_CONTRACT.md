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
| `combat.hit` | a hit the soldier survives (hit reaction) |
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
as the FBX Motion Lab (`labs/fbx-animation-lab.html`, including its contact-calibration workbench).

- **Sources.** Characters: `Assets/soldiers/{us,ge}-paratrooper.fbx` (default) and
  `{us,ge}-rifleman-rigged.fbx` (`?soldiers=rifleman`). Clips: `Assets/animations/*.fbx`
  (animation-only, Mixamo rig with fingers, named `<description> - <clip name>`). Rifles: `Assets/weapons/m1-garand.fbx` (US) and `kar98k.fbx` (German). The
  deploy plan uploads all three folders' `.fbx` files; the source `.zip` packs stay out.
- **Engine.** The FBX loader ships in Babylon 9, so the page pins `babylonjs@9.27.1`; the backend
  loads the matching `babylonjs-loaders` bundle on demand.
- **Bone naming.** Rigs name the same bones differently: the clips use Mixamo names
  (`mixamorig:Spine/Spine1/Spine2`, `HeadTop_End`), the older characters use
  `Spine02/Spine01/Spine`. Every rig is read through `canon()`, which lowercases, drops the prefix
  and punctuation and maps the spine chain to `spine0/1/2` by the scheme the rig uses, so binding,
  retargeting, the palm anchors and the weapon chain work across both.
- **Fingers.** The library animates the finger chains; a model that has finger bones gets them, and
  one without simply ignores those channels.
- **Retargeting.** Clips are authored on their own skeleton. A model with the same bone names
  and hierarchy but different rest orientations or units (the paratroopers: up to ~180 degrees per
  bone, metres instead of centimetres) gets its own copy of every clip at load: each bone's
  rotation away from the clip's rest pose is taken in armature space, reapplied to the model's rest
  pose and re-expressed locally; the hips track is rescaled by the rest hip-height ratio, as is
  each clip's natural ground speed.
- **Bone names.** Model and clips share one naming scheme (`Hips`, `Spine02/01/Spine`, `neck`, `Head`,
  `Left/RightShoulder/Arm/ForeArm/Hand`, `Left/RightUpLeg/Leg/Foot/ToeBase`), so channels bind by
  bone name. The loader's `*__fbx_inheritScale` helper nodes only duplicate their parent's
  channel and are dropped.
- **In-place clips.** A clip with no hips travel gets its natural speed from its feet instead: the
  median backward speed of the planted foot relative to the hips (within ~7% of the measured
  travel for walks, ~10-20% for runs; it under-reads sprints).
- **Conversion, once per page load.** Each clip is resampled to 30 fps typed arrays. Looping clips
  have the linear horizontal `Hips` drift removed (in place, sway kept); that drift is kept as the
  clip's natural ground speed. Non-looping clips (deaths, stance changes) keep their travel.
- **Scale and facing.** The model is scaled to `BODY.heightM` from its bind-pose bounds and hangs
  under `poseRoot`, so role and body-shape scaling still apply.
- **Weapons.** `tools/prepare-weapon-model.py` (Blender) turns a generated rifle into the battle's
  weapon layout (barrel along +Z, butt 0.40 m behind the grip origin, barrel top at 0.03 m, real
  length, bipods folded with `--fold-bipod`) and keeps only a 512 px albedo: the Meshy packs were
  ~18-23 MB each for ~2k triangles, the prepared weapons are ~150-190 KB. Riflemen get the faction
  rifle (M1 Garand / Kar98k), gunners the faction machine gun (M1919A6 / MG42), captains the faction
  pistol (M1911A1 / P38, 0.06 m butt, grip solved from the pistol idle), and each squad's two scouts
  one each of M1 Carbine and Thompson / FG42 and MP40. Weapon stats (`battle/weapons.js`) are still per role, not per model. No normal maps: Babylon's FBX loader shades them as blotches.
- **Repaired source models.** `tools/fix-soldier-model.py` (Blender) rewinds inside-out faces, drops normal maps,
  embeds each albedo under a unique name (identical embedded names collide in Babylon's texture
  cache), drops the stray emissive/normal-map wiring and, for the German model, moves the skin
  ~8 cm forward onto its skeleton. It never changes the armature: bone rest transforms match the
  originals to 0.02 degrees, so the clips keep binding. Re-run it on any new export.
- **Shading.** Normals are smoothed at load within a 60 degree crease (`?smooth=0` shows the flat
  export), and the material is two-sided: the auto-rig's weights fold the thin smock over itself
  at the shoulders when posed, which back-face culling would show as holes.

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
- **Stance changes:** crouch-to-prone (also used from standing) and prone-to-crouch carry the body
  through the ground change; stand-to-crouch and crouch-to-stand play only from a standstill (on
  the move they are a cross-fade, so the legs keep walking).
- **Crouched movement** picks crouch walk or crouch run (4-way, in place) by speed.
- **Turning on the spot:** a stationary soldier whose root is turning plays the stance's turn clip
  (standing, crouched, prone) at a rate matched to the turn; the clips' own hips yaw is removed at
  load, so the body turns once, with the root.
- **Idle variety:** a standing rifleman at rest picks one of four idles when he stops.
- **Flinches:** a fresh extension of `suppressedUntil` (fire landing close) sometimes plays a
  shield-face (standing) or duck-and-look (crouched) overlay, at most every ~10 s.
- **Captains (pistol)** use the aimed-pistol idle, kneel, walk, run and strafes.
- **Hit reactions:** `combat.hit` (raised by the animation bridge for any hit the soldier survives,
  using the ballistic shot's actual victim) plays a short upper-body reaction for the stance.
- **Deaths:** each variant draws at random from a pool (`DEATH_POOLS`): forward collapses, backward
  collapses and falls to the knees; crouched and prone soldiers have their own; a soldier cut down
  at a run keeps his momentum.
- **Weapon:** the right hand gets a web anchor between thumb and index bases; the left support
  anchor sits near the palm side of the index finger's second knuckle. Both are stored in the
  hand bone's space like added socket bones, with a hand-skinned vertex centroid fallback. The
  weapon's grip point sits on the right web; the barrel swings so the fore-end line
  (`WEAPON_POINTS` in the backend) passes through the left support anchor at the clip's spacing.
  Where the left hand leaves the weapon it
  fades back to a rigid right-hand hold solved once from the aiming clip. While aiming, a capped spine rotation
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
and deaths, labelled with the clip files that are playing. Pause/Play freezes the preview; the
0–120 frame slider rebuilds and advances the selected pose at 30 fps to a repeatable frame.
The visible soldier remains centered during moving poses. Motion Lab feeds virtual displacement
to the speed-sensitive animation selector, then restores the model root to the origin before
rendering. Looping FBX clips already have horizontal hips travel removed by the backend.

The separate [FBX import lab](../labs/fbx-animation-lab.html) on the `fbx-lab-normalization` branch
has an experimental `fbx-animation-root-lock.js`: it can hold the bottom skeleton root's X/Z
at its clip-start position and recenter an animated container from mesh bounds. That is a
different root correction for raw imported clips; Motion Lab uses the battle backend's clip
normalization and fixes its own synthetic navigation displacement as described above.

### Adding soldiers and weapons

Follow `Assets/PIPELINE.md` (repair/prepare in Blender, register, verify in a posed lineup).

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
