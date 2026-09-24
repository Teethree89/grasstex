/* Individual engagement pipeline for the ww2fps AI lab.

   Before this file the per-soldier combat behavior was spread over four modules that each wrapped
   SquadAI.updateSoldier and each wrote soldier.destination / prone / tacticalCrouch on the same
   tick. The last writer won, so a soldier's visible behavior was "walk to a formation slot while
   pointing a rifle": nobody ever owned the decision to stop, get down and fight.

   This module owns combat STATE, stance and fire control. It decides whether a soldier is
   advancing, orienting, bounding, engaging, pinned, assaulting or alert. It does not own the
   physical destination: combat movement requests go to BattleMovementResolver, which coalesces
   them and alone writes soldier.destination; squad movement remains owned by the squad-command path.

   Sequence a soldier now runs on contact:
     advance -> orient (halt, turn, weapon up) -> react
              -> bound (crouch-run/crawl to cover) -> engage (committed stance, aimed fire)
              -> pinned (prone while suppressed) / assault (short rush) / alert (lost contact)

   Nothing here touches Babylon, so the whole pipeline runs in the headless harness under
   tools/ai-sim-harness. */
(function(root){
  'use strict';

  /* Seconds between acquiring a target and being allowed to shoot at it. This is recognition and
     weapon handling, not aiming accuracy - the aim cone below is a separate gate. */
  var REACT={captain:.55,rifleman:.70,gunner:.85,scout:.45};
  var AIM_CONE=.22;              // ~12.6 deg; wider than this and the body is still turning
  var AIM_SETTLE=.40;            // after a stance change or a major retarget
  var MOVE_FIRE_FRACTION=.12;    // above this fraction of top speed the weapon stays down
  var ALERT_HOLD=4.5;            // hold the threat sector this long after losing sight
  var ENGAGE_REVIEW=7.0;         // re-open the cover question this often while holding
  var STANCE_HOLD=4.0,PRONE_HOLD=5.5;
  var COVER_RANGE=26,COVER_RANGE_UNDER_FIRE=42,COVER_ARRIVED=1.2;
  var GUNNER_SETUP=1.4;
  /* A position is "in the open" when the best stance available there still leaves the soldier
     nearly fully exposed. */
  var OPEN_COVER=.92,USEFUL_COVER=.88;
  var PRONE_ROLES={rifleman:1,gunner:1};
  var BOUND_METERS=6.5,BOUND_ARRIVED=1.25;
  /* Suppressing a known position. Capped per squad so it reads as suppressing fire rather than
     everyone emptying magazines into a hedge, and fired in short bursts so the sound of a
     firefight has a rhythm. */
  var MAX_SUPPRESSORS=2,SUPPRESS_BURST=3,SUPPRESS_PAUSE=2.6,SUPPRESS_HOLD=1.5;
  /* A man whose squad already knows where the enemy is reacts faster than the man who found them:
     he is looking the right way before his own target resolves. */
  var PREWARNED_REACT=.55;

  function SA(){return root.SquadAI;}
  function field(){return root.BattleObstacleField;}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function posOf(s){return s.root.position;}
  function telemetry(battle,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,battle);}
  function roleOf(s){var roles=SA()&&SA().ROLES;return(roles&&roles[s.role])||{speed:2.9,visionRange:140,engageRange:130};}
  function jitter(s,scale){return((+s.id||0)%7)*scale;}

  function state(s){
    if(!s.eng)s.eng={state:'advance',since:0,until:0,stance:'stand',stanceUntil:0,fireReadyAt:0,
      threatSector:null,cover:null,lastSeen:null,lastSeenAt:-999,contactAt:-999,reviewAt:0,setUpSince:0,boundOrder:false,
      suppressOrder:false,burstLeft:SUPPRESS_BURST,burstPauseUntil:0};
    return s.eng;
  }
  function threatSector(s,target){
    if(!s||!target||!target.root)return null;
    var p=posOf(s),t=posOf(target),a=Math.atan2(t.z-p.z,t.x-p.x);
    return((Math.round((a+Math.PI)/(Math.PI/4))%8)+8)%8;
  }
  function sectorDistance(a,b){if(a==null||b==null)return 8;var d=Math.abs(a-b)%8;return Math.min(d,8-d);}
  function facingError(s,pt){
    if(!pt)return Math.PI;
    var p=posOf(s),dx=pt.x-p.x,dz=pt.z-p.z;
    if(Math.abs(dx)+Math.abs(dz)<1e-5)return 0;
    var diff=Math.atan2(dx,dz)-(s.root.rotation.y||0);
    return Math.abs(Math.atan2(Math.sin(diff),Math.cos(diff)));
  }

  function squadContact(s,battle){
    var api=SA();
    return api&&api.squadContact?api.squadContact(s.squad,battle):null;
  }
  /* Recognition time, shortened when the squad has already called the contact. */
  function reactTime(s,battle){
    var base=(REACT[s.role]||.7)+jitter(s,.06),contact=squadContact(s,battle);
    return contact&&contact.seenBy!==s.id?base*PREWARNED_REACT:base;
  }
  /* Where a man without his own target should be looking and shooting. */
  function knownThreat(s,battle){
    var contact=squadContact(s,battle);
    if(contact)return{x:contact.x,z:contact.z};
    var e=state(s);
    return e.lastSeen||null;
  }

  /* ---- stance ------------------------------------------------------------------------------- */

  function applyStance(s,stance){
    if(stance==='prone'){s.prone=true;s.tacticalCrouch=false;}
    else if(stance==='crawl'){s.prone=true;s.crawling=true;s.tacticalCrouch=false;return;}
    else if(stance==='crouch'){s.prone=false;s.tacticalCrouch=true;}
    else{s.prone=false;s.tacticalCrouch=false;}
    s.crawling=false;
  }
  function commitStance(s,battle,stance,seconds){
    var e=state(s);
    if(e.stance!==stance){e.fireReadyAt=Math.max(e.fireReadyAt,battle.time+AIM_SETTLE);e.stance=stance;}
    e.stanceUntil=battle.time+(seconds==null?(stance==='prone'?PRONE_HOLD:STANCE_HOLD):seconds);
    applyStance(s,stance);
  }
  function holdStance(s,battle){
    var e=state(s);
    if(battle.time<e.stanceUntil){applyStance(s,e.stance);return true;}
    return false;
  }
  /* Prone is only useful where it is survivable and the soldier can still shoot: long shots,
     real suppression, or cover low enough that crouching leaves him showing. */
  function fightingStance(s,battle,distanceToTarget,coverValue){
    var role=roleOf(s),suppressed=s.suppressedUntil>battle.time;
    if(!PRONE_ROLES[s.role])return 'crouch';
    if(suppressed)return 'prone';
    if(distanceToTarget>Math.max(70,role.engageRange*.55))return 'prone';
    if(coverValue>USEFUL_COVER)return 'prone';   // no cover at all: go to ground
    return 'crouch';
  }

  /* ---- cover ------------------------------------------------------------------------------- */

  /* Cover is a set of physical stand slots, shared by engagement and survival routes. Claims
     last for the actual bound/occupancy, never a clock lease. This owner chooses/reserves cover;
     Movement Resolver remains the only writer of physical destinations. */
  var coverClaims=new WeakMap(),COVER_SPACING=1.8,COVER_CELL=2;
  function coverKey(p){return Math.floor(p.x/COVER_CELL)+','+Math.floor(p.z/COVER_CELL);}
  function coverRegistry(battle){
    var obs=battle.obstacles||[],N=root.BattleNavigation,c=coverClaims.get(battle),version=(obs.__physicalVersion||0)+'|'+obs.length+'|'+(N&&N.version||0);
    if(!c||c.source!==obs||c.version!==version||c.roster!==battle._roster||battle.time<c.lastTime){
      c={battle:battle,source:obs,version:version,roster:battle._roster,lastTime:battle.time,shapes:new Map(),shapeIds:new Map(),slots:null,bySoldier:new Map(),claims:new Map(),bodies:new Map(),bodyTime:null};
      var physical=obs.__physicalFootprints||[];for(var i=0;i<physical.length;i++)if(physical[i].id!=null)c.shapes.set(String(physical[i].id),physical[i]);
      for(i=0;i<obs.length;i++){var fp=c.shapes.get(String(obs[i].physicalId))||obs[i];if(!c.shapeIds.has(fp))c.shapeIds.set(fp,'cover:'+i);}
      coverClaims.set(battle,c);
    }
    c.lastTime=battle.time;return c;
  }
  function dropCover(c,e){
    if(!e)return;if(c.bySoldier.get(e.soldier)===e)c.bySoldier.delete(e.soldier);
    var list=c.claims.get(coverKey(e.slot));if(list){var i=list.indexOf(e);if(i>=0)list.splice(i,1);}
  }
  function coverLive(e,battle){
    var s=e.soldier,q=s.squad||{},eng=s.eng,p=s.root&&s.root.position;
    if(s.dead||s.incapacitated||battle.winner||!p||q.state==='retreat'||q.commandPhase==='retreat'||q.commandPhase==='regroup'||(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s)))return false;
    if(e.createdAt===battle.time)return true; // selection is committed by its caller in this tick
    var near=dist(p.x,p.z,e.slot.x,e.slot.z)<=COVER_SPACING;
    if(e.kind==='route')return!!(s._tacticalRoute&&s._tacticalRoute.coverSlotId===e.slot.id)||near;
    return!!(eng&&eng.cover&&eng.cover.slotId===e.slot.id&&(eng.state==='bound'||(near&&['engage','pinned','orient','alert'].indexOf(eng.state)>=0)));
  }
  function currentCover(s,battle){var c=coverRegistry(battle),e=c.bySoldier.get(s);if(e&&!coverLive(e,battle)){dropCover(c,e);return null;}return e||null;}
  function releaseCover(s,battle,kind){var c=coverRegistry(battle),e=c.bySoldier.get(s);if(e&&(!kind||e.kind===kind))dropCover(c,e);}
  function slotPad(){var P=root.BattleNavigationPhysicality;return Math.max(.9,(P&&P.routeMargin||1.15)+.05);}
  function coverEligible(F,ob){return F.obstacleHeight(ob)>=.5&&(ob.cover==null?1:+ob.cover)<=USEFUL_COVER;}
  function rawCoverSlots(c,ob,fp){
    var slots=[],pad=slotPad(),id=c.shapeIds.get(fp);
    function add(x,z,nx,nz){var slot={id:id+':'+slots.length,x:x,z:z,normalX:nx,normalZ:nz,obstacle:ob,shape:fp,type:ob.type||'cover'};slots.push(slot);}
    if(fp.shape==='obb'){
      var ux=isFinite(+fp.ux)?+fp.ux:1,uz=+fp.uz||0,l=Math.hypot(ux,uz)||1;ux/=l;uz/=l;
      var vx=isFinite(+fp.vx)?+fp.vx:-uz,vz=isFinite(+fp.vz)?+fp.vz:ux,vl=Math.hypot(vx,vz)||1;vx/=vl;vz/=vl;
      var hx=+fp.hx||.5,hz=+fp.hz||.5;
      function face(half,nx,nz,tx,tz,depth){var n=Math.max(1,Math.floor(half*2/COVER_SPACING));for(var i=0;i<n;i++){var along=(i+.5)*half*2/n-half;add(fp.x+nx*(depth+pad)+tx*along,fp.z+nz*(depth+pad)+tz*along,nx,nz);}}
      face(hx,vx,vz,ux,uz,hz);face(hx,-vx,-vz,ux,uz,hz);face(hz,ux,uz,vx,vz,hx);face(hz,-ux,-uz,vx,vz,hx);
    }else{
      var radius=(+fp.radius||1)+pad,count=Math.max(4,Math.floor(Math.PI*2*radius/COVER_SPACING));
      for(var i=0;i<count;i++){var a=i*Math.PI*2/count;add(fp.x+Math.cos(a)*radius,fp.z+Math.sin(a)*radius,Math.cos(a),Math.sin(a));}
    }
    return slots;
  }
  /* Every obstacle rings itself with slots, so neighbouring pieces of cover produce slots that
     sit on top of each other. Build them all once per map version in obstacle order, drop the
     unusable ones, then walk from the newest back and delete any older slot within claim spacing
     of one already kept: no two surviving slots overlap, so every slot shown can be taken. */
  /* Distance from a point to an obstacle's ground footprint (0 inside). */
  function footprintGap(fp,x,z){
    if(fp.shape==='obb'){
      var ux=isFinite(+fp.ux)?+fp.ux:1,uz=+fp.uz||0,l=Math.hypot(ux,uz)||1;ux/=l;uz/=l;
      var vx=isFinite(+fp.vx)?+fp.vx:-uz,vz=isFinite(+fp.vz)?+fp.vz:ux,vl=Math.hypot(vx,vz)||1;vx/=vl;vz/=vl;
      var dx=x-fp.x,dz=z-fp.z,a=Math.abs(dx*ux+dz*uz)-(+fp.hx||.5),b=Math.abs(dx*vx+dz*vz)-(+fp.hz||.5);
      return Math.hypot(Math.max(a,0),Math.max(b,0));
    }
    return Math.max(0,dist(x,z,fp.x,fp.z)-(+fp.radius||1));
  }
  /* Every standing obstacle keeps a stand-off margin that no slot may enter. Defence works
     (sandbags, log walls, trenches) are chains of cover circles that are not physical footprints,
     so neither the collision line nor the planner's stand check sees them; without this, one
     circle's ring of slots landed on top of its neighbours. */
  function marginIndex(F,c,pad){
    var cell=4,grid=new Map(),seen=new Set();
    for(var i=0;i<c.source.length;i++){
      var ob=c.source[i];if(F.obstacleHeight(ob)<.5)continue;
      var fp=c.shapes.get(String(ob.physicalId))||ob,ext=(fp.shape==='obb'?Math.hypot(+fp.hx||.5,+fp.hz||.5):(+fp.radius||1))+pad;
      if(seen.has(fp))continue;seen.add(fp);
      for(var cx=Math.floor((fp.x-ext)/cell);cx<=Math.floor((fp.x+ext)/cell);cx++)for(var cz=Math.floor((fp.z-ext)/cell);cz<=Math.floor((fp.z+ext)/cell);cz++){var k=cx+','+cz,list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(fp);}
    }
    return function(x,z){var list=grid.get(Math.floor(x/cell)+','+Math.floor(z/cell));if(list)for(var j=0;j<list.length;j++)if(footprintGap(list[j],x,z)<pad-.01)return false;return true;};
  }
  function buildCoverSlots(c){
    var F=field(),N=root.BattleNavigation,P=root.BattleNavigationPhysicality,all=[],seen=new Set();c.slots=new Map();
    var outsideMargins=F?marginIndex(F,c,slotPad()):function(){return true;};
    /* A slot must be somewhere a body can stand: the planner's stand envelope (route margin
       around every shape, not just this one) must accept it unchanged, or the planner would
       quietly move the soldier off it. */
    function standable(slot){
      if(N&&!N.movementClear(slot,slot))return false;
      if(!P||!P.resolveStandGoal)return true;
      var stand=P.resolveStandGoal(c.battle,null,slot);return!!stand&&dist(stand.x,stand.z,slot.x,slot.z)<.01;
    }
    for(var i=0;i<c.source.length;i++){
      var ob=c.source[i],fp=c.shapes.get(String(ob.physicalId))||ob;if(seen.has(fp))continue;seen.add(fp);
      c.slots.set(fp,[]);if(!F||!coverEligible(F,ob))continue;
      var raw=rawCoverSlots(c,ob,fp);
      for(var j=0;j<raw.length;j++){var slot=raw[j];
        if(!outsideMargins(slot.x,slot.z)||!standable(slot))continue;
        if(F.coverPotentialAt(c.source,slot.x,slot.z)>USEFUL_COVER)continue;
        all.push(slot);
      }
    }
    var grid=new Map(),kept=[];
    function cell(x,z){return Math.floor(x/COVER_SPACING)+','+Math.floor(z/COVER_SPACING);}
    for(i=all.length-1;i>=0;i--){
      var slot=all[i],cx=Math.floor(slot.x/COVER_SPACING),cz=Math.floor(slot.z/COVER_SPACING),clash=false;
      for(var x=-1;x<=1&&!clash;x++)for(var z=-1;z<=1&&!clash;z++){var list=grid.get((cx+x)+','+(cz+z));if(list)for(var k=0;k<list.length;k++)if(dist(list[k].x,list[k].z,slot.x,slot.z)<COVER_SPACING-.001){clash=true;break;}}
      if(clash)continue;var key=cell(slot.x,slot.z),bucket=grid.get(key);if(!bucket)grid.set(key,bucket=[]);bucket.push(slot);kept.push(slot);
    }
    for(i=kept.length-1;i>=0;i--)c.slots.get(kept[i].shape).push(kept[i]);
    c.slotCount=kept.length;c.slotsPruned=all.length-kept.length;
  }
  function coverSlots(c,ob){
    if(!c.slots)buildCoverSlots(c);
    return c.slots.get(c.shapes.get(String(ob.physicalId))||ob)||[];
  }
  function coverBodies(c,battle){
    if(c.bodyTime===battle.time)return;c.bodyTime=battle.time;c.bodies.clear();
    var roster=battle._roster||{};
    ['us','ge'].forEach(function(f){(roster[f]||[]).forEach(function(s){if(s.dead||!s.root)return;[s.root.position,s.destination].forEach(function(p){if(!p)return;var k=coverKey(p),list=c.bodies.get(k);if(!list)c.bodies.set(k,list=[]);list.push({soldier:s,point:{x:p.x,z:p.z}});});});});
  }
  function coverAvailable(c,slot,s,battle){
    coverBodies(c,battle);var cx=Math.floor(slot.x/COVER_CELL),cz=Math.floor(slot.z/COVER_CELL);
    for(var x=-1;x<=1;x++)for(var z=-1;z<=1;z++){
      var key=(cx+x)+','+(cz+z),list=c.claims.get(key)||[];
      for(var i=list.length-1;i>=0;i--){var e=list[i];if(!coverLive(e,battle)){dropCover(c,e);continue;}if(e.soldier!==s&&dist(e.slot.x,e.slot.z,slot.x,slot.z)<COVER_SPACING-.001)return false;}
      var bodies=c.bodies.get(key)||[];for(i=0;i<bodies.length;i++){var body=bodies[i];if(body.soldier!==s&&!body.soldier.dead&&dist(body.point.x,body.point.z,slot.x,slot.z)<.9)return false;}
    }
    var N=root.BattleNavigation;return!N||N.movementClear(slot,slot);
  }
  function reserveCover(s,battle,slot,kind){
    var c=coverRegistry(battle);if(!slot||!coverAvailable(c,slot,s,battle))return null;
    var prev=c.bySoldier.get(s);if(prev&&prev.slot===slot&&prev.kind===kind)return prev;
    dropCover(c,prev);var e={slot:slot,soldier:s,kind:kind||'engagement',createdAt:battle.time};c.bySoldier.set(s,e);
    var k=coverKey(slot),list=c.claims.get(k);if(!list)c.claims.set(k,list=[]);list.push(e);return e;
  }
  function coverCandidates(s,battle,threat,maxRange){
    var F=field();if(!F||!threat)return[];var c=coverRegistry(battle),p=posOf(s),t=threat.root?posOf(threat):threat;
    var obs=F.nearby(battle.obstacles,p.x,p.z,maxRange),out=[],seen=new Set(),P=root.BattleNavigationPhysicality;
    for(var i=0;i<obs.length;i++){
      var slots=coverSlots(c,obs[i]);if(!slots.length||seen.has(slots))continue;seen.add(slots);
      for(var j=0;j<slots.length;j++){
        var slot=slots[j],dx=t.x-slot.x,dz=t.z-slot.z;
        if(dx*slot.normalX+dz*slot.normalZ>=0||dist(p.x,p.z,slot.x,slot.z)>maxRange)continue;
        // The sheltering physical volume must actually lie between this slot and the threat.
        if(P&&P.shapeHit&&!P.shapeHit(slot,t,slot.shape,0))continue;
        if(!coverAvailable(c,slot,s,battle))continue;
        var quality=F.coverPotentialAt(battle.obstacles,slot.x,slot.z);if(quality>USEFUL_COVER)continue;
        out.push({x:slot.x,z:slot.z,slotId:slot.id,slot:slot,quality:quality,distance:dist(p.x,p.z,slot.x,slot.z),obstacle:slot.obstacle,type:slot.type});
      }
    }
    return out;
  }
  function coverSnapshot(battle){
    var c=coverRegistry(battle),F=field(),out=[],seen=new Set();
    for(var i=0;i<c.source.length;i++){var slots=coverSlots(c,c.source[i]);if(!slots.length||seen.has(slots))continue;seen.add(slots);
      for(var j=0;j<slots.length;j++){var slot=slots[j];
        var e=null,list=c.claims.get(coverKey(slot))||[];for(var k=0;k<list.length;k++)if(list[k].slot===slot&&coverLive(list[k],battle)){e=list[k];break;}
        var occupied=e&&dist(posOf(e.soldier).x,posOf(e.soldier).z,slot.x,slot.z)<=.45;
        out.push({id:slot.id,x:slot.x,z:slot.z,normalX:slot.normalX,normalZ:slot.normalZ,type:slot.type,status:e?(occupied?'occupied':'reserved'):'free',soldierId:e?e.soldier.id:null,faction:e?e.soldier.faction:null});
      }
    }
    return out;
  }
  function reachable(from,to){
    var N=root.BattleNavigation;if(!N)return true;if(!N.movementClear(to,to))return false;
    if(N.movementClear(from,to))return true;var path=N.findPath(from,to);
    return!!(path&&path.length&&dist(path[path.length-1].x,path[path.length-1].z,to.x,to.z)<=.35);
  }
  function findCover(s,battle,opts){
    opts=opts||{};var target=opts.threat||s.target;if(!target)return null;
    var p=posOf(s),forward=opts.forward||null,candidates=coverCandidates(s,battle,target,opts.maxRange||COVER_RANGE),best=null,bestScore=-Infinity;
    for(var i=0;i<candidates.length;i++){
      var pt=candidates[i],moveD=pt.distance;
      if(root.BattleAssaultForwardGuard&&!root.BattleAssaultForwardGuard.allowCover(s,battle,pt))continue;
      if(root.BattleMovementProgress&&!root.BattleMovementProgress.candidateAllowed(s,battle,pt))continue;
      var anchor=s.orderDestination||s.squad&&s.squad.orderAnchor;
      if(s.role==='captain'&&anchor&&dist(pt.x,pt.z,anchor.x,anchor.z)>18)continue;
      if(dist(pt.x,pt.z,posOf(target).x,posOf(target).z)<(opts.minEnemyDistance||12))continue;
      var score=(1-pt.quality)*40-moveD;
      if(forward)score+=((pt.x-p.x)*forward.x+(pt.z-p.z)*forward.z)*.9;
      if(score<=bestScore||!reachable(p,pt))continue;bestScore=score;best=pt;
    }
    var incumbent=state(s).state==='bound'&&state(s).cover,claim=currentCover(s,battle);
    if(best&&incumbent&&claim&&!opts.forward&&incumbent.quality<=USEFUL_COVER&&
       (!root.BattleMovementProgress||root.BattleMovementProgress.candidateAllowed(s,battle,incumbent))){
      var incumbentScore=(1-incumbent.quality)*40-dist(p.x,p.z,incumbent.x,incumbent.z);
      if(bestScore<incumbentScore+4)return incumbent;
    }
    if(best&&!reserveCover(s,battle,best.slot,'engagement'))return null;
    return best;
  }

  /* ---- fire discipline --------------------------------------------------------------------- */

  function movingTooFast(s){return!!(s.moving&&(s.moveSpeed||0)>Math.max(.16,(s.speed||1)*MOVE_FIRE_FRACTION));}
  function fireAllowed(s,battle){
    var e=state(s);
    if(!s.target||s.target.dead||s.reloading)return false;
    if(battle.time<e.fireReadyAt)return false;
    if(movingTooFast(s)||s.crawling)return false;
    if(facingError(s,posOf(s.target))>AIM_CONE)return false;
    if(s.role==='gunner'&&!s.setUp&&e.state==='engage')return false;   // the gun gets emplaced first
    return true;
  }
  function tryFire(s,battle){
    if(!fireAllowed(s,battle))return false;
    var d=dist(posOf(s).x,posOf(s).z,posOf(s.target).x,posOf(s.target).z);
    if(d>roleOf(s).engageRange)return false;
    SA().tryFire(s,battle);
    return true;
  }

  /* Rounds into a known position. Facing and settling still gate it, so a man turns onto the
     sector before he fires into it. */
  function suppress(s,battle,point){
    var e=state(s);
    if(!point||s.reloading||movingTooFast(s)||s.crawling)return false;
    if(battle.time<e.burstPauseUntil||battle.time<e.fireReadyAt)return false;
    if(facingError(s,point)>AIM_CONE)return false;
    if(!SA().areaFire(s,point,battle))return false;
    e.burstLeft=(e.burstLeft||SUPPRESS_BURST)-1;
    if(e.burstLeft<=0){e.burstLeft=SUPPRESS_BURST;e.burstPauseUntil=battle.time+SUPPRESS_PAUSE+jitter(s,.2);}
    return true;
  }

  /* ---- transitions ------------------------------------------------------------------------- */

  function enter(s,battle,next,seconds,why){
    var e=state(s);
    if(e.state!==next){
      /* A gun that leaves its firing position has to be emplaced again before it counts as set up. */
      if(next!=='engage'&&next!=='station')e.setUpSince=0;
      e.state=next;e.since=battle.time;
      e.moveReason=why||next;
      if(next!=='assault')e.assaultGoal=null;
      if(why)telemetry(battle,'decision-engagement',{soldier:s.id,faction:s.faction,role:s.role,squad:s.squad&&s.squad.id,state:next,why:why});
    }
    e.until=battle.time+(seconds||0);
  }
  /* Engagement describes combat movement; the Movement Resolver decides whether it wins. */
  function move(s,battle,p,kind,ttl){
    var reason=state(s).moveReason||state(s).state;
    if(root.BattleMovementResolver)return root.BattleMovementResolver.proposeCombat(s,p,battle,kind,ttl,{source:'engagement',reason:reason});
    /* Isolated unit harness fallback: production loads the resolver before any AI tick. */
    s.destination={x:p.x,z:p.z};s._navCache=null;return null;
  }
  function holdPosition(s,battle){var p=posOf(s);move(s,battle,{x:p.x,z:p.z},'hold');}
  function orderPoint(s){
    if(s._fireteamDestination)return s._fireteamDestination;
    if(s.orderDestination)return s.orderDestination;
    return SA().formationSlot(s.squad,s,s.slotIndex);
  }
  function followOrders(s,battle,urgent){
    /* Captain already published this persistent order. Micro relinquishes combat authority;
       it must not republish the Captain's point once per soldier tick. */
    if(root.BattleMovementResolver)return;
    var pt=orderPoint(s);
    SA().setDestination(s,pt,battle,!!urgent);
  }
  function squadForward(s){
    var sq=s.squad;if(!sq)return null;
    var goal=sq.objective||sq.home,anchor=sq.orderAnchor||sq.rally;if(!goal||!anchor)return null;
    var dx=goal.x-anchor.x,dz=goal.z-anchor.z,len=Math.hypot(dx,dz);
    return len>.1?{x:dx/len,z:dz/len}:null;
  }

  /* One Captain permission produces one displacement. Cover and a no-cover rush use the same
     engagement lifecycle, so target flicker cannot create a second, invisible movement drill. */
  function orderedBound(s,battle){
    var e=state(s),sq=s.squad;
    if(!e.boundOrder||!sq||!sq._assaultAuthorized||battle.time>=(sq._boundUntil||0))return false;
    if(s.role==='gunner'||s.reloading||s.clearingStoppage||s.outOfAmmo||s.suppressedUntil>battle.time)return false;
    e.boundOrder=false;
    var threat=s.target,known=knownThreat(s,battle);
    if(!threat&&known)threat={root:{position:known}};
    var cover=findCover(s,battle,{maxRange:COVER_RANGE_UNDER_FIRE,forward:squadForward(s),threat:threat});
    if(cover){e.cover=cover;enter(s,battle,'bound',Math.max(3,cover.distance/Math.max(.6,s.speed*.6)+2),'authorized fireteam bound: cover');bound(s,battle);return true;}
    var p=posOf(s),goal=sq.objective||sq.home,dx=goal&&goal.x-p.x,dz=goal&&goal.z-p.z,len=Math.hypot(dx,dz);
    if(!isFinite(len)||len<=BOUND_ARRIVED)return false;
    var step=Math.min(BOUND_METERS,len),next={x:p.x+dx/len*step,z:p.z+dz/len*step};
    if(root.BattleMovementProgress&&!root.BattleMovementProgress.candidateAllowed(s,battle,next))return false;
    enter(s,battle,'assault',Math.max(0,sq._boundUntil-battle.time),'authorized fireteam bound');
    e.assaultGoal=next;assault(s,battle);return true;
  }

  /* ---- per-soldier update ------------------------------------------------------------------ */

  function updateSoldier(s,battle){
    var e=state(s),role=roleOf(s),now=battle.time;
    currentCover(s,battle);

    if(s.target){
      e.contactAt=e.state==='advance'||e.state==='alert'?now:e.contactAt;
      e.lastSeen={x:posOf(s.target).x,z:posOf(s.target).z};e.lastSeenAt=now;
      var sector=threatSector(s,s.target);
      if(e.threatSector!=null&&sectorDistance(e.threatSector,sector)>1){
        /* A threat from a materially different direction is a fresh problem: re-orient. */
        e.fireReadyAt=Math.max(e.fireReadyAt,now+AIM_SETTLE);
        if(e.state==='engage'||e.state==='pinned')enter(s,battle,'orient',REACT[s.role]||.7,'new threat sector');
      }
      e.threatSector=sector;
    }

    /* Squad withdrawal and claimed building stations outrank every individual drill. Both go
       through enter() so the state is honest: the squad counters and the operator readout read it,
       and a man coming off a retreat re-decides instead of resuming a stale firefight state. */
    if(s.squad&&s.squad.state==='retreat'){enter(s,battle,'withdraw',0,'squad withdrawing');return withdraw(s,battle);}
    if(root.BattleTacticalPositions&&root.BattleTacticalPositions.update(s,battle)){enter(s,battle,'station',0,'firing station');return station(s,battle);}

    switch(e.state){
      case'orient':return orient(s,battle);
      case'bound':return bound(s,battle);
      case'engage':return engage(s,battle);
      case'pinned':return pinned(s,battle);
      case'assault':return assault(s,battle);
      case'alert':return alert(s,battle);
      default:return advance(s,battle);
    }
  }

  function advance(s,battle){
    var e=state(s);
    s.state='advance';s.setUp=false;
    if(orderedBound(s,battle))return;
    if(s.target){enter(s,battle,'orient',reactTime(s,battle),'contact');return orient(s,battle);}
    if(!holdStance(s,battle))commitStance(s,battle,'stand',1.0);
    followOrders(s,battle,false);
  }

  /* Recognize, stop, face the threat, weapon up. No shooting during this window - this is the
     beat that was missing and that made the old behavior read as "aiming while strolling". */
  function orient(s,battle){
    var e=state(s);
    s.state='engage';
    if(!s.target){enter(s,battle,'alert',ALERT_HOLD,'target lost');return alert(s,battle);}
    holdPosition(s,battle);
    commitStance(s,battle,'crouch',Math.max(.8,e.until-battle.time));
    e.fireReadyAt=Math.max(e.fireReadyAt,e.since+(REACT[s.role]||.7));
    if(battle.time>=e.until)decide(s,battle,'oriented');
  }

  /* The one place that answers "so what do I do about this enemy?". */
  function decide(s,battle,why){
    var e=state(s),F=field(),p=posOf(s),target=s.target;
    if(!target){enter(s,battle,'alert',ALERT_HOLD,'no target');return;}
    var d=dist(p.x,p.z,posOf(target).x,posOf(target).z),role=roleOf(s);
    var here=F?F.coverPotentialAt(battle.obstacles,p.x,p.z):1;
    var suppressed=s.suppressedUntil>battle.time;

    if(suppressed&&here>OPEN_COVER&&PRONE_ROLES[s.role]){enter(s,battle,'pinned',0,'pinned in the open');return pinned(s,battle);}
    if(here<=USEFUL_COVER){enter(s,battle,'engage',0,why+': cover here');return engage(s,battle);}

    var cover=findCover(s,battle,{maxRange:suppressed?COVER_RANGE_UNDER_FIRE:COVER_RANGE});
    if(cover){
      e.cover=cover;
      enter(s,battle,'bound',Math.max(3,cover.distance/Math.max(.6,s.speed*.6)+2.5),why+': moving to cover');
      telemetry(battle,'decision-cover',{soldier:s.id,faction:s.faction,role:s.role,squad:s.squad&&s.squad.id,distance:+cover.distance.toFixed(1),quality:+cover.quality.toFixed(2),coverType:cover.type,suppressed:suppressed});
      return bound(s,battle);
    }
    /* Nothing to hide behind. Closing the distance is only sane with an order to do it; otherwise
       go to ground and shoot from where he is. */
    enter(s,battle,'engage',0,why+': fight from the open');
    return engage(s,battle);
  }

  function bound(s,battle){
    var e=state(s),cover=e.cover;
    s.state='engage';s.setUp=false;
    if(!cover){decide(s,battle,'bound without cover');return;}
    /* Structured recovery consumed here: repeated no-progress against this cover flags it
       unreachable, so abandon the bound and re-decide (alternate cover or fight from here)
       instead of cycling the same destination forever. */
    if(s._movementGoalUnreachable){
      s._movementGoalUnreachable=false;
      if(root.BattleMovementProgress)root.BattleMovementProgress.noteFailure(s,battle,cover,'bound-unreachable');
      decide(s,battle,'bound unreachable');return;
    }
    if(cover&&root.BattleMovementProgress&&!root.BattleMovementProgress.candidateAllowed(s,battle,cover)){decide(s,battle,'cover suppressed');return;}
    var p=posOf(s),d=dist(p.x,p.z,cover.x,cover.z);
    if(d<=(cover.slotId ? .35 : COVER_ARRIVED)){
      if(root.BattleMovementProgress)root.BattleMovementProgress.clearFailuresNear(s,battle,cover);
      holdPosition(s,battle);
      enter(s,battle,'engage',0,'reached cover');
      return engage(s,battle);
    }
    var suppressed=s.suppressedUntil>battle.time,crawl=suppressed&&d<14&&PRONE_ROLES[s.role];
    commitStance(s,battle,crawl?'crawl':'crouch',Math.max(1,e.until-battle.time));
    move(s,battle,{x:cover.x,z:cover.z},'cover-bound');
  }

  function engage(s,battle){
    var e=state(s),p=posOf(s);
    s.state='engage';
    if(orderedBound(s,battle))return;
    if(!s.target){enter(s,battle,'alert',ALERT_HOLD,'target lost');return alert(s,battle);}
    var suppressed=s.suppressedUntil>battle.time,F=field(),here=F?F.coverPotentialAt(battle.obstacles,p.x,p.z):1;
    if(suppressed&&here>OPEN_COVER&&PRONE_ROLES[s.role]){enter(s,battle,'pinned',0,'pinned');return pinned(s,battle);}

    var d=dist(p.x,p.z,posOf(s.target).x,posOf(s.target).z);
    holdPosition(s,battle);
    if(!holdStance(s,battle))commitStance(s,battle,fightingStance(s,battle,d,here));
    if(s.role==='gunner'){
      if(!e.setUpSince)e.setUpSince=battle.time;
      s.setUp=battle.time-e.setUpSince>GUNNER_SETUP;
    }else s.setUp=false;
    tryFire(s,battle);
    if(battle.time>=(e.reviewAt||0)){e.reviewAt=battle.time+ENGAGE_REVIEW+jitter(s,.3);if(here>OPEN_COVER)decide(s,battle,'review');}
  }

  /* Suppressed in the open: flat, still, and only shooting in the gaps between bursts. */
  function pinned(s,battle){
    var e=state(s);
    s.state='pinned';s.setUp=false;
    holdPosition(s,battle);
    commitStance(s,battle,PRONE_ROLES[s.role]?'prone':'crouch',PRONE_HOLD);
    if(s.suppressedUntil-battle.time<.4)tryFire(s,battle);
    if(s.suppressedUntil<=battle.time){
      if(!s.target){enter(s,battle,'alert',ALERT_HOLD,'suppression lifted, no target');return alert(s,battle);}
      decide(s,battle,'suppression lifted');
    }
  }

  function assault(s,battle){
    var e=state(s);
    s.state='assault';s.setUp=false;
    /* A committed rush is locomotion, not aim: losing sight for a beat must not cancel it.
       Aim tracking (target/lastSeen) may flicker, but the assaultGoal stands until arrival,
       the window lapses, or recovery reports it unreachable. Only a rush that never had a
       live target/goal falls back to alert. */
    if((!s.target||s.target.dead)&&!e.assaultGoal){enter(s,battle,'alert',ALERT_HOLD,'target lost before rush');return alert(s,battle);}
    if(s._movementGoalUnreachable){
      s._movementGoalUnreachable=false;
      if(root.BattleMovementProgress&&e.assaultGoal)root.BattleMovementProgress.noteFailure(s,battle,e.assaultGoal,'assault-unreachable');
      enter(s,battle,'engage',0,'assault unreachable');return engage(s,battle);
    }
    var p=posOf(s),hasTarget=!!(s.target&&!s.target.dead),t=hasTarget?posOf(s.target):null,d=t?dist(p.x,p.z,t.x,t.z):Infinity;
    commitStance(s,battle,'crouch',Math.max(1,e.until-battle.time));
    if(!e.assaultGoal){if(!t){enter(s,battle,'alert',ALERT_HOLD,'assault target unavailable');return alert(s,battle);}e.assaultGoal={x:p.x+(t.x-p.x)*.55,z:p.z+(t.z-p.z)*.55};}
    var arrived=Math.hypot(p.x-e.assaultGoal.x,p.z-e.assaultGoal.z)<=BOUND_ARRIVED;
    if(arrived||d<12||battle.time>=e.until){enter(s,battle,'engage',0,'assault complete');return engage(s,battle);}
    s._combatUrgentUntil=battle.time+.5;
    move(s,battle,e.assaultGoal,'assault-rush');
    if(hasTarget)tryFire(s,battle);
  }

  /* Contact broken. Hold the sector briefly rather than instantly resuming the march, which is
     what produced the old "walk, aim, walk, aim" cycle. */
  function alert(s,battle){
    var e=state(s);
    s.state='alert';s.setUp=false;
    if(orderedBound(s,battle))return;
    if(s.target){enter(s,battle,'orient',reactTime(s,battle)*.6,'re-acquired');return orient(s,battle);}
    holdPosition(s,battle);
    if(!holdStance(s,battle))commitStance(s,battle,'crouch',2.0);
    /* The squad's shared contact outranks this man's own last sighting: somebody else may have
       eyes on right now. */
    var aim=knownThreat(s,battle);
    s._faceHint=aim&&facingError(s,aim)>AIM_CONE?aim:null;
    if(e.suppressOrder&&aim){
      /* A designated suppressor holds the firing line for as long as the contact is current,
         rather than wandering off mid-burst when the alert timer lapses. */
      e.until=Math.max(e.until,battle.time+SUPPRESS_HOLD);
      s.state='suppress';
      suppress(s,battle,aim);
    }
    if(battle.time>=e.until){e.cover=null;e.threatSector=null;s._faceHint=null;e.suppressOrder=false;enter(s,battle,'advance',0,'sector clear');}
  }

  function withdraw(s,battle){
    var e=state(s);
    s.state='retreat';s.setUp=false;e.cover=null;
    commitStance(s,battle,'stand',.5);
    followOrders(s,battle,true);
    if(s.target&&dist(posOf(s).x,posOf(s).z,posOf(s.target).x,posOf(s.target).z)<35)tryFire(s,battle);
  }

  function station(s,battle){
    var e=state(s),t=root.BattleTacticalPositions.current(s),st=t.position;
    s.state='hardpoint';s._faceHint=t.threatSector;
    var p=posOf(s),d=dist(p.x,p.z,st.x,st.z);
    commitStance(s,battle,'crouch',2.0);
    // Keep the station intent even when occupied; a short-lived hold proposal cannot return him
    // to formation when engagement updates are staggered.
    move(s,battle,{x:st.x,z:st.z},'firing-station');
    if(d<=.35){
      if(s.role==='gunner'){if(!e.setUpSince)e.setUpSince=battle.time;s.setUp=battle.time-e.setUpSince>GUNNER_SETUP;}
      if(s.target){var tp=posOf(s.target),dx=tp.x-st.windowX,dz=tp.z-st.windowZ,len=Math.hypot(dx,dz)||1;
        if((dx*st.normalX+dz*st.normalZ)/len>=.25)tryFire(s,battle);}
    }else s.setUp=false;
  }

  /* ---- per-squad update ------------------------------------------------------------------- */

  /* Who puts fire on the last known position. Preference order: the machine gun first (it is the
     suppressive weapon and it is already static), then whoever was doing it last tick so the job
     does not hop around the squad, then by slot. Men who can see a target of their own, men who
     are moving, pinned, withdrawing or holding a firing station are all excluded - and during a
     bound the movers never double as the base of fire. */
  function assignSuppressors(sq,battle,members,known){
    var contact=known!==undefined?known:(SA().squadContact?SA().squadContact(sq,battle):null),i,s,chosen=0;
    for(i=0;i<members.length;i++){s=members[i];if(!s.dead)state(s).suppressOrder=false;}
    if(contact){
      var bounding=battle.time<(sq._boundUntil||0),candidates=[];
      var point={x:contact.x,z:contact.z},api=SA();
      for(i=0;i<members.length;i++){
        s=members[i];
        if(s.dead||s.target||(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s))||(root.BattleAmmunition&&!root.BattleAmmunition.available(s)))continue;
        if(s.suppressedUntil>battle.time)continue;
        var es=state(s);
        if(es.state==='bound'||es.state==='pinned'||es.state==='withdraw'||es.state==='assault')continue;
        if(bounding&&es.boundOrder)continue;
        /* No job for a man who cannot reach it - he keeps advancing instead of standing still. */
        if(api.canSuppress&&!api.canSuppress(s,point,battle))continue;
        candidates.push(s);
      }
      candidates.sort(function(a,b){
        var ga=a.role==='gunner'?0:1,gb=b.role==='gunner'?0:1;
        if(ga!==gb)return ga-gb;
        var sa=state(a).suppressOrder?0:1,sb=state(b).suppressOrder?0:1;
        if(sa!==sb)return sa-sb;
        return(+a.slotIndex||0)-(+b.slotIndex||0);
      });
      for(i=0;i<candidates.length&&chosen<MAX_SUPPRESSORS;i++){state(candidates[i]).suppressOrder=true;chosen++;}
    }
    if(chosen!==(sq.suppressorCount||0)&&(chosen||sq.suppressorCount))
      telemetry(battle,'decision-suppress',{faction:sq.faction,squad:sq.id,suppressors:chosen,contactAge:contact?+(battle.time-contact.at).toFixed(1):null});
    sq.suppressorCount=chosen;
    return chosen;
  }

  /* Squad contact report. Micro state flows up: who can see the enemy, who is pinned, who is
     actually putting rounds out (the base of fire). The Captain (16-squad-plan-stability.js) reads
     this report to decide fire and movement; Engagement only executes a bound it is ordered to. */
  function updateSquad(sq,battle){
    if(!sq||!battle)return null;
    var members=sq.members||[],contact=0,effective=0,pinnedCount=0,fireSupport=[],i,s;
    /* Suppression is assigned off the shared contact, not off current visibility, so it keeps
       working in the gap where nobody can see anyone - which is exactly when a squad used to fall
       silent. Assigning before the counting below means a suppressor counts toward this tick's
       base of fire rather than the previous one's. */
    var known=SA().squadContact?SA().squadContact(sq,battle):null;
    var suppressing=assignSuppressors(sq,battle,members,known);
    for(i=0;i<members.length;i++){
      s=members[i];if(s.dead)continue;
      var e=state(s);
      if(s.target)contact++;
      if(e.state==='pinned'||s.suppressedUntil>battle.time)pinnedCount++;
      /* A man putting rounds on the known position IS the base of fire - that is the entire point
         of him doing it. Counting only men with a visible target meant a squad whose line of sight
         kept blinking could never satisfy the bound requirement and simply stopped advancing. */
      else if(!s.reloading&&!s.clearingStoppage&&(!root.BattleAmmunition||root.BattleAmmunition.available(s))){
        var position=root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s);
        if(e.state==='engage'||(e.state==='station'&&position&&position.occupiedAt!=null)||e.suppressOrder){effective++;fireSupport.push(s);}
      }
    }
    sq.contactCount=contact;sq.pinnedCount=pinnedCount;sq.effectiveCount=effective;
    var wasInContact=!!sq.inContact;
    /* In contact means shooting at somebody or shooting at where they are - NOT merely knowing a
       position exists. One blink of line of sight used to clear the firefight state and reset the
       bound cycle, so a squad trading fire through a hedgerow behaved as if the battle had ended
       every couple of seconds; but counting bare knowledge instead deadlocks the field. A squad
       that knows about an enemy 220 m away can neither shoot at it nor bound toward it (a bound
       needs a base of fire), so it would freeze in place forever. Suppressor assignment already
       answers the question that matters - can anybody here actually put rounds on it - so that is
       the test. Out of reach means keep advancing until it is in reach. */
    sq.inContact=contact>0||suppressing>0;
    var started=sq.inContact&&!wasInContact;
    if(started){sq.contactSince=battle.time;telemetry(battle,'decision-contact',{faction:sq.faction,squad:sq.id,phase:sq.commandPhase||'',contacts:contact});}
    if(!sq.inContact)sq.contactSince=null;
    return{contactStarted:started,effective:effective,pinned:pinnedCount,fireSupport:fireSupport};
  }
  /* The Captain's bound order, stored as Micro state and consumed once by orderedBound(). */
  function orderBound(movers){for(var i=0;i<movers.length;i++){var e=state(movers[i]);e.boundOrder=true;e.suppressOrder=false;}}
  function clearBoundOrders(sq){var a=sq&&sq.members||[];for(var i=0;i<a.length;i++)if(!a[i].dead)state(a[i]).boundOrder=false;}

  function resetSoldier(s){
    s.eng=null;s._faceHint=null;s.prone=false;s.crawling=false;s.tacticalCrouch=false;s.setUp=false;
  }
  function resetSquad(sq){
    sq.inContact=false;sq.contactSince=null;sq.contactCount=0;sq.contact=null;sq.suppressorCount=0;
  }

  root.BattleCoverPositions={warm:function(battle){var c=coverRegistry(battle);if(!c.slots)buildCoverSlots(c);return c.slotCount;},candidates:coverCandidates,reserve:reserveCover,release:releaseCover,current:currentCover,snapshot:coverSnapshot,spacing:COVER_SPACING};

  root.BattleEngagement={
    updateSoldier:updateSoldier,updateSquad:updateSquad,orderBound:orderBound,clearBoundOrders:clearBoundOrders,decide:decide,
    suppress:suppress,assignSuppressors:assignSuppressors,reactTime:reactTime,knownThreat:knownThreat,
    findCover:findCover,threatSector:threatSector,sectorDistance:sectorDistance,
    facingError:facingError,fireAllowed:fireAllowed,commitStance:commitStance,applyStance:applyStance,
    resetSoldier:resetSoldier,resetSquad:resetSquad,stateOf:state,
    tuning:{REACT:REACT,AIM_CONE:AIM_CONE,ALERT_HOLD:ALERT_HOLD,COVER_RANGE:COVER_RANGE,BOUND_METERS:BOUND_METERS,USEFUL_COVER:USEFUL_COVER,OPEN_COVER:OPEN_COVER,
      MAX_SUPPRESSORS:MAX_SUPPRESSORS,SUPPRESS_BURST:SUPPRESS_BURST,SUPPRESS_PAUSE:SUPPRESS_PAUSE,PREWARNED_REACT:PREWARNED_REACT}
  };
  if(typeof console!=='undefined')console.log('[ENGAGE] state/fire owner loaded; combat locomotion proposed to the Movement Resolver');
})(typeof window!=='undefined'?window:globalThis);
