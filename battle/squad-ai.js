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
  var EYE_HEIGHT=1.55,EYE_HEIGHT_CROUCH=1.05,EYE_HEIGHT_PRONE=.42;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function dist2(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}
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
    acc*=coverMultiplierAt(target.root.position.x,target.root.position.z,battle.obstacles);
    acc=clamp(acc,.02,.95);
    var hit=Math.random()<acc;
    if(stats.suppressive)target.suppressedUntil=battle.time+SUPPRESSION_TIME;
    if(hit){target.hp-=stats.damage*(.85+Math.random()*.3);if(target.hp<=0)battle.killSoldier(target,shooter);}
    battle.onShot&&battle.onShot(shooter,target,hit,d);
    return hit;
  }

  function createSquad(id,faction,homePoint,objective){return {id:id,faction:faction,members:[],state:'advance',home:homePoint,objective:objective,rally:{x:homePoint.x,z:homePoint.z},accuracyMultiplier:1,captainAlive:true};}
  function formationSlot(squad,soldier,slotIndex){var dx=squad.objective.x-squad.home.x,dz=squad.objective.z-squad.home.z,len=Math.hypot(dx,dz)||1;var fx=dx/len,fz=dz/len,rx=-fz,rz=fx,rally=squad.rally;if(soldier.role==='captain')return {x:rally.x,z:rally.z};if(soldier.role==='gunner')return {x:rally.x-fx*11,z:rally.z-fz*11};if(soldier.role==='scout'){var side=(slotIndex%2===0)?1:-1;return {x:rally.x+rx*side*24+fx*10,z:rally.z+rz*side*24+fz*10};}var lane=(slotIndex%6)-2.5;return {x:rally.x+rx*lane*5.5,z:rally.z+rz*lane*5.5-fz*2};}

  function createSoldier(opts){
    var role=ROLES[opts.role];
    return Object.assign({},opts.model,{id:opts.id,faction:opts.faction,role:opts.role,squad:opts.squad,slotIndex:opts.slotIndex,weapon:opts.weapon,hp:role.hp,maxHp:role.hp,state:'advance',target:null,destination:{x:opts.model.root.position.x,z:opts.model.root.position.z},fireCooldown:Math.random()*.5,moving:false,crouching:false,prone:false,suppressedUntil:0,setUp:false,setUpSince:0,speed:role.speed,moveSpeed:0,voiceCooldown:Math.random()*2,lastSquadState:'advance'});
  }

  function updateSquad(squad){
    var alive=0;for(var i=0;i<squad.members.length;i++)if(!squad.members[i].dead)alive++;squad.aliveCount=alive;
    var casualtyFrac=1-alive/squad.members.length,anyEngaged=false;for(i=0;i<squad.members.length;i++)if(squad.members[i].target)anyEngaged=true;
    if(casualtyFrac>=RETREAT_CASUALTY_FRAC)squad.state='retreat';else squad.state=anyEngaged?'engaged':'advance';
    var step=.42;
    if(squad.state==='advance'){var dx=squad.objective.x-squad.rally.x,dz=squad.objective.z-squad.rally.z,len=Math.hypot(dx,dz);if(len>step){squad.rally.x+=dx/len*step;squad.rally.z+=dz/len*step;}}
    else if(squad.state==='retreat'){var hx=squad.home.x-squad.rally.x,hz=squad.home.z-squad.rally.z,hlen=Math.hypot(hx,hz);if(hlen>step){squad.rally.x+=hx/hlen*step;squad.rally.z+=hz/hlen*step;}}
  }

  function callout(soldier,battle,type){
    if(!battle.onCallout||battle.time<(soldier.voiceCooldown||0))return;
    soldier.voiceCooldown=battle.time+4+Math.random()*5;
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
      soldier.prone=false;soldier.state='retreat';soldier.destination=formationSlot(soldier.squad,soldier,soldier.slotIndex);
      soldier.destination.x=soldier.squad.home.x+(soldier.destination.x-soldier.squad.rally.x);soldier.destination.z=soldier.squad.home.z+(soldier.destination.z-soldier.squad.rally.z);
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
      if(soldier.role==='gunner'){
        soldier.destination={x:soldier.root.position.x,z:soldier.root.position.z};hold=true;
        soldier.setUpSince=soldier.setUp?soldier.setUpSince:battle.time;soldier.setUp=battle.time-soldier.setUpSince>GUNNER_SETUP_TIME;
      }else{
        soldier.setUp=false;
        if(d>role.engageRange*.65){soldier.destination={x:t.root.position.x,z:t.root.position.z};}
        else{soldier.destination={x:soldier.root.position.x,z:soldier.root.position.z};hold=true;}
      }
      soldier.prone=!!(canProne&&hold&&(longRange||shallow||soldier.suppressedUntil>battle.time&&d>55));
      if(d<=role.engageRange)tryFire(soldier,battle);
    }else{
      soldier.prone=false;soldier.state='advance';soldier.setUp=false;soldier.destination=formationSlot(soldier.squad,soldier,soldier.slotIndex);
    }
  }

  function tryFire(soldier,battle){if(soldier.fireCooldown>0)return;var stats=soldier.weapon.stats;resolveFire(soldier,soldier.target,battle);soldier.fireCooldown=1/stats.rof*(.85+Math.random()*.3);battle.onFire&&battle.onFire(soldier);}

  root.SquadAI={ROLES:ROLES,COMPOSITION:COMPOSITION,createSquad:createSquad,createSoldier:createSoldier,updateSquad:updateSquad,updateSoldier:updateSoldier,formationSlot:formationSlot,hasLineOfSight:hasLineOfSight,findTarget:findTarget,coverMultiplierAt:coverMultiplierAt,dist2:dist2};
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
