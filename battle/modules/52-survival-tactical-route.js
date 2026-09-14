/* Survival-first tactical micro-routing.
   Command owns intent; the soldier owns how to survive the trip. The movement resolver still owns
   soldier.destination. This layer only supplies a temporary waypoint when a locally safer route is
   warranted, then hands control back to the original order/combat intent.

   Current plan types:
     - exposed/suppressed movement -> nearby protective position -> resume the original intent
     - firing station in a building -> safest usable door -> cross threshold -> station

   The API is deliberately generic so later movement planners (medic, ammo bearer, room clearing,
   retreat, etc.) can use the same intent -> tactical steps -> physical destination contract. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleTacticalRoute)return;

var ARRIVE=.95,THREAT_AGE=8,COVER_SEARCH=30,GOOD_COVER=.88,MAX_DETOUR=42,
    FORMATION_INTENT_EPS=16,PRECISE_INTENT_EPS=4,DOOR_VISIBLE_PENALTY=48,DOOR_FACING_PENALTY=34;

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function pos(s){return point(s&&s.root&&s.root.position);}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function clone(p){return{x:+p.x,z:+p.z};}
function fresh(){return{plans:0,coverDetours:0,safeDoorPlans:0,completedSteps:0,cancelledPlans:0,byFaction:{us:{plans:0,coverDetours:0,safeDoorPlans:0},ge:{plans:0,coverDetours:0,safeDoorPlans:0}}};}
function stats(sim){return sim._tacticalRouteStats||(sim._tacticalRouteStats=fresh());}
function bump(sim,s,field){var st=stats(sim);st[field]=(st[field]||0)+1;var f=st.byFaction[s&&s.faction];if(f&&f[field]!=null)f[field]++;}
function pathLength(start,path){var p=start,total=0;for(var i=0;i<(path||[]).length;i++){var q=path[i];total+=dist(p,q);p=q;}return total;}
function navPath(a,b){var N=root.BattleNavigation;return N&&N.findPath?N.findPath(a,b):[clone(b)];}
function knownThreat(s,battle){
  if(s&&s.target&&!s.target.dead)return point(s.target.root&&s.target.root.position);
  var sq=s&&s.squad,c=sq&&sq.contact;if(c&&isFinite(+c.at)&&(+battle.time||0)-(+c.at)<=THREAT_AGE)return point(c);
  var e=s&&s.eng;if(e&&e.lastSeen&&isFinite(+e.lastSeenAt)&&(+battle.time||0)-(+e.lastSeenAt)<=THREAT_AGE)return point(e.lastSeen);
  return null;
}
function coverValue(sim,p){try{var F=root.BattleObstacleField;return F&&p?F.coverPotentialAt(sim.obstacles,p.x,p.z):1;}catch(_){return 1;}}
function currentlyExposed(s,battle){var p=pos(s);return !p||coverValue(battle,p)>GOOD_COVER;}
function dangerActive(s,battle){return!!(knownThreat(s,battle)&&(((+s.suppressedUntil||0)>(+battle.time||0))||(s.squad&&s.squad.inContact)));}
function buildingById(id){var sc=root.BattleNavigation&&root.BattleNavigation.scenario,a=sc&&sc.buildings||[];for(var i=0;i<a.length;i++)if(String(a[i].id)===String(id))return a[i];return null;}
function insideBuilding(p,b){
  if(!p||!b)return false;var dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.rot||0),sn=Math.sin(b.rot||0),lx=dx*c-dz*sn,lz=dx*sn+dz*c;
  return Math.abs(lx)<=b.w/2-.15&&Math.abs(lz)<=b.d/2-.15;
}
function threatCanSeePoint(threat,p,battle){
  if(!threat||!p)return false;
  try{
    var N=root.BattleNavigation,F=root.BattleObstacleField,ay=(battle.heightAt?battle.heightAt(threat.x,threat.z):0)+1.45,by=(battle.heightAt?battle.heightAt(p.x,p.z):0)+1.1;
    if(N&&N.lineOfSightBlocked&&N.lineOfSightBlocked(threat,p,ay,by))return false;
    if(F&&F.sightBlocked&&F.sightBlocked(battle.obstacles,{x:threat.x,z:threat.z,y:ay},{x:p.x,z:p.z,y:by}))return false;
  }catch(_){return false;}
  return true;
}
function planMatches(plan,pick){
  if(!plan||!pick||!plan.intent)return false;if(plan.kind!==String(pick.kind||''))return false;
  var eps=pick.kind==='formation'?FORMATION_INTENT_EPS:PRECISE_INTENT_EPS;return dist(plan.intent,pick.point)<=eps;
}
function beginPlan(s,battle,pick,reason,steps){
  if(!steps||!steps.length)return null;
  s._tacticalRoute={kind:String(pick.kind||''),owner:String(pick.owner||''),intent:clone(pick.point),reason:reason,steps:steps.map(clone),index:0,createdAt:+battle.time||0};
  bump(battle,s,'plans');if(reason==='cover-detour')bump(battle,s,'coverDetours');if(reason==='safe-building-entry')bump(battle,s,'safeDoorPlans');
  return s._tacticalRoute;
}
function clearPlan(s,battle,cancelled){if(!s||!s._tacticalRoute)return;if(cancelled)stats(battle).cancelledPlans++;delete s._tacticalRoute;}
function advancePlan(s,battle,plan){
  var p=pos(s);while(plan&&plan.index<plan.steps.length&&dist(p,plan.steps[plan.index])<=ARRIVE){plan.index++;stats(battle).completedSteps++;}
  if(plan&&plan.index>=plan.steps.length){delete s._tacticalRoute;return null;}return plan;
}
function safestDoorPlan(s,battle,pick,threat){
  var st=s&&s._firingStation;if(!st||!st.building||!threat)return null;var b=buildingById(st.building),here=pos(s);if(!b||insideBuilding(here,b))return null;
  var portals=root.BattleNavigation.doorPortals||[],best=null,bestScore=Infinity;
  for(var i=0;i<portals.length;i++){
    var d=portals[i];if(String(d.building)!==String(st.building))continue;
    var p1=navPath(here,d.outside),p2=navPath(d.inside,pick.point),score=pathLength(here,p1)+pathLength(d.inside,p2);
    var vx=threat.x-d.x,vz=threat.z-d.z,vl=Math.hypot(vx,vz)||1,faces=(vx/vl)*(+d.normalX||0)+(vz/vl)*(+d.normalZ||0);
    if(threatCanSeePoint(threat,d.outside,battle))score+=DOOR_VISIBLE_PENALTY;
    score+=Math.max(0,faces)*DOOR_FACING_PENALTY;
    if(score<bestScore){bestScore=score;best=d;}
  }
  if(!best)return null;
  return beginPlan(s,battle,pick,'safe-building-entry',[best.outside,best.inside]);
}
function protectivePoint(s,battle,pick,threat){
  var F=root.BattleObstacleField,N=root.BattleNavigation,here=pos(s);if(!F||!here||!threat)return null;
  var obs=F.nearby(battle.obstacles,here.x,here.z,COVER_SEARCH)||[],direct=dist(here,pick.point),best=null,bestScore=Infinity;
  for(var i=0;i<obs.length;i++){
    var ob=obs[i],height=F.obstacleHeight(ob);if(height<.5||(ob.cover==null?1:+ob.cover)>GOOD_COVER)continue;
    var dx=ob.x-threat.x,dz=ob.z-threat.z,len=Math.hypot(dx,dz)||1,pad=(+ob.radius||1)+.9;
    var pt={x:ob.x+dx/len*pad,z:ob.z+dz/len*pad};
    if(dist(here,pt)<2||dist(pt,threat)<10)continue;
    var q=coverValue(battle,pt);if(q>GOOD_COVER)continue;
    var path=navPath(here,pt),toCover=pathLength(here,path),remaining=dist(pt,pick.point);
    if(toCover+remaining>direct+MAX_DETOUR)continue;
    if(N&&N.movementClear&&!path.length)continue;
    var score=toCover+remaining*.12+q*24;
    /* When incoming fire is from the same side as the command intent, survival is allowed to win:
       a lateral/rear cover move is cheaper than stepping directly into the beaten zone. */
    var goalDx=pick.point.x-here.x,goalDz=pick.point.z-here.z,thDx=threat.x-here.x,thDz=threat.z-here.z,gl=Math.hypot(goalDx,goalDz)||1,tl=Math.hypot(thDx,thDz)||1;
    var sameSide=(goalDx/gl)*(thDx/tl)+(goalDz/gl)*(thDz/tl);if(sameSide>.35)score-=Math.max(0,dist(here,pt)-Math.abs(((pt.x-here.x)*goalDx+(pt.z-here.z)*goalDz)/gl))*.18;
    if(score<bestScore){bestScore=score;best=pt;}
  }
  return best;
}
function survivalPlan(s,battle,pick,threat){
  if(!threat||!dangerActive(s,battle)||!currentlyExposed(s,battle))return null;
  var kind=String(pick.kind||'');if(['hold','reload-hold','contact-reaction','cover-bound','assault-rush','assault-bound-push'].indexOf(kind)>=0)return null;
  var pt=protectivePoint(s,battle,pick,threat);return pt?beginPlan(s,battle,pick,'cover-detour',[pt]):null;
}
function resolve(s,battle,pick){
  if(!s||!battle||!pick||!pick.point||s.dead)return null;
  var plan=s._tacticalRoute;if(plan&&!planMatches(plan,pick)){clearPlan(s,battle,true);plan=null;}
  plan=advancePlan(s,battle,plan);if(plan)return{point:clone(plan.steps[plan.index]),reason:plan.reason,intent:clone(pick.point),step:plan.index,total:plan.steps.length};
  var threat=knownThreat(s,battle);
  if(String(pick.kind||'')==='firing-station')plan=safestDoorPlan(s,battle,pick,threat);
  if(!plan)plan=survivalPlan(s,battle,pick,threat);
  plan=advancePlan(s,battle,plan);return plan?{point:clone(plan.steps[plan.index]),reason:plan.reason,intent:clone(pick.point),step:plan.index,total:plan.steps.length}:null;
}
function publish(sim){var out=JSON.parse(JSON.stringify(stats(sim)));sim._tacticalRouteSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.tacticalRoutes=JSON.parse(JSON.stringify(out));}
function reset(sim){sim._tacticalRouteStats=fresh();var a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++)delete a[i]._tacticalRoute;publish(sim);}

root.BattleTacticalRoute={version:'1.0-survival-intent',resolve:resolve,knownThreat:knownThreat,summary:function(sim){return sim&&sim._tacticalRouteSummary?JSON.parse(JSON.stringify(sim._tacticalRouteSummary)):null;}};
root.BattleModules.registerSystem('survival-tactical-route',{version:'1.0-survival-intent',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:publish});
console.log('[MOVE] survival tactical routing active: command intent -> safe micro-route -> physical destination');
})(typeof window!=='undefined'?window:globalThis);
