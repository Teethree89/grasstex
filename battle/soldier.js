/* Low-poly WW2 soldier model: US and German, built from primitives at runtime so there is
   no asset pipeline to stand up before the AI/battle-sim work can start. Every soldier is a
   handful of merged boxes/spheres tinted with vertex colors and ONE shared, textureless
   material - the goal is a silhouette you can tell faction/role apart from at RTS-camera
   distance for a hundred of these on screen at once, not a display model. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}

  var FACTIONS={
    us:{uniform:c3('5b6236'),helmet:c3('47502f'),trim:c3('d9b53c')},
    ge:{uniform:c3('4c4f42'),helmet:c3('363829'),trim:c3('c8c8c8')}
  };
  var SKIN=c3('c9a066'),WOOD=c3('5b3a20'),METAL=c3('33352e'),PACK=c3('4a3d2a');

  function paint(mesh,color){var n=mesh.getTotalVertices(),data=new Float32Array(n*4);for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);return mesh;}
  function box(scene,size,color,pos,rot){var m=BABYLON.MeshBuilder.CreateBox('p',{width:size[0],height:size[1],depth:size[2]},scene);if(pos)m.position.set(pos[0],pos[1],pos[2]);if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);m.bakeCurrentTransformIntoVertices();return paint(m,color);}
  function sphere(scene,diam,color,pos,scaleY){var m=BABYLON.MeshBuilder.CreateSphere('p',{diameter:diam,segments:6},scene);if(scaleY)m.scaling.y=scaleY;if(pos)m.position.set(pos[0],pos[1],pos[2]);m.bakeCurrentTransformIntoVertices();return paint(m,color);}
  function cylinder(scene,diamTop,diamBottom,height,color,pos,rot){var m=BABYLON.MeshBuilder.CreateCylinder('p',{diameterTop:diamTop,diameterBottom:diamBottom,height:height,tessellation:8},scene);if(pos)m.position.set(pos[0],pos[1],pos[2]);if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);m.bakeCurrentTransformIntoVertices();return paint(m,color);}

  var sharedMat=null;
  function bodyMaterial(scene){if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;sharedMat=new BABYLON.StandardMaterial('soldierBodyMat',scene);sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);return sharedMat;}

  function buildHelmet(scene,faction,headTopY){var col=FACTIONS[faction].helmet;if(faction==='ge'){var dome=sphere(scene,.34,col,[0,headTopY+.03,0],.62);var brim=cylinder(scene,.40,.40,.05,col,[0,headTopY-.03,0]);return [dome,brim];}return [sphere(scene,.33,col,[0,headTopY+.05,0.01],.72)];}
  function buildScoutCap(scene,faction,headTopY){return [box(scene,[.24,.10,.26],FACTIONS[faction].helmet,[0,headTopY,0])];}

  var ROLE_BUILD={captain:{torsoW:.48,scale:1.04,cap:false},rifleman:{torsoW:.48,scale:1.0,cap:false},gunner:{torsoW:.58,scale:1.02,cap:false},scout:{torsoW:.42,scale:.98,cap:true}};

  function createSoldier(scene,faction,role,parent){
    var pal=FACTIONS[faction],build=ROLE_BUILD[role]||ROLE_BUILD.rifleman,scale=build.scale;
    var root_=new BABYLON.TransformNode('soldier',scene);if(parent)root_.parent=parent;root_.scaling.setAll(scale);
    /* poseRoot lets stance animation happen locally without disturbing the world-space root
       used by AI, terrain sampling and weapon positioning. */
    var poseRoot=new BABYLON.TransformNode('soldierPose',scene);poseRoot.parent=root_;

    var HIP_Y=.90,TORSO_H=.60,torsoTopY=HIP_Y+TORSO_H,headY=torsoTopY+.16;
    var parts=[];
    parts.push(box(scene,[build.torsoW,TORSO_H,.28],pal.uniform,[0,HIP_Y+TORSO_H/2,0]));
    parts.push(box(scene,[.30,.34,.14],PACK,[0,HIP_Y+TORSO_H*.55,-.19]));
    parts.push(sphere(scene,.26,SKIN,[0,headY,0.01]));
    parts=parts.concat(build.cap?buildScoutCap(scene,faction,headY+.13):buildHelmet(scene,faction,headY+.13));
    var armY=torsoTopY-.10,armSpread=build.torsoW/2+.08;
    parts.push(box(scene,[.13,.52,.13],pal.uniform,[armSpread,armY-.24,.05],[.35,0,-.12]));
    parts.push(box(scene,[.13,.52,.13],pal.uniform,[-armSpread,armY-.24,.05],[.35,0,.12]));
    if(role==='captain')parts.push(box(scene,[.10,.05,.03],pal.trim,[armSpread-.14,armY+.10,.155]));
    var body=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);body.name='soldierBody';body.parent=poseRoot;body.material=bodyMaterial(scene);body.isPickable=false;body.alwaysSelectAsActiveMesh=true;

    function leg(sign){var pivot=new BABYLON.TransformNode('hip',scene);pivot.parent=poseRoot;pivot.position.set(sign*.13,HIP_Y,0);var mesh=box(scene,[.16,.86,.19],pal.uniform,[0,-.43,0]);mesh.parent=pivot;mesh.material=bodyMaterial(scene);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;return pivot;}
    var legL=leg(1),legR=leg(-1);

    var weaponSocket=new BABYLON.TransformNode('weaponSocket',scene);weaponSocket.parent=poseRoot;weaponSocket.position.set(build.torsoW/2+.05,HIP_Y+TORSO_H*.62,.16);weaponSocket.rotation.set(-.08,0,0);

    return {faction:faction,role:role,root:root_,poseRoot:poseRoot,body:body,legL:legL,legR:legR,weaponSocket:weaponSocket,baseY:root_.position.y,walkPhase:Math.random()*Math.PI*2,stanceBlend:0,stanceTarget:'stand',dead:false};
  }

  function lerp(a,b,t){return a+(b-a)*t;}
  function animateWalk(soldier,dt,speedFrac){
    if(soldier.dead)return;
    var target=soldier.prone?'prone':(soldier.crouching?'crouch':'stand');
    soldier.stanceTarget=target;
    var desired=target==='prone'?1:(target==='crouch'?.48:0);
    var k=1-Math.exp(-dt*(target==='prone'?5.5:7.5));
    soldier.stanceBlend=lerp(soldier.stanceBlend||0,desired,k);
    var b=soldier.stanceBlend,s=(ROLE_BUILD[soldier.role]||ROLE_BUILD.rifleman).scale;
    /* 0=standing, ~.48=crouched, 1=prone. Pose rotation makes prone read as lying down,
       while Y compression/offset makes the stand<->crouch transition continuous. */
    var proneT=Math.max(0,(b-.48)/.52),crouchT=Math.min(1,b/.48);
    soldier.root.scaling.set(s,s*lerp(1,.72,crouchT)*lerp(1,.70,proneT),s);
    soldier.poseRoot.rotation.x=lerp(soldier.poseRoot.rotation.x,1.38*proneT,k);
    soldier.poseRoot.position.y=lerp(soldier.poseRoot.position.y,-.08*crouchT+.28*proneT,k);
    soldier.poseRoot.position.z=lerp(soldier.poseRoot.position.z,.42*proneT,k);

    var movingFrac=target==='prone'?0:Math.min(1,speedFrac);
    var amp=movingFrac*.55*(1-.35*crouchT);
    soldier.walkPhase+=dt*(3.5+movingFrac*5.5);
    var swing=Math.sin(soldier.walkPhase)*amp;
    soldier.legL.rotation.x=lerp(soldier.legL.rotation.x,swing,k);
    soldier.legR.rotation.x=lerp(soldier.legR.rotation.x,-swing,k);
    soldier.body.position.y=Math.abs(Math.sin(soldier.walkPhase))*amp*.045;
  }

  /* Kept for battle-sim compatibility; stance changes are targets now, not instant scaling. */
  function setCrouch(soldier,crouching){if(soldier.dead)return;soldier.crouching=!!crouching;if(!soldier.prone)soldier.stanceTarget=crouching?'crouch':'stand';}
  function setProne(soldier,prone){if(soldier.dead)return;soldier.prone=!!prone;soldier.stanceTarget=prone?'prone':(soldier.crouching?'crouch':'stand');}

  function kill(soldier){if(soldier.dead)return;soldier.dead=true;soldier.prone=false;soldier.root.rotation.z=(Math.random()<0.5?-1:1)*(Math.PI/2-.15);soldier.root.rotation.x=(Math.random()-0.5)*.5;soldier.root.position.y-=.35;}

  root.BattleSoldierModel={FACTIONS:FACTIONS,createSoldier:createSoldier,animateWalk:animateWalk,setCrouch:setCrouch,setProne:setProne,kill:kill};
})(typeof window!=='undefined'?window:globalThis);
