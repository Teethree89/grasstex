/* Low-poly WW2 small arms + animation-friendly magazine/reload metadata. */
(function(root){
  'use strict';if(typeof BABYLON==='undefined')return;
  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var WOOD=c3('5b3a20'),METAL=c3('2e2f29'),METAL_L=c3('54564c');
  function paint(mesh,color){var n=mesh.getTotalVertices(),data=new Float32Array(n*4);for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);return mesh;}
  function box(scene,size,color,pos){var m=BABYLON.MeshBuilder.CreateBox('w',{width:size[0],height:size[1],depth:size[2]},scene);if(pos)m.position.set(pos[0],pos[1],pos[2]);m.bakeCurrentTransformIntoVertices();return paint(m,color);}
  function cyl(scene,d,height,color,pos,rot){var m=BABYLON.MeshBuilder.CreateCylinder('w',{diameter:d,height:height,tessellation:6},scene);if(pos)m.position.set(pos[0],pos[1],pos[2]);if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);m.bakeCurrentTransformIntoVertices();return paint(m,color);}
  var sharedMat=null;function weaponMaterial(scene){if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;sharedMat=new BABYLON.StandardMaterial('weaponMat',scene);sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);return sharedMat;}
  function buildRifle(scene,short){var len=short?.78:1.0,parts=[box(scene,[.06,.09,len],WOOD,[0,0,len*.15]),cyl(scene,.035,len*.62,METAL,[0,.01,len*.62],[Math.PI/2,0,0])],mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);mesh.material=weaponMaterial(scene);mesh.isPickable=false;return{mesh:mesh,muzzle:[0,.01,len*.95]};}
  function buildLmg(scene){var parts=[box(scene,[.09,.11,.55],WOOD,[0,0,.10]),cyl(scene,.05,.72,METAL,[0,.02,.55],[Math.PI/2,0,0]),box(scene,[.10,.16,.14],METAL_L,[0,-.02,.30]),box(scene,[.02,.22,.02],METAL,[.05,-.14,.82]),box(scene,[.02,.22,.02],METAL,[-.05,-.14,.82])],mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);mesh.material=weaponMaterial(scene);mesh.isPickable=false;return{mesh:mesh,muzzle:[0,.02,.91]};}
  function buildPistol(scene){var parts=[box(scene,[.05,.12,.05],METAL,[0,-.02,.02]),box(scene,[.045,.06,.16],METAL_L,[0,.03,.11])],mesh=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);mesh.material=weaponMaterial(scene);mesh.isPickable=false;return{mesh:mesh,muzzle:[0,.03,.19]};}
  var BUILDERS={rifle:function(s){return buildRifle(s,false);},carbine:function(s){return buildRifle(s,true);},smg:function(s){return buildRifle(s,true);},lmg:buildLmg,pistol:buildPistol};
  var STATS={
    rifle:{label:'M1-pattern rifle',damage:34,rof:.95,range:140,falloffStart:85,accuracy:.80,suppressive:false,magazine:8,reloadTime:2.6},
    carbine:{label:'carbine',damage:26,rof:1.35,range:110,falloffStart:65,accuracy:.76,suppressive:false,magazine:15,reloadTime:2.25},
    smg:{label:'submachine gun',damage:24,rof:2.4,range:90,falloffStart:45,accuracy:.62,suppressive:false,magazine:30,reloadTime:2.4},
    lmg:{label:'light machine gun',damage:20,rof:3.4,range:165,falloffStart:100,accuracy:.52,suppressive:true,magazine:30,reloadTime:4.4},
    pistol:{label:'sidearm',damage:30,rof:1.6,range:55,falloffStart:28,accuracy:.64,suppressive:false,magazine:8,reloadTime:2.0}
  };
  function attachWeapon(scene,socket,kind){var build=(BUILDERS[kind]||BUILDERS.rifle)(scene),stats=STATS[kind]||STATS.rifle;build.mesh.parent=socket;build.mesh.position.set(0,0,0);return{kind:kind,mesh:build.mesh,muzzleLocal:build.muzzle,stats:stats,socket:socket,magSize:stats.magazine||8,ammo:stats.magazine||8};}
  root.BattleWeapons={STATS:STATS,attachWeapon:attachWeapon};
})(typeof window!=='undefined'?window:globalThis);
