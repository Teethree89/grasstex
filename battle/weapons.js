/* Low-poly WW2 small arms: one mesh builder plus a stats table per weapon, keyed by the
   same names squad-ai.js's ROLES table assigns to each role. Visually these only need to
   read as "rifle silhouette" vs "boxy support gun" vs "sidearm" at a distance - they are not
   trying to be a Garand or a Kar98k, just something that could plausibly become one later
   without any of the AI/stat code changing.

   Combat numbers are tuned for the battle-sim's tick rate (squad-ai.js calls tryFire at a
   fixed ~6.7 Hz "AI tick", not every render frame), not for real ballistics: `rof` is shots
   per second of that tick's fire opportunity, `accuracy` is the hit chance at point-blank
   before range falloff, and `damage` divides evenly enough that 3-4 hits from a rifle-class
   weapon kill a 100 HP soldier. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var WOOD=c3('5b3a20'),METAL=c3('2e2f29'),METAL_L=c3('54564c');

  function paint(mesh,color){
    var n=mesh.getTotalVertices(),data=new Float32Array(n*4);
    for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);
    return mesh;
  }
  function box(scene,size,color,pos){
    var m=BABYLON.MeshBuilder.CreateBox('w',{width:size[0],height:size[1],depth:size[2]},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }
  function cyl(scene,d,height,color,pos,rot){
    var m=BABYLON.MeshBuilder.CreateCylinder('w',{diameter:d,height:height,tessellation:6},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }

  var sharedMat=null;
  function weaponMaterial(scene){
    if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;
    sharedMat=new BABYLON.StandardMaterial('weaponMat',scene);
    sharedMat.specularColor=BABYLON.Color3.Black();
    sharedMat.ambientColor=new BABYLON.Color3(1,1,1);
    return sharedMat;
  }

  /* Every builder returns {mesh, muzzle:[x,y,z]} in the weapon's own local space, barrel
     pointing down +Z, grip roughly at the origin - that origin is what gets parented to the
     soldier's weaponSocket, so the socket's own offset/rotation is all soldier.js needs to
     tune to change how a weapon sits in the hand. */
  function buildRifle(scene,short){
    var len=short?.78:1.0;
    var parts=[
      box(scene,[.06,.09,len],WOOD,[0,0,len*.15]),
      cyl(scene,.035,len*.62,METAL,[0,.01,len*.62],[Math.PI/2,0,0])
    ];
    var mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    mesh.material=weaponMaterial(scene);mesh.isPickable=false;
    return {mesh:mesh,muzzle:[0,.01,len*.95]};
  }
  function buildLmg(scene){
    var parts=[
      box(scene,[.09,.11,.55],WOOD,[0,0,.10]),
      cyl(scene,.05,.72,METAL,[0,.02,.55],[Math.PI/2,0,0]),
      box(scene,[.10,.16,.14],METAL_L,[0,-.02,.30]), // receiver/mag housing bulk
      // bipod legs, splayed forward-down from near the muzzle
      box(scene,[.02,.22,.02],METAL,[.05,-.14,.82]),
      box(scene,[.02,.22,.02],METAL,[-.05,-.14,.82])
    ];
    var mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    mesh.material=weaponMaterial(scene);mesh.isPickable=false;
    return {mesh:mesh,muzzle:[0,.02,.91]};
  }
  function buildPistol(scene){
    var parts=[
      box(scene,[.05,.12,.05],METAL,[0,-.02,.02]),
      box(scene,[.045,.06,.16],METAL_L,[0,.03,.11])
    ];
    var mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    mesh.material=weaponMaterial(scene);mesh.isPickable=false;
    return {mesh:mesh,muzzle:[0,.03,.19]};
  }

  var BUILDERS={rifle:function(s){return buildRifle(s,false);},carbine:function(s){return buildRifle(s,true);},lmg:buildLmg,pistol:buildPistol};

  /* Tuning table. `suppressive` weapons (the LMG) apply the "pinned" accuracy penalty to
     whoever they're shooting at even on a miss - see squad-ai.js resolveFire. */
  var STATS={
    rifle:{label:'M1-pattern rifle',damage:34,rof:0.95,range:140,falloffStart:85,accuracy:.80,suppressive:false},
    carbine:{label:'carbine',damage:26,rof:1.35,range:110,falloffStart:65,accuracy:.76,suppressive:false},
    lmg:{label:'light machine gun',damage:20,rof:3.4,range:165,falloffStart:100,accuracy:.52,suppressive:true},
    pistol:{label:'sidearm',damage:30,rof:1.6,range:55,falloffStart:28,accuracy:.64,suppressive:false}
  };

  /* Attaches a weapon of `kind` to `socket` (a TransformNode from soldier.js) and returns
     the combined runtime record squad-ai.js needs to fire it. */
  function attachWeapon(scene,socket,kind){
    var build=(BUILDERS[kind]||BUILDERS.rifle)(scene);
    build.mesh.parent=socket;
    build.mesh.position.set(0,0,0);
    return {kind:kind,mesh:build.mesh,muzzleLocal:build.muzzle,stats:STATS[kind]||STATS.rifle,socket:socket};
  }

  root.BattleWeapons={STATS:STATS,attachWeapon:attachWeapon};
})(typeof window!=='undefined'?window:globalThis);
