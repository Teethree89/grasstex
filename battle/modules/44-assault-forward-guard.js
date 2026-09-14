/* Assault forward-progress guard.
   Benchmark #11 showed the dominant low-progress pattern was a stable squad-level assault route
   with no route-index churn: squads were moving, but their centroid often drifted sideways or
   backward while in contact. Keep the strategic route authoritative while still allowing genuine
   combat overrides (holds, firing stations and assault rushes).

   Two deliberately narrow corrections live here:
     1. Assault formation/order proposals are compacted around the squad's forward axis and cannot
        ask an out-of-contact soldier to march materially backward just to recover his slot.
     2. A non-suppressed cover bound that would take a soldier >3 m backward relative to the
        squad's strategic axis is rejected for that tick. Suppressed men may still fall back to
        cover, and all other engagement proposals remain untouched.
*/
(function(root){
'use strict';
if(!root.BattleMovementResolver||root.BattleAssaultForwardGuard)return;

var MAX_LATERAL=22,MAX_FORMATION_BACK=7,MAX_ORDER_BACK_FROM_MAN=2,MAX_COVER_BACK=3;
var baseResolve=root.BattleMovementResolver.resolve;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function objectiveById(sim,id){var a=sim&&sim._objectives||[];for(var i=0;i<a.length;i++){var o=a[i];if(String(o&&o.id)===String(id)){var d=o.def||o,p=point(d);if(p)return p;}}return null;}
function axis(sim,sq){
  if(!sq)return null;
  var anchor=point(sq.orderAnchor)||point(sq.rally),goal=objectiveById(sim,sq.targetObjective)||point(sq._routeFinalObjective)||point(sq.objective);
  if(!anchor||!goal)return null;
  var dx=goal.x-anchor.x,dz=goal.z-anchor.z,len=Math.hypot(dx,dz);if(len<1)return null;
  return{anchor:anchor,fx:dx/len,fz:dz/len,rx:-dz/len,rz:dx/len};
}
function stats(sim){return sim._assaultForwardGuard||(sim._assaultForwardGuard={orderClamps:0,coverRejects:0,byFaction:{us:{orderClamps:0,coverRejects:0},ge:{orderClamps:0,coverRejects:0}}});}
function bump(sim,sq,kind){var st=stats(sim);st[kind]++;if(st.byFaction[sq.faction])st.byFaction[sq.faction][kind]++;}
function setProposalPoint(p,x,z){p.point={x:x,z:z};}
function compactOrder(sim,s,q,ax){
  var st=s&&s._movementResolver,p=st&&st.order,pt=p&&point(p.point);if(!pt)return;
  var dx=pt.x-ax.anchor.x,dz=pt.z-ax.anchor.z,forward=dx*ax.fx+dz*ax.fz,lateral=dx*ax.rx+dz*ax.rz;
  var nf=Math.max(-MAX_FORMATION_BACK,forward),nl=Math.max(-MAX_LATERAL,Math.min(MAX_LATERAL,lateral));
  var here=point(s.root&&s.root.position);
  if(here&&!q.inContact){
    var hx=here.x-ax.anchor.x,hz=here.z-ax.anchor.z,hf=hx*ax.fx+hz*ax.fz;
    nf=Math.max(nf,hf-MAX_ORDER_BACK_FROM_MAN);
  }
  if(Math.abs(nf-forward)<.01&&Math.abs(nl-lateral)<.01)return;
  setProposalPoint(p,ax.anchor.x+ax.fx*nf+ax.rx*nl,ax.anchor.z+ax.fz*nf+ax.rz*nl);
  if(s.orderDestination){s.orderDestination.x=p.point.x;s.orderDestination.z=p.point.z;}
  bump(sim,q,'orderClamps');
}
function rejectBackwardCover(sim,s,q,ax){
  var st=s&&s._movementResolver,p=st&&st.combat;if(!p||p.kind!=='cover-bound'||!p.point)return;
  if((+s.suppressedUntil||0)>(+sim.time||0))return; // genuine survival move: let him fall back
  var here=point(s.root&&s.root.position),pt=point(p.point);if(!here||!pt)return;
  var back=(pt.x-here.x)*ax.fx+(pt.z-here.z)*ax.fz;
  if(back>=-MAX_COVER_BACK)return;
  st.combat=null;bump(sim,q,'coverRejects');
}
function publish(sim){
  var st=stats(sim),out={orderClamps:st.orderClamps,coverRejects:st.coverRejects,byFaction:st.byFaction,maxLateral:MAX_LATERAL,maxFormationBack:MAX_FORMATION_BACK,maxOrderBackFromSoldier:MAX_ORDER_BACK_FROM_MAN,maxNonSuppressedCoverBack:MAX_COVER_BACK};
  sim._assaultForwardGuardSummary=JSON.parse(JSON.stringify(out));
  if(sim._coordinationHealth)sim._coordinationHealth.assaultForwardGuard=JSON.parse(JSON.stringify(out));
}
root.BattleMovementResolver.resolve=function(s,battle){
  if(s&&battle&&s.squad&&s.squad.commandPhase==='assault'&&s.squad.state!=='retreat'){
    var ax=axis(battle,s.squad);if(ax){compactOrder(battle,s,s.squad,ax);rejectBackwardCover(battle,s,s.squad,ax);}
    publish(battle);
  }
  return baseResolve.apply(this,arguments);
};
root.BattleAssaultForwardGuard={version:'1.0',summary:function(sim){return sim&&sim._assaultForwardGuardSummary?JSON.parse(JSON.stringify(sim._assaultForwardGuardSummary)):null;}};
console.log('[MOVE] assault forward guard active: compact formation + no casual backward cover bounds');
})(typeof window!=='undefined'?window:globalThis);
