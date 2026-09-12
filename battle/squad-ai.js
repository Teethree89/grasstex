/* Squad + soldier AI for the battle sim. */
(function(root){
  'use strict';

  var ROLES={
    captain: {weapon:'pistol', speed:3.0, visionRange:150, engageRange:55,  hp:110},
    rifleman:{weapon:'rifle',  speed:2.9, visionRange:140, engageRange:135, hp:100},
    gunner:  {weapon:'lmg',    speed:2.2, visionRange:150, engageRange:160, hp:100},
    scout:   {weapon:'carbine',speed:3.8, visionRange:175, engageRange:105, hp:90}
  };
  var COMPOSITION=['captain','gunner','scout','scout','rifleman','rifleman','rifleman','rifleman','rifleman','rifleman'];

  var RETREAT_CASUALTY_FRAC=.6,GUNNER_SETUP_TIME=1.4,SUPPRESSION_TIME=1.3,LOS_SAMPLES=8;
  /* A captain issues a destination for the squad, not a constantly-moving point for
     every man to chase.  These modest bounds leave room for each man to navigate
     around a building and settle into his own slot before the next order. */
  var ORDER_STRIDE=13,ORDER_ARRIVAL_RADIUS=8,ORDER_COHESION=.55,DESTINATION_COMMIT=1.35;
  var EYE_HEIGHT=1.55,EYE_HEIGHT_CROUCH=1.05,EYE_HEIGHT_PRONE=.42;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function dist2(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
  function rand(battle){return battle&&battle.random?battle.random():Math.random();}
  function segmentHitsObstacle(ax,az,bx,bz,ob){var dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;var t=len2>1e-6?((ob.x-ax)*dx+(ob.z-az)*dz)/len2:0;t=clamp(t,0,1);var px=ax+dx*t,pz=az+dz*t,ddx=px-ob.x,ddz=pz-ob.z;return ddx*ddx+ddz*ddz<=ob.radius*ob.radius;}
  function obstacleBlocks(ax,az,bx,bz,obstacles){if(!obstacles)return false;for(var i=0;i<obstacles.length;i++)if(segmentHitsObstacle(ax,az,bx,bz,obstacles[i]))return true;return false;}
  function coverMultiplierAt(x,z,obstacles){if(!obstacles)return 1;var best=1;for(var i=0;i<obstacles.length;i++){var ob=obstacles[i],dx=x-ob.x,dz=z-ob.z,r=ob.radius+1.4;if(dx*dx+dz*dz<=r*r&&ob.cover<best)best=ob.cover;}return best;}
  function shallowCoverAt(x,z,obstacles){
    if(!obstacles)return false;
    for(var i=0;i<obstacles.length;i++){
      var ob=obstacles[i],dx=x-ob.x,dz=z-ob.z,r=ob.radius+1.6;
      if(dx*dx+dz*dz<=r*r&&ob.cover>=.70&&ob.cover<.90)return true;
    }
    return false;
  }
  function eyeHeight(s){return s.prone?EYE_HEIGHT_PRONE:(s.crouching?EYE_HEIGHT_CROUCH:EYE_HEIGHT);}

  function hasLineOfSight(a,b,heightAt,obstacles){
    var ax=a.root.position.x,az=a.root.position.z,ay=heightAt(ax,az)+eyeHeight(a);
    var bx=b.root.position.x,bz=b.root.position.z,by=heightAt(bx,bz)+eyeHeight(b);
    if(obstacleBlocks(ax,az,bx,bz,obstacles))return false;
    if(root.BattleNavigation&&root.BattleNavigation.lineOfSightBlocked({x:ax,z:az},{x:bx,z:bz},ay,by))return false;
    for(var i=1;i<LOS_SAMPLES;i++){var t=i/LOS_SAMPLES,x=ax+(bx-ax)*t,z=az+(bz-az)*t;var lineY=ay+(by-ay)*t,groundY=heightAt(x,z);if(groundY>lineY-.15)return false;}
    return true;
  }

  function findTarget(soldier,enemies,heightAt,obstacles){var role=ROLES[soldier.role],best=null,bestD=Infinity;for(var i=0;i<enemies.length;i++){var e=enemies[i];if(e.dead)continue;var d=dist2(soldier.root.position.x,soldier.root.position.z,e.root.position.x,e.root.position.z);if(d>role.visionRange||d>=bestD)continue;if(!hasLineOfSight(soldier,e,heightAt,obstacles))continue;best=e;bestD=d;}return best;}

  function resolveFire(shooter,target,battle){
    var stats=shooter.weapon.stats,d=dist2(shooter.root.position.x,shooter.root.position.z,target.root.position.x,target.root.position.z);
    if(d>stats.range)return null;
    var falloff=d<=stats.falloffStart?1:Math.max(.15,1-(d-stats.falloffStart)/Math.max(1,stats.range-stats.falloffStart));
    var acc=stats.accuracy*falloff*(shooter.squad.accuracyMultiplier||1);
    if(target.prone)acc*=.34;else if(target.crouching)acc*=.6;
    if(target.suppressedUntil>battle.time)acc*=.55;
    if(shooter.role==='gunner'&&shooter.setUp)acc*=1.25;
    if(shooter.prone)acc*=1.12;
    if(shooter.moving)acc*=.82;
    if(target._windowSlot)acc*=.46;
    acc*=coverMultiplierAt(target.root.position.x,target.root.position.z,battle.obstacles);
    acc=clamp(acc,.02,.95);
    var hit=rand(battle)<acc;
    if(stats.suppressive)target.suppressedUntil=battle.time+SUPPRESSION_TIME;
    if(hit){target.hp-=stats.damage*(.85+rand(battle)*.3);if(target.hp<=0)battle.killSoldier(target,shooter);}
    battle.onShot&&battle.onShot(shooter,target,hit,d);
    return hit;
  }

  function createSquad(id,faction,homePoint,objective){return {id:id,faction:faction,members:[],state:'advance',home:homePoint,objective:objective,rally:{x:homePoint.x,z:homePoint.z},orderAnchor:{x:homePoint.x,z:homePoint.z},formation:'wedge',accuracyMultiplier:1,captainAlive:true,_orderGoal:{x:homePoint.x,z:homePoint.z},_orderVersion:0};}
  function formationDirection(squad){
    var anchor=squad.orderAnchor||squad.rally,goal=squad.state==='retreat'?squad.home:squad.objective||squad.home,dx=goal.x-anchor.x,dz=goal.z-anchor.z,len=Math.hypot(dx,dz);
    if(len<.1&&squad._formationForward){return squad._formationForward;}
    var forward={x:dx/(len||1),z:dz/(len||1)};squad._formationForward=forward;return forward;
  }
  function formationFor(squad){
    var phase=squad.commandPhase||'';
    if(squad.state==='retreat'||phase==='corner-check'||phase==='clear-town'||phase==='regroup')return 'column';
    if(squad.state==='engaged'||['contact','assault','capture','defend'].indexOf(phase)>=0)return 'line';
    var anchor=squad.orderAnchor||squad.rally,goal=squad.objective||squad.home;
    return dist2(anchor.x,anchor.z,goal.x,goal.z)<68?'line':'wedge';
  }
  function slotJitter(soldier,axis){
    var n=(soldier.slotIndex*37+String(soldier.id).length*19+(axis?11:3))%17;
    return (n-8)*.22;
  }
  function formationSlot(squad,soldier,slotIndex){
    var f=formationDirection(squad),fx=f.x,fz=f.z,rx=-fz,rz=fx,anchor=squad.orderAnchor||squad.rally,form=squad.formation||formationFor(squad),side=slotIndex%2===0?1:-1,lateral=slotJitter(soldier,0),depth=slotJitter(soldier,1),forward=0;
    if(form==='column'){
      if(soldier.role==='captain'){forward=-1;lateral=0;}
      else if(soldier.role==='scout'){forward=5+(slotIndex%2)*3;lateral=side*2.4+lateral;}
      else if(soldier.role==='gunner'){forward=-5;lateral=1.5+lateral;}
      else{forward=-3-(slotIndex-4)*2.7;lateral=side*(1.8+(slotIndex%3)*.8)+lateral;}
    }else if(form==='line'){
      if(soldier.role==='captain'){forward=-7;lateral=0;}
      else if(soldier.role==='gunner'){forward=-9;lateral=2+lateral;}
      else if(soldier.role==='scout'){forward=2;lateral=side*14+lateral;}
      else{var lane=slotIndex-6;forward=-2-(Math.abs(lane)%2)*2+depth;lateral=lane*5.3+lateral;}
    }else{
      if(soldier.role==='captain'){forward=-4;lateral=0;}
      else if(soldier.role==='gunner'){forward=-10;lateral=1.5+lateral;}
      else if(soldier.role==='scout'){forward=9;lateral=side*10+lateral;}
      else{var rank=Math.floor((slotIndex-4)/2),wing=slotIndex%2===0?1:-1;forward=1-rank*4+depth;lateral=wing*(4+rank*4.3)+lateral;}
    }
    return{x:anchor.x+fx*forward+rx*lateral,z:anchor.z+fz*forward+rz*lateral};
  }

  function createSoldier(opts){
    var role=ROLES[opts.role];
    return Object.assign({},opts.model,{id:opts.id,faction:opts.faction,role:opts.role,squad:opts.squad,slotIndex:opts.slotIndex,weapon:opts.weapon,hp:role.hp,maxHp:role.hp,state:'advance',target:null,destination:{x:opts.model.root.position.x,z:opts.model.root.position.z},orderDestination:null,_destinationCommitUntil:0,fireCooldown:Math.random()*.5,moving:false,crouching:false,prone:false,suppressedUntil:0,setUp:false,setUpSince:0,speed:role.speed,moveSpeed:0,voiceCooldown:Math.random()*2,lastSquadState:'advance'});
  }

  function setDestination(soldier,next,battle,urgent){
    if(!next)return;
    soldier.orderDestination={x:next.x,z:next.z};
    var current=soldier.destination,atCurrent=current&&dist2(soldier.root.position.x,soldier.root.position.z,current.x,current.z)<1.8,changed=!current||dist2(current.x,current.z,next.x,next.z)>2.4;
    if(urgent||atCurrent||(changed&&battle.time>=(soldier._destinationCommitUntil||0))){
      soldier.destination={x:next.x,z:next.z};
      soldier._destinationCommitUntil=battle.time+DESTINATION_COMMIT+(soldier.slotIndex%3)*.22;
    }
  }
  function orderCanAdvance(squad){
    var alive=0,arrived=0;
    for(var i=0;i<squad.members.length;i++){var s=squad.members[i];if(s.dead)continue;alive++;if(s.orderDestination&&dist2(s.root.position.x,s.root.position.z,s.orderDestination.x,s.orderDestination.z)<=ORDER_ARRIVAL_RADIUS)arrived++;}
    return !alive||arrived/alive>=ORDER_COHESION;
  }
  function issueOrders(squad,battle,force){
    var anchor=squad.orderAnchor||(squad.orderAnchor={x:squad.rally.x,z:squad.rally.z}),goal=squad.state==='retreat'?squad.home:(squad.objective||squad.home),goalChanged=!squad._orderGoal||dist2(goal.x,goal.z,squad._orderGoal.x,squad._orderGoal.z)>3;
    var form=formationFor(squad),formChanged=form!==squad.formation,phase=squad.commandPhase||'',hold=['regroup','support-hold','hold','reserve','defend','corner-check'].indexOf(phase)>=0;
    if(goalChanged){squad._orderGoal={x:goal.x,z:goal.z};force=true;}
    if(formChanged){squad.formation=form;force=true;}
    var dx=goal.x-anchor.x,dz=goal.z-anchor.z,len=Math.hypot(dx,dz),mayAdvance=!hold&&(squad.state==='advance'||squad.state==='engaged');
    if((force||orderCanAdvance(squad))&&mayAdvance&&len>2){
      var stride=squad.state==='engaged'?ORDER_STRIDE*.62:ORDER_STRIDE;
      anchor.x+=dx/len*Math.min(stride,len);anchor.z+=dz/len*Math.min(stride,len);squad._orderVersion++;
    }else if(squad.state==='retreat'&&len>2){
      anchor.x+=dx/len*Math.min(ORDER_STRIDE,len);anchor.z+=dz/len*Math.min(ORDER_STRIDE,len);squad._orderVersion++;
    }
    squad.rally={x:anchor.x,z:anchor.z};
    for(var i=0;i<squad.members.length;i++){var soldier=squad.members[i];if(!soldier.dead)setDestination(soldier,formationSlot(squad,soldier,soldier.slotIndex),battle,force||squad.state==='retreat');}
  }
  function updateSquad(squad,battle){
    var alive=0;for(var i=0;i<squad.members.length;i++)if(!squad.members[i].dead)alive++;squad.aliveCount=alive;
    var casualtyFrac=1-alive/squad.members.length,anyEngaged=false;for(i=0;i<squad.members.length;i++)if(squad.members[i].target)anyEngaged=true;
    if(casualtyFrac>=RETREAT_CASUALTY_FRAC)squad.state='retreat';else squad.state=anyEngaged?'engaged':'advance';
    if(battle)issueOrders(squad,battle,false);
  }

  function callout(soldier,battle,type){
    if(!battle.onCallout||battle.time<(soldier.voiceCooldown||0))return;
    soldier.voiceCooldown=battle.time+4+rand(battle)*5;
    battle.onCallout(soldier,type);
  }

  function updateSoldier(soldier,battle){
    if(soldier.dead)return;
    var heightAt=battle.heightAt,obstacles=battle.obstacles,enemies=battle.rosterOf(soldier.faction==='us'?'ge':'us'),role=ROLES[soldier.role];
    var oldTarget=soldier.target;
    var lostTarget=soldier.target&&(soldier.target.dead||dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z)>role.visionRange||!hasLineOfSight(soldier,soldier.target,heightAt,obstacles));
    if(!soldier.target||lostTarget)soldier.target=findTarget(soldier,enemies,heightAt,obstacles);
    if(!oldTarget&&soldier.target)callout(soldier,battle,'contact');

    if(soldier.lastSquadState!==soldier.squad.state){
      if(soldier.role==='captain')callout(soldier,battle,soldier.squad.state==='retreat'?'retreat':(soldier.squad.state==='advance'?'advance':'engage'));
      soldier.lastSquadState=soldier.squad.state;
    }

    if(soldier.squad.state==='retreat'){
      if(root.BattleNavigation)root.BattleNavigation.releaseWindow(soldier);
      soldier.prone=false;soldier.state='retreat';setDestination(soldier,soldier.orderDestination||formationSlot(soldier.squad,soldier,soldier.slotIndex),battle,true);
      if(soldier.target&&dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z)<35)tryFire(soldier,battle);
      soldier.setUp=false;return;
    }

    if(soldier.target){
      soldier.state='engage';
      var d=dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z),t=soldier.target;
      var shallow=shallowCoverAt(soldier.root.position.x,soldier.root.position.z,obstacles);
      var longRange=d>Math.max(80,role.engageRange*.62);
      var canProne=soldier.role==='rifleman'||soldier.role==='gunner';
      var hold=false;
      var orderTarget=soldier.orderDestination||formationSlot(soldier.squad,soldier,soldier.slotIndex);
      setDestination(soldier,orderTarget,battle,false);
      hold=dist2(soldier.root.position.x,soldier.root.position.z,orderTarget.x,orderTarget.z)<2.2||d<=role.engageRange*.65;
      if(soldier.role==='gunner'){
        soldier.setUpSince=hold?(soldier.setUp?soldier.setUpSince:battle.time):battle.time;soldier.setUp=hold&&battle.time-soldier.setUpSince>GUNNER_SETUP_TIME;
      }else soldier.setUp=false;
      soldier.prone=!!(canProne&&hold&&(longRange||shallow||soldier.suppressedUntil>battle.time&&d>55));
      if(d<=role.engageRange)tryFire(soldier,battle);
    }else{
      if(root.BattleNavigation&&soldier._windowSlot)root.BattleNavigation.releaseWindow(soldier);
      soldier.prone=false;soldier.state='advance';soldier.setUp=false;setDestination(soldier,soldier.orderDestination||formationSlot(soldier.squad,soldier,soldier.slotIndex),battle,false);
    }
  }

  function tryFire(soldier,battle){if(soldier.fireCooldown>0)return;var stats=soldier.weapon.stats;resolveFire(soldier,soldier.target,battle);soldier.fireCooldown=1/stats.rof*(.85+rand(battle)*.3);battle.onFire&&battle.onFire(soldier);}

  root.SquadAI={ROLES:ROLES,COMPOSITION:COMPOSITION,createSquad:createSquad,createSoldier:createSoldier,updateSquad:updateSquad,updateSoldier:updateSoldier,formationSlot:formationSlot,formationFor:formationFor,setDestination:setDestination,hasLineOfSight:hasLineOfSight,findTarget:findTarget,coverMultiplierAt:coverMultiplierAt,dist2:dist2};
})(typeof window!=='undefined'?window:globalThis);

/* v12 voice runtime override. The loader's original scheduler used a loader-local AUDIO
   binding and tried to play newly-created sounds before their MP3s had finished decoding.
   This source-level override runs later in the load order, uses the public global asset base,
   waits for Babylon's ready callback on first use, and emits concise diagnostics. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||typeof window==='undefined')return;
  var cache={},lastGlobal=0,squadLast={},failed={};
  function cameraPos(cam){return cam&&(cam.globalPosition||cam.position)||null;}
  function distance(a,b){if(!a||!b)return 0;var dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
  function playAt(entry,soldier){
    try{
      var p=soldier.root.position.clone?soldier.root.position.clone():soldier.root.position;
      entry.sound.setPosition(p);
      entry.sound.play();
      console.log('[VOICE] play '+entry.file);
    }catch(e){console.error('[VOICE] play failed '+entry.file+': '+(e&&e.message||e));}
  }
  function enqueue(soldier,type,cam){
    var m=window.BATTLE_AUDIO_MANIFEST;
    if(!m||!m.callouts||!m.callouts[soldier.faction]){console.warn('[VOICE] manifest/event map unavailable');return;}
    var events=m.callouts[soldier.faction].events||{},files=events[type];
    if(!files||!files.length){console.warn('[VOICE] no event '+soldier.faction+'/'+type);return;}
    var rules=m.rules&&m.rules.voice||{},now=performance.now(),globalGap=700,squadGap=(rules.perSquadCooldownSeconds||2.5)*1000;
    var cp=cameraPos(cam),drop=rules.dropBeyondDistance||120;
    if(cp&&distance(cp,soldier.root.position)>drop)return;
    if(now-lastGlobal<globalGap)return;
    var squadId=soldier.squad&&soldier.squad.id||soldier.faction;
    if(now-(squadLast[squadId]||0)<squadGap)return;
    var file=files[Math.floor(Math.random()*files.length)];
    if(failed[file])return;
    lastGlobal=now;squadLast[squadId]=now;
    var entry=cache[file];
    if(entry){
      if(entry.ready)playAt(entry,soldier);
      else{entry.pendingSoldier=soldier;console.log('[VOICE] waiting '+file);}
      return;
    }
    var base=window.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
    var url=base+file;
    console.log('[VOICE] request '+url);
    entry=cache[file]={file:file,sound:null,ready:false,pendingSoldier:soldier};
    try{
      var scene=soldier.root.getScene();
      entry.sound=new BABYLON.Sound('voice-'+file,url,scene,function(){
        entry.ready=true;
        console.log('[VOICE] ready '+file);
        if(entry.pendingSoldier){var s=entry.pendingSoldier;entry.pendingSoldier=null;playAt(entry,s);}
      },{
        spatialSound:true,distanceModel:'linear',maxDistance:(m.runtime&&m.runtime.voiceMaxDistance)||95,rolloffFactor:1.7,volume:.24,autoplay:false
      });
    }catch(e){
      failed[file]=true;delete cache[file];
      console.error('[VOICE] create failed '+file+': '+(e&&e.message||e));
    }
  }
  root.BattleVoiceScheduler={enqueue:enqueue};
  console.log('[VOICE] corrected runtime active');
})(typeof window!=='undefined'?window:globalThis);
