/* Imported FBX soldier backend.
   Soldiers render as the rigged FBX character (Assets/soldiers) driven by the shared Mixamo rifle
   clips (Assets/animations). Both are read with Babylon's FBX loader, the same import path as the
   FBX Motion Lab. Model and clips share one rig, so clip channels bind to bones by name; nothing
   is retargeted.

   Conversion happens once per page load (convertClip): each clip keeps only channels for bones
   the model has (the loader's `__fbx_inheritScale` helper nodes duplicate their parent and are
   dropped), is resampled at 30 fps, and looping clips have their horizontal hips travel removed so
   navigation stays the sole owner of world position. The removed travel becomes the clip's natural
   ground speed, which sets playback rate so feet do not skate.

   Gameplay still owns *why* (stance, movement, target, reload, fire, death arrive as the usual
   soldier fields and animation tags). This backend owns *how*: a lower layer plays the stance and
   locomotion clip for the whole body, and an upper overlay (spine, arms, head) plays aim, fire or
   reload on top. Both cross-fade. Clip clocks advance on simulation time in update(); poses are
   written once per rendered frame, so a paused or headless sim pays nothing for them.

   The procedural rig in soldier.js remains the fallback: while assets load, if they fail, and
   whenever imported animation is disabled (trainer and benchmark matches). */
(function(root){
'use strict';
if(typeof BABYLON==='undefined'||!root.BattleSoldierModel||root.BattleFbxSoldier)return;

var M=root.BattleSoldierModel,TAGS=M.TAGS,Q=BABYLON.Quaternion,V3=BABYLON.Vector3,MX=BABYLON.Matrix;
var BACKEND='fbx-skeletal-v1',FPS=30;
/* Models per faction and role; `default` covers the roles with no model of their own (riflemen,
   and any role whose model is not made yet). `?soldiers=rifleman` shows the earlier riflemen. */
var MODEL_SETS={
  paratrooper:{
    us:{default:'us-paratrooper.fbx',captain:'us-captain.fbx',scout:'us-scout.fbx',
        engineer:'us-engineer.fbx',gunner:'us-gunner.fbx'},
    ge:{default:'ge-paratrooper.fbx',captain:'ge-captain.fbx',scout:'ge-scout.fbx',
        engineer:'ge-engineer.fbx',gunner:'ge-gunner.fbx'}
  },
  rifleman:{us:{default:'us-rifleman-rigged.fbx'},ge:{default:'ge-rifleman-rigged.fbx'}}
};
var MODEL_SET=(typeof location!=='undefined'&&/[?&]soldiers=rifleman\b/.test(location.search||''))?'rifleman':'paratrooper';
var MODELS=MODEL_SETS[MODEL_SET];
/* Faction weapons (Assets/weapons, prepared by tools/prepare-weapon-model.py) replace the box
   weapons per role: riflemen get the faction rifle, gunners the faction machine gun (M1919A6 /
   MG42, bipods folded for carrying), captains the faction pistol. A list is dealt out in turn, so
   a squad's two scouts carry one of each: M1 Carbine and Thompson, FG42 and MP40. The prepared
   layout puts the butt plate WEAPON_BUTT metres behind the grip origin (pistols: the back of the
   frame, PISTOL_BUTT), barrel along +Z, so the hand calibration holds. */
var WEAPON_MODELS={
  us:{rifle:'m1-garand.fbx',carbine:['m1-carbine.fbx','thompson.fbx'],lmg:'m1919a6.fbx',pistol:'m1911a1.fbx'},
  ge:{rifle:'kar98k.fbx',carbine:['fg42.fbx','mp40.fbx'],lmg:'mg42.fbx',pistol:'p38.fbx'}
},WEAPON_BUTT=.40,PISTOL_BUTT=.06;
function weaponFiles(f,kind){var v=WEAPON_MODELS[f]&&WEAPON_MODELS[f][kind];return v?[].concat(v):[];}
/* Machine guns also come with the bipod deployed; that copy replaces the folded one while the gunner
   is settled prone. Same layout (grip, fore-end, muzzle), only the legs differ. */
var WEAPON_BIPOD={'m1919a6.fbx':'m1919a6-bipod.fbx','mg42.fbx':'mg42-bipod.fbx'};

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
  /* Captains carry the pistol: its own aimed idle, kneel and locomotion. */
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
var IDLE_VARIANTS=['idle','idleLook','idleTwoHand','idleFidget'],FLINCH_RATE=1.6;
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
var DEATH_POOLS={
  front:['deathFront','deathBackHeadKnees','deathBackOneKnee','deathChestKnees'],
  back:['deathBack','deathHitGround','deathHeadKnees','deathFrontHeadKnees'],
  side:['deathSide','deathChestKnees'],crouch:['deathCrouch','deathCrouched'],prone:['deathProne'],running:['deathRunning']
};

/* Right-hand grip point in each weapon mesh's local space (metres), as in soldier.js GRIPS. */
var GRIP={rifle:[0,-.055,-.12],carbine:[0,-.055,-.09],lmg:[0,-.07,-.02],pistol:[.02,-.07,0]};
/* Weapon reference points in local metres after prepareWeapon (barrel +Z). `trigger` is the
   centre of the visible trigger/guard, measured from the prepared mesh's side profile. The
   right palm sits behind it at `grip`, over the stock wrist or pistol grip, not on the trigger
   itself; `fore` records the support hand's fore-end range. */
var WEAPON_POINTS={
  'm1-garand.fbx':{trigger:[0,-.08,-.03],grip:[0,-.065,-.06],fore:[0,-.025,.06,.42]},
  'kar98k.fbx':{trigger:[0,-.08,-.035],grip:[0,-.05,-.06],fore:[0,-.01,.06,.45]},
  'mg42.fbx':{trigger:[0,-.08,-.025],grip:[0,-.10,-.09],fore:[0,-.01,.15,.45]},
  'm1919a6.fbx':{trigger:[0,-.10,.10],grip:[0,-.14,.05],fore:[0,-.05,.20,.60]},
  'm1-carbine.fbx':{trigger:[0,-.075,-.07],grip:[0,-.055,-.10],fore:[0,-.015,.06,.26]},
  'fg42.fbx':{trigger:[0,-.10,-.055],grip:[0,-.095,-.12],fore:[0,-.025,.08,.30]},
  'thompson.fbx':{trigger:[0,-.08,.01],grip:[0,-.10,-.06],fore:[0,-.015,.13,.34]},
  'mp40.fbx':{trigger:[0,-.075,-.055],grip:[0,-.10,-.125],fore:[0,-.035,.06,.17]},
  /* Pistol frame sits deeper into the captain's right palm: back, toward body centre, lower. */
  'm1911a1.fbx':{trigger:[0,-.07,.04],grip:[.035,0,.015],fore:null},
  'p38.fbx':{trigger:[0,-.07,.03],grip:[.035,-.005,.01],fore:null},
  rifle:{grip:GRIP.rifle,fore:[0,-.05,.05,.35]},carbine:{grip:GRIP.carbine,fore:[0,-.05,.04,.28]},
  lmg:{grip:GRIP.lmg,fore:[0,-.075,.15,.45]},pistol:{grip:GRIP.pistol,fore:null}
};
/* Per-model grip overrides for measured exceptions. Every model first uses its own hand-web
   anchors with the weapon's physical grip point. An override wins only when a posed lineup
   shows that a particular model/weapon pair needs a different contact point. */
var WEAPON_MODEL_POINTS={
  /* The GE scout's 0.342 m aiming web spacing exceeds the generic MP40 fore-end limit.
     Its barrel jacket continues here, so put the left hand on that reachable surface. */
  'ge-scout.fbx':{'mp40.fbx':{trigger:[0,-.075,-.055],grip:[0,-.10,-.125],fore:[0,-.035,.06,.23]}}
};
/* Runtime sidecar overlays (Assets/soldiers/<model>.json, written by the Motion Lab):
   SIDE_MODEL_POINTS[model][weapon] wins over WEAPON_MODEL_POINTS, SIDE_CONTACTS[model]
   wins over SOLDIER_CONTACTS, SIDE_ARM[model][weapon] carries the lab's left-arm dial
   degrees {shoulder,elbow,wrist} for that pair (pistol support cup), and
   SIDE_WRISTR[model][weapon] the right-wrist dial (straight stocks, finger on trigger). */
var SIDE_MODEL_POINTS={},SIDE_CONTACTS={},SIDE_ARM={},SIDE_WRISTR={};
function isSideTriplet(a){
  return Array.isArray(a)&&a.length===3&&a.every(function(n){return typeof n==='number'&&isFinite(n);});
}
function applySidecarData(file,data){
  if(!file||!data)return;
  if(data.contacts&&(isSideTriplet(data.contacts.right)||data.contacts.right===null||
      isSideTriplet(data.contacts.left)||data.contacts.left===null)){
    SIDE_CONTACTS[file]={right:data.contacts.right||null,left:data.contacts.left||null};
  }
  var weapons=data.weapons||{};
  Object.keys(weapons).forEach(function(w){
    var slot=weapons[w]||{};
    if(!isSideTriplet(slot.grip)&&!(slot.grip===null))return;
    var fore=null;
    if(isSideTriplet(slot.foreNear)&&isSideTriplet(slot.foreFar)){
      // Backend fore shares x/y: [x,y,zNear,zFar]. The lab warns when near/far x/y differ.
      fore=[slot.foreNear[0],slot.foreNear[1],slot.foreNear[2],slot.foreFar[2]];
    }
    var base=WEAPON_POINTS[w]||WEAPON_POINTS.rifle;
    (SIDE_MODEL_POINTS[file]||(SIDE_MODEL_POINTS[file]={}))[w]={
      trigger:(base&&base.trigger)||[0,0,0],
      grip:slot.grip?slot.grip.slice():(base&&base.grip?base.grip.slice():[0,0,0]),
      fore:fore
    };
    /* Right-wrist dial for straight stocks: rotate the firing hand so the finger meets
       the trigger. Stored only when non-zero; applied with the same yaw/pitch/roll
       order as the lab preview, ahead of the hand chains. */
    if(isSideTriplet(slot.wristR)&&slot.wristR.some(function(n){return Math.abs(n)>1e-9;})){
      (SIDE_WRISTR[file]||(SIDE_WRISTR[file]={}))[w]=slot.wristR.slice();
    }
    var arm=slot.armDeg;
    if(arm&&(isSideTriplet(arm.shoulder)||isSideTriplet(arm.elbow)||isSideTriplet(arm.wrist))){
      var nz=function(a){return isSideTriplet(a)&&a.some(function(n){return Math.abs(n)>1e-9;});};
      if(nz(arm.shoulder)||nz(arm.elbow)||nz(arm.wrist)){
        (SIDE_ARM[file]||(SIDE_ARM[file]={}))[w]={
          shoulder:arm.shoulder?arm.shoulder.slice():[0,0,0],
          elbow:arm.elbow?arm.elbow.slice():[0,0,0],
          wrist:arm.wrist?arm.wrist.slice():[0,0,0]
        };
      }
    }
  });
}
function loadSidecars(base,files){
  if(typeof fetch==='undefined')return Promise.resolve();
  return Promise.all((files||[]).map(function(file){
    return fetch(base+'soldiers/'+encodeURIComponent(file)+'.json',{cache:'no-store'}).then(function(res){
      if(!res.ok)return;
      return res.json().then(function(data){applySidecarData(file,data);}).catch(function(){});
    }).catch(function(){});
  })).then(function(){});
}
function pointsFor(file,kind){
  var s=file&&SIDE_MODEL_POINTS[file];
  if(s&&s[kind])return s[kind];
  var m=file&&WEAPON_MODEL_POINTS[file];
  if(m&&m[kind])return m[kind];
  return WEAPON_POINTS[kind];
}
function armDegFor(modelFile,weaponFile){
  var m=modelFile&&SIDE_ARM[modelFile];
  return(m&&weaponFile&&m[weaponFile])||null;
}
function wristRFor(modelFile,weaponFile){
  var m=modelFile&&SIDE_WRISTR[modelFile];
  return(m&&weaponFile&&m[weaponFile])||null;
}
/* Measured per-model hand contacts, in hand-bone local import units: the same space
   palmAnchors() derives. Generated by the Motion Lab workbench (labs/fbx-animation-lab.html
   section 4, "Copy backend snippet"); an entry here wins over the derived web / centroid
   anchors for that model file. Empty until a lineup proves a model needs stored contacts. */
var SOLDIER_CONTACTS={
};
var SMOOTH_NORMALS=!(typeof location!=='undefined'&&/[?&]smooth=0\b/.test(location.search||''));

/* Rigs differ in bone naming: the clips use Mixamo names ("mixamorig:Spine/Spine1/Spine2"), the
   older characters use "Spine02/Spine01/Spine" for the same three bones, and Mixamo's leaf bones
   spell out "HeadTop_End". Every rig is read through canon(): names are lowercased, the prefix and
   punctuation dropped, and the spine chain mapped to spine0/1/2 by the scheme the rig uses, so
   binding, retargeting, the palm anchors and the weapon chain all work across both. */
var SPINE_MAP={mixamo:{spine:'spine0',spine1:'spine1',spine2:'spine2'},legacy:{spine02:'spine0',spine01:'spine1',spine:'spine2'}};
var CANON_ALIAS={headtopend:'headend',headend:'headend',lefttoeend:'lefttoeend',righttoeend:'righttoeend'};
function rigScheme(names){
  for(var i=0;i<names.length;i++){var n=String(names[i]).toLowerCase();if(n.indexOf('spine02')>=0)return'legacy';}
  return'mixamo';
}
function canon(name,scheme){
  var n=String(name||'').toLowerCase().replace(/^mixamorig[:_]?/,'').replace(/[^a-z0-9]/g,'');
  var spine=SPINE_MAP[scheme||'mixamo'];
  if(spine&&spine[n])return spine[n];
  return CANON_ALIAS[n]||n;
}
var BONE={hips:'hips',spine0:'spine0',spine2:'spine2',neck:'neck',head:'head',
  leftHand:'lefthand',rightHand:'righthand',leftFoot:'leftfoot',rightFoot:'rightfoot'};
var UPPER_CANON={spine0:1,spine1:1,spine2:1,neck:1,head:1,headend:1,headfront:1,
  leftshoulder:1,leftarm:1,leftforearm:1,lefthand:1,rightshoulder:1,rightarm:1,rightforearm:1,righthand:1};
function isUpper(canonName){
  /* Fingers ride with the hand they belong to. */
  return!!UPPER_CANON[canonName]||/^(left|right)hand(thumb|index|middle|ring|pinky)/.test(canonName);
}
var scenes=typeof WeakMap!=='undefined'?new WeakMap():null;
function sceneState(scene){
  var st=scenes?scenes.get(scene):scene._battleFbxSoldier;
  if(!st){st={enabled:true,libs:{},clips:null,bones:null,loading:null,ready:false,active:[],error:null};if(scenes)scenes.set(scene,st);else scene._battleFbxSoldier=st;}
  return st;
}
/* Soldier assets can live beside a branch preview's runtime; everything else is shared. */
function assetBase(){return String(root.BATTLE_SOLDIER_ASSET_BASE||root.BATTLE_ASSET_BASE||'../Assets/').replace(/\/?$/,'/');}

var loaderPromise=null;
function ensureLoader(){
  if(BABYLON.FBXFileLoader)return Promise.resolve();
  if(loaderPromise)return loaderPromise;
  if(typeof document==='undefined')return Promise.reject(new Error('FBX loader needs a document'));
  /* The loader bundle must match the engine build exactly. */
  loaderPromise=new Promise(function(ok,fail){
    var tag=document.createElement('script');tag.async=true;
    tag.src='https://cdn.jsdelivr.net/npm/babylonjs-loaders@'+BABYLON.Engine.Version+'/babylonjs.loaders.min.js';
    tag.onload=function(){if(BABYLON.FBXFileLoader)ok();else fail(new Error('loader bundle has no FBX loader'));};
    tag.onerror=function(){fail(new Error('FBX loader script failed to load'));};
    document.head.appendChild(tag);
  });
  return loaderPromise;
}
function loadContainer(scene,url){return BABYLON.LoadAssetContainerAsync(url,scene,{pluginExtension:'.fbx'});}

/* ---- import + conversion ------------------------------------------------------------------ */

/* Hand anchors are fixed in their hand bone's space. The right grip lands in the web between
   thumb and index bases. The left fore-end rests at the palm side of the index finger's second
   knuckle, forward of the wrist: use the second index joint blended a little toward the web.
   This is a stable virtual socket even when the fingers animate. Rigs without those joints
   fall back to the centroid of hand-skinned vertices. */
function palmAnchors(meshes,nodes,scheme){
  var out={};
  [BONE.rightHand,BONE.leftHand].forEach(function(name){
    var sum=new V3(),count=0,node=nodes[name],web=null;
    var thumb=node&&nodes[name+'thumb1'],index=node&&nodes[name+'index1'],index2=node&&nodes[name+'index2'];
    if(node&&thumb&&index){
      /* Fresh vectors only (V3.Lerp): getAbsolutePosition may hand back internal state,
         so never chain mutating arithmetic onto it. */
      var webMid=V3.Lerp(thumb.getAbsolutePosition(),index.getAbsolutePosition(),.5);
      if(name===BONE.leftHand&&index2){
        webMid=V3.Lerp(webMid,index2.getAbsolutePosition(),.8);
        out[name+'Source']='index-pip';
      }else out[name+'Source']='web';
      web=V3.TransformCoordinates(webMid,node.getWorldMatrix().clone().invert());
    }
    meshes.forEach(function(mesh){
      var sk=mesh.skeleton;if(!sk||!node)return;
      var handBones={};for(var b=0;b<sk.bones.length;b++){var boneName=canon(sk.bones[b].name,scheme);if(boneName===name||new RegExp('^'+name+'(thumb|index|middle|ring|pinky)').test(boneName))handBones[b]=1;}if(!Object.keys(handBones).length)return;
      var VB=BABYLON.VertexBuffer,pos=mesh.getVerticesData(VB.PositionKind),ix=[mesh.getVerticesData(VB.MatricesIndicesKind),mesh.getVerticesData(VB.MatricesIndicesExtraKind)],
          wt=[mesh.getVerticesData(VB.MatricesWeightsKind),mesh.getVerticesData(VB.MatricesWeightsExtraKind)],world=mesh.getWorldMatrix(),p=new V3();
      for(var v=0;v<pos.length/3;v++){
        var w=0;for(var set=0;set<2;set++){if(!ix[set]||!wt[set])continue;for(var j=0;j<4;j++)if(handBones[ix[set][v*4+j]])w+=wt[set][v*4+j];}
        if(w<.5)continue;V3.TransformCoordinatesFromFloatsToRef(pos[v*3],pos[v*3+1],pos[v*3+2],world,p);sum.addInPlace(p);count++;
      }
    });
    var centroid=count&&node?V3.TransformCoordinates(sum.scale(1/count),node.getWorldMatrix().clone().invert()):V3.Zero();
    out[name]=web||centroid;
    if(!web)out[name+'Source']='centroid';
    out[name+'Centroid']=centroid;
    out[name+'Vertices']=count;
  });
  return out;
}
function prepareModel(container){
  var top=container.transformNodes.filter(function(n){return!n.parent;})[0];
  var skeleton=container.skeletons[0];
  if(!top||!skeleton)throw new Error('model FBX has no skinned skeleton');
  var meshes=container.meshes.filter(function(m){return m.getTotalVertices()>0;}),lo=Infinity,hi=-Infinity;
  top.computeWorldMatrix(true);
  top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  meshes.forEach(function(m){var b=m.getBoundingInfo().boundingBox;lo=Math.min(lo,b.minimumWorld.y);hi=Math.max(hi,b.maximumWorld.y);});
  if(!(hi>lo))throw new Error('model FBX has no measurable height');
  var all=top.getDescendants(false),scheme=rigScheme(all.map(function(n){return n.name;})),nodes={};
  all.forEach(function(n){nodes[canon(n.name,scheme)]=n;});
  container.materials.forEach(function(m){
    if(m.specularColor)m.specularColor.set(.06,.06,.06);
    /* The atlas is hundreds of small islands; keep it crisp at glancing angles. */
    if(m.diffuseTexture)m.diffuseTexture.anisotropicFilteringLevel=8;
    /* The auto-rig's weights fold the thin smock over itself at the shoulders and back once the
       soldier is posed, turning those triangles away from the camera. Culled, they read as holes;
       draw both sides, lit from whichever side faces the viewer. */
    m.backFaceCulling=false;if('twoSidedLighting' in m)m.twoSidedLighting=true;
  });
  if(SMOOTH_NORMALS)meshes.forEach(smoothNormals);
  var palms=palmAnchors(meshes,nodes,scheme);
  var scale=(M.BODY&&M.BODY.heightM||1.7)/(hi-lo);
  if(!nodes.hips)throw new Error('model FBX has no hips bone');
  return{container:container,top:top,nodes:nodes,height:hi-lo,scale:scale,
    scheme:scheme,hipsHeight:(nodes.hips.getAbsolutePosition().y-lo)*scale,palms:palms,grips:null,clips:null};
}

/* Optional look (on by default, `?smooth=0` turns it off): the models ship flat-shaded, so the
   low-poly body reads as facets. Each corner instead averages the normals of the faces that meet at
   its position (welded across UV seams) and point within 60 degrees of its own face. The limit
   matters: the smock hem, straps and cuffs are thin shells whose two sides share positions, and
   averaging across them flips the normal and shades those faces black. */
function smoothNormals(mesh){
  var pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),idx=mesh.getIndices();if(!pos||!idx)return;
  var n=pos.length/3,key={},group=new Int32Array(n),count=0,i,j;
  for(i=0;i<n;i++){var k=pos[i*3].toFixed(4)+','+pos[i*3+1].toFixed(4)+','+pos[i*3+2].toFixed(4);if(key[k]==null)key[k]=count++;group[i]=key[k];}
  var tris=idx.length/3,face=new Float64Array(tris*3),own=new Float64Array(n*3),members=[];
  for(i=0;i<count;i++)members.push([]);
  for(var t=0;t<tris;t++){
    var a=idx[t*3]*3,b=idx[t*3+1]*3,c=idx[t*3+2]*3,ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
    /* Area-weighted face normal (cross product length is twice the area). */
    face[t*3]=uy*vz-uz*vy;face[t*3+1]=uz*vx-ux*vz;face[t*3+2]=ux*vy-uy*vx;
    for(j=0;j<3;j++){var v=idx[t*3+j];own[v*3]+=face[t*3];own[v*3+1]+=face[t*3+1];own[v*3+2]+=face[t*3+2];members[group[v]].push(t);}
  }
  var old=mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind),out=new Float32Array(n*3),agree=0,cos=Math.cos(Math.PI/3);
  for(i=0;i<n;i++){
    var ox=own[i*3],oy=own[i*3+1],oz=own[i*3+2],ol=Math.sqrt(ox*ox+oy*oy+oz*oz)||1,x=0,y=0,z=0,list=members[group[i]];
    for(j=0;j<list.length;j++){
      var f=list[j]*3,fx=face[f],fy=face[f+1],fz=face[f+2],fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
      if((fx*ox+fy*oy+fz*oz)/(fl*ol)>=cos){x+=fx;y+=fy;z+=fz;}
    }
    var l=Math.sqrt(x*x+y*y+z*z);if(!l){x=ox;y=oy;z=oz;l=ol;}
    out[i*3]=x/l;out[i*3+1]=y/l;out[i*3+2]=z/l;
    if(old)agree+=(out[i*3]*old[i*3]+out[i*3+1]*old[i*3+1]+out[i*3+2]*old[i*3+2])>0?1:-1;
  }
  /* Keep the outward sense the file's own normals have overall (the loader mirrors handedness). */
  if(agree<0)for(i=0;i<out.length;i++)out[i]=-out[i];
  mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind,out,false);
}
/* The clips' own skeleton: bone names (helper nodes excluded) and their rest local transforms.
   Every clip file carries the same one, so it is read once from the first clip loaded. */
function sourceRig(container){
  var real=container.transformNodes.filter(function(n){return n.name!=='__fbx_root__'&&n.name.indexOf('__fbx')<0;});
  var scheme=rigScheme(real.map(function(n){return n.name;})),bones=[],rest={};
  real.forEach(function(n){
    var name=canon(n.name,scheme);bones.push(name);
    rest[name]={q:(n.rotationQuaternion||Q.FromEulerVector(n.rotation)).clone(),p:n.position.clone()};
  });
  return{bones:bones,rest:rest,scheme:scheme};
}
function convertClip(container,key,spec,bones){
  var group=container.animationGroups[0];if(!group)throw new Error('no animation in '+spec[0]);
  var index={};bones.forEach(function(name,i){index[name]=i;});
  var scheme=rigScheme(container.transformNodes.map(function(n){return n.name;}));
  var channels=new Array(bones.length),frames=0,duration=0,loop=!!spec[1];
  group.targetedAnimations.forEach(function(ta){
    var i=ta.target?index[canon(ta.target.name,scheme)]:null,a=ta.animation;if(i==null||!a)return;
    var prop=a.targetProperty;if(prop!=='rotationQuaternion'&&prop!=='position')return;
    var afps=a.framePerSecond||FPS,span=(group.to-group.from)/afps;
    if(!frames){frames=Math.max(2,Math.round(span*FPS)+1);duration=(frames-1)/FPS;}
    var size=prop==='position'?3:4,data=new Float32Array(frames*size);
    for(var k=0;k<frames;k++){
      var v=a.evaluate(group.from+Math.min(span,k/FPS)*afps),o=k*size;
      data[o]=v.x;data[o+1]=v.y;data[o+2]=v.z;
      if(size===4){
        data[o+3]=v.w;
        /* Keep neighbouring samples in one hemisphere so per-frame nlerp never takes the long way. */
        if(k&&data[o]*data[o-4]+data[o+1]*data[o-3]+data[o+2]*data[o-2]+data[o+3]*data[o-1]<0)for(var j=0;j<4;j++)data[o+j]=-data[o+j];
      }
    }
    var ch=channels[i]||(channels[i]={rot:null,pos:null});
    if(prop==='position')ch.pos=data;else ch.rot=data;
  });
  if(!frames)throw new Error('no usable channels in '+spec[0]);
  /* Hips travel is horizontal in the armature's Z-up space (forward is -Y). Its net displacement
     is the clip's natural ground speed (kept in the clip's own units until a model scales it).
     Looping clips are made in place by removing the linear drift, which keeps sway and bob but
     ends each cycle where it began. */
  var hips=channels[index.hips],travel=0;
  if(hips&&hips.pos){
    var p=hips.pos,last=(frames-1)*3,dx=p[last]-p[0],dy=p[last+1]-p[1];
    travel=Math.sqrt(dx*dx+dy*dy)/Math.max(1e-3,duration);
    if(loop)for(var f=0;f<frames;f++){var u=f/(frames-1);p[f*3]-=dx*u;p[f*3+1]-=dy*u;}
  }
  /* Turn clips rotate the hips about the vertical by ~90 degrees; the soldier's root already turns
     in the sim, so that yaw is removed (linearly, like travel) and kept as the clip's turn rate. */
  var turnRate=0;
  if(spec[2]==='turn'&&hips&&hips.rot){
    /* Heading = where the hips faced at frame 0 (armature -Y, forward), carried through each frame. */
    var r=hips.rot,last4=(frames-1)*4,q=new Q(),R=new Q(),out=new Q(),face=new V3(),vf=new V3();
    q.set(r[0],r[1],r[2],r[3]);Q.InverseToRef(q,R);new V3(0,-1,0).rotateByQuaternionToRef(R,vf);
    var yawOf=function(quat){vf.rotateByQuaternionToRef(quat,face);return Math.atan2(face.x,-face.y);};
    var at=function(o){q.set(r[o],r[o+1],r[o+2],r[o+3]);return q;};
    var y0=yawOf(at(0)),dyaw=Math.atan2(Math.sin(yawOf(at(last4))-y0),Math.cos(yawOf(at(last4))-y0));turnRate=Math.abs(dyaw)/Math.max(1e-3,duration);
    /* Remove the yaw about the armature's vertical (+Z). The multiplication order that actually
       cancels it is picked on the last frame, so no quaternion convention is assumed. */
    var undo=function(o,u,first){Q.RotationAxisToRef(Z_UP,-dyaw*u,R);at(o);if(first)R.multiplyToRef(q,out);else q.multiplyToRef(R,out);return out;};
    var err=function(first){var y=yawOf(undo(last4,1,first));return Math.abs(Math.atan2(Math.sin(y-y0),Math.cos(y-y0)));};
    var first=err(true)<=err(false);
    for(var t4=0;t4<frames;t4++){var o=t4*4;undo(o,t4/(frames-1),first);r[o]=out.x;r[o+1]=out.y;r[o+2]=out.z;r[o+3]=out.w;}
  }
  return{key:key,file:spec[0],loop:loop,frames:frames,duration:duration,travel:travel,speed:0,turnRate:turnRate,channels:channels};
}

/* Clips are authored on one skeleton; a model may share its bone names and hierarchy but not its
   rest orientations or units (the paratroopers differ by up to ~180 degrees per bone and use
   metres, not centimetres). Retarget each clip onto the model once: for every bone, the clip's
   rotation away from its own rest pose is taken in world (armature) space, reapplied to the model's
   rest pose, and turned back into a local rotation under the model's already-retargeted parent.
   The hips position is rescaled by the ratio of the two rest hip heights. Models whose rest pose
   already matches keep the clips as they are. */
var rtA=new MX(),rtB=new MX(),rtC=new MX(),rtQ=new Q(),Z_UP=new V3(0,0,1);
function quatMatrix(x,y,z,w,out){rtQ.set(x,y,z,w);rtQ.toRotationMatrix(out);return out;}
function retargetClips(lib,src,clips,bones){
  var n=bones.length,parent=new Int32Array(n),restS=[],restT=[],i;
  var nodes=bones.map(function(name){return lib.nodes[name]||null;});
  for(i=0;i<n;i++){
    var node=nodes[i],pn=node&&node.parent?bones.indexOf(canon(node.parent.name,lib.scheme)):-1;parent[i]=pn;
    restS[i]=src.rest[bones[i]].q;restT[i]=node?(node.rotationQuaternion||Q.FromEulerVector(node.rotation)):restS[i];
  }
  /* Parents before children. */
  var order=[],depth=function(k){var d=0;while(parent[k]>=0){k=parent[k];d++;}return d;};
  for(i=0;i<n;i++)order.push(i);order.sort(function(a,b){return depth(a)-depth(b);});
  var worst=0;for(i=0;i<n;i++)if(nodes[i])worst=Math.max(worst,1-Math.abs(Q.Dot(restS[i],restT[i])));
  var hipsS=src.rest.hips.p,hipsT=lib.nodes.hips.position,k=hipsT.length()/Math.max(1e-6,hipsS.length());
  lib.speedScale=lib.hipsHeight/Math.max(1e-6,hipsS.z);
  var out={};
  Object.keys(clips).forEach(function(key){
    var clip=clips[key],copy={};for(var f in clip)copy[f]=clip[f];copy.speed=clip.travel*lib.speedScale;
    out[key]=copy;
    if(worst<1e-4&&Math.abs(k-1)<1e-3)return;
    var frames=clip.frames,chans=new Array(n),S0=[],T0=[],Ws=[],Wt=[];
    for(i=0;i<n;i++){S0[i]=new MX();T0[i]=new MX();Ws[i]=new MX();Wt[i]=new MX();}
    for(var o=0;o<n;o++){
      i=order[o];var ps=parent[i];
      quatMatrix(restS[i].x,restS[i].y,restS[i].z,restS[i].w,rtA);if(ps>=0)rtA.multiplyToRef(S0[ps],S0[i]);else S0[i].copyFrom(rtA);
      quatMatrix(restT[i].x,restT[i].y,restT[i].z,restT[i].w,rtA);if(ps>=0)rtA.multiplyToRef(T0[ps],T0[i]);else T0[i].copyFrom(rtA);
      var ch=clip.channels[i];
      if(ch&&nodes[i])chans[i]={rot:ch.rot?new Float32Array(frames*4):null,pos:null};
      if(ch&&ch.pos&&nodes[i]){
        var pos=new Float32Array(ch.pos.length),rs=src.rest[bones[i]].p,rt=nodes[i].position;
        for(var j=0;j<frames;j++){var b=j*3;pos[b]=rt.x+(ch.pos[b]-rs.x)*k;pos[b+1]=rt.y+(ch.pos[b+1]-rs.y)*k;pos[b+2]=rt.z+(ch.pos[b+2]-rs.z)*k;}
        chans[i].pos=pos;
      }
    }
    for(var fr=0;fr<frames;fr++){
      for(o=0;o<n;o++){
        i=order[o];var p=parent[i],c=clip.channels[i],q=c&&c.rot?c.rot:null,a=fr*4;
        if(q)quatMatrix(q[a],q[a+1],q[a+2],q[a+3],rtA);else quatMatrix(restS[i].x,restS[i].y,restS[i].z,restS[i].w,rtA);
        if(p>=0)rtA.multiplyToRef(Ws[p],Ws[i]);else Ws[i].copyFrom(rtA);
        if(!chans[i]||!chans[i].rot){
          quatMatrix(restT[i].x,restT[i].y,restT[i].z,restT[i].w,rtA);if(p>=0)rtA.multiplyToRef(Wt[p],Wt[i]);else Wt[i].copyFrom(rtA);continue;
        }
        /* delta = S0^-1 * Ws (world-space change), Wt = T0 * delta, local = Wt * parentWt^-1 */
        S0[i].transposeToRef(rtB);rtB.multiplyToRef(Ws[i],rtC);T0[i].multiplyToRef(rtC,Wt[i]);
        if(p>=0){Wt[p].transposeToRef(rtB);Wt[i].multiplyToRef(rtB,rtC);}else rtC.copyFrom(Wt[i]);
        Q.FromRotationMatrixToRef(rtC,rtQ);
        var r=chans[i].rot;
        if(fr&&rtQ.x*r[a-4]+rtQ.y*r[a-3]+rtQ.z*r[a-2]+rtQ.w*r[a-1]<0)rtQ.scaleInPlace(-1);
        r[a]=rtQ.x;r[a+1]=rtQ.y;r[a+2]=rtQ.z;r[a+3]=rtQ.w;
      }
    }
    copy.channels=chans;
  });
  /* In-place loops have no travel: use the stride speed. Root-motion loops keep their measured
     travel (the stride estimate is kept alongside for diagnostics). */
  Object.keys(out).forEach(function(key){
    var c=out[key];if(!c.loop)return;c.stride=strideSpeed(lib,c,bones);
    if(c.speed<.05&&c.stride>0)c.speed=c.stride;
  });
  lib.clips=out;lib.retargeted=!(worst<1e-4&&Math.abs(k-1)<1e-3);
  return out;
}

/* Natural ground speed of an in-place clip, read from its feet: while a foot is planted it slides
   backwards under the hips at the speed the body would travel. Forward kinematics runs from the
   hips to each foot on the model's own rest offsets; for every frame the lower foot (by at least a
   few centimetres) is the planted one, and the median of its horizontal speed relative to the hips
   is the stride speed, in metres per second. */
var skA=new MX(),skB=new MX(),skQ=new Q(),skP=new V3(),skOne=new V3(1,1,1);
function strideSpeed(lib,clip,bones){
  var hipsNode=lib.nodes.hips;if(!hipsNode)return 0;
  var index={};bones.forEach(function(b,i){index[b]=i;});
  var unit=lib.hipsHeight/Math.max(1e-6,Math.abs(hipsNode.position.z)||hipsNode.position.length());
  var feet=[BONE.leftFoot,BONE.rightFoot].map(function(name){var chain=[],node=lib.nodes[name];while(node&&node!==hipsNode){chain.unshift(node);node=node.parent;}return node?chain:null;});
  if(!feet[0]||!feet[1])return 0;
  function localOf(node,frame,out){
    var i=index[node.name],ch=i!=null?clip.channels[i]:null,r=ch&&ch.rot,a=frame*4;
    if(r)skQ.set(r[a],r[a+1],r[a+2],r[a+3]);else skQ.copyFrom(node.rotationQuaternion||Q.FromEulerVector(node.rotation));
    MX.ComposeToRef(skOne,skQ,node.position,out);return out;
  }
  function footAt(chain,frame){
    /* Hips rotation only (its horizontal travel is what the stride is measured against). */
    localOf(hipsNode,frame,skB);skB.setTranslationFromFloats(0,0,0);
    for(var c=0;c<chain.length;c++){localOf(chain[c],frame,skA);skA.multiplyToRef(skB,skB);}
    return skB.getTranslation();
  }
  var speeds=[],prev=null,fps=FPS,gap=.03/unit;
  for(var f=0;f<clip.frames;f++){
    var l=footAt(feet[0],f),r=footAt(feet[1],f),planted=l.z<r.z-gap?0:(r.z<l.z-gap?1:-1),pos=planted===0?l:r;
    if(prev&&planted>=0&&planted===prev.planted)speeds.push(Math.sqrt((pos.x-prev.pos.x)*(pos.x-prev.pos.x)+(pos.y-prev.pos.y)*(pos.y-prev.pos.y))*fps*unit);
    prev={planted:planted,pos:pos};
  }
  if(!speeds.length)return 0;speeds.sort(function(a,b){return a-b;});
  return speeds[Math.floor(speeds.length/2)];
}

/* Solve each weapon from this model's posed hand webs. The physical grip point must land on
   the right web in both the rigid pose and the two-hand hold. */
function solveGrips(lib,aim,bones,kinds){
  var nodes=lib.nodes,saved=[];
  bones.forEach(function(name,i){
    var n=nodes[name],ch=aim.channels[i];if(!n||!ch)return;
    saved.push([n,n.position.clone(),n.rotationQuaternion?n.rotationQuaternion.clone():null]);
    if(ch.rot){if(!n.rotationQuaternion)n.rotationQuaternion=new Q();n.rotationQuaternion.set(ch.rot[0],ch.rot[1],ch.rot[2],ch.rot[3]);}
    if(ch.pos)n.position.set(ch.pos[0],ch.pos[1],ch.pos[2]);
  });
  lib.top.computeWorldMatrix(true);
  lib.top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  var hand=nodes[BONE.rightHand].getWorldMatrix().clone(),left=nodes[BONE.leftHand].getWorldMatrix();
  var rightPalm=V3.TransformCoordinates(lib.palms[BONE.rightHand],hand),leftPalm=V3.TransformCoordinates(lib.palms[BONE.leftHand],left);
  /* The rifle's aim pose defines a fixed right-hand socket: its barrel follows the support-hand
     line. A pistol keeps the model-forward axis because its free hand does not define its barrel. */
  var hands=leftPalm.subtract(rightPalm),z=kinds[0]==='pistol'?new V3(0,0,1):hands.clone(),up=V3.Up();if(z.lengthSquared()<1e-8)z.set(0,0,1);else z.normalize();
  var y=up.subtract(z.scale(V3.Dot(up,z)));if(y.lengthSquared()<1e-8)y=new V3(0,1,0);else y.normalize();var x=V3.Cross(y,z).normalize(),rotation=Q.RotationQuaternionFromAxis(x,y,z),basis=new MX(),inv=hand.clone().invert(),grips={};rotation.toRotationMatrix(basis);
  kinds.forEach(function(kind){
    var pts=pointsFor(lib.file,kind),g=pts.grip.slice();
    var offset=V3.TransformNormal(new V3(g[0],g[1],g[2]).scale(1/lib.scale),basis);
    var origin=rightPalm.subtract(offset),s=1/lib.scale;
    grips[kind]=MX.Compose(new V3(s,s,s),rotation,origin).multiply(inv);
  });
  saved.forEach(function(e){e[0].position.copyFrom(e[1]);if(e[2])e[0].rotationQuaternion.copyFrom(e[2]);});
  lib.top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  Object.keys(grips).forEach(function(k){lib.grips[k]=grips[k];});
  /* Diagnostic: how far the support hand sits from the barrel line in the calibration pose. */
  if(kinds[0]!=='pistol')lib.supportHand={along:+(V3.Dot(hands,z)*lib.scale).toFixed(3),off:+(hands.subtract(z.scale(V3.Dot(hands,z))).length()*lib.scale).toFixed(3)};
}

/* The model a soldier of this faction and role wears. */
function modelFor(st,faction,role){
  var set=MODELS[faction==='ge'?'ge':'us']||{};return st.libs[set[role]||set.default]||null;
}
function prepareWeapon(container,name,butt){
  var mesh=container.meshes.filter(function(m){return m.getTotalVertices()>0;})[0];if(!mesh)throw new Error('weapon FBX has no mesh');
  /* Bake the loader's root (handedness + units) into the vertices, then normalise units from the
     known butt position; Babylon flips the winding when the baked transform mirrors. */
  mesh.bakeCurrentTransformIntoVertices();mesh.parent=null;
  var pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),zmin=Infinity,zmax=-Infinity,i;
  for(i=2;i<pos.length;i+=3){zmin=Math.min(zmin,pos[i]);zmax=Math.max(zmax,pos[i]);}
  var k=-butt/zmin;if(isFinite(k)&&Math.abs(k-1)>1e-3)mesh.bakeTransformIntoVertices(MX.Scaling(k,k,k));
  /* Muzzle: the foremost geometry at barrel height (folded bipod legs can reach further forward). */
  pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);zmax=-Infinity;
  for(i=0;i<pos.length;i+=3)if(pos[i+1]>-.04)zmax=Math.max(zmax,pos[i+2]);
  var ys=0,n=0;for(i=0;i<pos.length;i+=3)if(pos[i+1]>-.04&&pos[i+2]>zmax-.03){ys+=pos[i+1];n++;}
  var mat=mesh.material;if(mat){if(mat.specularColor)mat.specularColor.set(.08,.08,.08);if(mat.diffuseTexture)mat.diffuseTexture.anisotropicFilteringLevel=4;}
  mesh.isPickable=false;mesh.refreshBoundingInfo();
  return{name:name,mesh:mesh,muzzle:[0,n?ys/n:0,zmax]};
}
function loadWeapons(scene,st,base){
  st.weapons={};var files={};
  Object.keys(WEAPON_MODELS).forEach(function(f){Object.keys(WEAPON_MODELS[f]).forEach(function(kind){weaponFiles(f,kind).forEach(function(file){
    files[file]=kind==='pistol'?PISTOL_BUTT:WEAPON_BUTT;if(WEAPON_BIPOD[file])files[WEAPON_BIPOD[file]]=WEAPON_BUTT;});});});
  return Promise.all(Object.keys(files).map(function(file){
    return loadContainer(scene,base+'weapons/'+file).then(function(c){st.weapons[file]=prepareWeapon(c,file,files[file]);})
      .catch(function(e){console.warn('[ANIM] weapon model '+file+' unavailable; box weapon stays',e);});
  }));
}
function loadLibrary(scene){
  var st=sceneState(scene);if(st.loading)return st.loading;
  var base=assetBase(),started=Date.now();
  st.loading=ensureLoader().then(function(){
    var files={};Object.keys(MODELS).forEach(function(f){Object.keys(MODELS[f]).forEach(function(role){files[MODELS[f][role]]=1;});});
    return Promise.all(Object.keys(files).map(function(file){
      return loadContainer(scene,base+'soldiers/'+file).then(function(c){st.libs[file]=prepareModel(c);st.libs[file].file=file;});
    }).concat([loadWeapons(scene,st,base)]));
  }).then(function(){
    /* Each file loads once, however many keys use it. Sidecars (per-model Motion Lab
       calibrations) load alongside the clips; both must finish before retarget/solve. */
    var byFile={};Object.keys(CLIPS).forEach(function(key){(byFile[CLIPS[key][0]]||(byFile[CLIPS[key][0]]=[])).push(key);});
    var clipWork=Promise.all(Object.keys(byFile).map(function(file){
      return loadContainer(scene,base+'animations/'+encodeURIComponent(file)+'.fbx').then(function(c){
        try{if(!st.src){st.src=sourceRig(c);st.bones=st.src.bones;}return byFile[file].map(function(key){return convertClip(c,key,CLIPS[key],st.bones);});}finally{c.dispose();}
      });
    })).then(function(groups){return[].concat.apply([],groups);});
    var sideWork=loadSidecars(base,Object.keys(st.libs||{})).then(function(){return null;});
    return Promise.all([clipWork,sideWork]).then(function(parts){return parts[0];});
  }).then(function(list){
    st.clips={};list.forEach(function(clip){st.clips[clip.key]=clip;});
    Object.keys(st.libs).forEach(function(f){retargetClips(st.libs[f],st.src,st.clips,st.bones);});
    st.animated=[];st.upper=[];st.hips=st.bones.indexOf(BONE.hips);st.spineRoot=st.bones.indexOf(BONE.spine0);
    st.bones.forEach(function(name,i){
      if(list.some(function(c){return!!c.channels[i];}))st.animated.push(i);
      st.upper[i]=isUpper(name);
    });
    Object.keys(st.libs).forEach(function(f){
      var lib=st.libs[f];lib.grips={};
      var measured=SIDE_CONTACTS[f]||SOLDIER_CONTACTS[f];
      if(measured){
        if(measured.right)lib.palms[BONE.rightHand]=new V3(measured.right[0],measured.right[1],measured.right[2]);
        if(measured.left)lib.palms[BONE.leftHand]=new V3(measured.left[0],measured.left[1],measured.left[2]);
        lib.palms[BONE.rightHand+'Source']=measured.right?'stored':lib.palms[BONE.rightHand+'Source'];
        lib.palms[BONE.leftHand+'Source']=measured.left?'stored':lib.palms[BONE.leftHand+'Source'];
      }
      var pistols=['pistol'].concat(weaponFiles('us','pistol'),weaponFiles('ge','pistol'));
      solveGrips(lib,lib.clips.aim,st.bones,Object.keys(WEAPON_POINTS).filter(function(k){return pistols.indexOf(k)<0;}));
      solveGrips(lib,lib.clips.pistolIdle,st.bones,pistols);
      console.log('[ANIM] hand sockets '+f+': R='+lib.palms[BONE.rightHand+'Source']
        +' L='+lib.palms[BONE.leftHand+'Source']
        +' Rverts='+lib.palms[BONE.rightHand+'Vertices']+' Lverts='+lib.palms[BONE.leftHand+'Vertices']);
    });
    hookRender(scene,st);st.ready=true;
    console.log('[ANIM] FBX soldiers ready: '+MODEL_SET+' '+Object.keys(st.libs).map(function(f){return f.replace('.fbx','')+(st.libs[f].retargeted?'*':'');}).join(' ')+', weapons '+Object.keys(st.weapons||{}).join(' ')+', '+list.length+' clips, '+st.animated.length+' animated bones, '+(Date.now()-started)+' ms'+(SMOOTH_NORMALS?', smoothed normals':''));
    return true;
  }).catch(function(error){
    st.error=error;console.warn('[ANIM] FBX soldiers unavailable; procedural rig stays active',error);return false;
  });
  return st.loading;
}

/* ---- binding a soldier -------------------------------------------------------------------- */

function bind(soldier,scene,st,lib,faction){
  var inst=lib.container.instantiateModelsToScene(function(name){return name;},false,{doNotInstantiate:true});
  var holder=new BABYLON.TransformNode('fbxSoldier',scene);holder.parent=soldier.poseRoot;holder.scaling.setAll(lib.scale);
  inst.rootNodes.forEach(function(n){n.parent=holder;});
  inst.animationGroups.forEach(function(g){g.stop();g.dispose();});
  var byName={},meshes=[];
  holder.getDescendants(false).forEach(function(n){
    byName[canon(n.name,lib.scheme)]=n;
    if(n.getTotalVertices&&n.getTotalVertices()>0){n.isPickable=false;n.alwaysSelectAsActiveMesh=true;meshes.push(n);}
  });
  holder.onDisposeObservable.add(function(){inst.skeletons.forEach(function(k){k.dispose();});});

  /* Retire the primitive body. The weapon socket leaves the chest first: it now follows the hand
     but stays parented to the soldier root, so it inherits neither model scale nor handedness. */
  var socket=soldier.weaponSocket;socket.parent=soldier.root;if(!socket.rotationQuaternion)socket.rotationQuaternion=new Q();
  socket._fbxFaction=faction;
  var hips=soldier.rig&&soldier.rig.hips;if(hips&&!hips.isDisposed())hips.dispose();
  soldier.rig=null;

  /* Soldier root -> each hand. The render pass composes these chains itself (see handChain);
     the left chain exists so the support hold can read the left web each frame. */
  var hand=byName[BONE.rightHand],path=[];for(var n=hand;n;n=n.parent)path.unshift(n);
  var pathL=[];for(n=byName[BONE.leftHand];n;n=n.parent)pathL.unshift(n);
  var nodes=st.bones.map(function(name){var node=byName[name]||null;if(node&&!node.rotationQuaternion)node.rotationQuaternion=new Q();return node;});
  var fx={lib:lib,st:st,nodes:nodes,holder:holder,meshes:meshes,root:soldier.root,socket:socket,hand:hand,path:path,chain:path.map(function(){return new MX();}),spineAt:path.indexOf(byName[BONE.spine2]),
    pathL:pathL,chainL:pathL.map(function(){return new MX();}),spineAtL:pathL.indexOf(byName[BONE.spine2]),
    weaponModel:null,twoHand:0,yawRate:0,lastYaw:null,turning:false,weaponKind:'rifle',
    lower:{entries:[]},upper:{entries:[]},overlay:0,overlayTarget:0,stance:null,transition:null,sector:0,family:null,moving:false,
    vx:0,vz:0,speed:0,lastX:null,lastZ:null,aim:0,aimWanted:false,aimAt:null,spine:byName[BONE.spine2]||null,fireHold:0,fireShot:0,fireSeen:0,reloadShot:0,reloadSeen:0,reloadDuration:2.5,death:null};
  soldier._fbx=fx;
  soldier.animationBinding={backend:BACKEND,tags:TAGS,play:play,update:update};
  st.active.push(fx);
  return fx;
}

/* ---- clip layers -------------------------------------------------------------------------- */

function setClip(layer,clip,rate,fade,restart,keepPhase){
  var entries=layer.entries,top=entries[entries.length-1];
  if(top&&top.clip===clip&&!restart){top.rate=rate;return top;}
  var t=0;if(keepPhase&&top&&top.clip.loop&&clip.loop)t=(top.t/top.clip.duration)*clip.duration;
  var entry={clip:clip,t:t,rate:rate,w:entries.length?0:1};
  entries.push(entry);layer.fade=Math.max(.01,fade);
  if(entries.length>4)entries.splice(0,entries.length-4);
  return entry;
}
function advanceLayer(layer,dt){
  var entries=layer.entries,n=entries.length;if(!n)return;
  for(var i=0;i<n;i++){var e=entries[i],d=e.clip.duration;e.t+=dt*e.rate;e.t=e.clip.loop?((e.t%d)+d)%d:Math.min(d,e.t);}
  var top=entries[n-1],rest=0;top.w=Math.min(1,top.w+dt/(layer.fade||.25));
  for(i=0;i<n-1;i++)rest+=entries[i].w;
  var scale=rest>0?(1-top.w)/rest:0;
  for(i=n-2;i>=0;i--){entries[i].w*=scale;if(entries[i].w<.002)entries.splice(i,1);}
  if(entries.length===1)top.w=1;
}
function topEntry(layer){return layer.entries[layer.entries.length-1]||null;}

/* ---- simulation-side state machine -------------------------------------------------------- */

function play(tag,data,soldier){
  var fx=soldier&&soldier._fbx;if(!fx)return;
  if(tag===TAGS.fire)fx.fireShot++;
  else if(tag===TAGS.hit)fx.hitShot=(fx.hitShot||0)+1;
  else if(tag===TAGS.reload){fx.reloadShot++;fx.reloadDuration=+(data&&data.duration)||(soldier.weapon&&soldier.weapon.stats&&soldier.weapon.stats.reloadTime)||2.5;}
}
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function sectorOf(fx,angle){
  /* Eight-way sector with a little stickiness so a diagonal path does not flicker between clips. */
  var step=Math.PI/4,current=fx.sector,diff=Math.atan2(Math.sin(angle-current*step),Math.cos(angle-current*step));
  if(Math.abs(diff)<step*.5+.14)return current;
  return((Math.round(angle/step)%8)+8)%8;
}
function familyOf(fx,clips,speed,families){
  var best=null,bestCost=Infinity;
  families.forEach(function(f){
    var natural=clips[f+'0'].speed||1,cost=Math.abs(Math.log(Math.max(.05,speed)/natural));
    if(f===fx.family)cost-=.18;
    if(cost<bestCost){bestCost=cost;best=f;}
  });
  return best;
}
function update(soldier,state,dt){
  var fx=soldier._fbx;if(!fx)return false;
  var clips=fx.lib.clips;dt=Math.max(0,+dt||0);
  if(soldier.weapon&&soldier.weapon.kind){fx.weaponKind=soldier.weapon.kind;fx.weaponModel=soldier.weapon.model||null;fx.weapon=soldier.weapon;}

  /* Ground velocity from what navigation actually did this step, in the soldier's own frame. */
  var p=soldier.root.position;
  if(fx.lastX==null||dt<=0){fx.lastX=p.x;fx.lastZ=p.z;}
  var vx=dt>0?(p.x-fx.lastX)/dt:0,vz=dt>0?(p.z-fx.lastZ)/dt:0;fx.lastX=p.x;fx.lastZ=p.z;
  if(vx*vx+vz*vz>225){vx=fx.vx;vz=fx.vz;} /* respawn/teleport: not motion, keep the last estimate */
  var k=1-Math.exp(-dt*9);fx.vx+=(vx-fx.vx)*k;fx.vz+=(vz-fx.vz)*k;fx.speed=Math.sqrt(fx.vx*fx.vx+fx.vz*fx.vz);

  if(soldier.dead){
    fx.bipod=false;
    if(!fx.death){
      /* Pick from the pool for how he fell; a soldier cut down at a run carries his momentum. */
      var pool=fx.stance==='prone'?'prone':(fx.stance==='crouch'?'crouch':(fx.speed>2.4&&fx.moving&&Math.abs(fx.heading||0)<.8?'running':(soldier.deathVariant==='front'||soldier.deathVariant==='back'?soldier.deathVariant:'side')));
      var keys=DEATH_POOLS[pool].filter(function(k){return!!clips[k];}),v=keys[Math.floor(Math.random()*keys.length)]||'deathSide';
      fx.death=v;setClip(fx.lower,clips[v],1,.18,true,false);
    }
    fx.overlayTarget=0;fx.aimWanted=false;fx.supportReleased=true;advance(fx,dt);return true;
  }
  fx.death=null;

  var stance=soldier.prone?'prone':(soldier.crouching?'crouch':'stand');
  if(fx.stance==null)fx.stance=stance;
  if(stance!==fx.stance){
    /* Crouch<->prone clips carry the body through the ground change (from standing too). The
       stand<->crouch clips only play from a standstill; on the move the change is a blend, so the
       legs keep walking. */
    var still=!fx.moving,from=fx.stance;
    fx.transition=stance==='prone'?'crouchToProne':(from==='prone'?'proneToCrouch':(still&&from==='stand'?'standToCrouch':(still&&stance==='stand'?'crouchToStand':null)));
    var TR_RATE={crouchToProne:1.35,proneToCrouch:1.35,standToCrouch:1.8,crouchToStand:1.5};
    if(fx.transition&&clips[fx.transition])setClip(fx.lower,clips[fx.transition],TR_RATE[fx.transition],.2,true,false);else fx.transition=null;
    fx.stance=stance;
  }
  if(fx.transition){
    var tr=topEntry(fx.lower),quick=fx.transition==='standToCrouch'||fx.transition==='crouchToStand';
    /* A soldier who sets off mid stand/crouch change drops the clip and walks. */
    if(tr&&tr.clip.key===fx.transition&&tr.t<tr.clip.duration-.3*tr.rate&&!(quick&&fx.speed>.5)){fx.overlayTarget=0;fx.aimWanted=false;fx.bipod=false;fx.supportReleased=true;advance(fx,dt);return true;}
    fx.transition=null;
  }

  fx.bipod=stance==='prone';
  var speed=fx.speed,moving=stance==='prone'?(fx.moving?speed>.1:speed>.22):(fx.moving?speed>.18:speed>.35);fx.moving=moving;
  var yaw=soldier.root.rotation.y||0,sin=Math.sin(yaw),cos=Math.cos(yaw);
  var forward=fx.vx*sin+fx.vz*cos,right=fx.vx*cos-fx.vz*sin,angle=Math.atan2(right,forward);
  fx.heading=angle;
  /* Turning on the spot: yaw rate of the root this step, smoothed, with hysteresis. */
  if(fx.lastYaw==null)fx.lastYaw=yaw;
  var dyaw=Math.atan2(Math.sin(yaw-fx.lastYaw),Math.cos(yaw-fx.lastYaw));fx.lastYaw=yaw;
  fx.yawRate+=((dt>0?dyaw/dt:0)-fx.yawRate)*k;
  var turning=!moving&&Math.abs(fx.yawRate)>(fx.turning?.35:.6);fx.turning=turning;
  var pistol=fx.weaponKind==='pistol',clip,rate=1;
  if(turning){
    /* Positive yaw turns toward +X, i.e. to the soldier's right. */
    var side=fx.yawRate>0?'Right':'Left',key=stance==='prone'?'proneTurn'+side:(stance==='crouch'?'crouchTurn'+side:'turn'+side);
    clip=clips[key];rate=clamp(Math.abs(fx.yawRate)/Math.max(.2,clip.turnRate||1.5),.5,2);fx.family=null;
  }
  else if(!moving){
    var idleKey=stance==='prone'?'proneIdle':(stance==='crouch'?(pistol?'pistolKneel':'crouchIdle'):(pistol?'pistolIdle':null));
    if(!idleKey){
      /* A standing rifleman at rest picks an idle variant when he stops, and keeps it. */
      if(!fx.idleKey){var pool=IDLE_VARIANTS.filter(function(k2){return!!clips[k2];});fx.idleKey=pool[Math.floor(Math.random()*pool.length)];}
      idleKey=fx.idleKey;
    }
    clip=clips[idleKey];fx.family=null;
  }
  if(moving)fx.idleKey=null;
  if(turning||!moving){}
  else if(stance==='prone'){clip=clips[Math.abs(angle)<1.9?'proneForward':'proneBackward'];rate=clamp(speed/(clip.speed||.3),.6,2.2);}
  else{
    var families=stance==='crouch'?['crouch','crouchRun']:(pistol?['pistolWalk','pistolRun']:['walk','run','sprint']);
    var family=familyOf(fx,clips,speed,families);fx.family=family;
    fx.sector=sectorOf(fx,angle);clip=clips[family+fx.sector];rate=clamp(speed/(clip.speed||1.5),.55,1.8);
  }
  setClip(fx.lower,clip,rate,.25,false,true);

  var over=null,orate=1,restart=false;
  fx.fireHold=Math.max(0,fx.fireHold-dt);fx.hitHold=Math.max(0,(fx.hitHold||0)-dt);
  if(fx.fireShot!==fx.fireSeen){fx.fireSeen=fx.fireShot;fx.fireHold=.9;restart=fx.weaponKind!=='lmg'&&!pistol;}
  if(fx.reloadShot!==fx.reloadSeen){fx.reloadSeen=fx.reloadShot;restart=true;}
  var hitKey=stance==='prone'?'hitProne':(stance==='crouch'?'hitCrouch':(pistol?'pistolHit':(fx.speed>2.4?'hitRun':'hit')));
  var HIT_RATE={hit:1,hitCrouch:1.6,hitProne:1.2,hitRun:1,pistolHit:2.2};
  if((fx.hitShot||0)!==(fx.hitSeen||0)){fx.hitSeen=fx.hitShot;fx.hitKey=hitKey;fx.hitHold=clips[hitKey].duration/HIT_RATE[hitKey];restart=true;}
  /* Suppressive fire landing close extends suppressedUntil; a fresh extension may be a flinch (at
     most one per soldier every ~10 s, not every time, never over firing or reloading). */
  fx.flinchCool=Math.max(0,(fx.flinchCool||0)-dt);fx.flinchHold=Math.max(0,(fx.flinchHold||0)-dt);
  var supp=+soldier.suppressedUntil||0;
  if(supp>(fx.lastSupp||0)+.05&&fx.lastSupp!=null&&fx.flinchCool<=0&&stance!=='prone'&&!soldier.reloading&&fx.fireHold<=0){
    fx.flinchCool=10;
    if(Math.random()<.6){fx.flinchKey=stance==='crouch'?'flinchCrouch':'flinch';fx.flinchHold=clips[fx.flinchKey].duration/FLINCH_RATE;restart=true;}
  }
  fx.lastSupp=supp;
  if(fx.hitHold>0){over=fx.hitKey;orate=HIT_RATE[over];}
  else if(fx.flinchHold>0&&fx.fireHold<=0&&!soldier.reloading){over=fx.flinchKey;orate=FLINCH_RATE;}
  else if(soldier.reloading){
    over=stance==='prone'?'reloadProne':(stance==='crouch'?'reloadCrouch':'reload');
    orate=clips[over].duration/Math.max(.5,fx.reloadDuration);
  }else if(fx.fireHold>0){
    var auto=fx.weaponKind==='lmg';
    if(pistol&&stance!=='prone'){over=stance==='crouch'?'pistolKneel':'pistolIdle';restart=false;}
    else{over=stance==='prone'?(auto?'fireAutoProne':'fireProne'):(auto?'fireAuto':(stance==='crouch'?'fireCrouch':'fire'));orate=auto?1:1.3;}
  }else if(soldier.target&&stance!=='prone'){over=pistol?(stance==='crouch'?'pistolKneel':'pistolIdle'):(stance==='crouch'?'crouchAim':'aim');restart=false;}
  else restart=false;
  if(over){setClip(fx.upper,clips[over],orate,.16,restart,false);fx.overlayTarget=1;}else fx.overlayTarget=0;
  fx.supportReleased=!!(soldier.reloading||fx.hitHold>0||fx.flinchHold>0);
  var t=soldier.target&&soldier.target.root&&soldier.target.root.position;
  fx.aimWanted=!soldier.reloading&&(!!t||fx.fireHold>0);fx.aimAt=t||null;
  advance(fx,dt);
  return true;
}
function advance(fx,dt){
  advanceLayer(fx.lower,dt);advanceLayer(fx.upper,dt);
  var step=dt/.22;fx.overlay=fx.overlay<fx.overlayTarget?Math.min(fx.overlayTarget,fx.overlay+step):Math.max(fx.overlayTarget,fx.overlay-step);
  fx.aim=fx.aimWanted?Math.min(1,fx.aim+dt/.3):Math.max(0,fx.aim-dt/.3);
}

/* ---- render-side pose writing ------------------------------------------------------------- */

var qa=new Q(),qb=new Q(),qc=new Q(),qd=new Q(),hipsLower=new Q(),pa=new V3(),pb=new V3(),socketWorld=new MX(),rootInv=new MX(),sScale=new V3(),sRot=new Q(),sPos=new V3(),ONE=new V3(1,1,1);
function sampleLayer(layer,bone,q,pos){
  var entries=layer.entries,total=0,hasPos=false;q.set(0,0,0,0);pos.set(0,0,0);
  for(var i=0;i<entries.length;i++){
    var e=entries[i],ch=e.clip.channels[bone];if(!ch||e.w<=0)continue;
    var f=e.t*FPS,last=e.clip.frames-1,i0=Math.min(last,Math.floor(f)),i1=Math.min(last,i0+1),u=Math.min(1,Math.max(0,f-i0)),w=e.w;
    if(ch.rot){
      var r=ch.rot,a=i0*4,b=i1*4,x=r[a]+(r[b]-r[a])*u,y=r[a+1]+(r[b+1]-r[a+1])*u,z=r[a+2]+(r[b+2]-r[a+2])*u,ww=r[a+3]+(r[b+3]-r[a+3])*u;
      if(total>0&&x*q.x+y*q.y+z*q.z+ww*q.w<0)w=-w;
      q.x+=x*w;q.y+=y*w;q.z+=z*w;q.w+=ww*w;
    }
    if(ch.pos){var s=ch.pos,c=i0*3,d=i1*3,wp=Math.abs(w);pos.x+=(s[c]+(s[d]-s[c])*u)*wp;pos.y+=(s[c+1]+(s[d+1]-s[c+1])*u)*wp;pos.z+=(s[c+2]+(s[d+2]-s[c+2])*u)*wp;hasPos=true;}
    total+=Math.abs(e.w);
  }
  if(total<=0)return 0;
  q.normalize();if(hasPos)pos.scaleInPlace(1/total);
  return hasPos?2:1;
}
function showBipod(fx){
  var w=fx.weapon;if(!w||!w.bipodMesh||w.bipodMesh.isDisposed())return;
  if(w.bipodMesh.isEnabled()!==!!fx.bipod){w.bipodMesh.setEnabled(!!fx.bipod);w.mesh.setEnabled(!fx.bipod);}
}
/* Sidecar left-arm dials: degree offsets added onto the animated wrist/elbow/shoulder
   (same nodes + yaw/pitch/roll order as the Motion Lab preview), rotations only. Applied
   inside the pose loop right after the clip pose is written, so every frame starts from
   the clean clip pose and the offsets never accumulate. */
var dialQ=new Q();
function dialQuat(deg){
  var d=deg||[0,0,0];
  Q.RotationYawPitchRollToRef((+d[1]||0)*Math.PI/180,(+d[0]||0)*Math.PI/180,(+d[2]||0)*Math.PI/180,dialQ);
  return dialQ;
}
function applyPose(fx){
  showBipod(fx);
  var st=fx.st,nodes=fx.nodes,animated=st.animated,overlay=fx.overlay>.001&&fx.upper.entries.length;
  var dialKey=fx.weaponModel||fx.weaponKind;
  /* Arm dials are the pistol support cup only (same rule as the Motion Lab preview):
     stray dial values stored on a long-gun slot stay inert here too. */
  var dialPistol=dialKey==='pistol'||/m1911a1|p38/i.test(dialKey||'');
  var dials=dialPistol?armDegFor(fx.lib.file,dialKey):null;
  var wrDial=wristRFor(fx.lib.file,dialKey),wrNode=null;
  if(wrDial){
    var ri=st.bones?st.bones.indexOf(BONE.rightHand):-1;
    wrNode=(ri>=0&&nodes[ri])||null;
  }
  var wristNode=null,elbowNode=null,shoulderNode=null;
  if(dials){
    var li=st.bones?st.bones.indexOf(BONE.leftHand):-1;
    wristNode=(li>=0&&nodes[li])||null;
    elbowNode=wristNode&&wristNode.parent;
    shoulderNode=elbowNode&&elbowNode.parent&&elbowNode.parent.parent;
    // Fall back to canon bone names when the parent chain is unavailable.
    if(!elbowNode||!shoulderNode){
      var ei=st.bones?st.bones.indexOf('leftforearm'):-1,si=st.bones?st.bones.indexOf('leftarm'):-1;
      if(!elbowNode&&ei>=0)elbowNode=nodes[ei]||null;
      if(!shoulderNode&&si>=0)shoulderNode=nodes[si]||null;
    }
  }
  for(var n=0;n<animated.length;n++){
    var i=animated[n],node=nodes[i];if(!node)continue;
    var got=sampleLayer(fx.lower,i,qa,pa);
    if(i===st.hips&&got)hipsLower.copyFrom(qa);
    if(overlay&&st.upper[i]){
      var up=sampleLayer(fx.upper,i,qb,pb);
      /* The overlay's torso keeps the orientation it has in its own clip, re-expressed under the
         hips the legs are playing. Copying the spine's hips-local rotation instead would inherit
         the locomotion hips' twist and lean, and the rifle would stop pointing at the target. */
      if(up&&i===st.spineRoot&&sampleLayer(fx.upper,st.hips,qc,pb)){qc.multiplyToRef(qb,qd);Q.InverseToRef(hipsLower,qc);qc.multiplyToRef(qd,qb);}
      if(up){if(!got){qa.copyFrom(qb);got=1;}else{if(Q.Dot(qa,qb)<0)qb.scaleInPlace(-1);Q.SlerpToRef(qa,qb,fx.overlay,qa);}}
    }
    if(!got)continue;
    node.rotationQuaternion.copyFrom(qa);
    if(dials){
      var dd=null;
      if(node===wristNode)dd=dials.wrist;
      else if(node===elbowNode)dd=dials.elbow;
      else if(node===shoulderNode)dd=dials.shoulder;
      if(dd&&(dd[0]||dd[1]||dd[2])){
        if(!node.rotationQuaternion)node.rotationQuaternion=new Q();
        node.rotationQuaternion.multiplyInPlace(dialQuat(dd));
      }
    }
    /* Right-wrist dial for straight stocks: same yaw/pitch/roll order as the lab's
       R wrist dial, applied ahead of the hand chains so the grip anchor (and the
       finger) rides in the corrected hand. Ungated by weapon: the lab previews it
       identically, so parity holds by construction. */
    if(wrNode&&node===wrNode&&wrDial){
      if(!node.rotationQuaternion)node.rotationQuaternion=new Q();
      node.rotationQuaternion.multiplyInPlace(dialQuat(wrDial));
    }
    if(got===2)node.position.copyFrom(pa);
  }
  /* Weapon follows the hands: the rigid right-web socket is the base; the support hold then
     swings long guns so the fore-end line passes through the left web (pistols have no fore
     line and keep the rigid hold). Socket world is expressed under the soldier root. */
  var key=fx.weaponModel&&fx.lib.grips&&fx.lib.grips[fx.weaponModel]?fx.weaponModel:fx.weaponKind;
  var grip=fx.lib.grips&&(fx.lib.grips[key]||fx.lib.grips.rifle),points=pointsFor(fx.lib.file,key)||WEAPON_POINTS.rifle;if(!grip||!fx.hand)return;
  handChain(fx.path,fx.chain,0);if(fx.chainL.length)handChain(fx.pathL,fx.chainL,0);holdWeapon(fx,grip,points);
  if(fx.aim>.01&&fx.spineAt>0&&aimSpine(fx)){handChain(fx.path,fx.chain,fx.spineAt);if(fx.chainL.length&&fx.spineAtL>0)handChain(fx.pathL,fx.chainL,fx.spineAtL);holdWeapon(fx,grip,points);}
  /* Body-shape and role scaling must not stretch the rifle: keep it at world scale 1. */
  socketWorld.decompose(sScale,sRot,sPos);MX.ComposeToRef(ONE,sRot,sPos,socketWorld);
  fx.chain[0].invertToRef(rootInv);socketWorld.multiplyToRef(rootInv,socketWorld);
  socketWorld.decompose(sScale,fx.socket.rotationQuaternion,fx.socket.position);fx.socket.scaling.copyFrom(sScale);
}
/* Two-hand hold. The right web and left web are the two attachment points. Pick the point within
   the weapon's fore-end range whose distance from the grip equals the posed hand spacing, then
   map that grip-to-fore vector exactly onto the hand-to-hand vector. The rigid right-hand pose
   supplies only the roll around this axis. Released-hand actions keep the rigid pose. */
var hR=new V3(),hL=new V3(),hV=new V3(),hA=new V3(),hUp=new V3(),hX=new V3(),hY=new V3(),hDir=new V3(),hG=new V3(),hFore=new V3(),hS=new V3(),hP=new V3(),hQ=new Q(),hQw=new Q(),hQl=new Q(),hLa=new V3(),hLy=new V3(),hLx=new V3();
function holdWeapon(fx,grip,points){
  grip.multiplyToRef(fx.chain[fx.chain.length-1],socketWorld);
  var palms=fx.lib.palms,f=points&&points.fore,g=points&&points.grip;fx.twoHand=0;fx.supportErrorCm=null;
  fx.supportHandM=fx.supportNearM=fx.supportFarM=null;
  if(!f||!g||!palms||!fx.chainL.length){fx.supportReason='one-hand';return;}
  if(fx.death||fx.transition||fx.supportReleased){fx.supportReason='released';return;}
  V3.TransformCoordinatesToRef(palms[BONE.rightHand],fx.chain[fx.chain.length-1],hR);
  V3.TransformCoordinatesToRef(palms[BONE.leftHand],fx.chainL[fx.chainL.length-1],hL);
  hL.subtractToRef(hR,hV);var dist=hV.length();if(dist<1e-4){fx.supportReason='coincident';return;}hV.scaleInPlace(1/dist);
  socketWorld.decompose(hS,hQ,hP);
  /* Both attachment points can be met only when the posed hand spacing reaches the fore-end. */
  var dy=(f[1]-g[1])*hS.y,dx=(f[0]-g[0])*hS.x,
      nearZ=(f[2]-g[2])*hS.z,farZ=(f[3]-g[2])*hS.z,
      near=Math.sqrt(dx*dx+dy*dy+nearZ*nearZ),far=Math.sqrt(dx*dx+dy*dy+farZ*farZ);
  fx.supportHandM=dist;fx.supportNearM=near;fx.supportFarM=far;
  if(dist<near||dist>far){fx.supportReason='out-of-reach';return;}
  var reach=Math.sqrt(dist*dist-dy*dy-dx*dx),z=g[2]+reach/hS.z;
  hLa.set(dx,dy,reach);hLa.scaleInPlace(1/dist);
  hLa.rotateByQuaternionToRef(hQ,hDir);
  if(V3.Dot(hDir,hV)<.4){fx.supportReason='off-axis';return;}
  /* World frame: forward along the hands, up from the rigid hold. Local frame: the same built on
     the weapon's grip->fore line. Rotation = world frame * local frame^-1. */
  V3.Up().rotateByQuaternionToRef(hQ,hUp);
  hUp.subtractToRef(hV.scale(V3.Dot(hUp,hV)),hY);hY.normalize();V3.CrossToRef(hY,hV,hX);
  hLy.set(0,1,0).subtractInPlace(hLa.scale(hLa.y));hLy.normalize();V3.CrossToRef(hLy,hLa,hLx);
  Q.RotationQuaternionFromAxisToRef(hX,hY,hV,hQw);Q.RotationQuaternionFromAxisToRef(hLx,hLy,hLa,hQl);
  hQl.conjugateInPlace();hQw.multiplyToRef(hQl,hQw);
  /* Grip point onto the right web. */
  hG.set(g[0]*hS.x,g[1]*hS.y,g[2]*hS.z).rotateByQuaternionToRef(hQw,hA);hR.subtractToRef(hA,hA);
  MX.ComposeToRef(hS,hQw,hA,socketWorld);fx.twoHand=1;fx.supportReason='attached';
  hFore.set(f[0],f[1],z);V3.TransformCoordinatesToRef(hFore,socketWorld,hG);
  fx.supportErrorCm=V3.Distance(hG,hL)*100;
}
/* Clips hold the rifle a little differently (crouched and prone aim sit low or wide), so while a
   soldier aims, the upper spine turns the barrel onto the target, by at most ~40 degrees. The
   rotation is applied about the spine's own origin and re-expressed in its parent's local space,
   which also absorbs the model's scale and handedness conversion. */
var aimDir=new V3(),aimWant=new V3(),aimAxis=new V3(),aimOrigin=new V3(),aimRot=new MX(),aimA=new MX(),aimB=new MX(),aimLocal=new MX(),aimPos=new V3(),aimScale=new V3(),aimQ=new Q();
function aimSpine(fx){
  var weapon=socketWorld;V3.TransformNormalToRef(V3.Forward(),weapon,aimDir);aimDir.normalize();
  var muzzle=weapon.getTranslation();
  if(fx.aimAt){aimWant.set(fx.aimAt.x-muzzle.x,(fx.aimAt.y||0)+1.2-muzzle.y,fx.aimAt.z-muzzle.z);}
  else{V3.TransformNormalToRef(V3.Forward(),fx.chain[0],aimWant);aimWant.y=0;}
  if(aimWant.lengthSquared()<1e-6)return false;aimWant.normalize();
  var dot=Math.max(-1,Math.min(1,V3.Dot(aimDir,aimWant))),angle=Math.min(.7,Math.acos(dot))*fx.aim;if(angle<.004)return false;
  V3.CrossToRef(aimDir,aimWant,aimAxis);if(aimAxis.lengthSquared()<1e-8)return false;aimAxis.normalize();
  MX.RotationAxisToRef(aimAxis,angle,aimRot);
  var spine=fx.spine,parent=fx.chain[fx.spineAt-1];fx.chain[fx.spineAt].getTranslationToRef(aimOrigin);
  /* C = parentWorld * T(-o) * R * T(o) * parentWorld^-1 ; local' = local * C */
  MX.TranslationToRef(-aimOrigin.x,-aimOrigin.y,-aimOrigin.z,aimA);parent.multiplyToRef(aimA,aimB);aimB.multiplyToRef(aimRot,aimA);
  MX.TranslationToRef(aimOrigin.x,aimOrigin.y,aimOrigin.z,aimB);aimA.multiplyToRef(aimB,aimA);parent.invertToRef(aimB);aimA.multiplyToRef(aimB,aimA);
  MX.ComposeToRef(spine.scaling,spine.rotationQuaternion,spine.position,aimLocal);aimLocal.multiplyToRef(aimA,aimLocal);
  aimLocal.decompose(aimScale,aimQ,aimPos);spine.rotationQuaternion.copyFrom(aimQ);
  return true;
}
/* World matrices from the soldier root down to a hand, composed straight from each node's TRS.
   Babylon's computeWorldMatrix(true) per node cost ~10x more; the chain has no pivots, billboards
   or parent-less jumps, so plain composition is exact. */
var chainLocal=new MX(),chainQ=new Q();
function handChain(path,chain,from){
  for(var i=from;i<path.length;i++){
    var n=path[i],q=n.rotationQuaternion;
    if(!q){Q.RotationYawPitchRollToRef(n.rotation.y,n.rotation.x,n.rotation.z,chainQ);q=chainQ;}
    MX.ComposeToRef(n.scaling,q,n.position,chainLocal);
    if(i)chainLocal.multiplyToRef(chain[i-1],chain[i]);else chain[i].copyFrom(chainLocal);
  }
}
function hookRender(scene,st){
  if(st.hooked)return;st.hooked=true;
  scene.onBeforeRenderObservable.add(function(){
    var list=st.active;
    for(var i=list.length-1;i>=0;i--){
      var fx=list[i];
      if(fx.holder.isDisposed()){list.splice(i,1);continue;}
      if(fx.root.isEnabled())applyPose(fx);
    }
  });
}

/* ---- BattleSoldierModel integration ------------------------------------------------------- */

var Weapons=root.BattleWeapons,oldAttach=Weapons&&Weapons.attachWeapon;
if(oldAttach)Weapons.attachWeapon=function(scene,socket,kind){
  var weapon=oldAttach.apply(this,arguments),faction=socket&&socket._fbxFaction,st=faction&&sceneState(scene);
  var files=faction?weaponFiles(faction,kind):[],file=null,model=null;
  if(files.length&&st.weapons){var turn=st.weaponTurn||(st.weaponTurn={}),n=turn[faction+kind]||0;turn[faction+kind]=n+1;file=files[n%files.length];model=st.weapons[file];}
  if(model){
    var mesh=model.mesh.clone('weapon.'+faction,socket);mesh.position.set(0,0,0);mesh.isPickable=false;
    weapon.mesh.dispose();weapon.mesh=mesh;weapon.muzzleLocal=model.muzzle.slice();weapon.model=model.name;
    var bipod=WEAPON_BIPOD[file]&&st.weapons[WEAPON_BIPOD[file]];
    if(bipod){weapon.bipodMesh=bipod.mesh.clone('weapon.'+faction+'.bipod',socket);weapon.bipodMesh.position.set(0,0,0);weapon.bipodMesh.isPickable=false;weapon.bipodMesh.setEnabled(false);}
  }
  return weapon;
};
var oldCreate=M.createSoldier,oldPreload=M.preload,oldSetEnabled=M.setImportedEnabled;
M.createSoldier=function(scene,faction,role){
  var soldier=oldCreate.apply(this,arguments),st=sceneState(scene),lib=st.ready&&st.enabled&&modelFor(st,faction,role);
  if(lib){try{bind(soldier,scene,st,lib,faction==='ge'?'ge':'us');}catch(e){console.warn('[ANIM] FBX soldier bind failed; keeping procedural rig',e);}}
  return soldier;
};
M.preload=function(scene){
  var before=oldPreload?Promise.resolve(oldPreload.apply(this,arguments)):Promise.resolve(true);
  /* Never hold the battle hostage to an asset host: fall back to the procedural rig after 25 s. */
  var timeout=new Promise(function(ok){setTimeout(function(){ok(false);},25000);});
  return before.then(function(){return Promise.race([loadLibrary(scene),timeout]);});
};
M.setImportedEnabled=function(scene,enabled){
  if(oldSetEnabled)oldSetEnabled.apply(this,arguments);
  if(scene)sceneState(scene).enabled=!!enabled;
};

root.BattleFbxSoldier={
  version:'1.3',backend:BACKEND,clips:CLIPS,models:MODELS,modelSet:MODEL_SET,
  load:loadLibrary,
  sidecars:function(){return{contacts:Object.keys(SIDE_CONTACTS),points:Object.keys(SIDE_MODEL_POINTS),arms:Object.keys(SIDE_ARM),wrists:Object.keys(SIDE_WRISTR)};},
  status:function(scene){var st=sceneState(scene),sockets={};Object.keys(st.libs||{}).forEach(function(f){var lib=st.libs[f],p=lib.palms||{};sockets[f]={right:p[BONE.rightHand+'Source']||null,left:p[BONE.leftHand+'Source']||null,aimHandSpacingM:lib.supportHand&&lib.supportHand.along||0,sidecar:!!SIDE_CONTACTS[f],sideWeapons:SIDE_MODEL_POINTS[f]?Object.keys(SIDE_MODEL_POINTS[f]):[],sideArms:SIDE_ARM[f]?Object.keys(SIDE_ARM[f]):[],sideWrists:SIDE_WRISTR[f]?Object.keys(SIDE_WRISTR[f]):[]};});return{ready:st.ready,enabled:st.enabled,error:st.error?String(st.error.message||st.error):null,active:st.active.length,clips:st.clips?Object.keys(st.clips).length:0,bones:st.bones?st.bones.length:0,sockets:sockets,sidecars:Object.keys(SIDE_CONTACTS)};},
  clip:function(scene,key){var st=sceneState(scene);return st.clips&&st.clips[key]||null;},
  /* Per-model clip timing: natural speed (m/s), stride estimate, duration, loop. */
  speeds:function(scene,file){var st=sceneState(scene),lib=st.libs[file]||st.libs[Object.keys(st.libs)[0]],out={};if(!lib||!lib.clips)return out;
    Object.keys(lib.clips).forEach(function(k){var c=lib.clips[k];out[k]={turnRate:+(c.turnRate||0).toFixed(2),speed:+(c.speed||0).toFixed(2),stride:c.stride!=null?+c.stride.toFixed(2):null,travel:+((c.travel||0)*lib.speedScale).toFixed(2),duration:+c.duration.toFixed(2),loop:c.loop};});return out;}
};
console.log('[ANIM] FBX soldier backend installed (models + clips load with the battle)');
})(typeof window!=='undefined'?window:globalThis);
