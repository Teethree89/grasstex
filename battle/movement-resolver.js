/* Final movement authority for the Battle AI.

   Squad Orders provides stable command INTENT. Engagement can temporarily require a halt, cover
   bound, assault rush, or firing station. Neither writes `soldier.destination` directly: this
   resolver selects one winning intent, lets the tactical-route layer substitute a survival-aware
   waypoint when needed, and remains the sole writer of the physical destination.
*/
(function(root){
  'use strict';

  var ORDER_COMMIT=1.35,COMBAT_TTL=.75,ORDER_EPS=2.4,ARRIVAL=1.8,ORDER_WRITE_EPS=.05;
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function distance(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
  function now(battle){return battle&&isFinite(+battle.time)?+battle.time:0;}
  function state(s){if(!s._movementResolver)s._movementResolver={order:null,combat:null,last:null,changes:0,combatWins:0,orderWins:0,stickyCombatWins:0,tacticalWins:0};return s._movementResolver;}
  function signature(s){var q=s.squad||{};return[q.commandPhase||'',q.targetObjective||'',q._engagementPlan&&q._engagementPlan.serial||0,q.state==='retreat'?'retreat':''].join('|');}
  function priority(kind,s){return kind==='retreat'?100:kind==='regroup'?95:kind==='reload-hold'?90:kind==='firing-station'?80:kind==='assault-rush'||kind==='assault-bound-push'?70:kind==='cover-bound'?60:kind==='contact-reaction'?55:kind==='hold'?(s.eng&&s.eng.state==='pinned'?85:50):20;}
  function tolerance(kind){return ['firing-station','hold','reload-hold','contact-reaction'].indexOf(kind)>=0?.1:ORDER_EPS;}
  function metrics(b){return b._movementGoalStats||(b._movementGoalStats={requests:0,actualChanges:0,equivalentRequestsIgnored:0,hysteresisRetains:0,lowerPriorityRejected:0,emergencyOverrides:0,orderNoopRetains:0,shadowedFormationRequestsIgnored:0,overridesByPriority:{},bySource:{}});}
  function count(b,key,source){var m=metrics(b);m[key]=(m[key]||0)+1;if(source){var row=m.bySource[source]||(m.bySource[source]={requests:0,changes:0});if(key==='requests')row.requests++;if(key==='actualChanges')row.changes++;}}
  function valid(s,p,b){
    if(!p||p.signature!==signature(s))return false;
    if(p.kind==='cover-bound')return s.eng&&s.eng.state==='bound';
    if(p.kind==='assault-rush')return s.eng&&s.eng.state==='assault';
    if(p.kind==='assault-bound-push')return!!s._assaultBoundPush;
    if(p.kind==='reload-hold')return!!(s.reloading||s.clearingStoppage);
    return p.until+1e-6>=now(b);
  }
  function proposal(owner,pt,battle,kind,urgent,ttl){pt=point(pt);if(!pt)return null;return{owner:owner,point:pt,kind:kind||owner,urgent:!!urgent,issuedAt:now(battle),until:now(battle)+(ttl==null?Infinity:ttl)};}
  function proposeOrder(soldier,next,battle,urgent){
    if(!soldier)return null;var p=point(next);if(!p)return null;
    var st=state(soldier),team=point(soldier._fireteamDestination),sq=soldier.squad||{},shadowed=!!(team&&sq._fireteamOrderOwnerActive&&!urgent&&distance(p,team)>ORDER_WRITE_EPS);
    var source=shadowed?'squad-orders':(team?'squad-stability':'squad-orders');count(battle,'requests',source);st.requests=(st.requests||0)+1;
    /* While Squad Stability owns a committed fireteam slot, the wrapped legacy issueOrders pass
       still computes a raw individual formation slot. That raw value is an input, not a second
       owner. Letting it overwrite orderDestination for a few microsteps before the fireteam layer
       restores the slot produced the engagement <-> squad-stability writer ping-pong seen in v129. */
    if(shadowed){
      count(battle,'shadowedFormationRequestsIgnored');
      if(st.order)return st.order;
      p=team;source='squad-stability';
    }
    var sig=signature(soldier),old=st.order,cur=point(soldier.orderDestination);
    if(old&&old.owner===source&&old.signature===sig&&distance(old.point,p)<=ORDER_WRITE_EPS&&cur&&distance(cur,p)<=ORDER_WRITE_EPS){
      old.urgent=!!urgent;old.until=Infinity;count(battle,'orderNoopRetains');return old;
    }
    if(!cur||distance(cur,p)>ORDER_WRITE_EPS)soldier.orderDestination={x:p.x,z:p.z};
    st.order=proposal(source,p,battle,'formation',urgent,Infinity);st.order.signature=sig;st.order.reason='squad intent';return st.order;
  }
  function proposeCombat(soldier,next,battle,kind,ttl,meta){
    if(!soldier)return null;meta=meta||{};var st=state(soldier),source=meta.source||'engagement',p=proposal(source,next,battle,kind||'combat',true,ttl==null?COMBAT_TTL:ttl);if(!p)return null;
    count(battle,'requests',source);st.requests=(st.requests||0)+1;p.signature=signature(soldier);p.reason=meta.reason||kind;p.score=meta.score;p.priority=priority(p.kind,soldier);
    var q=soldier.squad||{},old=st.combat;
    if(q.state==='retreat'||q.commandPhase==='retreat'){count(battle,'lowerPriorityRejected');return old;}
    /* Short-lived failed-candidate memory: a cover/bound point this soldier repeatedly failed to
       reach stays proposed by engagement until it re-decides, so retain the incumbent instead of
       recommitting to the suppressed candidate. Kinds with no alternative never consult it. */
    var MP=root.BattleMovementProgress;
    if(MP&&MP.gatedKind(p.kind)&&!MP.candidateAllowed(soldier,battle,next))return old;
    if(old&&valid(soldier,old,battle)){
      if(p.priority<priority(old.kind,soldier)){count(battle,'lowerPriorityRejected');return old;}
      if(old.kind===p.kind&&old.owner===p.owner&&distance(old.point,p.point)<=tolerance(p.kind)){
        old.until=p.until;count(battle,'equivalentRequestsIgnored');return old;
      }
      if(!meta.material&&old.kind===p.kind&&isFinite(old.score)&&isFinite(p.score)&&p.score<old.score+4){count(battle,'hysteresisRetains');return old;}
    }
    st.combat=p;return p;
  }

  /* Some combat destinations are STATE commitments, not momentary hints. Their short TTL exists as
      a dead-writer safety net, but it must not dump a man back onto his formation slot merely because
      simulation time advanced faster than the engagement writer refreshed the proposal. That exact
      expiry/fallback cycle produced the visible left-right "Duck Hunt" oscillation under fire.

      Keep only destinations whose owning tactical state is still unquestionably active (see valid()
      above). Once the state changes, ordinary TTL/order selection resumes immediately, so stale
      combat goals cannot drag a soldier after the state machine has moved on. */
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
    /* Progress tracking and graduated stuck recovery. Round 1-2 advice rebuilds the physical route
       to the same goal; round 3 flags the goal unreachable for the owning subsystem to abandon.
       Formation intent has no other owner, so consume the flag here with a fresh plan. */
    var MP=root.BattleMovementProgress,advice=MP&&MP.observe?MP.observe(soldier,battle,pick.point,pick):null;
    if(advice&&advice.rebuild){soldier._navCache=null;soldier._physicalPath=null;var TR=root.BattleTacticalRoute;if(TR&&TR.cancel)TR.cancel(soldier,battle);}
    if(soldier._movementGoalUnreachable&&pick.kind==='formation'){soldier._movementGoalUnreachable=false;soldier._navCache=null;soldier._physicalPath=null;}
    var routed=tacticalWaypoint(soldier,battle,pick),physical=point(routed&&routed.point)||pick.point;
    // A window stand point needs finer placement than a marching formation slot. Tactical door/cover
    // waypoints are also precise: they should not be skipped because they are only ~2 m apart.
    var epsilon=(routed||!previous||previous.kind!==pick.kind)?.1:tolerance(pick.kind);
    var current=point(soldier.destination),atCurrent=current&&distance({x:+soldier.root.position.x,z:+soldier.root.position.z},current)<ARRIVAL,changed=!current||distance(current,physical)>epsilon,canChange=pick.urgent||!!routed||atCurrent||now(battle)>=(soldier._destinationCommitUntil||0);
    if(changed&&canChange){
      /* Provenance records command/combat intent separately from the tactical waypoint. The captain
         still owns where the man ultimately needs to end up; local survival owns the next step. */
      count(battle,'actualChanges',pick.owner);
      var pk=String(priority(pick.kind,soldier));metrics(battle).overridesByPriority[pk]=(metrics(battle).overridesByPriority[pk]||0)+1;
      var route=soldier._physicalPath,trace={time:now(battle),soldier:soldier.id,oldDestination:current,newDestination:physical,source:pick.owner,reason:pick.reason||pick.kind,kind:pick.kind,priority:priority(pick.kind,soldier),commandPhase:soldier.squad&&soldier.squad.commandPhase,engagementState:soldier.eng&&soldier.eng.state,oldGoalValid:!!oldValid,previousRoute:route?{createdAt:route.createdAt,blocked:route.blocked,remaining:route.points&&route.points.length}:null,inContact:!!(soldier.squad&&soldier.squad.inContact),localAvoidance:!!(soldier._movementYieldUntil>now(battle)||soldier._separatedAt>now(battle)-1),destinationDistanceDelta:current?distance(soldier.root.position,physical)-distance(soldier.root.position,current):null};
      (st.history||(st.history=[])).push(trace);if(st.history.length>32)st.history.shift();
      soldier._movementResolvedOwner='movement-resolver';soldier._movementProposalOwner=pick.owner;soldier._movementTacticalReason=routed&&routed.reason||null;soldier.destination={x:physical.x,z:physical.z};soldier._navCache=null;soldier._destinationCommitUntil=now(battle)+ORDER_COMMIT+(soldier.slotIndex%3)*.22;st.changes++;
    }
    if(routed)st.tacticalWins++;
    st.last={owner:pick.owner,kind:pick.kind,reason:pick.reason||pick.kind,oldGoalValid:!!oldValid,issuedAt:pick.issuedAt,until:pick.until,point:{x:physical.x,z:physical.z},intentPoint:{x:pick.point.x,z:pick.point.z},tacticalReason:routed&&routed.reason||null,tacticalStep:routed?{index:routed.step,total:routed.total}:null};
    if(pick.owner==='engagement'||pick.owner==='tactical-positions')st.combatWins++;else st.orderWins++;
    return st.last;
  }
  function resetSoldier(soldier){if(soldier){delete soldier._movementResolver;delete soldier._movementTacticalReason;delete soldier._tacticalRoute;}}
  function summary(sim){
    var out=Object.assign({orders:0,combat:0,byKind:{},changed:0,stickyCombatWins:0,tacticalWins:0,bySoldier:[],highestChurnSoldier:null},metrics(sim)),roster=sim&&sim._roster||{},active=0;
    ['us','ge'].forEach(function(f){(roster[f]||[]).forEach(function(s){var st=s._movementResolver;if(!st)return;out.changed+=st.changes||0;
      var row={id:s.id,faction:f,changes:st.changes||0,requests:st.requests||0};out.bySoldier.push(row);if(!out.highestChurnSoldier||row.changes>out.highestChurnSoldier.changes)out.highestChurnSoldier=row;
      if(!s.dead){active++;var last=st.last;if(last){if(last.kind==='formation')out.orders++;else out.combat++;out.byKind[last.kind]=(out.byKind[last.kind]||0)+1;}out.stickyCombatWins+=st.stickyCombatWins||0;out.tacticalWins+=st.tacticalWins||0;}
    });});
    out.averageChangesPerActiveSoldier=active?out.bySoldier.filter(function(r){return(roster[r.faction]||[]).some(function(s){return s.id===r.id&&!s.dead;});}).reduce(function(n,r){return n+r.changes;},0)/active:0;
    return JSON.parse(JSON.stringify(out));
  }
  root.BattleMovementResolver={version:'2.1-order-owner-gate',signature:signature,priority:priority,tolerance:tolerance,orderCommit:ORDER_COMMIT,combatTTL:COMBAT_TTL,proposeOrder:proposeOrder,proposeCombat:proposeCombat,resolve:resolve,resetSoldier:resetSoldier,summary:summary};
  console.log('[MOVE] final resolver: command intent -> survival-aware tactical waypoint -> physical destination');
})(typeof window!=='undefined'?window:globalThis);
