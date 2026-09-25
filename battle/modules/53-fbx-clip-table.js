/* The FBX soldier clip table: which Assets/animations/<name>.fbx file plays each animation key.
   Data only, no Babylon: the battle backend (53-fbx-soldier-backend.js) binds these keys, and the
   Motion Lab (labs/fbx-animation-lab.html) loads this file to tell the clips the game uses from
   the rest of the library. Add a clip here to use it in the game. */
(function(root){
'use strict';
if(root.BattleFbxClips)return;

/* key -> [clip file (Assets/animations/<name>.fbx), loops]. Directional locomotion is generated
   below as <family><sector>, sector 0..7 clockwise from forward. */
var DIRS=['Forward','Forward Right','Right','Backward Right','Backward','Backward Left','Left','Forward Left'];
/* The library names every file "<description> - <clip name>"; the 8-way families follow one pattern. */
var FAMILIES={walk:['Rifle Walk ',' - Walk '],run:['Rifle Run ',' - Run '],sprint:['Rifle Sprint ',' - Sprint '],
  crouch:['Rifle Crouched Walk ',' - Walk Crouching ']};
var CLIPS={
  idle:['Rifle Standing Idle - Idle',1],aim:['Rifle Standing Idle Aiming - Idle Aiming',1],
  crouchIdle:['Rifle Crouched Idle - Idle Crouching',1],crouchAim:['Rifle Crouched Idle Aiming - Idle Crouching Aiming',1],
  proneIdle:['Lying Down Prone With Rifle - Prone Idle',1],
  proneForward:['Moving Forward While In Prone Position - Prone Forward',1],
  proneBackward:['Moving Backward In Prone Position With Rifle - Moving Backward In Prone Position',1],
  fire:['Firing A Rifle While Standing - Firing Rifle',0],fireCrouch:['Fire Rifle While Crouched - Fire Rifle',0],
  fireProne:['Firing A Rifle While Prone - Prone Firing Rifle',0],
  fireAuto:['Firing A Rifle While Standing - Firing Rifle (2)',1],fireAutoProne:['Prone Fire Rifle Upper Body - Prone Firing Rifle',1],
  reload:['Reloading Rifle While Standing - Reloading',0],reloadCrouch:['Reload Rifle While In Crouch Position - Reload',0],
  reloadProne:['Reloading Rifle In Prone - Prone Reloading',0],
  /* Stance changes. Stand<->crouch clips play only when the soldier is standing still. */
  standToCrouch:['Standing To Crouching Transition - Stand To Crouch',0],
  crouchToStand:['Standing Up From A Crouched Position With An Aimed Rifle - Crouch To Standing With Rifle',0],
  crouchToProne:['Crouching To Laying Prone Transition - Crouch To Prone',0],
  proneToCrouch:['Transition From Prone To Crouch - Prone To Crouch Transition',0],
  /* Non-lethal hits (combat.hit). */
  hit:['Hit Reaction - Hit Reaction',0],hitCrouch:['Hit Reaction From Rifle Crouched - Hit Reaction',0],
  hitProne:['Rifle Prone Hit Reaction - Rifle Prone Hit Reaction',0],hitRun:['Hit Reaction When Running With Rifle - Hit Reaction',0],
  /* Sergeants carry the pistol: its own aimed idle, kneel and locomotion. */
  pistolIdle:['Idle With Aimed Pistol - Pistol Idle',1],pistolKneel:['Kneeling Idle With Aimed Pistol - Pistol Kneeling Idle',1],
  pistolHit:['Hit Reaction While Holding A Pistol - Hit Reaction',0],
  /* Deaths, grouped into pools below. death.front is a forward collapse (shot from behind). */
  deathFront:['Rifle Death From The Back - Death From The Back',0],deathBack:['Rifle Death From The Front - Death From The Front',0],
  deathSide:['Rifle Death From Right Side - Death From Right',0],
  deathBackHeadKnees:['Dying Shot To Back Of Head Falling On Two Knees - Dying',0],
  deathBackOneKnee:['Death Hit From The Back Falling On One Knee - Dying',0],
  deathHitGround:['Rifle Getting Hit To Ground - Rifle Hit To Back',0],
  deathChestKnees:['Dying Shot To The Chest Falling On Two Knees - Dying',0],
  deathHeadKnees:['Dying Shot To The Head Falling On Two Knees - Dying',0],
  deathFrontHeadKnees:['Dying Front Head Impact To Two Knees - Dying',0],
  deathCrouch:['Rifle Death Crouched From Headshot Front - Death Crouching Headshot Front',0],
  deathCrouched:['Dying From A Crouched Position - Crouch Death',0],deathProne:['Dying From A Prone Position - Prone Death',0],
  deathRunning:['Getting Shot While Running With An Aimed Rifle - Rifle Run To Dying',0],
  /* Turning on the spot ('turn': the hips' own yaw is removed at load; the sim turns the root). */
  turnLeft:['Rifle Turn 90 Left - Turn 90 Left',1,'turn'],turnRight:['Rifle Turn 90 Right - Turn 90 Right',1,'turn'],
  crouchTurnLeft:['Rifle Crouched Turn 90 Left - Crouching Turn 90 Left',1,'turn'],
  crouchTurnRight:['Rifle Crouched Turn 90 Left - Crouching Turn 90 Right',1,'turn'],
  proneTurnLeft:['Turning Left While Prone - Prone Left Turn',1,'turn'],proneTurnRight:['Turning Right While Prone - Prone Right Turn',1,'turn'],
  /* Idle variety for a standing rifleman with nothing to shoot at. */
  idleLook:['Rifle Idle Looking Around - Rifle Idle',1],idleTwoHand:['Two Hand Rifle Idle - Rifle Idle',1],
  idleFidget:['Idle Holding A Rifle While Shaking Legs - Rifle Idle',1],
  /* Flinches when suppressive fire lands close. */
  flinch:['Rifle Shielding Face From Debris - Rifle Shielding Face',0],flinchCrouch:['Duck And Look Around Apprehensively - Gunplay',0]
};
Object.keys(FAMILIES).forEach(function(f){var p=FAMILIES[f];DIRS.forEach(function(d,i){CLIPS[f+i]=[p[0]+d+p[1]+d,1];});});
/* Four-way in-place families (forward, right, backward, left); diagonals use forward or backward. */
var FOUR_WAY={
  crouchRun:['Running Crouched With Rifle - Crouched Run','Run Crouched Strafe Right With Rifle - Crouched Strafe Run',
    'Running Backwards Crouched While Aiming Rifle - Crouch Run Backwards','Crouched Strafe Run Left While Aiming Rifle - Crouch Strafe Run Left'],
  pistolWalk:['Walking With An Aimed Pistol - Pistol Walk','Strafe Right With An Aimed Pistol - Pistol Strafe',
    'Walking Backward With An Aimed Pistol - Pistol Walk Backward','Strafe Left With An Aimed Pistol - Pistol Strafe'],
  pistolRun:['Running With Aimed Pistol - Pistol Run','Strafe Right With An Aimed Pistol - Pistol Strafe',
    'Running Backward With An Aimed Pistol - Pistol Run Backward','Strafe Left With An Aimed Pistol - Pistol Strafe']
};
Object.keys(FOUR_WAY).forEach(function(f){var c=FOUR_WAY[f],pick=[0,0,1,2,2,2,3,0];for(var i=0;i<8;i++)CLIPS[f+i]=[c[pick[i]],1];});

/* Every file the table plays, each once. */
var files=[],seen={};
Object.keys(CLIPS).forEach(function(k){var f=CLIPS[k][0];if(!seen[f]){seen[f]=1;files.push(f);}});
root.BattleFbxClips={clips:CLIPS,files:files.sort()};
})(typeof window!=='undefined'?window:globalThis);
