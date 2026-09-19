# Soldier animation catalog

Runtime clips live in `Assets/animations/*.fbx` (270 clips, Mixamo rig with finger chains, named
`<description> - <clip name>`) and are registered in `CLIPS` in
`battle/modules/53-fbx-soldier-backend.js`; 92 of them are loaded today. Bone names are canonicalised
at load, so clips bind to models on either naming scheme (see `ANIMATION_CONTRACT.md`).

## In use

| Use | Clips |
| --- | --- |
| Idle / aim | `Rifle Standing Idle`, `Rifle Standing Idle Aiming`, `Rifle Crouched Idle`, `Rifle Crouched Idle Aiming`, `Lying Down Prone With Rifle` |
| 8-way locomotion (incl. strafes and backpedal) | `Rifle Walk/Run/Sprint <direction>`, `Rifle Crouched Walk <direction>` |
| 4-way crouch run (in place) | `Running Crouched With Rifle`, `Run Crouched Strafe Right`, `Running Backwards Crouched`, `Crouched Strafe Run Left` |
| Prone movement | `Prone Forward`, `Moving Backward In Prone Position` |
| Pistol (captains) | `pistol idle aiming`, `pistol kneel idle`, `pistol walk forward/backward`, `pistol run forward/backward`, `pistol strafe left/right`, `pistol hit reaction` |
| Fire | `Fire Rifle Single Shot` (+ crouched kneel, prone), `Fire Rifle Automatic Standing` / `Prone` (LMG) |
| Reload | `Rifle Reload Standing`, `Crouched`, `Prone` |
| Stance changes | `stand to crouch`, `crouch to stand`, `crouch to prone`, `prone to crouch` |
| Turning on the spot | `turn 90 left/right`, `crouching turn 90 left/right`, `Prone Left/Right Turn` (hips yaw removed at load; rate matched to the root's turn) |
| Idle variety | `idle`, `idle looking around`, `idle two hand`, `idle shaking legs` (picked when a rifleman comes to rest) |
| Flinches | `shielding face`, `duck and look around` (fresh suppression, occasional) |
| Hit reactions | `hit reaction`, `hit reaction crouched`, `hit reaction prone`, `hit reaction running` |
| Deaths (pools) | `death from the back/front/right`, `death back of head two knees`, `death from back one knee`, `death hit to ground`, `death chest two knees`, `death head two knees`, `death front head two knees`, `death crouching headshot front`, `death crouched`, `Prone Death`, `death running` |

## Available in `new/`, not used yet

| Group | Examples | What it needs |
| --- | --- | --- |
| More turns | 45/135/180 degree left/right, standing and crouched; turning while aiming | Pick by turn size (the 90 degree clips cover all turns now, rate-matched) |
| Rolls | `Rolling Left While Aiming Rifle`, `Rifle Prone Rolling Right`, dive rolls | A lateral prone displacement from Combat Mobility (left and right now both exist) |
| Starts and stops | start walking/running, walk/run/crouch to stop, strafe starts and stops | Blending into and out of locomotion on speed changes |
| Aimed locomotion | `Walking While Aiming Rifle`, `Running With Rifle Aimed`, crouched aimed walks (in place) | Could replace the layered walk + aim overlay |
| Moving fire / reload | firing while walking, running, crouch walking; `Walk/Run While Reloading Rifle` (in place) | Full-body alternatives to the upper-body overlays |
| Grenades | throwing while walking, crouched, prone | A grenade weapon in gameplay |
| Melee | bayonet stab and slash, pistol whip, kicks, block | A melee rule in gameplay |
| Wounded / dazed | sitting against a wall dazed, knocked unconscious, getting up from back | A wounded state |
| Reactions | rubbing eyes (debris), jumping away from explosions | Explosions |
| Misc | jumps (several), kick in door, rifle pull out / put away | Navigation vault edges, building entry |

Missing from both libraries: sideways prone crawl, climbing, window-lean poses, carrying a wounded man.
