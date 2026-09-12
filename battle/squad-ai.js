/* Squad + soldier AI for the battle sim. This is the part actually being tested - the
   models in soldier.js/weapons.js exist to give it something to point a camera at.

   Two levels of state:
     - a Squad (10 soldiers: 1 captain, 1 gunner, 2 scouts, 6 riflemen) decides ADVANCE vs
       ENGAGED vs RETREATING for the group and slides a rally point toward the objective;
     - each Soldier decides its own destination and whether/what to shoot, using its squad's
       state as an input rather than duplicating it.

   Nothing here touches Babylon directly except through the plain fields soldier.js/battle-sim
   put on each soldier (root position, weaponSocket, hp) - so the decision logic can be read,
   and eventually unit-tested, without a scene. */
(function(root){
  'use strict';

  var ROLES={
    captain: {weapon:'pistol', speed:3.0, visionRange:150, engageRange:55,  hp:110},
    rifleman:{weapon:'rifle',  speed:2.9, visionRange:140, engageRange:135, hp:100},
    gunner:  {weapon:'lmg',    speed:2.2, visionRange:150, engageRange:160, hp:100},
    scout:   {weapon:'carbine',speed:3.8, visionRange:175, engageRange:105, hp:90}
  };
  /* 1 captain + 1 gunner + 2 scouts + 6 riflemen = 10 per squad; five squads a side is the
     50 the battle sim spawns. */
  var COMPOSITION=['captain','gunner','scout','scout','rifleman','rifleman','rifleman','rifleman','rifleman','rifleman'];

  var RETREAT_CASUALTY_FRAC=.6;   // squad falls back once 60% of it is down
  var GUNNER_SETUP_TIME=1.4;      // seconds stationary-while-engaged before the accuracy bonus
  var SUPPRESSION_TIME=1.3;       // how long an LMG near-miss keeps a target rattled
  var LOS_SAMPLES=8;
  var EYE_HEIGHT=1.55,EYE_HEIGHT_CROUCH=1.05;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function dist2(ax,az,bx,bz){var dx=ax-bx,dz=az-bz;return Math.sqrt(dx*dx+dz*dz);}

  function hasLineOfSight(a,b,heightAt){
    var ax=a.root.position.x,az=a.root.position.z,ay=heightAt(ax,az)+(a.crouching?EYE_HEIGHT_CROUCH:EYE_HEIGHT);
    var bx=b.root.position.x,bz=b.root.position.z,by=heightAt(bx,bz)+(b.crouching?EYE_HEIGHT_CROUCH:EYE_HEIGHT);
    for(var i=1;i<LOS_SAMPLES;i++){
      var t=i/LOS_SAMPLES,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      var lineY=ay+(by-ay)*t,groundY=heightAt(x,z);
      if(groundY>lineY-.15)return false; // terrain pokes through the sightline
    }
    return true;
  }

  /* Picks the nearest visible living enemy in range. Re-run every AI tick rather than only
     on target loss - a closer target (or a lost LOS) should be able to steal the shooter's
     attention rather than have it fixate on the first thing it ever saw. */
  function findTarget(soldier,enemies,heightAt){
    var role=ROLES[soldier.role],best=null,bestD=Infinity;
    for(var i=0;i<enemies.length;i++){
      var e=enemies[i];
      if(e.dead)continue;
      var d=dist2(soldier.root.position.x,soldier.root.position.z,e.root.position.x,e.root.position.z);
      if(d>role.visionRange||d>=bestD)continue;
      if(!hasLineOfSight(soldier,e,heightAt))continue;
      best=e;bestD=d;
    }
    return best;
  }

  function resolveFire(shooter,target,battle){
    var stats=shooter.weapon.stats,d=dist2(shooter.root.position.x,shooter.root.position.z,target.root.position.x,target.root.position.z);
    if(d>stats.range)return null;
    var falloff=d<=stats.falloffStart?1:Math.max(.15,1-(d-stats.falloffStart)/Math.max(1,stats.range-stats.falloffStart));
    var acc=stats.accuracy*falloff*(shooter.squad.accuracyMultiplier||1);
    if(target.crouching)acc*=.6;
    if(target.suppressedUntil>battle.time)acc*=.55;
    if(shooter.role==='gunner'&&shooter.setUp)acc*=1.25;
    if(shooter.moving)acc*=.82;
    acc=clamp(acc,.02,.95);
    var hit=Math.random()<acc;
    if(stats.suppressive){target.suppressedUntil=battle.time+SUPPRESSION_TIME;}
    if(hit){
      target.hp-=stats.damage*(.85+Math.random()*.3);
      if(target.hp<=0)battle.killSoldier(target,shooter);
    }
    battle.onShot&&battle.onShot(shooter,target,hit,d);
    return hit;
  }

  /* A squad's rally point is where its formation is centered; it creeps toward `objective`
     while ADVANCE, holds while ENGAGED, and creeps toward `home` while RETREATING. Individual
     soldiers then take a role-based offset from it - see formationSlot. */
  function createSquad(id,faction,homePoint,objective){
    return {
      id:id,faction:faction,members:[],state:'advance',
      home:homePoint,objective:objective,
      rally:{x:homePoint.x,z:homePoint.z},
      accuracyMultiplier:1,captainAlive:true
    };
  }

  function formationSlot(squad,soldier,slotIndex){
    var dx=squad.objective.x-squad.home.x,dz=squad.objective.z-squad.home.z,len=Math.hypot(dx,dz)||1;
    var fx=dx/len,fz=dz/len,rx=-fz,rz=fx; // rx/rz: right-hand side of the advance direction
    var rally=squad.rally;
    if(soldier.role==='captain')return {x:rally.x,z:rally.z};
    if(soldier.role==='gunner')return {x:rally.x-fx*11,z:rally.z-fz*11};
    if(soldier.role==='scout'){
      var side=(slotIndex%2===0)?1:-1;
      return {x:rally.x+rx*side*24+fx*10,z:rally.z+rz*side*24+fz*10};
    }
    // riflemen: a loose line either side of the captain
    var lane=(slotIndex%6)-2.5;
    return {x:rally.x+rx*lane*5.5,z:rally.z+rz*lane*5.5-fz*2};
  }

  function createSoldier(opts){
    var role=ROLES[opts.role];
    var s=Object.assign({},opts.model,{
      id:opts.id,faction:opts.faction,role:opts.role,squad:opts.squad,slotIndex:opts.slotIndex,
      weapon:opts.weapon,hp:role.hp,maxHp:role.hp,
      state:'advance',target:null,destination:{x:opts.model.root.position.x,z:opts.model.root.position.z},
      fireCooldown:Math.random()*.5,moving:false,crouching:false,suppressedUntil:0,setUp:false,setUpSince:0,
      speed:role.speed
    });
    return s;
  }

  function updateSquad(squad){
    var alive=0;for(var i=0;i<squad.members.length;i++)if(!squad.members[i].dead)alive++;
    squad.aliveCount=alive;
    var casualtyFrac=1-alive/squad.members.length;
    var anyEngaged=false;for(i=0;i<squad.members.length;i++)if(squad.members[i].target)anyEngaged=true;

    if(casualtyFrac>=RETREAT_CASUALTY_FRAC)squad.state='retreat';
    else squad.state=anyEngaged?'engaged':'advance';

    /* The rally point has to creep at roughly rifle-speed, not "however far looks like a
       round number" - this runs once per AI tick (battle-sim.js's AI_TICK, 0.15s), so at
       ~2.8 m/s that's a ~0.42 m step. Faster than that and the formation permanently chases
       a rally point that has already outrun it; slower and the squad stalls behind it. */
    var step=0.42;
    if(squad.state==='advance'){
      var dx=squad.objective.x-squad.rally.x,dz=squad.objective.z-squad.rally.z,len=Math.hypot(dx,dz);
      if(len>step){squad.rally.x+=dx/len*step;squad.rally.z+=dz/len*step;}
    }else if(squad.state==='retreat'){
      var hx=squad.home.x-squad.rally.x,hz=squad.home.z-squad.rally.z,hlen=Math.hypot(hx,hz);
      if(hlen>step){squad.rally.x+=hx/hlen*step;squad.rally.z+=hz/hlen*step;}
    }
  }

  /* Runs once per AI tick (battle-sim.js decides the cadence) for one soldier. Movement
     itself is integrated every render frame in battle-sim.js against soldier.destination /
     soldier.speed, so this only ever needs to set intent, not move anything. */
  function updateSoldier(soldier,battle){
    if(soldier.dead)return;
    var heightAt=battle.heightAt,enemies=battle.rosterOf(soldier.faction==='us'?'ge':'us');
    var role=ROLES[soldier.role];

    var lostTarget=soldier.target&&(soldier.target.dead||
      dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z)>role.visionRange||
      !hasLineOfSight(soldier,soldier.target,heightAt));
    if(!soldier.target||lostTarget)soldier.target=findTarget(soldier,enemies,heightAt);
    if(soldier.squad.state==='retreat'){
      soldier.state='retreat';
      soldier.destination=formationSlot(soldier.squad,soldier,soldier.slotIndex);
      soldier.destination.x=soldier.squad.home.x+(soldier.destination.x-soldier.squad.rally.x);
      soldier.destination.z=soldier.squad.home.z+(soldier.destination.z-soldier.squad.rally.z);
      // Still allow a last-ditch shot at anything that closed to knife-fight range.
      if(soldier.target&&dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z)<35)
        tryFire(soldier,battle);
      soldier.setUp=false;
      return;
    }

    if(soldier.target){
      soldier.state='engage';
      var d=dist2(soldier.root.position.x,soldier.root.position.z,soldier.target.root.position.x,soldier.target.root.position.z);
      var t=soldier.target;
      if(soldier.role==='gunner'){
        // Gunners stop to deploy the bipod rather than walking-and-shooting.
        soldier.destination={x:soldier.root.position.x,z:soldier.root.position.z};
        soldier.setUpSince=soldier.setUp?soldier.setUpSince:battle.time;
        soldier.setUp=battle.time-soldier.setUpSince>GUNNER_SETUP_TIME;
      }else{
        soldier.setUp=false;
        // Close a bit if at the edge of engage range, otherwise hold and trade fire.
        if(d>role.engageRange*.65){
          soldier.destination={x:t.root.position.x,z:t.root.position.z};
        }else{
          soldier.destination={x:soldier.root.position.x,z:soldier.root.position.z};
        }
      }
      if(d<=role.engageRange)tryFire(soldier,battle);
    }else{
      soldier.state='advance';
      soldier.setUp=false;
      soldier.destination=formationSlot(soldier.squad,soldier,soldier.slotIndex);
    }
  }

  function tryFire(soldier,battle){
    if(soldier.fireCooldown>0)return;
    var stats=soldier.weapon.stats;
    resolveFire(soldier,soldier.target,battle);
    soldier.fireCooldown=1/stats.rof*(.85+Math.random()*.3);
    battle.onFire&&battle.onFire(soldier);
  }

  root.SquadAI={
    ROLES:ROLES,COMPOSITION:COMPOSITION,
    createSquad:createSquad,createSoldier:createSoldier,
    updateSquad:updateSquad,updateSoldier:updateSoldier,
    formationSlot:formationSlot,hasLineOfSight:hasLineOfSight,findTarget:findTarget,
    dist2:dist2
  };
})(typeof window!=='undefined'?window:globalThis);
