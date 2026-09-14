/* Assault bound momentum.
   A designated assault fireteam should not stop simply because no perfect piece of forward cover
   exists. Once a no-cover push starts, keep ONE fixed short objective-directed goal for the whole
   bound window instead of alternating between engagement's hold and a new rush every AI tick.

   Suppression, reloads/stoppages, retreat and firing stations immediately cancel the push. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleEngagement||!root.BattleMovementResolver||root.BattleAssaultBoundMomentum)return;

var PUSH_METERS=6.5,ARRIVAL=1.25;
var oldUpdate=root.BattleEngagement.updateSoldier;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function strategicForward(s){
  var sq=s&&s.squad,here=point(s&&s.root&&s.root.position),goal=point(sq&&sq.objective);if(!sq||!here||!goal)return null;
  var dx=goal.x-here.x,dz=goal.z-here.z,len=Math.hypot(dx,dz);if(len<2)return null;return{x:dx/len,z:dz/len,distance:len};
}
function fresh(){return{pushes:0,completions:0,cancels:0,byFaction:{us:{pushes:0,completions:0,cancels:0},ge:{pushes:0,completions:0,cancels:0}}};}
function stats(sim){return sim._assaultBoundMomentum||(sim._assaultBoundMomentum=fresh());}
function bump(sim,s,kind){var st=stats(sim);st[kind]++;if(st.byFaction[s.faction])st.byFaction[s.faction][kind]++;}
function tokenFor(s){return s&&s.squad?+s.squad._boundUntil||0:0;}
function unsafe(s,battle){
  var sq=s&&s.squad;if(!sq||s.dead||s.role==='gunner'||s._firingStation||s.reloading||s.clearingStoppage||s.outOfAmmo)return true;
  if((+s.suppressedUntil||0)>(+battle.time||0))return true;
  if(sq.state==='retreat'||sq.commandPhase!=='assault'||!sq._assaultAuthorized||!sq.inContact)return true;
  if((+battle.time||0)>=tokenFor(s))return true;
  if(s._fireteamKey&&sq._boundTeam&&s._fireteamKey!==sq._boundTeam)return true;
  return false;
}
function clearRun(s,battle,cancelled){var r=s&&s._assaultBoundPush;if(!r)return;if(cancelled&&!r.completed)bump(battle,s,'cancels');delete s._assaultBoundPush;}
function mayStart(s,battle){
  if(unsafe(s,battle))return false;
  var mr=s._movementResolver,combat=mr&&mr.combat;
  /* Genuine cover/rush/station plan wins. We only replace engagement's no-cover hold. */
  return!!(combat&&combat.kind==='hold');
}
function start(s,battle){
  var f=strategicForward(s);if(!f)return null;var here=point(s.root.position),token=tokenFor(s),step=Math.min(PUSH_METERS,Math.max(2.5,f.distance-1));
  var run={token:token,goal:{x:here.x+f.x*step,z:here.z+f.z*step},completed:false};s._assaultBoundPush=run;bump(battle,s,'pushes');return run;
}
function maintain(s,battle){
  var run=s._assaultBoundPush,token=tokenFor(s);if(run&&run.token!==token){clearRun(s,battle,true);run=null;}
  if(unsafe(s,battle)){clearRun(s,battle,!!run);return;}
  if(!run){if(!mayStart(s,battle))return;run=start(s,battle);if(!run)return;}
  var here=point(s.root.position);
  if(dist(here,run.goal)<=ARRIVAL){run.completed=true;bump(battle,s,'completions');delete s._assaultBoundPush;return;}
  /* A bound is an urgent dash, not a 1 m/s crouch stroll. Combat-urgency marks this proposal so
     the gait layer compensates the movement integrator's suppression/crouch multiplier. */
  s._combatUrgentUntil=Math.max(+s._combatUrgentUntil||0,(+battle.time||0)+.5);
  s.prone=false;s.crawling=false;s.tacticalCrouch=true;
  root.BattleMovementResolver.proposeCombat(s,run.goal,battle,'assault-bound-push',.8);
}
function publish(sim){var st=stats(sim),out=JSON.parse(JSON.stringify(st));out.pushMeters=PUSH_METERS;sim._assaultBoundMomentumSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.assaultBoundMomentum=JSON.parse(JSON.stringify(out));}
function reset(sim){sim._assaultBoundMomentum=fresh();['us','ge'].forEach(function(f){var a=sim&&sim._roster&&sim._roster[f]||[];for(var i=0;i<a.length;i++)delete a[i]._assaultBoundPush;});publish(sim);}

root.BattleEngagement.updateSoldier=function(s,battle){var result=oldUpdate.apply(this,arguments);if(s&&battle)maintain(s,battle);return result;};
root.BattleModules.registerSystem('assault-bound-momentum',{version:'1.1',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:publish});
root.BattleAssaultBoundMomentum={version:'1.1',summary:function(sim){return sim&&sim._assaultBoundMomentumSummary?JSON.parse(JSON.stringify(sim._assaultBoundMomentumSummary)):null;}};
console.log('[MOVE] assault fireteams maintain one fixed urgent no-cover bound goal');
})(typeof window!=='undefined'?window:globalThis);
