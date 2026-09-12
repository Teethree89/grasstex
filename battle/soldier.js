/* Articulated low-poly WW2 soldier + model-agnostic animation contract.
   The procedural rig follows a conventional humanoid chain (hips -> spine -> chest; thigh -> shin
   -> foot; shoulder -> upper arm -> forearm -> hand), matching the replacement animation pack's
   bone semantics so a skeletal GLTF can replace it without changing combat/AI code. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  function c3(hex){hex=hex.replace('#','');return new BABYLON.Color3(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);}
  var FACTIONS={us:{uniform:c3('5b6236'),helmet:c3('47502f'),trim:c3('d9b53c')},ge:{uniform:c3('4c4f42'),helmet:c3('363829'),trim:c3('c8c8c8')}};
  var SKIN=c3('c9a066'),PACK=c3('4a3d2a');
  var ROLE_BUILD={captain:{torsoW:.48,scale:1.04,cap:false},rifleman:{torsoW:.48,scale:1.0,cap:false},gunner:{torsoW:.56,scale:1.02,cap:false},scout:{torsoW:.43,scale:.98,cap:true}};
  /* ww2fps treats the on-foot body as ~1.7 m tall. Keep the procedural test rig in that scale. */
  var BODY={heightM:1.70,pelvisY:.91,thigh:.40,shin:.39,upperArm:.31,forearm:.29};

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

    /* The hierarchy intentionally mirrors the supplied Human Soldier Animations rig:
       hips/spine/chest/neck/head, shoulder/upperArm/forearm/hand, thigh/shin/foot/toe. */
    var hips=node(scene,'joint.hips',pose,[0,BODY.pelvisY,0]);box(scene,[.37,.20,.25],pal.uniform,hips,[0,0,0]);
    var spine=node(scene,'joint.spine',hips,[0,.15,0]);box(scene,[build.torsoW*.82,.28,.25],pal.uniform,spine,[0,.13,0]);
    var chest=node(scene,'joint.chest',spine,[0,.27,0]);box(scene,[build.torsoW,.30,.28],pal.uniform,chest,[0,.13,0]);box(scene,[.30,.32,.14],PACK,chest,[0,.10,-.21]);
    var neck=node(scene,'joint.neck',chest,[0,.31,0]),head=node(scene,'joint.head',neck,[0,.12,.01]);sphere(scene,.26,SKIN,head,[0,0,0]);
    if(build.cap)box(scene,[.25,.09,.27],pal.helmet,head,[0,.145,0]);else{sphere(scene,.34,pal.helmet,head,[0,.155,.01],faction==='ge'?.63:.74);if(faction==='ge')cylinder(scene,.39,.045,pal.helmet,head,[0,.095,0]);}

    function arm(sign){
      var side=sign>0?'r':'l',shoulder=node(scene,'joint.shoulder.'+side,chest,[sign*(build.torsoW/2+.055),.20,.01]);
      var upper=node(scene,'joint.upperArm.'+side,shoulder,[0,0,0]);box(scene,[.14,BODY.upperArm,.14],pal.uniform,upper,[0,-BODY.upperArm/2,0]);
      var fore=node(scene,'joint.forearm.'+side,upper,[0,-BODY.upperArm,0]);box(scene,[.13,BODY.forearm,.13],pal.uniform,fore,[0,-BODY.forearm/2,0]);
      var hand=node(scene,'joint.hand.'+side,fore,[0,-BODY.forearm-.01,0]);sphere(scene,.125,SKIN,hand,[0,0,0]);
      return{shoulder:shoulder,upperArm:upper,forearm:fore,hand:hand};
    }
    function leg(sign){
      var side=sign>0?'r':'l',thigh=node(scene,'joint.thigh.'+side,hips,[sign*.135,-.075,0]);box(scene,[.18,BODY.thigh,.20],pal.uniform,thigh,[0,-BODY.thigh/2,0]);
      var shin=node(scene,'joint.shin.'+side,thigh,[0,-BODY.thigh,0]);box(scene,[.17,BODY.shin,.18],pal.uniform,shin,[0,-BODY.shin/2,0]);
      var foot=node(scene,'joint.foot.'+side,shin,[0,-BODY.shin,0]);box(scene,[.18,.10,.31],pal.uniform,foot,[0,-.015,.095]);
      var toe=node(scene,'joint.toe.'+side,foot,[0,0,.21]);
      return{thigh:thigh,shin:shin,foot:foot,toe:toe};
    }
    var armR=arm(1),armL=arm(-1),legR=leg(1),legL=leg(-1);
    if(role==='captain')box(scene,[.10,.05,.03],pal.trim,armR.upperArm,[0,-.09,.08]);

    /* Weapon origin stays semantic and model-independent. It lives on the chest rather than the
       world root so crouch/lean follow the torso; prone counter-rotation keeps the barrel forward. */
    var weaponSocket=node(scene,'socket.weapon',chest,[.055,.055,.30]);
    var rig={
      hips:hips,pelvis:hips,spine:spine,chest:chest,neck:neck,head:head,
      shoulderR:armR.shoulder,shoulderL:armL.shoulder,upperArmR:armR.upperArm,upperArmL:armL.upperArm,
      forearmR:armR.forearm,forearmL:armL.forearm,handR:armR.hand,handL:armL.hand,
      thighR:legR.thigh,thighL:legL.thigh,shinR:legR.shin,shinL:legL.shin,footR:legR.foot,footL:legL.foot,toeR:legR.toe,toeL:legL.toe,weapon:weaponSocket
    };
    /* Compatibility aliases for any diagnostic code written against the first articulated pass. */
    rig.hipR=rig.thighR;rig.hipL=rig.thighL;rig.kneeR=rig.shinR;rig.kneeL=rig.shinL;rig.elbowR=rig.forearmR;rig.elbowL=rig.forearmL;
    return{faction:faction,role:role,root:world,poseRoot:pose,weaponSocket:weaponSocket,dead:false,rig:rig,
      animationBinding:{backend:'procedural-v3',tags:TAGS},walkPhase:Math.random()*Math.PI*2,stanceBlend:0,_animFireKick:0,_animReloadClock:0,deathClock:0};
  }

  function damp(a,b,k){return a+(b-a)*k;}
  function rot(node_,x,y,z,k){node_.rotation.x=damp(node_.rotation.x,x,k);node_.rotation.y=damp(node_.rotation.y,y||0,k);node_.rotation.z=damp(node_.rotation.z,z||0,k);}
  function trigger(soldier,tag,data){if(!soldier)return;soldier.animationEvent={tag:tag,data:data||null};if(tag===TAGS.fire)soldier._animFireKick=1;if(tag===TAGS.reload)soldier._animReloadClock=0;var b=soldier.animationBinding;if(b&&b.backend.indexOf('procedural')!==0&&typeof b.play==='function')try{b.play(tag,data||{},soldier);}catch(e){console.warn('[ANIM] external play failed',e);}}
  function bindAnimationBackend(soldier,binding){if(!soldier||!binding)return false;soldier.animationBinding=Object.assign({backend:'external',tags:TAGS},binding);return true;}

  function primitivePose(s,dt,speedFrac){
    var r=s.rig;if(!r)return;var k=1-Math.exp(-dt*11),moving=Math.min(1,Math.max(0,speedFrac||0));
    if(s.dead){
      s.deathClock=(s.deathClock||0)+dt;var p=Math.min(1,s.deathClock/.62),ease=1-Math.pow(1-p,3),side=s.deathVariant==='side'?(s.deathSide||1):0,front=s.deathVariant==='front'?1:(s.deathVariant==='back'?-1:0);
      rot(r.hips,front*.22,0,0,k);rot(r.thighL,.28,0,0,k);rot(r.thighR,-.12,0,0,k);rot(r.shinL,.92,0,0,k);rot(r.shinR,.52,0,0,k);
      s.poseRoot.rotation.z=damp(s.poseRoot.rotation.z,side*1.42*ease,k);s.poseRoot.rotation.x=damp(s.poseRoot.rotation.x,front*1.26*ease,k);s.poseRoot.position.y=damp(s.poseRoot.position.y,-.24*ease,k);return;
    }

    var prone=!!s.prone,crouch=!prone&&!!s.crouching,crawl=prone&&!!s.crawling&&moving>.02;
    s.walkPhase+=dt*(crawl?(2.4+moving*3.2):(3.0+moving*6.2));
    var phase=s.walkPhase,sin=Math.sin(phase),rightForward=Math.max(0,sin),leftForward=Math.max(0,-sin),walkSwing=.58*moving;

    /* Do not rotate the whole avatar into prone. Lower the hips and rotate the anatomical chain.
       That keeps knees, shoulders and weapon orientation coherent instead of tipping a rigid doll. */
    s.poseRoot.position.y=damp(s.poseRoot.position.y,prone?-.62:(crouch?-.12:0),k);
    s.poseRoot.position.z=damp(s.poseRoot.position.z,prone?.03:0,k);
    rot(s.poseRoot,0,0,0,k);
    rot(r.hips,prone?1.40:(crouch?.11:0),0,0,k);
    rot(r.spine,prone?-.12:(crouch?.13:0),0,0,k);
    rot(r.chest,prone?-.08:(crouch?.07:0),0,0,k);
    rot(r.neck,prone?-.24:0,0,0,k);

    if(prone){
      var crawlSwing=crawl?sin*.20:0,crawlKneeR=crawl?(.28+.58*rightForward):.18,crawlKneeL=crawl?(.28+.58*leftForward):.18;
      rot(r.thighR,.04-crawlSwing,0,crawl?.07:0,k);rot(r.thighL,.04+crawlSwing,0,crawl?-.07:0,k);
      /* Positive shin X is the anatomical knee-flex direction for this hierarchy. */
      rot(r.shinR,crawlKneeR,0,0,k);rot(r.shinL,crawlKneeL,0,0,k);
      rot(r.footR,-.16-crawlKneeR*.22,0,0,k);rot(r.footL,-.16-crawlKneeL*.22,0,0,k);
    }else{
      var baseHip=crouch?-.64:0,rightHip=baseHip-sin*walkSwing,leftHip=baseHip+sin*walkSwing;
      var kneeBase=crouch?1.10:0,rightKnee=kneeBase+(crouch?0:.68*rightForward*moving),leftKnee=kneeBase+(crouch?0:.68*leftForward*moving);
      rot(r.thighR,rightHip,0,0,k);rot(r.thighL,leftHip,0,0,k);
      rot(r.shinR,rightKnee,0,0,k);rot(r.shinL,leftKnee,0,0,k);
      rot(r.footR,crouch?-.48:-rightKnee*.32,0,0,k);rot(r.footL,crouch?-.48:-leftKnee*.32,0,0,k);
    }

    var aiming=!!s.target&&!s.reloading,fireKick=s._animFireKick||0;s._animFireKick=Math.max(0,fireKick-dt*8);
    var reload=!!s.reloading;if(reload)s._animReloadClock=(s._animReloadClock||0)+dt;else s._animReloadClock=0;
    var reloadDur=s.weapon&&s.weapon.stats&&s.weapon.stats.reloadTime||2.5,rp=reload?Math.min(1,s._animReloadClock/reloadDur):0,reach=Math.sin(Math.PI*rp);

    /* Rifle-ready pose. In prone the torso is horizontal, so the shoulders reach forward relative
       to that rotated chest while the weapon socket counter-rotates to keep the barrel on target. */
    var shoulderR=prone?-1.86:(aiming?-1.02:-.72),shoulderL=prone?-1.92:(aiming?-1.08:-.78);
    if(!aiming&&!reload&&!prone){shoulderR+=sin*.08*moving;shoulderL-=sin*.08*moving;}
    if(crawl){shoulderR+=sin*.16;shoulderL-=sin*.16;}
    rot(r.upperArmR,shoulderR,0,.13,k);rot(r.upperArmL,shoulderL,0,-.20,k);
    rot(r.forearmR,(prone?-.50:-.58)+(reload?reach*.72:0),0,.10,k);
    rot(r.forearmL,(prone?-.66:-.78)+(reload?reach*1.12:0),0,-.10,k);

    if(reload){r.upperArmL.rotation.z=damp(r.upperArmL.rotation.z,-.62*reach,k);r.weapon.rotation.z=damp(r.weapon.rotation.z,.30*reach,k);}else r.weapon.rotation.z=damp(r.weapon.rotation.z,0,k);
    r.weapon.rotation.x=damp(r.weapon.rotation.x,prone?-1.20:0,k);
    r.weapon.position.x=damp(r.weapon.position.x,.055,k);
    r.weapon.position.y=damp(r.weapon.position.y,.055-(reload?.08*reach:0),k);
    r.weapon.position.z=damp(r.weapon.position.z,.30-fireKick*.07,k);
  }

  function animateWalk(soldier,dt,speedFrac){
    var b=soldier&&soldier.animationBinding;if(b&&b.backend.indexOf('procedural')!==0&&typeof b.update==='function'){
      var tag=soldier.dead?(soldier.deathTag||TAGS.deathSide):(soldier.reloading?TAGS.reload:(soldier.prone?(soldier.crawling&&speedFrac>.02?TAGS.crawl:TAGS.prone):(soldier.crouching?(speedFrac>.03?TAGS.crouchWalk:TAGS.crouch):(speedFrac>.03?TAGS.walk:(soldier.target?TAGS.aim:TAGS.idle)))));
      try{b.update(soldier,{tag:tag,speed:speedFrac||0,target:soldier.target||null},dt,TAGS);}catch(e){console.warn('[ANIM] external update failed',e);}return;
    }
    primitivePose(soldier,dt,speedFrac);
  }
  function setCrouch(soldier,v){if(!soldier||soldier.dead)return;soldier.crouching=!!v;if(v)soldier.prone=false;}
  function setProne(soldier,v){if(!soldier||soldier.dead)return;soldier.prone=!!v;if(v)soldier.crouching=false;}
  function kill(soldier){if(!soldier||soldier.dead)return;soldier.dead=true;soldier.crawling=false;soldier.reloading=false;soldier.deathClock=0;var r=Math.random();soldier.deathVariant=r<.34?'front':(r<.67?'back':'side');soldier.deathSide=Math.random()<.5?-1:1;soldier.deathTag=soldier.deathVariant==='front'?TAGS.deathFront:(soldier.deathVariant==='back'?TAGS.deathBack:TAGS.deathSide);trigger(soldier,soldier.deathTag,{variant:soldier.deathVariant});}

  root.BattleSoldierModel={FACTIONS:FACTIONS,BODY:BODY,TAGS:TAGS,createSoldier:buildPrimitiveRig,animateWalk:animateWalk,setCrouch:setCrouch,setProne:setProne,kill:kill,triggerAnimation:trigger,bindAnimationBackend:bindAnimationBackend};
  console.log('[ANIM] anatomical soldier rig v3 + semantic animation tags loaded');
})(typeof window!=='undefined'?window:globalThis);