/* Runtime Mixamo skeletal soldier backend.
   The procedural Battle Sim rig remains the animation/IK driver. The GLB is only the visible skin.
   Native GLB animation groups are deliberately ignored, so Meshy's Walking clip never drives play.

   Retargeting deliberately solves anatomical joint directions instead of copying raw quaternions.
   The procedural rig and Mixamo use different local bone axes; direction solving preserves the
   Mixamo bind frame while matching the actual pose of our animated procedural joints. */
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
/* Source child and target child used to define each anatomical segment. Head intentionally inherits
   the animated neck without an extra solve until we have a stable head-look layer. */
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
function ensureLoader(){if(BABYLON.GLTFFileLoader)return Promise.resolve(true);if(loaderPromise)return loaderPromise;if(typeof document==='undefined')return Promise.reject(new Error('GLTF loader unavailable outside browser'));loaderPromise=new Promise(function(resolve,reject){var e=document.querySelector('script[data-battle-gltf-loader]');if(e){e.addEventListener('load',function(){resolve(true);},{once:true});e.addEventListener('error',reject,{once:true});return;}var s=document.createElement('script');s.async=true;s.dataset.battleGltfLoader='1';s.src='https://cdn.jsdelivr.net/npm/babylonjs-loaders@8.26.0/babylonjs.loaders.min.js';s.onload=function(){resolve(true);};s.onerror=function(){reject(new Error('Unable to load Babylon GLTF loader'));};document.head.appendChild(s);});return loaderPromise;}
function loadFaction(scene,faction){var file=ASSET[faction],s=actualState(scene);if(!file||!s.enabled)return Promise.resolve(false);if(s.containers[faction])return Promise.resolve(true);if(s.failed[faction])return Promise.resolve(false);return ensureLoader().then(function(){return BABYLON.SceneLoader.LoadAssetContainerAsync(assetBase()+'soldiers/',file,scene,null,'.glb');}).then(function(c){(c.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){}});s.containers[faction]=c;console.log('[ANIM] runtime Mixamo skin ready for '+faction+' ('+file+')');return true;}).catch(function(err){s.failed[faction]=true;console.warn('[ANIM] skeletal '+faction+' soldier unavailable; procedural fallback active',err&&err.message||err);return false;});}

var qWorld=new BABYLON.Quaternion(),qRoot=new BABYLON.Quaternion(),qInvRoot=new BABYLON.Quaternion(),qDesired=new BABYLON.Quaternion(),qParent=new BABYLON.Quaternion(),qInvParent=new BABYLON.Quaternion(),qLocal=new BABYLON.Quaternion(),qSwing=new BABYLON.Quaternion();
var decompScale=new BABYLON.Vector3(),decompPos=new BABYLON.Vector3(),vA=new BABYLON.Vector3(),vB=new BABYLON.Vector3(),vDir=new BABYLON.Vector3(),vCross=new BABYLON.Vector3(),mInv=new BABYLON.Matrix();
function worldRotation(n,out){if(!n){out.set(0,0,0,1);return out;}n.computeWorldMatrix(true);n.getWorldMatrix().decompose(decompScale,out,decompPos);return out;}
function relativeRotation(r,n,out){worldRotation(r,qRoot);qRoot.conjugateToRef(qInvRoot);worldRotation(n,qWorld);qInvRoot.multiplyToRef(qWorld,out);return out.normalize();}
function relativeDirection(r,a,b,out){if(!r||!a||!b){out.set(0,1,0);return out;}a.computeWorldMatrix(true);b.computeWorldMatrix(true);vA.copyFrom(a.getAbsolutePosition());vB.copyFrom(b.getAbsolutePosition());vB.subtractToRef(vA,vDir);r.computeWorldMatrix(true);r.getWorldMatrix().invertToRef(mInv);BABYLON.Vector3.TransformNormalToRef(vDir,mInv,out);if(out.lengthSquared()<1e-10)out.set(0,1,0);else out.normalize();return out;}
function rotationFromTo(a,b,out){
  var d=BABYLON.Scalar.Clamp(BABYLON.Vector3.Dot(a,b),-1,1);
  if(d>.999999){out.set(0,0,0,1);return out;}
  if(d<-.999999){
    vCross.set(1,0,0);BABYLON.Vector3.CrossToRef(a,vCross,vDir);
    if(vDir.lengthSquared()<1e-8){vCross.set(0,0,1);BABYLON.Vector3.CrossToRef(a,vCross,vDir);}vDir.normalize();
    BABYLON.Quaternion.RotationAxisToRef(vDir,Math.PI,out);return out;
  }
  BABYLON.Vector3.CrossToRef(a,b,vCross);var s=Math.sqrt((1+d)*2),inv=1/s;out.set(vCross.x*inv,vCross.y*inv,vCross.z*inv,s*.5);return out.normalize();
}
function descendants(roots){var out=[],seen=[];function add(n){if(!n||seen.indexOf(n)>=0)return;seen.push(n);out.push(n);var k=n.getChildren?n.getChildren():[];for(var i=0;i<k.length;i++)add(k[i]);}for(var i=0;i<roots.length;i++)add(roots[i]);return out;}
function suffixName(n,t){n=String(n||'');return n===t||n.slice(-t.length)===t;}
function findNamed(nodes,n){for(var i=0;i<nodes.length;i++)if(suffixName(nodes[i].name,n))return nodes[i];return null;}
function meshBounds(roots){var lo=Infinity,hi=-Infinity;for(var r=0;r<roots.length;r++){var ms=[];if(roots[r].getChildMeshes)ms=roots[r].getChildMeshes(false);if(roots[r].getBoundingInfo)ms.unshift(roots[r]);for(var i=0;i<ms.length;i++)try{ms[i].computeWorldMatrix(true);var b=ms[i].getBoundingInfo().boundingBox;lo=Math.min(lo,b.minimumWorld.y);hi=Math.max(hi,b.maximumWorld.y);}catch(_){}}return isFinite(lo)&&isFinite(hi)&&hi>lo?{minY:lo,maxY:hi,height:hi-lo}:null;}
function disposeMeshes(ms){for(var i=0;i<(ms||[]).length;i++)try{if(ms[i]&&!ms[i].isDisposed())ms[i].dispose(false,false);}catch(_){} }
function captureMap(model,nodes){
  var targets=Object.create(null),bindWorld=Object.create(null),bindDir=Object.create(null),targetChildren=Object.create(null);
  for(var i=0;i<MAP.length;i++){
    var key=MAP[i][0],target=findNamed(nodes,MAP[i][1]);if(!model.rig||!model.rig[key]||!target)continue;
    targets[key]=target;bindWorld[key]=relativeRotation(model.root,target,new BABYLON.Quaternion()).clone();
    var seg=SEGMENT[key];if(seg){var tc=findNamed(nodes,seg[1]);if(tc){targetChildren[key]=tc;bindDir[key]=relativeDirection(model.root,target,tc,new BABYLON.Vector3()).clone();}}
  }
  return{nodes:targets,bindWorld:bindWorld,bindDir:bindDir,targetChildren:targetChildren};
}
function instantiate(model,scene,faction){
  var s=actualState(scene),container=s.containers[faction];if(!container||!s.enabled)return false;
  var oldMeshes=model.root&&model.root.getChildMeshes?model.root.getChildMeshes(false).slice():[],prefix='soldier'+(++instanceSerial)+'|',entry;
  try{entry=container.instantiateModelsToScene(function(n){return prefix+n;},false,{doNotInstantiate:false});}catch(err){console.warn('[ANIM] skeletal instantiate failed',err);return false;}
  if(!entry||!entry.rootNodes||!entry.rootNodes.length)return false;(entry.animationGroups||[]).forEach(function(g){try{g.stop();g.dispose();}catch(_){}});
  var mount=new BABYLON.TransformNode(prefix+'mount',scene);mount.parent=model.poseRoot;for(var i=0;i<entry.rootNodes.length;i++)entry.rootNodes[i].parent=mount;
  var bounds=meshBounds(entry.rootNodes),scale=s.scale[faction];if(!(scale>0)&&bounds){scale=TARGET_HEIGHT/bounds.height;s.scale[faction]=scale;}if(!(scale>0))scale=1;mount.scaling.setAll(scale);if(bounds)mount.position.y=-bounds.minY*scale;
  var nodes=descendants(entry.rootNodes),rest=captureMap(model,nodes),mapped=Object.keys(rest.nodes).length;if(mapped<12){console.warn('[ANIM] skeletal mapping incomplete ('+mapped+'/'+MAP.length+'); procedural fallback active');try{mount.dispose();}catch(_){}return false;}
  disposeMeshes(oldMeshes);model._skeletal={mount:mount,entry:entry,rest:rest,mapped:mapped,faction:faction};model.animationBinding.backend='runtime-mixamo-driver';
  console.log('[ANIM] '+faction+' soldier using direction-solved runtime Mixamo skin; '+mapped+' driver joints mapped');return true;
}
function retarget(model){
  var sk=model&&model._skeletal;if(!sk||!model.root||!model.rig)return;var rest=sk.rest;
  for(var i=0;i<MAP.length;i++){
    var key=MAP[i][0],source=model.rig[key],target=rest.nodes[key],seg=SEGMENT[key],bind=rest.bindWorld[key];
    if(!source||!target||!bind)continue;
    if(!seg||!rest.bindDir[key])continue; /* head inherits neck until a dedicated look layer exists */
    var sourceChild=model.rig[seg[0]];if(!sourceChild)continue;
    relativeDirection(model.root,source,sourceChild,vDir);rotationFromTo(rest.bindDir[key],vDir,qSwing);qSwing.multiplyToRef(bind,qDesired).normalize();
    var p=target.parent;if(p&&p!==model.root){relativeRotation(model.root,p,qParent);qParent.conjugateToRef(qInvParent);qInvParent.multiplyToRef(qDesired,qLocal);}else qLocal.copyFrom(qDesired);
    if(!target.rotationQuaternion)target.rotationQuaternion=new BABYLON.Quaternion();target.rotationQuaternion.copyFrom(qLocal).normalize();if(target.rotation)target.rotation.set(0,0,0);target.computeWorldMatrix(true);
  }
}

M.preload=function(scene){var p=oldPreload?oldPreload.call(this,scene):true;return Promise.resolve(p).then(function(){return Promise.all([loadFaction(scene,'us'),loadFaction(scene,'ge')]);});};
M.setImportedEnabled=function(scene,v){if(oldSetImported)oldSetImported.call(this,scene,v);actualState(scene).enabled=!!v;};
M.createSoldier=function(scene,faction,role,parent){var model=oldCreate.call(this,scene,faction,role,parent);if(ASSET[faction]&&actualState(scene).enabled)instantiate(model,scene,faction);return model;};
M.animateWalk=function(model,dt,speed){var out=oldAnimate.apply(this,arguments);if(model&&model._skeletal)retarget(model);return out;};
root.BattleSkeletalSoldierBackend={version:'1.5',map:MAP.slice(),asset:ASSET,retarget:retarget};
console.log('[ANIM] runtime skeletal soldier backend active (direction-solved Battle Sim motion -> Mixamo skin)');
})(typeof window!=='undefined'?window:globalThis);
