/* Runtime Mixamo skeletal soldier backend.
   The existing procedural rig remains the animation driver/semantic contract.  When a compatible
   skinned GLB is available, its visible mesh is instantiated under the same soldier root and the
   driver's final pose (baked package motion + authored stance/crawl + weapon IK) is retargeted onto
   the skin every frame. Gameplay/AI never sees a second soldier representation.

   Important: the source GLB's native animation groups are intentionally unused.  Our Battle Sim
   motion remains authoritative, including crouch/prone/transitions and the rifle-hand solution. */
(function(root){
'use strict';
if(typeof BABYLON==='undefined'||!root.BattleSoldierModel||root.BattleSkeletalSoldierBackend)return;

var M=root.BattleSoldierModel;
var oldCreate=M.createSoldier,oldPreload=M.preload,oldSetImported=M.setImportedEnabled,oldAnimate=M.animateWalk;
if(typeof oldCreate!=='function'||typeof oldAnimate!=='function')return;

var ASSET={us:'us-rifleman-mixamo.glb'};
var MODEL_YAW=Math.PI;
var TARGET_HEIGHT=+((M.BODY&&M.BODY.heightM)||1.70);
var sceneStates=typeof WeakMap!=='undefined'?new WeakMap():null;
var loaderPromise=null,instanceSerial=0;

/* Driver joint -> Mixamo skin node.  Intermediate Mixamo bones (Spine1, shoulders, hands, toes)
   retain their bind-local transforms and inherit the retargeted parent pose. */
var MAP=[
  ['hips','mixamorig:Hips'],
  ['spine','mixamorig:Spine'],
  ['chest','mixamorig:Spine2'],
  ['neck','mixamorig:Neck'],
  ['head','mixamorig:Head'],
  ['upperArmR','mixamorig:RightArm'],
  ['forearmR','mixamorig:RightForeArm'],
  ['upperArmL','mixamorig:LeftArm'],
  ['forearmL','mixamorig:LeftForeArm'],
  ['thighR','mixamorig:RightUpLeg'],
  ['shinR','mixamorig:RightLeg'],
  ['footR','mixamorig:RightFoot'],
  ['thighL','mixamorig:LeftUpLeg'],
  ['shinL','mixamorig:LeftLeg'],
  ['footL','mixamorig:LeftFoot']
];

function state(scene){
  var s=sceneStates&&sceneStates.get(scene);
  if(!s){s={enabled:true,containers:Object.create(null),failed:Object.create(null),scale:Object.create(null)};if(sceneStates)sceneStates.set(scene,s);else scene._battleSkeletalSoldierState=s;}
  return s;
}
function actualState(scene){return sceneStates?state(scene):(scene._battleSkeletalSoldierState||state(scene));}
function assetBase(){return(root.BATTLE_ASSET_BASE||'https://test.ivandpopov.com/grasstex/Assets/').replace(/\/?$/,'/');}
function ensureLoader(){
  if(BABYLON.GLTFFileLoader)return Promise.resolve(true);
  if(loaderPromise)return loaderPromise;
  if(typeof document==='undefined')return Promise.reject(new Error('GLTF loader unavailable outside browser'));
  loaderPromise=new Promise(function(resolve,reject){
    var existing=document.querySelector('script[data-battle-gltf-loader]');
    if(existing){existing.addEventListener('load',function(){resolve(true);},{once:true});existing.addEventListener('error',reject,{once:true});return;}
    var script=document.createElement('script');script.async=true;script.dataset.battleGltfLoader='1';
    script.src='https://cdn.jsdelivr.net/npm/babylonjs-loaders@8.26.0/babylonjs.loaders.min.js';
    script.onload=function(){resolve(true);};script.onerror=function(){reject(new Error('Unable to load Babylon GLTF loader'));};document.head.appendChild(script);
  });
  return loaderPromise;
}
function loadFaction(scene,faction){
  var file=ASSET[faction],s=actualState(scene);if(!file||!s.enabled)return Promise.resolve(false);
  if(s.containers[faction])return Promise.resolve(true);if(s.failed[faction])return Promise.resolve(false);
  return ensureLoader().then(function(){
    return BABYLON.SceneLoader.LoadAssetContainerAsync(assetBase()+'soldiers/',file,scene,null,'.glb');
  }).then(function(container){
    /* Nothing from Meshy's native clip is allowed to drive the runtime. */
    (container.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){}});
    s.containers[faction]=container;console.log('[ANIM] runtime Mixamo skin ready for '+faction+' ('+file+')');return true;
  }).catch(function(err){
    s.failed[faction]=true;console.warn('[ANIM] skeletal '+faction+' soldier unavailable; procedural fallback active',err&&err.message||err);return false;
  });
}

var qWorld=new BABYLON.Quaternion(),qRoot=new BABYLON.Quaternion(),qInvRoot=new BABYLON.Quaternion();
var qSrc=new BABYLON.Quaternion(),qInvRest=new BABYLON.Quaternion(),qDelta=new BABYLON.Quaternion(),qDesired=new BABYLON.Quaternion();
var qParent=new BABYLON.Quaternion(),qInvParent=new BABYLON.Quaternion(),qLocal=new BABYLON.Quaternion();
var decompScale=new BABYLON.Vector3(),decompPos=new BABYLON.Vector3();
function worldRotation(node,out){
  if(!node){out.set(0,0,0,1);return out;}
  node.computeWorldMatrix(true);node.getWorldMatrix().decompose(decompScale,out,decompPos);return out;
}
function relativeRotation(rootNode,node,out){
  worldRotation(rootNode,qRoot);qRoot.conjugateToRef(qInvRoot);worldRotation(node,qWorld);qInvRoot.multiplyToRef(qWorld,out);return out.normalize();
}
function descendants(roots){
  var out=[],seen=[];
  function add(n){if(!n||seen.indexOf(n)>=0)return;seen.push(n);out.push(n);var kids=n.getChildren?n.getChildren():[];for(var i=0;i<kids.length;i++)add(kids[i]);}
  for(var i=0;i<roots.length;i++)add(roots[i]);return out;
}
function suffixName(name,target){name=String(name||'');return name===target||name.slice(-target.length)===target;}
function findNamed(nodes,name){for(var i=0;i<nodes.length;i++)if(suffixName(nodes[i].name,name))return nodes[i];return null;}
function meshBounds(roots){
  var minY=Infinity,maxY=-Infinity;
  for(var r=0;r<roots.length;r++){
    var meshes=[];if(roots[r].getChildMeshes)meshes=roots[r].getChildMeshes(false);if(roots[r].getBoundingInfo)meshes.unshift(roots[r]);
    for(var i=0;i<meshes.length;i++){
      try{meshes[i].computeWorldMatrix(true);var b=meshes[i].getBoundingInfo().boundingBox;minY=Math.min(minY,b.minimumWorld.y);maxY=Math.max(maxY,b.maximumWorld.y);}catch(_){ }
    }
  }
  return isFinite(minY)&&isFinite(maxY)&&maxY>minY?{minY:minY,maxY:maxY,height:maxY-minY}:null;
}
function hideProceduralGeometry(model){
  var meshes=model.root&&model.root.getChildMeshes?model.root.getChildMeshes(false):[];
  for(var i=0;i<meshes.length;i++){
    /* Only the primitive body exists before the GLB instance is attached.  Dispose leaves the
       TransformNode driver hierarchy intact and removes its draw/matrix burden. */
    try{meshes[i].dispose(false,false);}catch(_){ }
  }
}
function captureRest(model,targetNodes){
  var src=Object.create(null),dst=Object.create(null),targets=Object.create(null);
  for(var i=0;i<MAP.length;i++){
    var key=MAP[i][0],source=model.rig&&model.rig[key],target=findNamed(targetNodes,MAP[i][1]);
    if(!source||!target)continue;
    src[key]=relativeRotation(model.root,source,new BABYLON.Quaternion()).clone();
    dst[key]=relativeRotation(model.root,target,new BABYLON.Quaternion()).clone();
    targets[key]=target;
  }
  return{source:src,target:dst,nodes:targets};
}
function instantiate(model,scene,faction){
  var s=actualState(scene),container=s.containers[faction];if(!container||!s.enabled)return false;
  var prefix='soldier'+(++instanceSerial)+'|',entry;
  try{entry=container.instantiateModelsToScene(function(name){return prefix+name;},false,{doNotInstantiate:false});}catch(err){console.warn('[ANIM] skeletal instantiate failed',err);return false;}
  if(!entry||!entry.rootNodes||!entry.rootNodes.length)return false;
  (entry.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){} });
  var mount=new BABYLON.TransformNode(prefix+'mount',scene);mount.parent=model.poseRoot;mount.rotation.y=MODEL_YAW;
  for(var i=0;i<entry.rootNodes.length;i++)entry.rootNodes[i].parent=mount;
  var rawBounds=meshBounds(entry.rootNodes),scale=s.scale[faction];
  if(!(scale>0)&&rawBounds){scale=TARGET_HEIGHT/rawBounds.height;s.scale[faction]=scale;}
  if(!(scale>0))scale=1;mount.scaling.setAll(scale);
  if(rawBounds)mount.position.y=-rawBounds.minY*scale;
  var nodes=descendants(entry.rootNodes),rest=captureRest(model,nodes),mapped=Object.keys(rest.nodes).length;
  if(mapped<12){
    console.warn('[ANIM] skeletal mapping incomplete ('+mapped+'/'+MAP.length+'); procedural fallback active');
    try{mount.dispose();}catch(_){}return false;
  }
  hideProceduralGeometry(model);
  model._skeletal={mount:mount,entry:entry,rest:rest,mapped:mapped,faction:faction};
  model.animationBinding.backend='runtime-mixamo-driver';
  console.log('[ANIM] '+faction+' soldier using runtime Mixamo skin; '+mapped+' driver joints mapped');
  return true;
}
function retarget(model){
  var sk=model&&model._skeletal;if(!sk||!model.root||!model.rig)return;
  var rest=sk.rest;
  /* Parent-before-child order is intentional.  Unmapped intermediate Mixamo nodes remain at bind
     local rotation, so they naturally inherit their retargeted parent before the next mapped bone
     is solved into its own local frame. */
  for(var i=0;i<MAP.length;i++){
    var key=MAP[i][0],source=model.rig[key],target=rest.nodes[key],sr=rest.source[key],tr=rest.target[key];
    if(!source||!target||!sr||!tr)continue;
    relativeRotation(model.root,source,qSrc);sr.conjugateToRef(qInvRest);qSrc.multiplyToRef(qInvRest,qDelta);qDelta.multiplyToRef(tr,qDesired).normalize();
    var parent=target.parent;if(parent&&parent!==model.root){relativeRotation(model.root,parent,qParent);qParent.conjugateToRef(qInvParent);qInvParent.multiplyToRef(qDesired,qLocal);}else qLocal.copyFrom(qDesired);
    if(!target.rotationQuaternion)target.rotationQuaternion=new BABYLON.Quaternion();target.rotationQuaternion.copyFrom(qLocal).normalize();
    if(target.rotation)target.rotation.set(0,0,0);target.computeWorldMatrix(true);
  }
}

M.preload=function(scene){
  var prior=oldPreload?oldPreload.call(this,scene):true;
  return Promise.resolve(prior).then(function(){return loadFaction(scene,'us');});
};
M.setImportedEnabled=function(scene,enabled){
  if(oldSetImported)oldSetImported.call(this,scene,enabled);actualState(scene).enabled=!!enabled;
};
M.createSoldier=function(scene,faction,role,parent){
  var model=oldCreate.call(this,scene,faction,role,parent);
  if(ASSET[faction]&&actualState(scene).enabled)instantiate(model,scene,faction);
  return model;
};
M.animateWalk=function(model,dt,speed){
  var out=oldAnimate.apply(this,arguments);if(model&&model._skeletal)retarget(model);return out;
};

root.BattleSkeletalSoldierBackend={version:'1.0',map:MAP.slice(),asset:ASSET,retarget:retarget};
console.log('[ANIM] runtime skeletal soldier backend active (Battle Sim motion -> Mixamo skin)');
})(typeof window!=='undefined'?window:globalThis);
