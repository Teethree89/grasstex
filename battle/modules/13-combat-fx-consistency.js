/* Consistent visible feedback for every weapon discharge.
   Direct-fire ballistics now supply the actual ray impact point. Keep hit tracers visible and make
   miss tracers faint, while retaining the legacy fallback for older/non-ballistic shots. */
(function(root){
  'use strict';
  if(!root.BattleSim||typeof BABYLON==='undefined'||root.BattleCombatFxConsistency)return;
  var oldStart=root.BattleSim.start,flashMat=null;

  function hash01(seed){
    var x=(seed|0)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967295;
  }
  function muzzleWorld(soldier){
    if(!soldier||!soldier.weapon||!soldier.weapon.mesh||!soldier.weapon.muzzleLocal)return null;
    try{return BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(soldier.weapon.muzzleLocal),soldier.weapon.mesh.getWorldMatrix());}catch(_){return null;}
  }
  function ensureFlash(scene){
    if(flashMat&&flashMat.getScene&&flashMat.getScene()===scene)return flashMat;
    flashMat=new BABYLON.StandardMaterial('muzzleBloomMat',scene);flashMat.emissiveColor=new BABYLON.Color3(1,.72,.25);flashMat.diffuseColor=new BABYLON.Color3(1,.78,.32);flashMat.specularColor=BABYLON.Color3.Black();flashMat.disableLighting=true;return flashMat;
  }
  function muzzleBloom(scene,pos){
    if(!scene||!pos)return;var m=BABYLON.MeshBuilder.CreateSphere('muzzleBloom',{diameter:.34,segments:4},scene);
    m.position.copyFrom(pos);m.material=ensureFlash(scene);m.isPickable=false;m.renderingGroupId=3;
    setTimeout(function(){try{m.dispose();}catch(_){}},105);
  }
  function vec3(p){return p&&new BABYLON.Vector3(+p.x||0,+p.y||0,+p.z||0);}
  function legacyMissEndpoint(shooter,target,d,time){
    var tp=target.root.position,aim=new BABYLON.Vector3(tp.x,tp.y+1.15,tp.z),sid=+shooter.id||0,tid=+target.id||0,tick=Math.floor((+time||0)*1000),seed=(sid*73856093)^(tid*19349663)^tick;
    var a=hash01(seed)*Math.PI*2,spread=Math.min(3.2,.55+(+d||0)*.014),vertical=(hash01(seed^0x5bd1e995)-.5)*spread*.65;
    aim.x+=Math.cos(a)*spread;aim.z+=Math.sin(a)*spread;aim.y+=vertical;return aim;
  }
  function tracer(scene,name,from,to,color,alpha,lifetime){
    if(!scene||!from||!to)return;
    var opts={points:[from,to]},useVertexAlpha=typeof BABYLON.Color4==='function';
    if(useVertexAlpha){opts.colors=[new BABYLON.Color4(color.r,color.g,color.b,alpha),new BABYLON.Color4(color.r,color.g,color.b,alpha)];opts.useVertexAlpha=true;}
    var l=BABYLON.MeshBuilder.CreateLines(name,opts,scene);
    l.color=new BABYLON.Color3(color.r,color.g,color.b);if(!useVertexAlpha)l.alpha=alpha;
    l.isPickable=false;l.renderingGroupId=3;
    setTimeout(function(){try{l.dispose();}catch(_){}},lifetime);
  }
  function hitTracer(scene,from,to){tracer(scene,'tracer-hit',from,to,{r:1,g:.95,b:.7},.50,90);}
  function missTracer(scene,from,to){tracer(scene,'tracer-miss',from,to,{r:1,g:1,b:1},.15,135);}
  function install(sim){
    if(!sim||sim._combatFxConsistencyInstalled)return sim;sim._combatFxConsistencyInstalled=true;
    var oldFire=sim.onFire,oldShot=sim.onShot;
    sim.onFire=function(soldier){
      if(oldFire)oldFire.apply(sim,arguments);
      var pos=muzzleWorld(soldier);if(pos)muzzleBloom(sim.scene,pos);
    };
    sim.onShot=function(shooter,target,hit,d,shot){
      var from=muzzleWorld(shooter);
      if(shot&&shot.mode==='raycast'&&shot.impact&&from){
        var impact=vec3(shot.impact);if(hit)hitTracer(sim.scene,from,impact);else missTracer(sim.scene,from,impact);return;
      }
      if(oldShot)oldShot.apply(sim,arguments);
      if(hit||!shooter||!target||!target.root||!from)return;
      missTracer(sim.scene,from,legacyMissEndpoint(shooter,target,d,sim.time));
    };
    return sim;
  }
  root.BattleSim.start=function(scene,opts){return install(oldStart(scene,opts));};
  root.BattleCombatFxConsistency={version:'72-balanced-tracer-opacity',install:install};
  if(typeof console!=='undefined')console.log('[FX] ballistic hit tracers use 50% vertex alpha; miss tracers use 15% vertex alpha');
})(typeof window!=='undefined'?window:globalThis);
