/* Final movement authority for the Battle AI.

   Squad Orders provides stable command INTENT. Engagement can temporarily require a halt, cover
   bound, assault rush, or firing station. Neither writes `soldier.destination` directly: this
   resolver selects one winning intent, lets the tactical-route layer substitute a survival-aware
   waypoint when needed, and remains the sole writer of the physical destination.
*/
(function(root){
  'use strict';

  var ORDER_COMMIT=1.35,COMBAT_TTL=.75,ORDER_EPS=2.4,ARRIVAL=1.8;
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function distance(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
  function now(battle){return battle&&isFinite(+battle.time)?+battle.time:0;}
  function state(s){if(!s._movementResolver)s._movementResolver={order:null,combat:null,last:null,changes:0,combatWins:0,orderWins:0,stickyCombatWins:0,tacticalWins:0};return s._movementResolver;}
  function proposal(owner,pt,battle,kind,urgent,ttl){pt=point(pt);if(!pt)return null;return{owner:owner,point:pt,kind:kind||owner,urgent:!!urgent,issuedAt:now(battle),until:now(battle)+(ttl==null?Infinity:ttl)};}
  function proposeOrder(soldier,next,battle,urgent){
    if(!soldier)return null;var p=point(next);if(!p)return null;
    soldier.orderDestination={x:p.x,z:p.z};var st=state(soldier);st.order=proposal('squad-orders',p,battle,'formation',urgent,Infinity);return st.order;
  }
  function proposeCombat(soldier,next,battle,kind,ttl){if(!soldier)return null;var st=state(soldier),p=proposal('engagement',next,battle,kind||'combat',true,ttl==null?COMBAT_TTL:ttl);if(p)st.combat=p;return p;}

  /* Some combat destinations are STATE commitments, not momentary hints. Their short TTL exists as
     a dead-writer safety net, but it must not dump a man back onto his formation slot merely because
     simulation time advanced faster than the engagement writer refreshed the proposal. That exact
     expiry/fallback cycle produced the visible left-right "Duck Hunt" oscillation under fire.

     Keep only destinations whose owning tactical state is still unquestionably active. Once the
     state changes, ordinary TTL/order selection resumes immediately, so stale combat goals cannot
     drag a soldier after the state machine has moved on. */
  function stickyCombatActive(soldier,combat){
    if(!soldier||!combat)return false;
    var e=soldier.eng||{},kind=String(combat.kind||'');
    if(kind==='cover-bound')return e.state==='bound';
    if(kind==='assault-rush')return e.state==='assault';
    if(kind==='assault-bound-push')return!!soldier._assaultBoundPush;
    if(kind==='reload-hold')return!!soldier.reloading;
    return false;
  }
  function choose(soldier,battle){
    var st=state(soldier),t=now(battle),combat=st.combat;
    var P=root.BattleTacticalPositions,task=P&&P.update(soldier,battle);
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
    if(combat&&(combat.until+1e-6>=t||stickyCombatActive(soldier,combat))){
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
    var routed=tacticalWaypoint(soldier,battle,pick),physical=point(routed&&routed.point)||pick.point;
    // A window stand point needs finer placement than a marching formation slot. Tactical door/cover
    // waypoints are also precise: they should not be skipped because they are only ~2 m apart.
    var epsilon=(pick.kind==='firing-station'||routed)?.1:ORDER_EPS;
    var current=point(soldier.destination),atCurrent=current&&distance({x:+soldier.root.position.x,z:+soldier.root.position.z},current)<ARRIVAL,changed=!current||distance(current,physical)>epsilon,canChange=pick.urgent||!!routed||atCurrent||now(battle)>=(soldier._destinationCommitUntil||0);
    if(changed&&canChange){
      /* Provenance records command/combat intent separately from the tactical waypoint. The captain
         still owns where the man ultimately needs to end up; local survival owns the next step. */
      soldier._movementResolvedOwner='movement-resolver';soldier._movementProposalOwner=pick.owner;soldier._movementTacticalReason=routed&&routed.reason||null;soldier.destination={x:physical.x,z:physical.z};soldier._navCache=null;soldier._destinationCommitUntil=now(battle)+ORDER_COMMIT+(soldier.slotIndex%3)*.22;st.changes++;
    }
    if(routed)st.tacticalWins++;
    st.last={owner:pick.owner,kind:pick.kind,issuedAt:pick.issuedAt,until:pick.until,point:{x:physical.x,z:physical.z},intentPoint:{x:pick.point.x,z:pick.point.z},tacticalReason:routed&&routed.reason||null,tacticalStep:routed?{index:routed.step,total:routed.total}:null};
    if(pick.owner==='engagement'||pick.owner==='tactical-positions')st.combatWins++;else st.orderWins++;
    return st.last;
  }
  function resetSoldier(soldier){if(soldier){delete soldier._movementResolver;delete soldier._movementTacticalReason;delete soldier._tacticalRoute;}}
  function summary(sim){var out={orders:0,combat:0,byKind:{},changed:0,stickyCombatWins:0,tacticalWins:0},roster=sim&&sim._roster||{};['us','ge'].forEach(function(f){(roster[f]||[]).forEach(function(s){if(!s||s.dead)return;var st=s._movementResolver,last=st&&st.last;if(!last)return;out.changed+=st.changes||0;out.stickyCombatWins+=st.stickyCombatWins||0;out.tacticalWins+=st.tacticalWins||0;if(last.owner==='engagement'||last.owner==='tactical-positions')out.combat++;else out.orders++;out.byKind[last.kind]=(out.byKind[last.kind]||0)+1;});});return out;}
  root.BattleMovementResolver={version:'1.2-tactical-waypoints',orderCommit:ORDER_COMMIT,combatTTL:COMBAT_TTL,proposeOrder:proposeOrder,proposeCombat:proposeCombat,resolve:resolve,resetSoldier:resetSoldier,summary:summary};
  console.log('[MOVE] final resolver: command intent -> survival-aware tactical waypoint -> physical destination');
})(typeof window!=='undefined'?window:globalThis);
