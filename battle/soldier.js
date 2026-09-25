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
  var ROLE_BUILD={sergeant:{torsoW:.48,scale:1.04,cap:false},rifleman:{torsoW:.48,scale:1.0,cap:false},gunner:{torsoW:.56,scale:1.02,cap:false},scout:{torsoW:.43,scale:.98,cap:true}};
  /* ww2fps treats the on-foot body as ~1.7 m tall. Keep the procedural test rig in that scale. */
  var BODY={heightM:1.70,pelvisY:.91,thigh:.40,shin:.39,upperArm:.31,forearm:.29};

  var TAGS={
    idle:'locomotion.idle',walk:'locomotion.walk',crouchWalk:'locomotion.crouch-walk',crawl:'locomotion.prone-crawl',
    aim:'combat.aim',fire:'combat.fire',reload:'combat.reload',hit:'combat.hit',
    stand:'stance.stand',crouch:'stance.crouch',prone:'stance.prone',
    deathFront:'death.front',deathBack:'death.back',deathSide:'death.side'
  };
  /* Imported skeletal motion lives in battle/modules/53-fbx-soldier-backend.js, which replaces this
     primitive body with the rigged FBX soldier once its assets load. This file keeps the
     procedural rig: the fallback while assets load or fail, and the cheap body the trainer and
     benchmark use with imported animation disabled. */
  var Q=BABYLON.Quaternion,V3=BABYLON.Vector3;
  function preloadImported(){return Promise.resolve(true);}
  function setImportedEnabled(){}

  function currentQuaternion(joint,out){
    if(joint.rotationQuaternion)out.copyFrom(joint.rotationQuaternion);
    else Q.FromEulerAnglesToRef(joint.rotation.x,joint.rotation.y,joint.rotation.z,out);
    return out;
  }
  function useQuaternion(joint){if(!joint.rotationQuaternion)joint.rotationQuaternion=currentQuaternion(joint,new Q());return joint.rotationQuaternion;}
  /* Babylon zeroes Euler rotation whenever a quaternion is assigned; hand the pose back to the
     Euler-driven procedural stances without a snap. */
  function releaseQuaternion(joint){if(!joint.rotationQuaternion)return;var e=joint.rotationQuaternion.toEulerAngles();joint.rotationQuaternion=null;joint.rotation.copyFrom(e);}

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
    if(role==='sergeant')box(scene,[.10,.05,.03],pal.trim,armR.upperArm,[0,-.09,.08]);

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
    var soldier={faction:faction,role:role,root:world,poseRoot:pose,weaponSocket:weaponSocket,dead:false,rig:rig,
      animationBinding:{backend:'procedural-v3',tags:TAGS},walkPhase:Math.random()*Math.PI*2,stanceBlend:0,_animFireKick:0,_animReloadClock:0,deathClock:0};
    return soldier;
  }
  function createSoldier(scene,faction,role,parent){return buildPrimitiveRig(scene,faction,role,parent);}

  function damp(a,b,k){return a+(b-a)*k;}
  function rot(node_,x,y,z,k){node_.rotation.x=damp(node_.rotation.x,x,k);node_.rotation.y=damp(node_.rotation.y,y||0,k);node_.rotation.z=damp(node_.rotation.z,z||0,k);}
  /* Authored stance actions on the existing transform-node rig. These are in-place visual
     clips: navigation owns root, while the pelvis/body and support hand perform the action. */
  var STANCE_JOINTS=['hips','spine','chest','neck','head','thighR','thighL','shinR','shinL','footR','footL'];
  function stancePose(y,hip,spine,chest,rightHip,leftHip,rightKnee,leftKnee,rightFoot,leftFoot,support){
    return{y:y,z:0,support:support||0,angles:[hip,spine,chest,0,0,rightHip,leftHip,rightKnee,leftKnee,rightFoot,leftFoot]};
  }
  var STANCE_POSES={
    stand:stancePose(0,0,0,0,0,0,0,0,0,0),
    dip:stancePose(-.045,.08,.07,.02,-.30,-.30,.55,.55,-.33,-.33),
    crouch:stancePose(-.12,.11,.13,.07,-.64,-.64,1.10,1.10,-.48,-.48),
    kneel:stancePose(-.34,.32,.16,.06,-.25,-1.60,1.65,1.95,-1.35,-.67),
    tuck:stancePose(-.34,.32,.16,.06,-.25,-1.10,1.65,2.40,-1.35,-1.5,.2),
    extend:stancePose(-.34,.72,.12,-.05,.05,-.10,1.10,1.10,-1,-1,.6),
    brace:stancePose(-.57,1.02,.10,-.06,.10,.04,.65,.62,-.8,-.8,1),
    prone:stancePose(-.62,1.40,-.12,-.08,.03,.03,.10,.10,-.098,-.098)
  };
  STANCE_POSES.prone.z=.03;STANCE_POSES.prone.angles[3]=-.24;
  var STANCE_CLIPS={
    'stand>crouch':{duration:.48,keys:[[.35,'dip'],[1,'crouch']]},
    'crouch>stand':{duration:.55,keys:[[.65,'dip'],[1,'stand']]},
    'stand>prone':{duration:1.2,keys:[[.22,'crouch'],[.40,'kneel'],[.50,'tuck'],[.60,'extend'],[.78,'brace'],[1,'prone']]},
    'crouch>prone':{duration:.9,keys:[[.25,'kneel'],[.38,'tuck'],[.52,'extend'],[.72,'brace'],[1,'prone']]},
    'prone>crouch':{duration:1.05,keys:[[.25,'brace'],[.43,'extend'],[.55,'tuck'],[.73,'kneel'],[1,'crouch']]},
    'prone>stand':{duration:1.4,keys:[[.20,'brace'],[.34,'extend'],[.44,'tuck'],[.58,'kneel'],[.78,'crouch'],[1,'stand']]}
  };
  function desiredStance(s){return s.prone?'prone':(s.crouching?'crouch':'stand');}
  function poseSnapshot(s){
    return{position:s.poseRoot.position.clone(),rotation:currentQuaternion(s.poseRoot,new Q()),support:s._stanceSupport||0,
      joints:STANCE_JOINTS.map(function(name){return currentQuaternion(s.rig[name],new Q());})};
  }
  function stanceKey(s,name){
    var p=STANCE_POSES[name],blade=name==='crouch'&&s.target;
    return{position:new V3(0,p.y,p.z),rotation:Q.Identity(),support:p.support,joints:p.angles.map(function(x,i){return Q.FromEulerAngles(x,blade?(i===1?.22:(i===2?.30:0)):0,0);})};
  }
  function releaseStancePose(s){
    STANCE_JOINTS.forEach(function(name){releaseQuaternion(s.rig[name]);});releaseQuaternion(s.poseRoot);
  }
  function stanceTransition(s,dt){
    if(!s.rig||!s.poseRoot)return false;
    if(s.dead){if(s._stanceTransition)releaseStancePose(s);s._stanceTransition=null;s._stanceSupport=0;return false;}
    var next=desiredStance(s),tr=s._stanceTransition,previous=tr?tr.to:(s._visualStance||'stand');
    if(previous!==next){
      // Snapshot an interrupted action too; repeated stance assignments never restart the clock.
      var from=poseSnapshot(s),clip=STANCE_CLIPS[previous+'>'+next];
      tr=s._stanceTransition={from:previous,to:next,elapsed:0,duration:clip.duration,keys:[{at:0,pose:from}]};
      clip.keys.forEach(function(k){tr.keys.push({at:k[0],pose:stanceKey(s,k[1])});});
      s.animationEvent={tag:'stance.transition',data:{from:previous,to:next,duration:clip.duration}};
    }
    if(!tr){s._visualStance=next;return false;}
    tr.elapsed=Math.min(tr.duration,tr.elapsed+Math.max(0,dt));
    var t=tr.elapsed/tr.duration,index=1;while(index<tr.keys.length-1&&t>tr.keys[index].at)index++;
    var a=tr.keys[index-1],b=tr.keys[index],u=Math.max(0,Math.min(1,(t-a.at)/(b.at-a.at)));u=u*u*(3-2*u);
    V3.LerpToRef(a.pose.position,b.pose.position,u,s.poseRoot.position);Q.SlerpToRef(a.pose.rotation,b.pose.rotation,u,useQuaternion(s.poseRoot));
    for(var i=0;i<STANCE_JOINTS.length;i++)Q.SlerpToRef(a.pose.joints[i],b.pose.joints[i],u,useQuaternion(s.rig[STANCE_JOINTS[i]]));
    s._stanceSupport=damp(a.pose.support,b.pose.support,u);s._animationHold=Math.max(0,(s._animationHold||0)-dt);
    if(tr.elapsed>=tr.duration){s._visualStance=next;s._stanceTransition=null;s._stanceSupport=0;releaseStancePose(s);}
    return true;
  }
  function trigger(soldier,tag,data){if(!soldier)return;soldier.animationEvent={tag:tag,data:data||null};if(tag===TAGS.fire)soldier._animFireKick=1;if(tag===TAGS.reload)soldier._animReloadClock=0;var b=soldier.animationBinding;if(b&&b.backend.indexOf('procedural')!==0&&typeof b.play==='function')try{b.play(tag,data||{},soldier);}catch(e){console.warn('[ANIM] external play failed',e);}}
  function bindAnimationBackend(soldier,binding){if(!soldier||!binding)return false;soldier.animationBinding=Object.assign({backend:'external',tags:TAGS},binding);return true;}

  /* Hands stay on the weapon in every living state. The weapon pose is chosen in body space
     (butt anchored to the right shoulder, barrel along the soldier's facing), then both arms reach
     their grips with two-bone IK. Clips and procedural stances only move the body underneath, so
     a bladed aim torso, a crouch or prone chest all keep the rifle held rather than floating. */
  var GRIPS={
    rifle:{butt:-.35,grip:[0,-.055,-.12],fore:[0,-.05,.17],well:[0,-.10,-.02]},
    carbine:{butt:-.27,grip:[0,-.055,-.09],fore:[0,-.05,.13],well:[0,-.10,-.01]},
    smg:{butt:-.27,grip:[0,-.055,-.09],fore:[0,-.05,.13],well:[0,-.10,-.01]},
    lmg:{butt:-.17,grip:[0,-.07,-.02],fore:[0,-.075,.30],well:[0,-.13,.28]},
    pistol:{butt:-.02,grip:[.02,-.07,.0],fore:[-.03,-.07,.01],well:[-.03,-.12,.0]}
  };
  /* [butt offset from right shoulder x,y,z (body space), yaw, pitch (negative = muzzle up), roll] */
  var HOLDS={
    ready:[-.10,-.26,.10,-.45,-.30,.12],
    aim:[-.08,-.03,.06,0,0,0],
    reload:[-.10,-.22,.16,-.28,-.12,.10],
    /* Prone: rifle drawn in toward the body centre so the planted left arm reaches the fore-end. */
    prone:[-.20,-.01,-.02,0,0,0]
  };
  var PISTOL_HOLDS={ready:[-.22,-.36,.28,-.10,.55,0],aim:[-.26,-.04,.47,0,0,0],reload:[-.24,-.28,.34,-.20,.20,.30],prone:[-.30,-.02,.40,0,0,0]};
  var AXIS_X=new V3(1,0,0),DROPPED=Q.RotationAxis(AXIS_X,Math.PI/2),ARM_UP=BODY.upperArm,ARM_DOWN=BODY.forearm+.01;
  var hq={hips:new Q(),spine:new Q(),chest:new Q(),hs:new Q(),chestW:new Q(),inv:new Q(),weapon:new Q(),upper:new Q(),fore:new Q()};
  var hv={spine:new V3(),chest:new V3(),shoulder:new V3(),origin:new V3(),tmp:new V3(),tmp2:new V3(),target:new V3(),pole:new V3(),grip:new V3()};
  var ik={dir:new V3(),pole:new V3(),u:new V3(),f:new V3(),x:new V3(),y:new V3(),z:new V3(),t:new V3()};
  var POLE_R=new V3(.55,-1,-.25),POLE_L=new V3(-.45,-1,-.05);

  function solveArm(upper,fore,target,pole){
    var d=target.length();if(d<1e-4)return;
    var dir=ik.dir.copyFrom(target).scaleInPlace(1/d),reach=Math.min(ARM_UP+ARM_DOWN-.002,Math.max(ARM_UP-ARM_DOWN+.05,d));
    var cosA=Math.max(-1,Math.min(1,(ARM_UP*ARM_UP+reach*reach-ARM_DOWN*ARM_DOWN)/(2*ARM_UP*reach))),sinA=Math.sqrt(1-cosA*cosA);
    var p=ik.pole.copyFrom(pole);dir.scaleToRef(V3.Dot(p,dir),ik.t);p.subtractInPlace(ik.t);
    if(p.lengthSquared()<1e-6){V3.CrossToRef(dir,AXIS_X,p);}p.normalize();
    /* Elbow swings toward the pole; the forearm closes the triangle to the grip. */
    var u=ik.u.copyFrom(dir).scaleInPlace(cosA);p.scaleToRef(sinA,ik.t);u.addInPlace(ik.t);u.normalize();
    var f=ik.f.copyFrom(dir).scaleInPlace(reach);u.scaleToRef(ARM_UP,ik.t);f.subtractInPlace(ik.t);f.normalize();
    var z=ik.z.copyFrom(f);u.scaleToRef(V3.Dot(f,u),ik.t);z.subtractInPlace(ik.t);
    if(z.lengthSquared()<1e-6){z.copyFrom(p);u.scaleToRef(V3.Dot(p,u),ik.t);z.subtractInPlace(ik.t);z.scaleInPlace(-1);}
    z.normalize();
    var y=ik.y.copyFrom(u).scaleInPlace(-1);V3.CrossToRef(y,z,ik.x);
    /* Arm boxes hang along local -Y and the elbow hinge flexes toward local +Z around -X. */
    Q.RotationQuaternionFromAxisToRef(ik.x,y,z,useQuaternion(upper));
    Q.RotationAxisToRef(AXIS_X,-Math.acos(Math.max(-1,Math.min(1,V3.Dot(u,f)))),useQuaternion(fore));
  }
  function chestTransform(r){
    currentQuaternion(r.hips,hq.hips);currentQuaternion(r.spine,hq.spine);currentQuaternion(r.chest,hq.chest);
    r.spine.position.rotateByQuaternionToRef(hq.hips,hv.spine);hv.spine.addInPlace(r.hips.position);
    hq.hips.multiplyToRef(hq.spine,hq.hs);r.chest.position.rotateByQuaternionToRef(hq.hs,hv.chest);hv.chest.addInPlace(hv.spine);
    hq.hs.multiplyToRef(hq.chest,hq.chestW);hq.chestW.conjugateToRef(hq.inv);
  }
  function bodyToChest(point,out){point.subtractToRef(hv.chest,hv.tmp2);hv.tmp2.rotateByQuaternionToRef(hq.inv,out);return out;}
  function holdWeapon(s,dt){
    var r=s.rig,w=s.weapon;if(!r||!w||!w.mesh)return;
    var kind=GRIPS[w.kind]?w.kind:'rifle',g=GRIPS[kind],socket=r.weapon;
    chestTransform(r);
    if(s.dead){
      /* A dead soldier keeps the weapon in the right hand while the death clip drops the arms. */
      currentQuaternion(r.upperArmR,hq.upper);currentQuaternion(r.forearmR,hq.fore);
      hv.tmp.set(0,-ARM_UP,0).rotateByQuaternionToRef(hq.upper,hv.origin);hv.origin.addInPlace(r.shoulderR.position);
      hq.upper.multiplyToRef(hq.fore,hq.fore);hv.tmp.set(0,-ARM_DOWN,0).rotateByQuaternionToRef(hq.fore,hv.tmp2);hv.origin.addInPlace(hv.tmp2);
      /* Barrel runs along the forearm so the rifle settles flat with the arm. */
      hq.fore.multiplyToRef(DROPPED,hq.weapon);
      hv.grip.set(g.grip[0],g.grip[1],g.grip[2]).rotateByQuaternionToRef(hq.weapon,hv.tmp2);hv.origin.subtractInPlace(hv.tmp2);
      socket.position.copyFrom(hv.origin);useQuaternion(socket).copyFrom(hq.weapon);return;
    }
    var kick=s._animFireKick||0;s._animFireKick=Math.max(0,kick-dt*8);
    if(s.reloading)s._animReloadClock=(s._animReloadClock||0)+dt;else s._animReloadClock=0;
    var reloadDur=w.stats&&w.stats.reloadTime||2.5,rp=s.reloading?Math.min(1,s._animReloadClock/reloadDur):0,reach=Math.sin(Math.PI*rp);
    var mode=s.reloading?'reload':(s.target||s.prone||(s._animationHold>0)?'aim':'ready'),table=(kind==='pistol'?PISTOL_HOLDS:HOLDS)[s.prone?'prone':mode];
    var pose=s._holdPose,k=1-Math.exp(-dt*9);
    if(!pose)pose=s._holdPose=table.slice();else for(var i=0;i<6;i++)pose[i]+=(table[i]-pose[i])*k;
    Q.FromEulerAnglesToRef(pose[4]-kick*.10,pose[3],pose[5]+(mode==='reload'?.35*reach:0),hq.weapon);
    /* Butt at the right shoulder pocket, shoved back a little by recoil. */
    hv.shoulder.copyFrom(r.shoulderR.position).rotateByQuaternionToRef(hq.chestW,hv.tmp);hv.shoulder.copyFrom(hv.tmp).addInPlace(hv.chest);
    hv.origin.set(pose[0],pose[1],pose[2]-kick*.05).addInPlace(hv.shoulder);
    hv.tmp.set(0,0,g.butt).rotateByQuaternionToRef(hq.weapon,hv.tmp2);hv.origin.subtractInPlace(hv.tmp2);
    bodyToChest(hv.origin,socket.position);hq.inv.multiplyToRef(hq.weapon,useQuaternion(socket));
    for(var side=0;side<2;side++){
      var right=side===0,local=right?g.grip:(mode==='reload'?null:g.fore);
      if(local)hv.grip.set(local[0],local[1],local[2]);
      else{var m=Math.min(1,reach*1.6);hv.grip.set(g.fore[0]+(g.well[0]-g.fore[0])*m,g.fore[1]+(g.well[1]-g.fore[1])*m,g.fore[2]+(g.well[2]-g.fore[2])*m);}
      hv.grip.rotateByQuaternionToRef(hq.weapon,hv.target);hv.target.addInPlace(hv.origin);
      if(!right&&s._stanceSupport>0){
        // Keep the rifle in the right hand while the left hand braces on the ground.
        hv.tmp.set(-.34,-s.poseRoot.position.y+.055,.40-s.poseRoot.position.z);
        V3.LerpToRef(hv.target,hv.tmp,s._stanceSupport,hv.target);
      }
      bodyToChest(hv.target,hv.target);hv.target.subtractInPlace(right?r.shoulderR.position:r.shoulderL.position);
      (right?POLE_R:POLE_L).rotateByQuaternionToRef(hq.inv,hv.pole);
      solveArm(right?r.upperArmR:r.upperArmL,right?r.forearmR:r.forearmL,hv.target,hv.pole);
    }
  }

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
    s.poseRoot.position.x=damp(s.poseRoot.position.x,0,k);s.poseRoot.position.z=damp(s.poseRoot.position.z,prone?.03:0,k);
    rot(s.poseRoot,0,0,0,k);
    rot(r.hips,prone?1.40:(crouch?.11:0),0,0,k);
    /* A crouched shooter blades the torso so the left shoulder comes forward to the fore-end. */
    var blade=crouch&&s.target?1:0;
    rot(r.spine,prone?-.12:(crouch?.13:0),.22*blade,0,k);
    rot(r.chest,prone?-.08:(crouch?.07:0),.30*blade,0,k);
    rot(r.neck,prone?-.24:0,0,0,k);

    if(prone){
      var crawlSwing=crawl?sin*.13:0,crawlKneeR=crawl?(.12+.30*rightForward):.10,crawlKneeL=crawl?(.12+.30*leftForward):.10;
      rot(r.thighR,.03-crawlSwing,0,crawl?.14:0,k);rot(r.thighL,.03+crawlSwing,0,crawl?-.14:0,k);
      /* Positive shin X is the anatomical knee-flex direction for this hierarchy. */
      rot(r.shinR,crawlKneeR,0,0,k);rot(r.shinL,crawlKneeL,0,0,k);
      rot(r.footR,-.08-crawlKneeR*.18,0,0,k);rot(r.footL,-.08-crawlKneeL*.18,0,0,k);
    }else{
      var baseHip=crouch?-.64:0,rightHip=baseHip-sin*walkSwing,leftHip=baseHip+sin*walkSwing;
      var kneeBase=crouch?1.10:0,rightKnee=kneeBase+(crouch?0:.68*rightForward*moving),leftKnee=kneeBase+(crouch?0:.68*leftForward*moving);
      rot(r.thighR,rightHip,0,0,k);rot(r.thighL,leftHip,0,0,k);
      rot(r.shinR,rightKnee,0,0,k);rot(r.shinL,leftKnee,0,0,k);
      rot(r.footR,crouch?-.48:-rightKnee*.32,0,0,k);rot(r.footL,crouch?-.48:-leftKnee*.32,0,0,k);
    }
  }

  function semanticTag(soldier,speedFrac){
    return soldier.dead?(soldier.deathTag||TAGS.deathSide):(soldier.reloading?TAGS.reload:(soldier.prone?(soldier.crawling&&speedFrac>.02?TAGS.crawl:TAGS.prone):(soldier.crouching?(speedFrac>.03?TAGS.crouchWalk:TAGS.crouch):(speedFrac>.03?TAGS.walk:(soldier.target?TAGS.aim:TAGS.idle)))));
  }
  function animateWalk(soldier,dt,speedFrac){
    var b=soldier&&soldier.animationBinding;if(!b)return;
    if(b.backend.indexOf('procedural')===0&&stanceTransition(soldier,dt)){holdWeapon(soldier,dt);return;}
    if(b.backend.indexOf('procedural')!==0&&typeof b.update==='function'){
      try{b.update(soldier,{tag:semanticTag(soldier,speedFrac),speed:speedFrac||0,target:soldier.target||null},dt,TAGS);}catch(e){console.warn('[ANIM] external update failed',e);}return;
    }
    primitivePose(soldier,dt,speedFrac);holdWeapon(soldier,dt);
  }
  function setCrouch(soldier,v){if(!soldier||soldier.dead)return;soldier.crouching=!!v;if(v)soldier.prone=false;}
  function setProne(soldier,v){if(!soldier||soldier.dead)return;soldier.prone=!!v;if(v)soldier.crouching=false;}
  function kill(soldier){if(!soldier||soldier.dead)return;soldier.dead=true;soldier.crawling=false;soldier.reloading=false;soldier.deathClock=0;var r=Math.random();soldier.deathVariant=r<.34?'front':(r<.67?'back':'side');soldier.deathSide=Math.random()<.5?-1:1;soldier.deathTag=soldier.deathVariant==='front'?TAGS.deathFront:(soldier.deathVariant==='back'?TAGS.deathBack:TAGS.deathSide);trigger(soldier,soldier.deathTag,{variant:soldier.deathVariant});}

  root.BattleSoldierModel={FACTIONS:FACTIONS,BODY:BODY,TAGS:TAGS,createSoldier:createSoldier,preload:preloadImported,setImportedEnabled:setImportedEnabled,animateWalk:animateWalk,setCrouch:setCrouch,setProne:setProne,kill:kill,triggerAnimation:trigger,bindAnimationBackend:bindAnimationBackend};
  console.log('[ANIM] anatomical procedural rig loaded (fallback for the imported FBX soldier)');
})(typeof window!=='undefined'?window:globalThis);
