/* Runtime Mixamo skeletal soldier backend.
   The procedural Battle Sim rig remains the animation/IK owner. The GLB is only the visible skin.
   Native GLB animation groups are deliberately ignored, so Meshy's Walking clip never drives play.

   Retarget invariant: each visible Mixamo limb segment must point in the same world-space direction
   as the corresponding procedural segment after our existing animation, stance and IK layers run.
   We reset the Mixamo bone to its imported bind-local rotation, then use Babylon's WORLD-space
   TransformNode.rotate() to align the segment. This keeps hierarchy conversion inside Babylon and
   avoids copying quaternions between rigs with incompatible local bone axes. */
(function(root){
'use strict';
if(typeof BABYLON==='undefined'||!root.BattleSoldierModel||root.BattleSkeletalSoldierBackend)return;
var M=root.BattleSoldierModel,oldCreate=M.createSoldier,oldPreload=M.preload,oldSetImported=M.setImportedEnabled,oldAnimate=M.animateWalk;
if(typeof oldCreate!=='function'||typeof oldAnimate!=='function')return;

var ASSET={us:'us-rifleman-mixamo.glb',ge:'ge-rifleman-mixamo.glb'};
var TARGET_HEIGHT=+((M.BODY&&M.BODY.heightM)||1.70),sceneStates=typeof WeakMap!=='undefined'?new WeakMap():null,loaderPromise=null,instanceSerial=0;
var MAP=[
  ['hips','mixamorig:Hips'],['spine','mixamorig:Spine'],['chest','mixamorig:Spine2'],['neck','mixamorig:Neck'],['head','mixamorig:Head'],
  ['upperArmR','mixamorig:RightArm'],['forearmR','mixamorig:RightForeArm'],['upperArmL','mixamorig:LeftArm'],['forearmL','mixamorig:LeftForeArm'],
  ['thighR','mixamorig:RightUpLeg'],['shinR','mixamorig:RightLeg'],['footR','mixamorig:RightFoot'],
  ['thighL','mixamorig:LeftUpLeg'],['shinL','mixamorig:LeftLeg'],['footL','mixamorig:LeftFoot']
];
var SEGMENT={
  hips:['spine','mixamorig:Spine'],spine:['chest','mixamorig:Spine1'],chest:['neck','mixamorig:Neck'],neck:['head','mixamorig:Head'],
  upperArmR:['forearmR','mixamorig:RightForeArm'],forearmR:['handR','mixamorig:RightHand'],
  upperArmL:['forearmL','mixamorig:LeftForeArm'],forearmL:['handL','mixamorig:LeftHand'],
  thighR:['shinR','mixamorig:RightLeg'],shinR:['footR','mixamorig:RightFoot'],footR:['toeR','mixamorig:RightToeBase'],
  thighL:['shinL','mixamorig:LeftLeg'],shinL:['footL','mixamorig:LeftFoot'],footL:['toeL','mixamorig:LeftToeBase']
};

function state(scene){var s=sceneStates&&sceneStates.get(scene);if(!s){s={enabled:true,containers:Object.create(null),failed:Object.create(null),scale:Object.create(null)};if(sceneStates)sceneStates.set(scene,s);else scene._battleSkeletalSoldierState=s;}return s;}
function actualState(scene){return sceneStates?state(scene):(scene._battleSkeletalSoldierState||state(scene));}
function assetBase(){return(root.BATTLE_ASSET_BASE||'https://test.ivandpopov.com/grasstex/Assets/').replace(/\/?$/,'/');}
function ensureLoader(){
  if(BABYLON.GLTFFileLoader)return Promise.resolve(true);if(loaderPromise)return loaderPromise;
  if(typeof document==='undefined')return Promise.reject(new Error('GLTF loader unavailable outside browser'));
  loaderPromise=new Promise(function(resolve,reject){
    var e=document.querySelector('script[data-battle-gltf-loader]');
    if(e){e.addEventListener('load',function(){resolve(true);},{once:true});e.addEventListener('error',reject,{once:true});return;}
    var s=document.createElement('script');s.async=true;s.dataset.battleGltfLoader='1';s.src='https://cdn.jsdelivr.net/npm/babylonjs-loaders@8.26.0/babylonjs.loaders.min.js';
    s.onload=function(){resolve(true);};s.onerror=function(){reject(new Error('Unable to load Babylon GLTF loader'));};document.head.appendChild(s);
  });return loaderPromise;
}
function loadFaction(scene,faction){
  var file=ASSET[faction],s=actualState(scene);if(!file||!s.enabled)return Promise.resolve(false);
  if(s.containers[faction])return Promise.resolve(true);if(s.failed[faction])return Promise.resolve(false);
  return ensureLoader().then(function(){return BABYLON.SceneLoader.LoadAssetContainerAsync(assetBase()+'soldiers/',file,scene,null,'.glb');}).then(function(c){
    (c.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){}});s.containers[faction]=c;
    console.log('[ANIM] runtime Mixamo skin ready for '+faction+' ('+file+')');return true;
  }).catch(function(err){s.failed[faction]=true;console.warn('[ANIM] skeletal '+faction+' soldier unavailable; procedural fallback active',err&&err.message||err);return false;});
}

var vA=new BABYLON.Vector3(),vB=new BABYLON.Vector3(),vFrom=new BABYLON.Vector3(),vTo=new BABYLON.Vector3(),vAxis=new BABYLON.Vector3(),vFallback=new BABYLON.Vector3();
function worldDirection(a,b,out){
  if(!a||!b){out.set(0,1,0);return out;}a.computeWorldMatrix(true);b.computeWorldMatrix(true);vA.copyFrom(a.getAbsolutePosition());vB.copyFrom(b.getAbsolutePosition());
  vB.subtractToRef(vA,out);if(out.lengthSquared()<1e-10)out.set(0,1,0);else out.normalize();return out;
}
function alignSegment(target,targetChild,desired){
  if(!target||!targetChild)return;
  worldDirection(target,targetChild,vFrom);vTo.copyFrom(desired).normalize();
  var dot=BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(vFrom,vTo),-1,1);if(dot>.999999)return;
  BABYLON.Vector3.CrossToRef(vFrom,vTo,vAxis);
  if(vAxis.lengthSquared()<1e-10){
    vFallback.set(1,0,0);BABYLON.Vector3.CrossToRef(vFrom,vFallback,vAxis);
    if(vAxis.lengthSquared()<1e-10){vFallback.set(0,0,1);BABYLON.Vector3.CrossToRef(vFrom,vFallback,vAxis);}if(vAxis.lengthSquared()<1e-10)return;
  }
  vAxis.normalize();target.rotate(vAxis,Math.acos(dot),BABYLON.Space.WORLD);target.computeWorldMatrix(true);
}
function descendants(roots){var out=[],seen=[];function add(n){if(!n||seen.indexOf(n)>=0)return;seen.push(n);out.push(n);var k=n.getChildren?n.getChildren():[];for(var i=0;i<k.length;i++)add(k[i]);}for(var i=0;i<roots.length;i++)add(roots[i]);return out;}
function suffixName(n,t){n=String(n||'');return n===t||n.slice(-t.length)===t;}
function findNamed(nodes,n){for(var i=0;i<nodes.length;i++)if(suffixName(nodes[i].name,n))return nodes[i];return null;}
function localQuat(n){if(n.rotationQuaternion)return n.rotationQuaternion.clone();return BABYLON.Quaternion.FromEulerAngles(n.rotation.x,n.rotation.y,n.rotation.z);}
function meshBounds(roots){var lo=Infinity,hi=-Infinity;for(var r=0;r<roots.length;r++){var ms=[];if(roots[r].getChildMeshes)ms=roots[r].getChildMeshes(false);if(roots[r].getBoundingInfo)ms.unshift(roots[r]);for(var i=0;i<ms.length;i++)try{ms[i].computeWorldMatrix(true);var b=ms[i].getBoundingInfo().boundingBox;lo=Math.min(lo,b.minimumWorld.y);hi=Math.max(hi,b.maximumWorld.y);}catch(_){}}return isFinite(lo)&&isFinite(hi)&&hi>lo?{minY:lo,maxY:hi,height:hi-lo}:null;}
function disposeMeshes(ms){for(var i=0;i<(ms||[]).length;i++)try{if(ms[i]&&!ms[i].isDisposed())ms[i].dispose(false,false);}catch(_){} }
function captureMap(model,nodes){
  var targets=Object.create(null),children=Object.create(null),bindLocal=Object.create(null);
  for(var i=0;i<MAP.length;i++){
    var key=MAP[i][0],target=findNamed(nodes,MAP[i][1]);if(!model.rig||!model.rig[key]||!target)continue;
    targets[key]=target;bindLocal[key]=localQuat(target);
    var seg=SEGMENT[key];if(seg){var child=findNamed(nodes,seg[1]);if(child)children[key]=child;}
  }
  return{nodes:targets,children:children,bindLocal:bindLocal};
}
function instantiate(model,scene,faction){
  var s=actualState(scene),container=s.containers[faction];if(!container||!s.enabled)return false;
  var oldMeshes=model.root&&model.root.getChildMeshes?model.root.getChildMeshes(false).slice():[],prefix='soldier'+(++instanceSerial)+'|',entry;
  try{entry=container.instantiateModelsToScene(function(n){return prefix+n;},false,{doNotInstantiate:false});}catch(err){console.warn('[ANIM] skeletal instantiate failed',err);return false;}
  if(!entry||!entry.rootNodes||!entry.rootNodes.length)return false;(entry.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){}});
  var mount=new BABYLON.TransformNode(prefix+'mount',scene);mount.parent=model.poseRoot;for(var i=0;i<entry.rootNodes.length;i++)entry.rootNodes[i].parent=mount;
  var bounds=meshBounds(entry.rootNodes),scale=s.scale[faction];if(!(scale>0)&&bounds){scale=TARGET_HEIGHT/bounds.height;s.scale[faction]=scale;}if(!(scale>0))scale=1;mount.scaling.setAll(scale);if(bounds)mount.position.y=-bounds.minY*scale;
  var nodes=descendants(entry.rootNodes),rest=captureMap(model,nodes),mapped=Object.keys(rest.nodes).length;
  if(mapped<12){console.warn('[ANIM] skeletal mapping incomplete ('+mapped+'/'+MAP.length+'); procedural fallback active');try{mount.dispose();}catch(_){}return false;}
  disposeMeshes(oldMeshes);model._skeletal={mount:mount,entry:entry,rest:rest,mapped:mapped,faction:faction};model.animationBinding.backend='runtime-mixamo-driver';
  console.log('[ANIM] '+faction+' soldier using bind-reset world-space Mixamo driver; '+mapped+' joints mapped');return true;
}
function retarget(model){
  var sk=model&&model._skeletal;if(!sk||!model.rig)return;var rest=sk.rest,i,key,target,q;
  /* Never accumulate corrections frame-to-frame: first restore every mapped node to the imported
     bind-local rotation. Parent bones are then solved before their children in MAP order. */
  for(i=0;i<MAP.length;i++){
    key=MAP[i][0];target=rest.nodes[key];q=rest.bindLocal[key];if(!target||!q)continue;
    if(!target.rotationQuaternion)target.rotationQuaternion=q.clone();else target.rotationQuaternion.copyFrom(q);
    if(target.rotation)target.rotation.set(0,0,0);target.computeWorldMatrix(true);
  }
  for(i=0;i<MAP.length;i++){
    key=MAP[i][0];var seg=SEGMENT[key],source=model.rig[key],sourceChild=seg&&model.rig[seg[0]],targetChild=rest.children[key];target=rest.nodes[key];
    if(!seg||!source||!sourceChild||!target||!targetChild)continue;
    worldDirection(source,sourceChild,vTo);alignSegment(target,targetChild,vTo);
  }
}

M.preload=function(scene){var p=oldPreload?oldPreload.call(this,scene):true;return Promise.resolve(p).then(function(){return Promise.all([loadFaction(scene,'us'),loadFaction(scene,'ge')]);});};
M.setImportedEnabled=function(scene,v){if(oldSetImported)oldSetImported.call(this,scene,v);actualState(scene).enabled=!!v;};
M.createSoldier=function(scene,faction,role,parent){var model=oldCreate.call(this,scene,faction,role,parent);if(ASSET[faction]&&actualState(scene).enabled)instantiate(model,scene,faction);return model;};
M.animateWalk=function(model,dt,speed){var out=oldAnimate.apply(this,arguments);if(model&&model._skeletal)retarget(model);return out;};
root.BattleSkeletalSoldierBackend={version:'1.6',map:MAP.slice(),asset:ASSET,retarget:retarget};
console.log('[ANIM] runtime skeletal soldier backend active (bind-reset world-space Battle Sim motion -> Mixamo skin)');
})(typeof window!=='undefined'?window:globalThis);
