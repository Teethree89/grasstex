/* Articulated low-poly WW2 soldier + model-agnostic animation contract.
   The procedural rig exposes semantic animation tags and named joints so an imported skeletal
   model can replace it later without changing combat/AI code. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var FACTIONS={us:{uniform:c3('5b6236'),helmet:c3('47502f'),trim:c3('d9b53c')},ge:{uniform:c3('4c4f42'),helmet:c3('363829'),trim:c3('c8c8c8')}};
  var SKIN=c3('c9a066'),PACK=c3('4a3d2a');
  var ROLE_BUILD={captain:{torsoW:.48,scale:1.04,cap:false},rifleman:{torsoW:.48,scale:1.0,cap:false},gunner:{torsoW:.58,scale:1.02,cap:false},scout:{torsoW:.42,scale:.98,cap:true}};

  var TAGS={
    idle:'locomotion.idle',walk:'locomotion.walk',crouchWalk:'locomotion.crouch-walk',crawl:'locomotion.prone-crawl',
    aim:'combat.aim',fire:'combat.fire',reload:'combat.reload',
    stand:'stance.stand',crouch:'stance.crouch',prone:'stance.prone',
    deathFront:'death.front',deathBack:'death.back',deathSide:'death.side'
  };

  function paint(mesh,color){var n=mesh.getTotalVertices(),data=new Float32Array(n*4);for(var i=0;i<n;i++){data[i*4]=color.r;data[i*4+1]=color.g;data[i*4+2]=color.b;data[i*4+3]=1;}mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,data);return mesh;}
  function box(scene,size,color,parent,pos){var m=BABYLON.MeshBuilder.CreateBox('soldierPart',{width:size[0],height:size[1],depth:size[2]},scene);paint(m,color);m.parent=parent;if(pos)m.position.set(pos[0],pos[1],pos[2]);m.material=bodyMaterial(scene);m.isPickable=false;m.alwaysSelectAsActiveMesh=true;return m;}
  function sphere(scene,diam,color,parent,pos,scaleY){var m=BABYLON.MeshBuilder.CreateSphere('soldierPart',{diameter:diam,segments:6},scene);paint(m,color);m.parent=parent;if(pos)m.position.set(pos[0],pos[1],pos[2]);if(scaleY)m.scaling.y=scaleY;m.material=bodyMaterial(scene);m.isPickable=false;m.alwaysSelectAsActiveMesh=true;return m;}
  function cylinder(scene,diam,height,color,parent,pos){var m=BABYLON.MeshBuilder.CreateCylinder('soldierPart',{diameter:diam,height:height,tessellation:7},scene);paint(m,color);m.parent=parent;if(pos)m.position.set(pos[0],pos[1],pos[2]);m.material=bodyMaterial(scene);m.isPickable=false;m.alwaysSelectAsActiveMesh=true;return m;}
  var sharedMat=null;function bodyMaterial(scene){if(sharedMat&&sharedMat.getScene()===scene)return sharedMat;sharedMat=new BABYLON.StandardMaterial('soldierBodyMat',scene);sharedMat.specularColor=BABYLON.Color3.Black();sharedMat.ambientColor=new BABYLON.Color3(1,1,1);return sharedMat;}
  function node(scene,name,parent,pos){var n=new BABYLON.TransformNode(name,scene);n.parent=parent;if(pos)n.position.set(pos[0],pos[1],pos[2]);return n;}

  function buildPrimitiveRig(scene,faction,role,parent){
    var pal=FACTIONS[faction],build=ROLE_BUILD[role]||ROLE_BUILD.rifleman,scale=build.scale;
    var world=node(scene,'soldier',parent||null),pose=node(scene,'soldierPose',world);world.scaling.setAll(scale);
    var pelvis=node(scene,'joint.pelvis',pose,[0,.90,0]);box(scene,[.38,.22,.26],pal.uniform,pelvis,[0,0,0]);
    var torso=node(scene,'joint.spine',pose,[0,1.20,0]);box(scene,[build.torsoW,.62,.28],pal.uniform,torso,[0,.02,0]);box(scene,[.30,.34,.14],PACK,torso,[0,.02,-.21]);
    var neck=node(scene,'joint.neck',pose,[0,1.55,0]),head=node(scene,'joint.head',neck,[0,.12,.01]);sphere(scene,.27,SKIN,head,[0,0,0]);
    if(build.cap)box(scene,[.25,.10,.27],pal.helmet,head,[0,.15,0]);else{sphere(scene,.35,pal.helmet,head,[0,.16,.01],faction==='ge'?.63:.74);if(faction==='ge')cylinder(scene,.40,.045,pal.helmet,head,[0,.10,0]);}

    function arm(sign){
      var shoulder=node(scene,sign>0?'joint.shoulder.r':'joint.shoulder.l',pose,[sign*(build.torsoW/2+.08),1.43,.01]);
      box(scene,[.14,.38,.14],pal.uniform,shoulder,[0,-.19,0]);
      var elbow=node(scene,sign>0?'joint.elbow.r':'joint.elbow.l',shoulder,[0,-.38,0]);box(scene,[.13,.34,.13],pal.uniform,elbow,[0,-.17,0]);
      var hand=node(scene,sign>0?'joint.hand.r':'joint.hand.l',elbow,[0,-.35,0]);sphere(scene,.13,SKIN,hand,[0,0,0]);return{shoulder:shoulder,elbow:elbow,hand:hand};
    }
    function leg(sign){
      var hip=node(scene,sign>0?'joint.hip.r':'joint.hip.l',pose,[sign*.14,.88,0]);box(scene,[.18,.44,.20],pal.uniform,hip,[0,-.22,0]);
      var knee=node(scene,sign>0?'joint.knee.r':'joint.knee.l',hip,[0,-.44,0]);box(scene,[.17,.44,.19],pal.uniform,knee,[0,-.22,0]);return{hip:hip,knee:knee};
    }
    var armR=arm(1),armL=arm(-1),legR=leg(1),legL=leg(-1);
    if(role==='captain')box(scene,[.10,.05,.03],pal.trim,armR.shoulder,[0,-.08,.08]);
    var weaponSocket=node(scene,'socket.weapon',pose,[.06,1.31,.31]);
    return{
      faction:faction,role:role,root:world,poseRoot:pose,weaponSocket:weaponSocket,dead:false,
      rig:{pelvis:pelvis,spine:torso,neck:neck,head:head,shoulderR:armR.shoulder,shoulderL:armL.shoulder,elbowR:armR.elbow,elbowL:armL.elbow,handR:armR.hand,handL:armL.hand,hipR:legR.hip,hipL:legL.hip,kneeR:legR.knee,kneeL:legL.knee,weapon:weaponSocket},
      animationBinding:{backend:'procedural-v2',tags:TAGS},walkPhase:Math.random()*Math.PI*2,stanceBlend:0,_animFireKick:0,_animReloadClock:0,deathClock:0
    };
  }

  function damp(a,b,k){return a+(b-a)*k;}
  function rot(node_,x,y,z,k){node_.rotation.x=damp(node_.rotation.x,x,k);node_.rotation.y=damp(node_.rotation.y,y||0,k);node_.rotation.z=damp(node_.rotation.z,z||0,k);}
  function trigger(soldier,tag,data){
    if(!soldier)return;soldier.animationEvent={tag:tag,data:data||null};
    if(tag===TAGS.fire)soldier._animFireKick=1;if(tag===TAGS.reload)soldier._animReloadClock=0;
    var b=soldier.animationBinding;if(b&&b.backend!=='procedural-v2'&&typeof b.play==='function')try{b.play(tag,data||{},soldier);}catch(e){console.warn('[ANIM] external play failed',e);}
  }
  function bindAnimationBackend(soldier,binding){if(!soldier||!binding)return false;soldier.animationBinding=Object.assign({backend:'external',tags:TAGS},binding);return true;}

  function primitivePose(s,dt,speedFrac){
    var r=s.rig;if(!r)return;var k=1-Math.exp(-dt*10),moving=Math.min(1,Math.max(0,speedFrac||0));
    if(s.dead){
      s.deathClock=(s.deathClock||0)+dt;var p=Math.min(1,s.deathClock/.55),ease=1-Math.pow(1-p,3),side=s.deathVariant==='side'?(s.deathSide||1):0,front=s.deathVariant==='front'?1:(s.deathVariant==='back'?-1:0);
      r.spine.rotation.x=damp(r.spine.rotation.x,front*.55,k);r.hipL.rotation.x=damp(r.hipL.rotation.x,.45,k);r.hipR.rotation.x=damp(r.hipR.rotation.x,-.18,k);r.kneeL.rotation.x=damp(r.kneeL.rotation.x,-1.05,k);r.kneeR.rotation.x=damp(r.kneeR.rotation.x,-.62,k);
      s.poseRoot.rotation.z=damp(s.poseRoot.rotation.z,side*1.42*ease,k);s.poseRoot.rotation.x=damp(s.poseRoot.rotation.x,front*1.28*ease,k);s.poseRoot.position.y=damp(s.poseRoot.position.y,.10*ease,k);return;
    }
    var prone=s.prone?1:0,crouch=!prone&&s.crouching?1:0,crawl=prone&&s.crawling&&moving>.03;
    s.walkPhase+=dt*(3.2+moving*6.0);var phase=s.walkPhase,legSwing=Math.sin(phase)*.72*moving*(1-prone),back=Math.max(0,-Math.sin(phase)),front=Math.max(0,Math.sin(phase));
    s.poseRoot.position.y=damp(s.poseRoot.position.y,prone?.22:(crouch?-.18:0),k);s.poseRoot.position.z=damp(s.poseRoot.position.z,prone?.42:0,k);rot(s.poseRoot,prone?1.43:0,0,0,k);
    rot(r.spine,crouch?.20:0,0,0,k);rot(r.hipR,(crouch?.48:0)+legSwing,0,0,k);rot(r.hipL,(crouch?.48:0)-legSwing,0,0,k);rot(r.kneeR,crouch?-1.00:(-.55*back),0,0,k);rot(r.kneeL,crouch?-1.00:(-.55*front),0,0,k);
    var aiming=!!s.target&&!s.reloading,fireKick=s._animFireKick||0;s._animFireKick=Math.max(0,fireKick-dt*8);
    var reload=!!s.reloading;if(reload)s._animReloadClock=(s._animReloadClock||0)+dt;else s._animReloadClock=0;
    var reloadDur=s.weapon&&s.weapon.stats&&s.weapon.stats.reloadTime||2.5,rp=reload?Math.min(1,s._animReloadClock/reloadDur):0,reach=Math.sin(Math.PI*rp);
    var armBase=prone?-1.28:(aiming?-1.04:-.82),crawlSwing=crawl?Math.sin(phase)*.35:0;
    rot(r.shoulderR,armBase+crawlSwing*.25,0,.10,k);rot(r.shoulderL,armBase-crawlSwing*.35,0,-.16,k);rot(r.elbowR,-.54+(reload?reach*.72:0),0,.10,k);rot(r.elbowL,-.68+(reload?reach*1.15:0),0,-.10,k);
    if(reload){r.shoulderL.rotation.z=damp(r.shoulderL.rotation.z,-.62*reach,k);r.weapon.rotation.z=damp(r.weapon.rotation.z,.32*reach,k);r.weapon.position.y=damp(r.weapon.position.y,1.20-.10*reach,k);}else{r.weapon.rotation.z=damp(r.weapon.rotation.z,0,k);r.weapon.position.y=damp(r.weapon.position.y,1.31,k);}
    r.weapon.position.z=damp(r.weapon.position.z,.31-fireKick*.07,k);r.weapon.position.x=damp(r.weapon.position.x,.06,k);
    if(crawl){rot(r.hipR,.20+Math.sin(phase)*.30,0,0,k);rot(r.hipL,.20-Math.sin(phase)*.30,0,0,k);rot(r.kneeR,-.85,0,0,k);rot(r.kneeL,-.85,0,0,k);}
  }

  function animateWalk(soldier,dt,speedFrac){
    var b=soldier&&soldier.animationBinding;if(b&&b.backend!=='procedural-v2'&&typeof b.update==='function'){
      var tag=soldier.dead?(soldier.deathTag||TAGS.deathSide):(soldier.reloading?TAGS.reload:(soldier.prone?(soldier.crawling&&speedFrac>.03?TAGS.crawl:TAGS.prone):(soldier.crouching?(speedFrac>.03?TAGS.crouchWalk:TAGS.crouch):(speedFrac>.03?TAGS.walk:(soldier.target?TAGS.aim:TAGS.idle)))));
      try{b.update(soldier,{tag:tag,speed:speedFrac||0,target:soldier.target||null},dt,TAGS);}catch(e){console.warn('[ANIM] external update failed',e);}return;
    }
    primitivePose(soldier,dt,speedFrac);
  }
  function setCrouch(soldier,v){if(!soldier||soldier.dead)return;soldier.crouching=!!v;if(v)soldier.prone=false;}
  function setProne(soldier,v){if(!soldier||soldier.dead)return;soldier.prone=!!v;if(v)soldier.crouching=false;}
  function kill(soldier){if(!soldier||soldier.dead)return;soldier.dead=true;soldier.crawling=false;soldier.reloading=false;soldier.deathClock=0;var r=Math.random();soldier.deathVariant=r<.34?'front':(r<.67?'back':'side');soldier.deathSide=Math.random()<.5?-1:1;soldier.deathTag=soldier.deathVariant==='front'?TAGS.deathFront:(soldier.deathVariant==='back'?TAGS.deathBack:TAGS.deathSide);trigger(soldier,soldier.deathTag,{variant:soldier.deathVariant});}

  root.BattleSoldierModel={FACTIONS:FACTIONS,TAGS:TAGS,createSoldier:buildPrimitiveRig,animateWalk:animateWalk,setCrouch:setCrouch,setProne:setProne,kill:kill,triggerAnimation:trigger,bindAnimationBackend:bindAnimationBackend};
  console.log('[ANIM] articulated soldier rig + semantic animation tags loaded');
})(typeof window!=='undefined'?window:globalThis);
