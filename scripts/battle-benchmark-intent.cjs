/* Observational benchmark predicates, shared by the browser runner and node regressions. */
(function(root){
  'use strict';
  function distance(a,b){return !a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
  function live(sq){return sq&&sq.state!=='retreat'&&(sq.aliveCount!=null?sq.aliveCount>0:(sq.members||[]).some(s=>s&&!s.dead));}
  function routeActive(sq,pos){
    if(!live(sq)||sq.targetObjective)return false;
    const route=sq.route||[],index=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0)),wp=route[index];
    if(!wp||!Number.isFinite(wp.x)||!Number.isFinite(wp.z)||distance(sq.objective,wp)>3)return false;
    // At the terminal arrival region the commander must supply the next objective. Before that,
    // a stalled approach is a route-progress problem, not an absence of strategic intent.
    return index<route.length-1||distance(pos,wp)>32;
  }
  function targetless(sq,pos){
    return live(sq)&&!['support','reserve','garrison'].includes(sq.commandRole)&&sq.targetObjective==null&&!routeActive(sq,pos);
  }
  const api={routeActive,targetless};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.BattleBenchmarkIntent=api;
})(typeof window!=='undefined'?window:globalThis);
