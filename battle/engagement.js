/* Individual engagement pipeline for the ww2fps AI lab.

   Before this file the per-soldier combat behavior was spread over four modules that each wrapped
   SquadAI.updateSoldier and each wrote soldier.destination / prone / tacticalCrouch on the same
   tick. The last writer won, so a soldier's visible behavior was "walk to a formation slot while
   pointing a rifle": nobody ever owned the decision to stop, get down and fight.

   This module is that single owner. Exactly one state machine decides, per soldier per AI tick,
   where he is going, what stance he holds and whether he may pull the trigger. Other modules feed
   it inputs (squad plans, fireteam slots, claimed building firing stations) instead of overriding
   its output.

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
  var CLAIM_SECONDS=14;
  /* A position is "in the open" when the best stance available there still leaves the soldier
     nearly fully exposed. */
  var OPEN_COVER=.92,USEFUL_COVER=.88;
  var PRONE_ROLES={rifleman:1,gunner:1};
  var BOUND_CYCLE=9.0,BOUND_DURATION=3.6,BOUND_TEAMS=['alpha','bravo','charlie'];
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

  function claimedByOther(squad,ob,s,battle){
    var claims=squad&&squad._coverClaims;if(!claims)return false;
    for(var i=claims.length-1;i>=0;i--){
      var c=claims[i];
      if(c.until<battle.time){claims.splice(i,1);continue;}
      if(c.ob===ob&&c.id!==s.id)return true;
    }
    return false;
  }
  function claim(squad,ob,s,battle){
    if(!squad)return;
    var claims=squad._coverClaims||(squad._coverClaims=[]);
    for(var i=claims.length-1;i>=0;i--)if(claims[i].id===s.id)claims.splice(i,1);
    claims.push({ob:ob,id:s.id,until:battle.time+CLAIM_SECONDS});
  }
  function coverPointBehind(ob,threat){
    var t=posOf(threat),dx=ob.x-t.x,dz=ob.z-t.z,len=Math.hypot(dx,dz)||1,pad=(+ob.radius||1)+.9;
    return{x:ob.x+dx/len*pad,z:ob.z+dz/len*pad};
  }
  function reachable(from,to){
    if(!root.BattleNavigation)return true;
    if(root.BattleNavigation.movementClear(from,to))return true;
    var path=root.BattleNavigation.findPath(from,to);
    return!!(path&&path.length);
  }
  /* Picks the cover an actual soldier would pick: close, genuinely protective against THIS threat
     direction, not already taken by a squadmate, and - during a bound - forward of where he is. */
  function findCover(s,battle,opts){
    opts=opts||{};
    var F=field();if(!F)return null;
    var target=opts.threat||s.target;if(!target)return null;
    var p=posOf(s),maxRange=opts.maxRange||COVER_RANGE,forward=opts.forward||null;
    var candidates=F.nearby(battle.obstacles,p.x,p.z,maxRange),best=null,bestScore=-Infinity;
    for(var i=0;i<candidates.length;i++){
      var ob=candidates[i],height=F.obstacleHeight(ob);
      if(height<.5||(ob.cover==null?1:+ob.cover)>USEFUL_COVER)continue;
      if(claimedByOther(s.squad,ob,s,battle))continue;
      var pt=coverPointBehind(ob,target),moveD=dist(p.x,p.z,pt.x,pt.z);
      if(moveD>maxRange)continue;
      var quality=F.coverPotentialAt(battle.obstacles,pt.x,pt.z);
      if(quality>USEFUL_COVER)continue;
      var enemyD=dist(pt.x,pt.z,posOf(target).x,posOf(target).z);
      if(enemyD<(opts.minEnemyDistance||12))continue;   /* never 'take cover' by running into his lap */
      var score=(1-quality)*40-moveD*1.0;
      if(forward)score+=((pt.x-p.x)*forward.x+(pt.z-p.z)*forward.z)*.9;
      if(score<=bestScore)continue;
      if(!reachable({x:p.x,z:p.z},pt))continue;
      bestScore=score;best={x:pt.x,z:pt.z,quality:quality,distance:moveD,obstacle:ob,type:ob.type||'cover'};
    }
    if(best)claim(s.squad,best.obstacle,s,battle);
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
      if(why)telemetry(battle,'decision-engagement',{soldier:s.id,faction:s.faction,role:s.role,squad:s.squad&&s.squad.id,state:next,why:why});
    }
    e.until=battle.time+(seconds||0);
  }
  /* Engagement supplies a short-lived combat proposal; the resolver owns the physical destination. */
  function move(s,battle,p,kind,ttl){if(root.BattleMovementResolver)return root.BattleMovementResolver.proposeCombat(s,p,battle,kind,ttl);s.destination={x:p.x,z:p.z};s._navCache=null;return null;}
  function holdPosition(s,battle){var p=posOf(s);move(s,battle,{x:p.x,z:p.z},'hold');}
  function orderPoint(s){
    if(s._fireteamDestination)return s._fireteamDestination;
    if(s.orderDestination)return s.orderDestination;
    return SA().formationSlot(s.squad,s,s.slotIndex);
  }
  function followOrders(s,battle,urgent){
    var pt=orderPoint(s);
    SA().setDestination(s,pt,battle,!!urgent);
  }
  function squadForward(s){
    var sq=s.squad;if(!sq)return null;
    var goal=sq.objective||sq.home,anchor=sq.orderAnchor||sq.rally;if(!goal||!anchor)return null;
    var dx=goal.x-anchor.x,dz=goal.z-anchor.z,len=Math.hypot(dx,dz);
    return len>.1?{x:dx/len,z:dz/len}:null;
  }

  /* ---- per-soldier update ------------------------------------------------------------------ */

  function updateSoldier(s,battle){
    var e=state(s),role=roleOf(s),now=battle.time;

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
    if(s._firingStation){enter(s,battle,'station',0,'firing station');return station(s,battle);}

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
    if(d<Math.min(45,role.engageRange*.4)&&s.squad&&s.squad._assaultAuthorized){enter(s,battle,'assault',3.0,why+': assault, no cover');return assault(s,battle);}
    enter(s,battle,'engage',0,why+': fight from the open');
    return engage(s,battle);
  }

  function bound(s,battle){
    var e=state(s),cover=e.cover;
    s.state='engage';s.setUp=false;
    if(!cover){decide(s,battle,'bound without cover');return;}
    var p=posOf(s),d=dist(p.x,p.z,cover.x,cover.z);
    if(d<=COVER_ARRIVED||battle.time>=e.until){
      holdPosition(s,battle);
      enter(s,battle,'engage',0,d<=COVER_ARRIVED?'reached cover':'bound timed out');
      return engage(s,battle);
    }
    var suppressed=s.suppressedUntil>battle.time,crawl=suppressed&&d<14&&PRONE_ROLES[s.role];
    commitStance(s,battle,crawl?'crawl':'crouch',Math.max(1,e.until-battle.time));
    move(s,battle,{x:cover.x,z:cover.z},'cover-bound');
  }

  function engage(s,battle){
    var e=state(s),p=posOf(s);
    s.state='engage';
    if(!s.target){enter(s,battle,'alert',ALERT_HOLD,'target lost');return alert(s,battle);}
    var suppressed=s.suppressedUntil>battle.time,F=field(),here=F?F.coverPotentialAt(battle.obstacles,p.x,p.z):1;
    if(suppressed&&here>OPEN_COVER&&PRONE_ROLES[s.role]){enter(s,battle,'pinned',0,'pinned');return pinned(s,battle);}

    /* An authorized bound is the only thing that moves a firing soldier forward. */
    if(e.boundOrder&&battle.time<(s.squad&&s.squad._boundUntil||0)){
      e.boundOrder=false;
      var forwardCover=findCover(s,battle,{maxRange:COVER_RANGE_UNDER_FIRE,forward:squadForward(s)});
      if(forwardCover){e.cover=forwardCover;enter(s,battle,'bound',Math.max(3,forwardCover.distance/Math.max(.6,s.speed*.6)+2),'bounding forward');return bound(s,battle);}
    }

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
    if(!s.target){enter(s,battle,'alert',ALERT_HOLD,'target lost');return alert(s,battle);}
    var p=posOf(s),t=posOf(s.target),d=dist(p.x,p.z,t.x,t.z);
    commitStance(s,battle,'crouch',Math.max(1,e.until-battle.time));
    move(s,battle,{x:p.x+(t.x-p.x)*.55,z:p.z+(t.z-p.z)*.55},'assault-rush');
    if(d<12||battle.time>=e.until){enter(s,battle,'engage',0,'assault complete');return engage(s,battle);}
    tryFire(s,battle);
  }

  /* Contact broken. Hold the sector briefly rather than instantly resuming the march, which is
     what produced the old "walk, aim, walk, aim" cycle. */
  function alert(s,battle){
    var e=state(s);
    s.state='alert';s.setUp=false;
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
    var e=state(s),st=root.BattleNavigation&&root.BattleNavigation.firingDirective(s,s.target);
    if(!st){root.BattleNavigation&&root.BattleNavigation.releaseFiringPosition(s);enter(s,battle,'orient',.3,'station lost');return;}
    s.state='hardpoint';
    var p=posOf(s),d=dist(p.x,p.z,st.x,st.z);
    commitStance(s,battle,'crouch',2.0);
    if(d<.75){
      holdPosition(s,battle);
      if(s.role==='gunner'){if(!e.setUpSince)e.setUpSince=battle.time;s.setUp=battle.time-e.setUpSince>GUNNER_SETUP;}
      tryFire(s,battle);
    }else move(s,battle,{x:st.x,z:st.z},'firing-station');
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
        if(s.dead||s.target||s._firingStation)continue;
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

  /* Fire and movement: a squad in contact stops walking, shoots, and then moves one fireteam at a
     time. Without this the commander kept marching the whole squad through a firefight. */
  function updateSquad(sq,battle){
    if(!sq||!battle)return;
    var members=sq.members||[],contact=0,effective=0,pinnedCount=0,i,s;
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
      else if(e.state==='engage'||e.state==='station'||e.suppressOrder)effective++;
    }
    sq.contactCount=contact;sq.pinnedCount=pinnedCount;sq.effectiveCount=effective;
    /* A bound order that was not taken up inside its window is stale, not pending. */
    if(battle.time>=(sq._boundUntil||0))for(i=0;i<members.length;i++)if(!members[i].dead)state(members[i]).boundOrder=false;
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
    if(sq.inContact&&!wasInContact){sq.contactSince=battle.time;sq._boundUntil=0;sq._nextBoundAt=battle.time+BOUND_CYCLE;
      telemetry(battle,'decision-contact',{faction:sq.faction,squad:sq.id,phase:sq.commandPhase||'',contacts:contact});}
    if(!sq.inContact){sq.contactSince=null;sq._boundUntil=0;sq._assaultAuthorized=false;return;}

    var phase=sq.commandPhase||'';
    sq._assaultAuthorized=phase==='assault'||phase==='capture'||phase==='clear-town';

    /* A bound needs a base of fire: somebody has to be shooting while somebody else moves. */
    if(battle.time>=(sq._nextBoundAt||0)&&battle.time>=(sq._boundUntil||0)&&effective>=2&&pinnedCount<effective){
      var team=BOUND_TEAMS[(sq._boundTurn=(sq._boundTurn==null?0:sq._boundTurn+1))%BOUND_TEAMS.length];
      sq._boundTeam=team;sq._boundUntil=battle.time+BOUND_DURATION;sq._nextBoundAt=battle.time+BOUND_CYCLE;
      var ordered=0;
      for(i=0;i<members.length;i++){
        s=members[i];if(s.dead||s.suppressedUntil>battle.time)continue;
        if(s.role==='gunner')continue;                                  // the gun holds the base of fire
        if(s._fireteamKey&&s._fireteamKey!==team)continue;
        state(s).boundOrder=true;ordered++;
      }
      if(ordered)telemetry(battle,'decision-bound',{faction:sq.faction,squad:sq.id,team:team,movers:ordered,holding:effective-ordered});
    }
  }

  function resetSoldier(s){
    s.eng=null;s._faceHint=null;s.prone=false;s.crawling=false;s.tacticalCrouch=false;s.setUp=false;
  }
  function resetSquad(sq){
    sq.inContact=false;sq.contactSince=null;sq.contactCount=0;sq.contact=null;sq.suppressorCount=0;sq._boundUntil=0;sq._nextBoundAt=0;
    sq._boundTeam=null;sq._boundTurn=null;sq._coverClaims=null;sq._assaultAuthorized=false;
  }

  root.BattleEngagement={
    updateSoldier:updateSoldier,updateSquad:updateSquad,decide:decide,
    suppress:suppress,assignSuppressors:assignSuppressors,reactTime:reactTime,knownThreat:knownThreat,
    findCover:findCover,threatSector:threatSector,sectorDistance:sectorDistance,
    facingError:facingError,fireAllowed:fireAllowed,commitStance:commitStance,applyStance:applyStance,
    resetSoldier:resetSoldier,resetSquad:resetSquad,stateOf:state,
    tuning:{REACT:REACT,AIM_CONE:AIM_CONE,ALERT_HOLD:ALERT_HOLD,COVER_RANGE:COVER_RANGE,BOUND_CYCLE:BOUND_CYCLE,BOUND_DURATION:BOUND_DURATION,USEFUL_COVER:USEFUL_COVER,OPEN_COVER:OPEN_COVER,
      MAX_SUPPRESSORS:MAX_SUPPRESSORS,SUPPRESS_BURST:SUPPRESS_BURST,SUPPRESS_PAUSE:SUPPRESS_PAUSE,PREWARNED_REACT:PREWARNED_REACT}
  };
  if(typeof console!=='undefined')console.log('[ENGAGE] contact pipeline loaded: orient -> cover -> aimed fire -> bound');
})(typeof window!=='undefined'?window:globalThis);
