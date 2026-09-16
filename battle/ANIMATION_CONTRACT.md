# Battle Soldier Animation Contract

Gameplay owns **why** a soldier animates. The native Mixamo backend owns **how** an imported soldier skeleton animates.

## Stable semantic tags
`locomotion.idle`, `locomotion.walk`, `locomotion.crouch-walk`, `locomotion.prone-crawl`, `combat.aim`, `combat.fire`, `combat.reload`, `stance.stand`, `stance.crouch`, `stance.prone`, `death.front`, `death.back`, `death.side`.

`BattleSoldierModel.TAGS` is the gameplay/runtime source of truth. Gameplay selects semantic state/events, never FBX/GLB filenames.

## Native Mixamo runtime
Raw character masters live in `Assets/soldiers/*.fbx`; raw shared animation masters live in `Assets/animations/*.fbx`. CI converts these to `Assets/runtime/soldiers/*.glb` and `Assets/runtime/animations/*.glb`, with the generated manifest describing the shared library.

The converters preserve the FBX-authored source and target rest/bind transforms. They do not reinterpret Mixamo bone axes. Babylon.js 9 `AnimatorAvatar` is the reference-pose retargeting owner: each shared animation group is converted from its source transform-node reference frame into the instantiated soldier skeleton's reference frame and cached for playback. Name normalization is used only to establish source-to-target correspondence; copying same-named local transforms is not a valid retargeting strategy.

Imported skeletal animation is the sole pose owner for an active skeletal soldier. Missing clips, missing target bones, and retarget failures are explicit diagnostics; the legacy handmade pose system is not used as an animation fallback for that soldier.

Navigation remains the sole owner of soldier world translation. Detected locomotion—including prone and moving combat/reload clips—is converted horizontally in-place while vertical motion is preserved. Runtime retargeting therefore leaves Babylon root-position correction disabled.

Weapons remain separate reusable assets. Weapon socket/two-hand correction is a post-animation visual layer and must not become a second animation owner.

## Current clip policy
Standing/crouched/prone idle, locomotion, aim, fire, reload and deaths come from the shared Mixamo library. `prone-forward` implements semantic prone crawl. The uploaded stance-transition clips are retained for the blending/transition pass after the base native driver is visually proven.
