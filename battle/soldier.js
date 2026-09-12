/* Low-poly WW2 soldier model: US and German, built from primitives at runtime so there is
   no asset pipeline to stand up before the AI/battle-sim work can start. Every soldier is a
   handful of merged boxes/spheres tinted with vertex colors and ONE shared, textureless
   material - the goal is a silhouette you can tell faction/role apart from at RTS-camera
   distance for a hundred of these on screen at once, not a display model.

   Per soldier this builds:
     - one merged "body" mesh (torso, head, helmet, arms, backpack) - static, no per-part
       transforms needed after spawn;
     - two separate leg meshes, left/right, each pivoted at the hip so battle-sim.js can
       swing them for a cheap walk cycle without paying for skeletal animation;
     - one merged weapon mesh (from weapons.js), parented to a hand socket.
   That is 4 draw calls per soldier - fine for 100 of them, and simple enough that a future
   pass can swap any of these builders for a real rig without touching squad-ai.js, which
   only ever asks for soldier.root, soldier.legL/legR and soldier.weaponSocket. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){
    hex=hex.replace('#','');
    return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
  }

  /* Faction palettes. Kept separate from role so a captain and a rifleman on the same side
     still read as the same army first, different job second. */
  var FACTIONS={
    us:{uniform:c3('5b6236'),helmet:c3('47502f'),trim:c3('d9b53c')},
    ge:{uniform:c3('4c4f42'),helmet:c3('363829'),trim:c3('c8c8c8')}
  };
  var SKIN=c3('c9a066'),WOOD=c3('5b3a20'),METAL=c3('33352e'),PACK=c3('4a3d2a');

  function paint(mesh,color){
    var n=mesh.getTotalVertices(),data=new Float32Array(n*4);
    for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);
    return mesh;
  }
  function box(scene,size,color,pos,rot){
    var m=BABYLON.MeshBuilder.CreateBox('p',{width:size[0],height:size[1],depth:size[2]},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }
  function sphere(scene,diam,color,pos,scaleY){
    var m=BABYLON.MeshBuilder.CreateSphere('p',{diameter:diam,segments:6},scene);
    if(scaleY)m.scaling.y=scaleY;
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }
  function cylinder(scene,diamTop,diamBottom,height,color,pos,rot){
    var m=BABYLON.MeshBuilder.CreateCylinder('p',{diameterTop:diamTop,diameterBottom:diamBottom,height:height,tessellation:8},scene);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    m.bakeCurrentTransformIntoVertices();
    return paint(m,color);
  }

  var sharedMat=null;
  function bodyMaterial(scene){
    if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;
    sharedMat=new BABYLON.StandardMaterial('soldierBodyMat',scene);
    sharedMat.specularColor=BABYLON.Color3.Black();
    sharedMat.ambientColor=new BABYLON.Color3(1,1,1);
    return sharedMat;
  }

  /* One helmet shape per faction is most of what makes a silhouette read at a glance:
     the US M1 is a round dome, the German Stahlhelm is a lower dome with a flared brim. */
  function buildHelmet(scene,faction,headTopY){
    var col=FACTIONS[faction].helmet;
    if(faction==='ge'){
      var dome=sphere(scene,.34,col,[0,headTopY+.03,0],.62);
      var brim=cylinder(scene,.40,.40,.05,col,[0,headTopY-.03,0]);
      return [dome,brim];
    }
    var m1=sphere(scene,.33,col,[0,headTopY+.05,0.01],.72);
    return [m1];
  }
  function buildScoutCap(scene,faction,headTopY){
    var col=FACTIONS[faction].helmet;
    return [box(scene,[.24,.10,.26],col,[0,headTopY,0])];
  }

  /* Role shapes: gunners read bulkier, scouts leaner, captains get a bright rank flash.
     None of this affects gameplay stats - those live in squad-ai.js's ROLES table - it is
     purely so you can pick a role out of a crowd on the field. */
  var ROLE_BUILD={
    captain:{torsoW:.48,scale:1.04,cap:false},
    rifleman:{torsoW:.48,scale:1.0,cap:false},
    gunner:{torsoW:.58,scale:1.02,cap:false},
    scout:{torsoW:.42,scale:.98,cap:true}
  };

  /* Builds one soldier and returns the plain object squad-ai.js and battle-sim.js drive.
     `scene` and `parent` (a TransformNode battle-sim.js repositions per spawn) are the only
     Babylon-specific inputs; everything else is faction/role. */
  function createSoldier(scene,faction,role,parent){
    var pal=FACTIONS[faction],build=ROLE_BUILD[role]||ROLE_BUILD.rifleman,scale=build.scale;
    var root_=new BABYLON.TransformNode('soldier',scene);
    if(parent)root_.parent=parent;
    root_.scaling.setAll(scale);

    var HIP_Y=.90,TORSO_H=.60,torsoTopY=HIP_Y+TORSO_H,headY=torsoTopY+.16;
    var parts=[];
    parts.push(box(scene,[build.torsoW,TORSO_H,.28],pal.uniform,[0,HIP_Y+TORSO_H/2,0]));
    parts.push(box(scene,[.30,.34,.14],PACK,[0,HIP_Y+TORSO_H*.55,-.19]));
    parts.push(sphere(scene,.26,SKIN,[0,headY,0.01]));
    parts=parts.concat(build.cap?buildScoutCap(scene,faction,headY+.13):buildHelmet(scene,faction,headY+.13));
    // arms: static, angled slightly forward as if carrying a slung weapon across the body.
    var armY=torsoTopY-.10,armSpread=build.torsoW/2+.08;
    parts.push(box(scene,[.13,.52,.13],pal.uniform,[armSpread,armY-.24,.05],[.35,0,-.12]));
    parts.push(box(scene,[.13,.52,.13],pal.uniform,[-armSpread,armY-.24,.05],[.35,0,.12]));
    // Captains get a small bright rank tab on the chest - the one visual cue that isn't
    // "which role has which silhouette", since a leader is worth spotting at a glance.
    if(role==='captain')parts.push(box(scene,[.10,.05,.03],pal.trim,[armSpread-.14,armY+.10,.155]));
    var body=BABYLON.Mesh.MergeMeshes(parts,true,true,undefined,false,false);
    body.name='soldierBody';body.parent=root_;body.material=bodyMaterial(scene);
    body.isPickable=false;body.alwaysSelectAsActiveMesh=true;

    // Legs stay separate meshes, pivoted at the hip, so battle-sim.js can swing them.
    function leg(sign){
      var pivot=new BABYLON.TransformNode('hip',scene);pivot.parent=root_;pivot.position.set(sign*.13,HIP_Y,0);
      var mesh=box(scene,[.16,.86,.19],pal.uniform,[0,-.43,0]);
      mesh.parent=pivot;mesh.material=bodyMaterial(scene);mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;
      return pivot;
    }
    var legL=leg(1),legR=leg(-1);

    var weaponSocket=new BABYLON.TransformNode('weaponSocket',scene);
    weaponSocket.parent=root_;
    weaponSocket.position.set(build.torsoW/2+.05,HIP_Y+TORSO_H*.62,.16);
    weaponSocket.rotation.set(-.08,0,0);

    return {
      faction:faction,role:role,root:root_,body:body,legL:legL,legR:legR,weaponSocket:weaponSocket,
      baseY:root_.position.y,
      walkPhase:Math.random()*Math.PI*2,
      dead:false
    };
  }

  /* Cheap walk cycle: alternating hip swing plus a small torso bob, driven by how far the
     soldier moved this frame rather than by a fixed clock - so a stationary gunner doesn't
     idle-jog in place. `speedFrac` is current speed / role top speed, 0..~1. */
  function animateWalk(soldier,dt,speedFrac){
    if(soldier.dead)return;
    var amp=Math.min(1,speedFrac)*.55;
    soldier.walkPhase+=dt*(4+speedFrac*5);
    var swing=Math.sin(soldier.walkPhase)*amp;
    soldier.legL.rotation.x=swing;
    soldier.legR.rotation.x=-swing;
    soldier.body.position.y=Math.abs(Math.sin(soldier.walkPhase))*amp*.05;
  }

  function setCrouch(soldier,crouching){
    if(soldier.dead)return;
    // Y-only squash so crouch reads as "lower profile" without also narrowing the silhouette.
    var s=(ROLE_BUILD[soldier.role]||ROLE_BUILD.rifleman).scale;
    soldier.root.scaling.set(s,crouching?s*0.72:s,s);
  }

  /* Falls the soldier over in place and freezes it there as a battlefield marker - cheap,
     readable, and needs no extra draw calls or timers once it has happened. */
  function kill(soldier){
    if(soldier.dead)return;
    soldier.dead=true;
    soldier.root.rotation.z=(Math.random()<0.5?-1:1)*(Math.PI/2-.15);
    soldier.root.rotation.x=(Math.random()-0.5)*.5;
    soldier.root.position.y-=.35;
  }

  root.BattleSoldierModel={FACTIONS:FACTIONS,createSoldier:createSoldier,animateWalk:animateWalk,setCrouch:setCrouch,kill:kill};
})(typeof window!=='undefined'?window:globalThis);
