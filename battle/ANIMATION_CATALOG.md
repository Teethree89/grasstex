# Soldier animation catalog

Runtime clips live in `Assets/animations/*.fbx` and are registered in `CLIPS` in
`battle/modules/53-fbx-soldier-backend.js`. `Assets/animations/new/` (269 clips, all on our rig) is
the source library: copy a clip up with a clean name to use it (see `Assets/PIPELINE.md`). Lengths
and travel below were measured through the FBX loader.

## In use

| Use | Clips |
| --- | --- |
| Idle / aim | `idle`, `idle aiming`, `idle crouching`, `idle crouching aiming`, `Rifle Prone Idle` |
| 8-way locomotion (incl. strafes and backpedal) | `walk *`, `run *`, `sprint *`, `walk crouching *` |
| 4-way crouch run (in place) | `crouch run forward/right/backward/left` |
| Prone movement | `Prone Forward`, `Moving Backward In Prone Position` |
| Pistol (captains) | `pistol idle aiming`, `pistol kneel idle`, `pistol walk forward/backward`, `pistol run forward/backward`, `pistol strafe left/right`, `pistol hit reaction` |
| Fire | `Fire Rifle Single Shot` (+ crouched kneel, prone), `Fire Rifle Automatic Standing` / `Prone` (LMG) |
| Reload | `Rifle Reload Standing`, `Crouched`, `Prone` |
| Stance changes | `stand to crouch`, `crouch to stand`, `crouch to prone`, `prone to crouch` |
| Hit reactions | `hit reaction`, `hit reaction crouched`, `hit reaction prone`, `hit reaction running` |
| Deaths (pools) | `death from the back/front/right`, `death back of head two knees`, `death from back one knee`, `death hit to ground`, `death chest two knees`, `death head two knees`, `death front head two knees`, `death crouching headshot front`, `death crouched`, `Prone Death`, `death running` |

## Available in `new/`, not used yet

| Group | Examples | What it needs |
| --- | --- | --- |
| Turn in place | 45/90/135/180 degree left/right, standing and crouched; prone turns; turning while aiming | Hips yaw stripped at load (the sim already turns the root), triggered when a stationary soldier pivots. Highest value next step. |
| Rolls | `Rolling Left While Aiming Rifle`, `Rifle Prone Rolling Right`, dive rolls | A lateral prone displacement from Combat Mobility (left and right now both exist) |
| Starts and stops | start walking/running, walk/run/crouch to stop, strafe starts and stops | Blending into and out of locomotion on speed changes |
| Aimed locomotion | `Walking While Aiming Rifle`, `Running With Rifle Aimed`, crouched aimed walks (in place) | Could replace the layered walk + aim overlay |
| Moving fire / reload | firing while walking, running, crouch walking; `Walk/Run While Reloading Rifle` (in place) | Full-body alternatives to the upper-body overlays |
| Grenades | throwing while walking, crouched, prone | A grenade weapon in gameplay |
| Melee | bayonet stab and slash, pistol whip, kicks, block | A melee rule in gameplay |
| Wounded / dazed | sitting against a wall dazed, knocked unconscious, getting up from back | A wounded state |
| Reactions | shielding face, rubbing eyes (debris), duck and look around | Explosions / suppression reactions |
| Misc | jumps (several), kick in door, rifle pull out / put away, looking-around idles | Navigation vault edges, building entry, idle variety |

Missing from both libraries: sideways prone crawl, climbing, window-lean poses, carrying a wounded man.
