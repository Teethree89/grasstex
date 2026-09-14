/* Assault forward-progress guard.
   Benchmark #15 stripped the regroup false positives out of Loop Watch and exposed the stubborn
   remainder: 991 pure-assault low-forward-progress alerts in both #14 and #15. Routes were stable;
   men were simply spending too much motion recovering wide slots or taking lateral cover.

   This guard keeps the strategic route authoritative while preserving genuine survival moves:
     1. Assault formation/order proposals are compacted around the forward axis. Out of contact the
        formation is especially narrow, so a man does not spend a whole window crossing the line.
     2. A non-suppressed cover bound must gain meaningful ground. Backward or almost-pure-lateral
        cover is rejected and the normal squad order wins that tick. Suppressed men may still fall
        back anywhere survival requires.
     3. Existing assault-rush, hold and firing-station combat proposals remain untouched. */
(function(root){
'use strict';
if(!root.BattleMovementResolver||root.BattleAssaultForwardGuard)return;

var MAX_LATERAL_CONTACT=22,MAX_LATERAL_ADVANCE=14,MAX_FORMATION_BACK=7,MAX_ORDER_BACK_FROM_MAN=2;
var MIN_COVER_FORWARD=1.5;
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
function fresh(){return{orderClamps:0,coverRejects:0,lateralCoverRejects:0,byFaction:{us:{orderClamps:0,coverRejects:0,lateralCoverRejects:0},ge:{orderClamps:0,coverRejects:0,lateralCoverRejects:0}}};}
function stats(sim){return sim._assaultForwardGuard||(sim._assaultForwardGuard=fresh());}
function bump(sim,sq,kind){var st=stats(sim);st[kind]++;if(st.byFaction[sq.faction])st.byFaction[sq.faction][kind]++;}
function setProposalPoint(p,x,z){p.point={x:x,z:z};}
function compactOrder(sim,s,q,ax){
  var st=s&&s._movementResolver,p=st&&st.order,pt=p&&point(p.point);if(!pt)return;
  var dx=pt.x-ax.anchor.x,dz=pt.z-ax.anchor.z,forward=dx*ax.fx+dz*ax.fz,lateral=dx*ax.rx+dz*ax.rz;
  var maxLat=q.inContact?MAX_LATERAL_CONTACT:MAX_LATERAL_ADVANCE;
  var nf=Math.max(-MAX_FORMATION_BACK,forward),nl=Math.max(-maxLat,Math.min(maxLat,lateral));
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
function rejectNonProgressCover(sim,s,q,ax){
  var st=s&&s._movementResolver,p=st&&st.combat;if(!p||p.kind!=='cover-bound'||!p.point)return;
  if((+s.suppressedUntil||0)>(+sim.time||0))return; // survival outranks advance
  var here=point(s.root&&s.root.position),pt=point(p.point);if(!here||!pt)return;
  var dx=pt.x-here.x,dz=pt.z-here.z,forward=dx*ax.fx+dz*ax.fz;
  if(forward>=MIN_COVER_FORWARD)return;
  st.combat=null;bump(sim,q,'coverRejects');if(forward>=-.25)bump(sim,q,'lateralCoverRejects');
}
function publish(sim){
  var st=stats(sim),out={orderClamps:st.orderClamps,coverRejects:st.coverRejects,lateralCoverRejects:st.lateralCoverRejects,byFaction:st.byFaction,maxLateralAdvance:MAX_LATERAL_ADVANCE,maxLateralContact:MAX_LATERAL_CONTACT,maxFormationBack:MAX_FORMATION_BACK,maxOrderBackFromSoldier:MAX_ORDER_BACK_FROM_MAN,minNonSuppressedCoverForward:MIN_COVER_FORWARD};
  sim._assaultForwardGuardSummary=JSON.parse(JSON.stringify(out));
  if(sim._coordinationHealth)sim._coordinationHealth.assaultForwardGuard=JSON.parse(JSON.stringify(out));
}
function reset(sim){sim._assaultForwardGuard=fresh();publish(sim);}
root.BattleMovementResolver.resolve=function(s,battle){
  if(s&&battle&&s.squad&&s.squad.commandPhase==='assault'&&s.squad.state!=='retreat'){
    var ax=axis(battle,s.squad);if(ax){compactOrder(battle,s,s.squad,ax);rejectNonProgressCover(battle,s,s.squad,ax);}
    publish(battle);
  }
  return baseResolve.apply(this,arguments);
};
if(root.BattleModules)root.BattleModules.registerSystem('assault-forward-guard',{version:'1.2',onBattleStart:reset,onBattleRestart:reset});
root.BattleAssaultForwardGuard={version:'1.2',summary:function(sim){return sim&&sim._assaultForwardGuardSummary?JSON.parse(JSON.stringify(sim._assaultForwardGuardSummary)):null;}};
console.log('[MOVE] assault forward guard v1.2: narrow advance + forward-only casual cover');
})(typeof window!=='undefined'?window:globalThis);
