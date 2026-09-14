/* Assault bound momentum.
   The engagement pipeline prefers genuine forward cover. When an authorized assault fireteam gets
   a bound turn but no suitable forward cover exists, engagement falls back to a hold. Benchmark
   #15's 991 pure-assault low-progress alerts showed that fallback was too common.

   During the active bound window only, the designated movers may replace that hold with one fixed
   short rush toward the strategic objective. The point is captured once per bound, so this is not
   a moving carrot. Suppressed/reloading/jammed men, gunners and firing-station occupants never get
   pushed; survival and the base of fire still win. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleEngagement||!root.BattleMovementResolver||root.BattleAssaultBoundMomentum)return;

var PUSH_METERS=9,ARRIVAL=1.4;
var oldUpdate=root.BattleEngagement.updateSoldier;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function strategicForward(s){
  var sq=s&&s.squad,here=point(s&&s.root&&s.root.position),goal=point(sq&&sq.objective);if(!sq||!here||!goal)return null;
  var dx=goal.x-here.x,dz=goal.z-here.z,len=Math.hypot(dx,dz);if(len<2)return null;return{x:dx/len,z:dz/len,distance:len};
}
function fresh(){return{pushes:0,completions:0,byFaction:{us:{pushes:0,completions:0},ge:{pushes:0,completions:0}}};}
function stats(sim){return sim._assaultBoundMomentum||(sim._assaultBoundMomentum=fresh());}
function bump(sim,s,kind){var st=stats(sim);st[kind]++;if(st.byFaction[s.faction])st.byFaction[s.faction][kind]++;}
function activeMover(s,battle){
  var sq=s&&s.squad,e=root.BattleEngagement.stateOf&&root.BattleEngagement.stateOf(s);if(!sq||!e)return false;
  if(s.dead||s.role==='gunner'||s._firingStation||s.reloading||s.clearingStoppage||s.outOfAmmo)return false;
  if((+s.suppressedUntil||0)>(+battle.time||0))return false;
  if(sq.commandPhase!=='assault'||!sq._assaultAuthorized||!sq.inContact)return false;
  if((+battle.time||0)>=(+sq._boundUntil||0))return false;
  if(s._fireteamKey&&sq._boundTeam&&s._fireteamKey!==sq._boundTeam)return false;
  var mr=s._movementResolver,combat=mr&&mr.combat;
  /* Genuine forward cover/rush/station already has a plan. We only replace engagement's hold. */
  return !!(combat&&combat.kind==='hold');
}
function push(s,battle){
  var sq=s.squad,f=strategicForward(s);if(!f)return;
  var token=+sq._boundUntil||0,run=s._assaultBoundPush,here=point(s.root.position);
  if(!run||run.token!==token){
    var step=Math.min(PUSH_METERS,Math.max(3,f.distance-1));run=s._assaultBoundPush={token:token,goal:{x:here.x+f.x*step,z:here.z+f.z*step},counted:false};
  }
  if(dist(here,run.goal)<=ARRIVAL){if(!run.completed){run.completed=true;bump(battle,s,'completions');}return;}
  if(!run.counted){run.counted=true;bump(battle,s,'pushes');}
  if(root.BattleEngagement.commitStance)root.BattleEngagement.commitStance(s,battle,'crouch',Math.max(.8,token-(+battle.time||0)));
  root.BattleMovementResolver.proposeCombat(s,run.goal,battle,'assault-bound-push',.8);
}
function publish(sim){var st=stats(sim),out=JSON.parse(JSON.stringify(st));out.pushMeters=PUSH_METERS;sim._assaultBoundMomentumSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.assaultBoundMomentum=JSON.parse(JSON.stringify(out));}
function reset(sim){sim._assaultBoundMomentum=fresh();publish(sim);}

root.BattleEngagement.updateSoldier=function(s,battle){var result=oldUpdate.apply(this,arguments);if(s&&battle&&activeMover(s,battle))push(s,battle);return result;};
root.BattleModules.registerSystem('assault-bound-momentum',{version:'1.0',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:publish});
root.BattleAssaultBoundMomentum={version:'1.0',summary:function(sim){return sim&&sim._assaultBoundMomentumSummary?JSON.parse(JSON.stringify(sim._assaultBoundMomentumSummary)):null;}};
console.log('[MOVE] assault fireteams make short objective-bound rushes when forward cover is unavailable');
})(typeof window!=='undefined'?window:globalThis);
