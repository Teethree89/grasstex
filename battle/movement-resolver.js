/* Final movement authority for the Battle AI.

   Squad Orders provides stable command INTENT. Engagement can temporarily require a halt, cover
   bound, assault rush, or firing station. Neither writes `soldier.destination` directly: this
   resolver selects one winning intent, lets the tactical-route layer substitute a survival-aware
   waypoint when needed, and remains the sole writer of the physical destination.
*/
(function(root){
  'use strict';

  var ORDER_COMMIT=1.35,COMBAT_TTL=.75,ORDER_EPS=2.4,ARRIVAL=1.8,ORDER_WRITE_EPS=.05;
  var PRECISE_GOALS={'firing-station':1,'reload-hold':1,'hold':1,'contact-reaction':1};
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function distance(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
  function now(battle){return battle&&isFinite(+battle.time)?+battle.time:0;}
  function state(s){if(!s._movementResolver)s._movementResolver={order:null,combat:null,last:null,changes:0,combatWins:0,orderWins:0,stickyCombatWins:0,tacticalWins:0};return s._movementResolver;}
  function signature(s){var q=s.squad||{};return[q.commandPhase||'',q.targetObjective||'',q._engagementPlan&&q._engagementPlan.serial||0,q.state==='retreat'?'retreat':''].join('|');}
  function priority(kind,s){return kind==='retreat'?100:kind==='regroup'?95:kind==='reload-hold'?90:kind==='firing-station'?80:kind==='assault-rush'?70:kind==='cover-bound'?60:kind==='contact-reaction'?55:kind==='hold'?(s.eng&&s.eng.state==='pinned'?85:50):20;}
  function tolerance(kind){return ['firing-station','hold','reload-hold','contact-reaction'].indexOf(kind)>=0?.1:ORDER_EPS;}
  function metrics(b){return b._movementGoalStats||(b._movementGoalStats={requests:0,actualChanges:0,equivalentRequestsIgnored:0,hysteresisRetains:0,lowerPriorityRejected:0,emergencyOverrides:0,formationShadowsIgnored:0,goalLegalizations:0,formationEndpointResolutions:0,tacticalWaypointBacktracks:0,blockedGoalFallbacks:0,illegalGoalsUnresolved:0,overridesByPriority:{},bySource:{}});}
  function count(b,key,source){var m=metrics(b);m[key]=(m[key]||0)+1;if(source){var row=m.bySource[source]||(m.bySource[source]={requests:0,changes:0});if(key==='requests')row.requests++;if(key==='actualChanges')row.changes++;}}
  function valid(s,p,b){
    if(!p||p.signature!==signature(s))return false;
    if(p.kind==='cover-bound')return s.eng&&s.eng.state==='bound';
    if(p.kind==='assault-rush')return s.eng&&s.eng.state==='assault';
    if(p.kind==='reload-hold')return!!(s.reloading||s.clearingStoppage);
    return p.until+1e-6>=now(b);
  }
  function proposal(owner,pt,battle,kind,urgent,ttl){pt=point(pt);if(!pt)return null;return{owner:owner,point:pt,kind:kind||owner,urgent:!!urgent,issuedAt:now(battle),until:now(battle)+(ttl==null?Infinity:ttl)};}

  /* One physical invariant: an authoritative movement point may not overlap a hard terrain
     footprint. If a producer asks for an impossible point, walk BACK toward the soldier along the
     incoming path/ray until the body-clearance envelope is clear. This is deterministic, keeps the
     point on the soldier's own side of a hedge, and avoids ring-searching a different side.

     It does not alter pathfinder margins or obstacle geometry. The physicality module remains the
     source of truth for hedge/tree/log/wall/rock footprints. */
  function projectBlockedPoint(soldier,battle,raw,metric,source){
    var p=point(raw);if(!p||!battle)return p;
    var N=root.BattleNavigation;if(!N||typeof N.movementClear!=='function'||N.movementClear(p,p))return p;
    var start=point(soldier&&soldier.root&&soldier.root.position);if(!start)return p;
    var total=distance(p,start);if(!isFinite(total)||total<.02)return p;

    var P=root.BattleNavigationPhysicality,overlaps=null,margin=P&&isFinite(+P.navMargin)?+P.navMargin:0;
    if(P&&typeof P.footprints==='function'&&typeof P.shapeContains==='function'){
      try{
        var fps=P.footprints(battle)||[];overlaps=[];
        for(var i=0;i<fps.length;i++)if(P.shapeContains(p,fps[i],margin))overlaps.push(fps[i]);
      }catch(_){overlaps=null;}
    }
    function at(d){var u=Math.max(0,Math.min(1,d/total));return{x:p.x+(start.x-p.x)*u,z:p.z+(start.z-p.z)*u};}
    function blocked(q){
      if(overlaps&&overlaps.length){
        for(var j=0;j<overlaps.length;j++)if(P.shapeContains(q,overlaps[j],margin))return true;
        return false;
      }
      return !N.movementClear(q,q);
    }

    var lo=0,hi=Math.min(.25,total),q=at(hi);
    while(hi<total&&blocked(q)){lo=hi;hi=Math.min(total,hi*2);q=at(hi);}
    if(blocked(q)){
      if(N.movementClear(start,start)){
        if(metric)count(battle,metric,source);count(battle,'blockedGoalFallbacks',source);
        return start;
      }
      count(battle,'illegalGoalsUnresolved',source);return p;
    }
    for(var k=0;k<12;k++){
      var mid=(lo+hi)*.5,mq=at(mid);
      if(blocked(mq))lo=mid;else hi=mid;
    }
    var d=Math.min(total,hi+.12),out=at(d);
    /* Leaving the originally-overlapped footprint may expose another adjacent footprint. Continue
       toward the already-valid soldier position until the actual shipping point test agrees. */
    while(d<total&&!N.movementClear(out,out)){d=Math.min(total,d+.12);out=at(d);}
    if(!N.movementClear(out,out)){
      if(N.movementClear(start,start)){out=start;count(battle,'blockedGoalFallbacks',source);}
      else{count(battle,'illegalGoalsUnresolved',source);return p;}
    }
    if(metric)count(battle,metric,source);
    return out;
  }

  function legalizeGoal(soldier,battle,raw,kind,source){
    var p=point(raw);if(!p||!battle||PRECISE_GOALS[kind])return p;
    var P=root.BattleNavigationPhysicality,out;
    /* Formation intent is Meso-owned and terrain-blind. Do not collapse it onto the soldier's
       current side of a hedge. Physical Navigation resolves a route-margin-clear endpoint while
       intentPoint keeps the Captain's original slot for ownership/provenance. */
    if(kind==='formation'&&P&&typeof P.resolveStandGoal==='function'){
      out=P.resolveStandGoal(battle,soldier,p);
      if(out&&distance(out,p)>ORDER_WRITE_EPS){
        count(battle,'goalLegalizations',source);count(battle,'formationEndpointResolutions',source);
        if(soldier)soldier._movementEndpointResolution={kind:'formation',intent:{x:p.x,z:p.z},point:{x:out.x,z:out.z},at:now(battle)};
      }else if(soldier)delete soldier._movementEndpointResolution;
      var N=root.BattleNavigation;
      if(out&&(!N||typeof N.movementClear!=='function'||N.movementClear(out,out)))return{x:out.x,z:out.z};
      /* No bounded stand point was available. Retain the old conservative safety fallback rather
         than ever publishing a body-illegal endpoint. */
      return projectBlockedPoint(soldier,battle,p,'goalLegalizations',source);
    }
    var cache=soldier&&soldier._movementLegalGoalCache;
    if(cache&&cache.kind===kind&&distance(cache.raw,p)<=ORDER_WRITE_EPS)return{x:cache.point.x,z:cache.point.z};
    out=projectBlockedPoint(soldier,battle,p,'goalLegalizations',source);
    if(soldier)soldier._movementLegalGoalCache={kind:kind,raw:{x:p.x,z:p.z},point:{x:out.x,z:out.z}};
    return out;
  }

  function proposeOrder(soldier,next,battle,urgent){
    if(!soldier)return null;var raw=point(next);if(!raw)return null;
    var st=state(soldier),team=point(soldier._fireteamDestination),source=team?'squad-stability':'squad-orders';count(battle,'requests',source);st.requests=(st.requests||0)+1;
    /* Squad Stability owns the soldier's formation intent once it has published a fireteam slot.
       The wrapped legacy issueOrders pass still computes an individual formation slot before the
       fireteam layer refreshes. That intermediate point is not a second order: ignore it instead
       of briefly overwriting orderDestination and forcing engagement to restore the real intent.
       Retreat/forced orders remain immediate; the fireteam writer runs later in the same squad tick. */
    if(team&&!urgent&&distance(raw,team)>ORDER_WRITE_EPS){count(battle,'formationShadowsIgnored');return st.order;}
    var sig=signature(soldier),old=st.order,cur=point(soldier.orderDestination),oldIntent=old&&point(old.intentPoint||old.point);
    if(old&&old.owner===source&&old.signature===sig&&oldIntent&&distance(oldIntent,raw)<=ORDER_WRITE_EPS&&cur&&distance(cur,old.point)<=ORDER_WRITE_EPS){old.urgent=!!urgent;old.until=Infinity;return old;}
    var p=legalizeGoal(soldier,battle,raw,'formation',source);
    if(!cur||distance(cur,p)>ORDER_WRITE_EPS)soldier.orderDestination={x:p.x,z:p.z};
    st.order=proposal(source,p,battle,'formation',urgent,Infinity);st.order.signature=sig;st.order.reason='squad intent';st.order.intentPoint={x:raw.x,z:raw.z};return st.order;
  }
  function proposeCombat(soldier,next,battle,kind,ttl,meta){
    if(!soldier)return null;meta=meta||{};var raw=point(next);if(!raw)return null;
    var st=state(soldier),source=meta.source||'engagement',p=proposal(source,raw,battle,kind||'combat',true,ttl==null?COMBAT_TTL:ttl);if(!p)return null;
    count(battle,'requests',source);st.requests=(st.requests||0)+1;p.signature=signature(soldier);p.reason=meta.reason||kind;p.score=meta.score;p.priority=priority(p.kind,soldier);p.intentPoint={x:raw.x,z:raw.z};
    var q=soldier.squad||{},old=st.combat;
    if(q.state==='retreat'||q.commandPhase==='retreat'){count(battle,'lowerPriorityRejected');return old;}
    var MP=root.BattleMovementProgress;
    if(MP&&MP.gatedKind(p.kind)&&!MP.candidateAllowed(soldier,battle,raw))return old;
    p.point=legalizeGoal(soldier,battle,raw,p.kind,source);
    if(old&&valid(soldier,old,battle)){
      if(p.priority<priority(old.kind,soldier)){count(battle,'lowerPriorityRejected');return old;}
      if(old.kind===p.kind&&old.owner===p.owner&&distance(old.point,p.point)<=tolerance(p.kind)){
        old.until=p.until;old.intentPoint={x:raw.x,z:raw.z};count(battle,'equivalentRequestsIgnored');return old;
      }
      if(!meta.material&&old.kind===p.kind&&isFinite(old.score)&&isFinite(p.score)&&p.score<old.score+4){count(battle,'hysteresisRetains');return old;}
    }
    st.combat=p;return p;
  }

  function choose(soldier,battle){
    var st=state(soldier),t=now(battle),combat=st.combat;
    var P=root.BattleTacticalPositions,task=P&&P.update(soldier,battle),sq=soldier.squad||{};
    if(sq.state==='retreat'||sq.commandPhase==='retreat'){
      if(st.goal&&st.goal.kind!=='retreat')count(battle,'emergencyOverrides');
      st.combat=null;var escape=st.order&&st.order.signature===signature(soldier)?st.order.point:sq.home||soldier.orderDestination;
      return proposal('squad-command',escape,battle,'retreat',true,Infinity);
    }
    if(sq.commandPhase==='regroup'){
      st.combat=null;return proposal('squad-command',st.order&&st.order.point||soldier.orderDestination||sq.rally,battle,'regroup',true,Infinity);
    }
    if(task){
      if(soldier.reloading||soldier.clearingStoppage){
        if(!st.positionPause)st.positionPause=point(soldier.root.position);
        return proposal('tactical-positions',st.positionPause,battle,'reload-hold',true,Infinity);
      }
      st.positionPause=null;
      return proposal('tactical-positions',task.position,battle,'firing-station',true,Infinity);
    }
    st.positionPause=null;
    if(P&&combat&&combat.kind==='firing-station'){st.combat=null;combat=null;}
    if(combat&&valid(soldier,combat,battle)){
      if(combat.until+1e-6<t)st.stickyCombatWins++;
      return combat;
    }
    if(combat)st.combat=null;
    return st.order||proposal('squad-orders',soldier.orderDestination,battle,'formation',false,Infinity);
  }
  function tacticalWaypoint(soldier,battle,pick){
    if(pick.kind==='firing-station'&&root.BattleTacticalPositions)return root.BattleTacticalPositions.waypoint(soldier,battle);
    var T=root.BattleTacticalRoute;if(!T||typeof T.resolve!=='function')return null;
    try{return T.resolve(soldier,battle,pick)||null;}catch(err){if(root.console&&console.warn)console.warn('[MOVE] tactical route failed',err);return null;}
  }
  function resolve(soldier,battle){
    if(!soldier||soldier.dead)return null;var st=state(soldier),pick=choose(soldier,battle);if(!pick)return null;
    pick.signature=signature(soldier);
    var previous=st.goal,oldValid=previous&&valid(soldier,previous,battle);
    if(previous&&previous.kind===pick.kind&&previous.signature===pick.signature&&distance(previous.point,pick.point)<=tolerance(pick.kind)){
      if(distance(previous.point,pick.point)>1e-6)count(battle,'equivalentRequestsIgnored');
      pick=Object.assign({},pick,{point:previous.point,issuedAt:previous.issuedAt});
    }
    st.goal=pick;

    var MP=root.BattleMovementProgress,advice=MP&&MP.observe?MP.observe(soldier,battle,pick.point,pick):null;
    if(advice&&advice.rebuild){soldier._navCache=null;soldier._physicalPath=null;var TR=root.BattleTacticalRoute;if(TR&&TR.cancel)TR.cancel(soldier,battle);}
    if(soldier._movementGoalUnreachable&&pick.kind==='formation'){soldier._movementGoalUnreachable=false;soldier._navCache=null;soldier._physicalPath=null;}

    var routed=tacticalWaypoint(soldier,battle,pick),rawPhysical=point(routed&&routed.point)||pick.point;
    /* Tactical routing is allowed to substitute a cover/door waypoint, but it is not allowed to
       reintroduce an impossible endpoint after the high-level goal was legalized. Clamp the FINAL
       point too. If it came from a committed tactical plan, rewrite that plan step to the clamped
       point so the route can actually complete instead of returning to the same bad point forever. */
    var physical=projectBlockedPoint(soldier,battle,rawPhysical,routed?'tacticalWaypointBacktracks':null,pick.owner);
    if(routed&&distance(rawPhysical,physical)>ORDER_WRITE_EPS){
      var plan=soldier._tacticalRoute,idx=isFinite(+routed.step)?+routed.step:(plan&&isFinite(+plan.index)?+plan.index:null);
      if(plan&&plan.steps&&idx!=null&&plan.steps[idx])plan.steps[idx]={x:physical.x,z:physical.z};
      routed.point={x:physical.x,z:physical.z};
    }

    var epsilon=(routed||!previous||previous.kind!==pick.kind)?.1:tolerance(pick.kind);
    var current=point(soldier.destination),atCurrent=current&&distance({x:+soldier.root.position.x,z:+soldier.root.position.z},current)<ARRIVAL,changed=!current||distance(current,physical)>epsilon,canChange=pick.urgent||!!routed||atCurrent||now(battle)>=(soldier._destinationCommitUntil||0);
    if(changed&&canChange){
      count(battle,'actualChanges',pick.owner);
      var pk=String(priority(pick.kind,soldier));metrics(battle).overridesByPriority[pk]=(metrics(battle).overridesByPriority[pk]||0)+1;
      var route=soldier._physicalPath,trace={time:now(battle),soldier:soldier.id,oldDestination:current,newDestination:physical,source:pick.owner,reason:pick.reason||pick.kind,kind:pick.kind,priority:priority(pick.kind,soldier),commandPhase:soldier.squad&&soldier.squad.commandPhase,engagementState:soldier.eng&&soldier.eng.state,oldGoalValid:!!oldValid,previousRoute:route?{createdAt:route.createdAt,blocked:route.blocked,remaining:route.points&&route.points.length}:null,inContact:!!(soldier.squad&&soldier.squad.inContact),localAvoidance:!!(soldier._movementYieldUntil>now(battle)||soldier._separatedAt>now(battle)-1),destinationDistanceDelta:current?distance(soldier.root.position,physical)-distance(soldier.root.position,current):null};
      (st.history||(st.history=[])).push(trace);if(st.history.length>32)st.history.shift();
      soldier._movementResolvedOwner='movement-resolver';soldier._movementProposalOwner=pick.owner;soldier._movementTacticalReason=routed&&routed.reason||null;soldier.destination={x:physical.x,z:physical.z};soldier._navCache=null;soldier._destinationCommitUntil=now(battle)+ORDER_COMMIT+(soldier.slotIndex%3)*.22;st.changes++;
    }
    if(routed)st.tacticalWins++;
    var intent=point(pick.intentPoint)||pick.point;
    st.last={owner:pick.owner,kind:pick.kind,reason:pick.reason||pick.kind,oldGoalValid:!!oldValid,issuedAt:pick.issuedAt,until:pick.until,point:{x:physical.x,z:physical.z},intentPoint:{x:intent.x,z:intent.z},tacticalReason:routed&&routed.reason||null,tacticalStep:routed?{index:routed.step,total:routed.total}:null};
    if(pick.owner==='engagement'||pick.owner==='tactical-positions')st.combatWins++;else st.orderWins++;
    return st.last;
  }
  function resetSoldier(soldier){if(soldier){delete soldier._movementResolver;delete soldier._movementTacticalReason;delete soldier._tacticalRoute;delete soldier._movementLegalGoalCache;delete soldier._movementEndpointResolution;}}
  function summary(sim){
    var out=Object.assign({orders:0,combat:0,byKind:{},changed:0,stickyCombatWins:0,tacticalWins:0,bySoldier:[],highestChurnSoldier:null},metrics(sim)),roster=sim&&sim._roster||{},active=0;
    ['us','ge'].forEach(function(f){(roster[f]||[]).forEach(function(s){var st=s._movementResolver;if(!st)return;out.changed+=st.changes||0;
      var row={id:s.id,faction:f,changes:st.changes||0,requests:st.requests||0};out.bySoldier.push(row);if(!out.highestChurnSoldier||row.changes>out.highestChurnSoldier.changes)out.highestChurnSoldier=row;
      if(!s.dead){active++;var last=st.last;if(last){if(last.kind==='formation')out.orders++;else out.combat++;out.byKind[last.kind]=(out.byKind[last.kind]||0)+1;}out.stickyCombatWins+=st.stickyCombatWins||0;out.tacticalWins+=st.tacticalWins||0;}
    });});
    out.averageChangesPerActiveSoldier=active?out.bySoldier.filter(function(r){return(roster[r.faction]||[]).some(function(s){return s.id===r.id&&!s.dead;});}).reduce(function(n,r){return n+r.changes;},0)/active:0;
    return JSON.parse(JSON.stringify(out));
  }
  root.BattleMovementResolver={version:'2.0-goal-authority-v128-overlap-backtrack',signature:signature,priority:priority,tolerance:tolerance,orderCommit:ORDER_COMMIT,combatTTL:COMBAT_TTL,proposeOrder:proposeOrder,proposeCombat:proposeCombat,resolve:resolve,resetSoldier:resetSoldier,summary:summary};
  console.log('[MOVE] v128 resolver: blocked endpoints backtrack toward the incoming path until clear');
})(typeof window!=='undefined'?window:globalThis);
