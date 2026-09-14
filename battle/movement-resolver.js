/* Final movement authority for the Battle AI.

   Squad Orders provides a stable formation/order point. Engagement can temporarily require a
   halt, cover bound, assault rush, or firing station. Neither writes `soldier.destination`
   directly: this resolver selects one proposal once per AI tick and owns that physical field.
*/
(function(root){
  'use strict';

  var ORDER_COMMIT=1.35,COMBAT_TTL=.75,ORDER_EPS=2.4,ARRIVAL=1.8;
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function distance(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
  function now(battle){return battle&&isFinite(+battle.time)?+battle.time:0;}
  function state(s){if(!s._movementResolver)s._movementResolver={order:null,combat:null,last:null,changes:0,combatWins:0,orderWins:0,stickyCombatWins:0};return s._movementResolver;}
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
    if(kind==='firing-station')return!!soldier._firingStation&&e.state==='station';
    if(kind==='reload-hold')return!!soldier.reloading;
    return false;
  }
  function choose(soldier,battle){
    var st=state(soldier),t=now(battle),combat=st.combat;
    if(combat&&(combat.until+1e-6>=t||stickyCombatActive(soldier,combat))){
      if(combat.until+1e-6<t)st.stickyCombatWins++;
      return combat;
    }
    if(combat)st.combat=null;
    return st.order||proposal('squad-orders',soldier.orderDestination,battle,'formation',false,Infinity);
  }
  function resolve(soldier,battle){
    if(!soldier||soldier.dead)return null;var st=state(soldier),pick=choose(soldier,battle);if(!pick)return null;
    // A window stand point needs finer placement than a marching formation slot.
    var epsilon=pick.kind==='firing-station'?.1:ORDER_EPS;
    var current=point(soldier.destination),atCurrent=current&&distance({x:+soldier.root.position.x,z:+soldier.root.position.z},current)<ARRIVAL,changed=!current||distance(current,pick.point)>epsilon,canChange=pick.urgent||atCurrent||now(battle)>=(soldier._destinationCommitUntil||0);
    if(changed&&canChange){
      /* Provenance records the resolver as the sole writer and keeps the winning proposal beside it. */
      soldier._movementResolvedOwner='movement-resolver';soldier._movementProposalOwner=pick.owner;soldier.destination={x:pick.point.x,z:pick.point.z};soldier._navCache=null;soldier._destinationCommitUntil=now(battle)+ORDER_COMMIT+(soldier.slotIndex%3)*.22;st.changes++;
    }
    st.last={owner:pick.owner,kind:pick.kind,issuedAt:pick.issuedAt,until:pick.until,point:{x:pick.point.x,z:pick.point.z}};
    if(pick.owner==='engagement')st.combatWins++;else st.orderWins++;
    return st.last;
  }
  function resetSoldier(soldier){if(soldier)delete soldier._movementResolver;}
  function summary(sim){var out={orders:0,combat:0,byKind:{},changed:0,stickyCombatWins:0},roster=sim&&sim._roster||{};['us','ge'].forEach(function(f){(roster[f]||[]).forEach(function(s){if(!s||s.dead)return;var st=s._movementResolver,last=st&&st.last;if(!last)return;out.changed+=st.changes||0;out.stickyCombatWins+=st.stickyCombatWins||0;if(last.owner==='engagement')out.combat++;else out.orders++;out.byKind[last.kind]=(out.byKind[last.kind]||0)+1;});});return out;}
  root.BattleMovementResolver={version:'1.1-sticky-combat-state',orderCommit:ORDER_COMMIT,combatTTL:COMBAT_TTL,proposeOrder:proposeOrder,proposeCombat:proposeCombat,resolve:resolve,resetSoldier:resetSoldier,summary:summary};
  console.log('[MOVE] final destination resolver loaded: active combat-state destinations do not expire back to formation');
})(typeof window!=='undefined'?window:globalThis);
