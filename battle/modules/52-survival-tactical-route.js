/* Lean movement execution owner.
   Command/combat choose the goal; Movement Resolver chooses the winner; this module owns only the
   committed micro-route and a conservative last-resort progress check. Retreat/regroup are never
   declared unreachable here. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleMovementExecution)return;
var ARRIVE=.95,THREAT_AGE=10,COVER_SEARCH=30,GOOD_COVER=.88,MAX_DETOUR=42,FORMATION_INTENT_EPS=16,PRECISE_INTENT_EPS=4,DOOR_VISIBLE_PENALTY=48,DOOR_FACING_PENALTY=34,COVER_REPLAN_COOLDOWN=3,CANCEL_COOLDOWN=.75,MAX_COVER_PATH_CANDIDATES=3;
function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function pos(s){return point(s&&s.root&&s.root.position);}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function clone(p){return{x:+p.x,z:+p.z};}
function pathLength(start,path){var p=start,total=0;for(var i=0;i<(path||[]).length;i++){var q=path[i];total+=dist(p,q);p=q;}return total;}
function freshRoute(){return{plans:0,coverDetours:0,safeDoorPlans:0,completedSteps:0,cancelledPlans:0,cooldownBlocks:0,pathSearches:0,routeReuses:0,byFaction:{us:{plans:0,coverDetours:0,safeDoorPlans:0},ge:{plans:0,coverDetours:0,safeDoorPlans:0}}};}
function routeStats(sim){var st=sim._tacticalRouteStats||(sim._tacticalRouteStats=freshRoute());if(st.routeReuses==null)st.routeReuses=0;return st;}
function bumpRoute(sim,s,field){var st=routeStats(sim);st[field]=(st[field]||0)+1;var f=st.byFaction[s&&s.faction];if(f&&f[field]!=null)f[field]++;}
function navPath(a,b,battle){routeStats(battle).pathSearches++;var N=root.BattleNavigation;return N&&N.findPath?N.findPath(a,b):[clone(b)];}
function knownThreat(s,battle){if(s&&s.target&&!s.target.dead)return point(s.target.root&&s.target.root.position);var q=s&&s.squad,c=q&&q.contact;if(c&&isFinite(+c.at)&&battle.time-(+c.at)<=THREAT_AGE)return point(c);var e=s&&s.eng;if(e&&e.lastSeen&&isFinite(+e.lastSeenAt)&&battle.time-(+e.lastSeenAt)<=THREAT_AGE)return point(e.lastSeen);return null;}
function coverValue(sim,p){try{var F=root.BattleObstacleField;return F&&p?F.coverPotentialAt(sim.obstacles,p.x,p.z):1;}catch(_){return 1;}}
function currentlyExposed(s,b){var p=pos(s);return!p||coverValue(b,p)>GOOD_COVER;}
function dangerActive(s,b){return!!(knownThreat(s,b)&&(+s.suppressedUntil||0)>b.time);}
function buildingById(id){var sc=root.BattleNavigation&&root.BattleNavigation.scenario,a=sc&&sc.buildings||[];for(var i=0;i<a.length;i++)if(String(a[i].id)===String(id))return a[i];return null;}
function insideBuilding(p,b){if(!p||!b)return false;var dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.rot||0),sn=Math.sin(b.rot||0),lx=dx*c-dz*sn,lz=dx*sn+dz*c;return Math.abs(lx)<=b.w/2-.15&&Math.abs(lz)<=b.d/2-.15;}
function threatCanSeePoint(threat,p,battle){if(!threat||!p)return false;try{var N=root.BattleNavigation,F=root.BattleObstacleField,ay=(battle.heightAt?battle.heightAt(threat.x,threat.z):0)+1.45,by=(battle.heightAt?battle.heightAt(p.x,p.z):0)+1.1;if(N&&N.lineOfSightBlocked&&N.lineOfSightBlocked(threat,p,ay,by))return false;if(F&&F.sightBlocked&&F.sightBlocked(battle.obstacles,{x:threat.x,z:threat.z,y:ay},{x:p.x,z:p.z,y:by}))return false;}catch(_){return false;}return true;}
function planMatches(plan,pick){if(!plan||!pick||!plan.intent)return false;if(plan.kind!==String(pick.kind||''))return false;var eps=pick.kind==='formation'?FORMATION_INTENT_EPS:PRECISE_INTENT_EPS;return dist(plan.intent,pick.point)<=eps;}
function beginPlan(s,b,pick,reason,steps){if(!steps||!steps.length)return null;s._tacticalRoute={kind:String(pick.kind||''),owner:String(pick.owner||''),intent:clone(pick.point),reason:reason,steps:steps.map(clone),index:0,createdAt:+b.time||0};bumpRoute(b,s,'plans');if(reason==='cover-detour')bumpRoute(b,s,'coverDetours');if(reason==='safe-building-entry')bumpRoute(b,s,'safeDoorPlans');return s._tacticalRoute;}
function clearPlan(s,b,cancelled){if(!s||!s._tacticalRoute)return;if(cancelled){routeStats(b).cancelledPlans++;s._tacticalRouteCooldownUntil=Math.max(+s._tacticalRouteCooldownUntil||0,b.time+CANCEL_COOLDOWN);}delete s._tacticalRoute;}
function advancePlan(s,b,plan){var p=pos(s);while(plan&&plan.index<plan.steps.length&&dist(p,plan.steps[plan.index])<=ARRIVE){plan.index++;routeStats(b).completedSteps++;}if(plan&&plan.index>=plan.steps.length){if(plan.reason==='cover-detour')s._tacticalRouteCooldownUntil=b.time+COVER_REPLAN_COOLDOWN;delete s._tacticalRoute;return null;}return plan;}
function ingressPath(s,b,a,z){var P=root.BattleNavigationPhysicality;routeStats(b).pathSearches++;var path=P&&P.planIngressPath?P.planIngressPath(b,s,a,z):root.BattleNavigation.findPath(a,z);if(!path||!path.length||dist(path[path.length-1],z)>.35)return null;var cursor=a;for(var i=0;i<path.length;i++){if(!root.BattleNavigation.movementClear(cursor,path[i]))return null;cursor=path[i];}return path.map(clone);}
function ingressVersion(b){return root.BattleNavigation.version+'|'+(b.obstacles&&b.obstacles.__physicalVersion||0)+'|'+(b.obstacles&&b.obstacles.length||0);}
function createIngress(s,b,st,threat){var building=buildingById(st.building),here=pos(s);if(!building||!here)return null;var steps=null,door=null;if(insideBuilding(here,building))steps=ingressPath(s,b,here,st);else{var candidates=(root.BattleNavigation.doorPortals||[]).filter(function(d){return String(d.building)===String(st.building);}).map(function(d){var score=dist(here,d.outside)+dist(d.inside,st);if(threat){var vx=threat.x-d.x,vz=threat.z-d.z,vl=Math.hypot(vx,vz)||1;if(threatCanSeePoint(threat,d.outside,b))score+=DOOR_VISIBLE_PENALTY;score+=Math.max(0,(vx*d.normalX+vz*d.normalZ)/vl)*DOOR_FACING_PENALTY;}return{door:d,score:score};}).sort(function(a,c){return a.score-c.score;});var best=Infinity;for(var i=0;i<Math.min(2,candidates.length);i++){var c=candidates[i],d=c.door;if(!root.BattleNavigation.movementClear(d.outside,d.inside))continue;var p1=ingressPath(s,b,here,d.outside),p2=ingressPath(s,b,d.inside,st);if(!p1||!p2)continue;var score=pathLength(here,p1)+pathLength(d.inside,p2)+c.score-dist(here,d.outside)-dist(d.inside,st);if(score<best){best=score;steps=p1.concat([clone(d.inside)],p2);door=d.id;}}}if(!steps)return null;bumpRoute(b,s,'plans');bumpRoute(b,s,'safeDoorPlans');return{steps:steps,index:0,door:door,createdAt:b.time,version:ingressVersion(b)};}
function protectivePoint(s,b,pick,threat){var F=root.BattleObstacleField,N=root.BattleNavigation,here=pos(s);if(!F||!here||!threat)return null;var obs=F.nearby(b.obstacles,here.x,here.z,COVER_SEARCH)||[],direct=dist(here,pick.point),cheap=[];for(var i=0;i<obs.length;i++){var ob=obs[i],height=F.obstacleHeight(ob);if(height<.5||(ob.cover==null?1:+ob.cover)>GOOD_COVER)continue;var dx=ob.x-threat.x,dz=ob.z-threat.z,len=Math.hypot(dx,dz)||1,pad=(+ob.radius||1)+.9,pt={x:ob.x+dx/len*pad,z:ob.z+dz/len*pad};if(dist(here,pt)<2||dist(pt,threat)<10)continue;var q=coverValue(b,pt);if(q>GOOD_COVER)continue;var straight=dist(here,pt),remaining=dist(pt,pick.point);if(straight+remaining>direct+MAX_DETOUR)continue;cheap.push({point:pt,q:q,remaining:remaining,score:straight+remaining*.12+q*24});}cheap.sort(function(a,c){return a.score-c.score;});var best=null,bestScore=Infinity,limit=Math.min(MAX_COVER_PATH_CANDIDATES,cheap.length);for(var j=0;j<limit;j++){var cc=cheap[j],toCover;try{toCover=N&&N.movementClear&&N.movementClear(here,cc.point)?dist(here,cc.point):pathLength(here,navPath(here,cc.point,b));}catch(_){toCover=pathLength(here,navPath(here,cc.point,b));}if(toCover+cc.remaining>direct+MAX_DETOUR)continue;var actual=toCover+cc.remaining*.12+cc.q*24;if(actual<bestScore){bestScore=actual;best=cc.point;}}return best;}
function survivalPlan(s,b,pick,threat){if(!threat||!dangerActive(s,b)||!currentlyExposed(s,b))return null;var kind=String(pick.kind||'');if(['hold','reload-hold','contact-reaction','cover-bound','assault-rush','firing-station','retreat','regroup'].indexOf(kind)>=0)return null;var pt=protectivePoint(s,b,pick,threat);return pt?beginPlan(s,b,pick,'cover-detour',[pt]):null;}
function resolveRoute(s,b,pick){if(!s||!b||!pick||!pick.point||s.dead)return null;var plan=s._tacticalRoute;if(plan&&!planMatches(plan,pick)){clearPlan(s,b,true);plan=null;}plan=advancePlan(s,b,plan);if(plan){routeStats(b).routeReuses++;return{point:clone(plan.steps[plan.index]),reason:plan.reason,intent:clone(plan.intent),step:plan.index,total:plan.steps.length};}var threat=knownThreat(s,b);if((+s._tacticalRouteCooldownUntil||0)>b.time){routeStats(b).cooldownBlocks++;return null;}plan=survivalPlan(s,b,pick,threat);plan=advancePlan(s,b,plan);return plan?{point:clone(plan.steps[plan.index]),reason:plan.reason,intent:clone(plan.intent),step:plan.index,total:plan.steps.length}:null;}

var SAMPLE_DT=.5,WINDOW=6,NET=1.5,FAR=3,CONFIRMS=2,OBSERVE=8,FAIL_TTL=12,GRID=1;
var HOLD={hold:1,'reload-hold':1,'firing-station':1,'contact-reaction':1,retreat:1,regroup:1};
var GATED={'cover-bound':1,'assault-rush':1};
function freshProgress(){return{stuckDetections:0,recoveryAttempts:0,routeRebuilds:0,alternateApproaches:0,unreachableFlags:0,candidatesSuppressed:0,candidateChecks:0,failuresRecorded:0,failuresClearedOnArrival:0};}
function progressStats(b){return b._movementProgressStats||(b._movementProgressStats=freshProgress());}
function prog(s){return s._movementProgress||(s._movementProgress={goal:null,owner:null,kind:null,goalSince:0,samples:[],confirmCount:0,recoveryAt:0,recoveries:0,terminal:false,stuck:false,failures:{}});}
function key(p){return Math.round(p.x/GRID)+','+Math.round(p.z/GRID);}
function expire(st,t){for(var k in st.failures)if(st.failures[k].until<=t)delete st.failures[k];}
function candidateAllowed(s,b,p){p=point(p);if(!s||!b||!p)return true;var st=prog(s),t=b.time;expire(st,t);progressStats(b).candidateChecks++;var cx=Math.round(p.x/GRID),cz=Math.round(p.z/GRID);for(var x=-1;x<=1;x++)for(var z=-1;z<=1;z++){var f=st.failures[(cx+x)+','+(cz+z)];if(f&&f.until>t){progressStats(b).candidatesSuppressed++;return false;}}return true;}
function noteFailure(s,b,p,reason){p=point(p);if(!s||!b||!p)return false;var st=prog(s),k=key(p),old=st.failures[k];st.failures[k]={until:b.time+FAIL_TTL,reason:reason||'no-progress',count:(old?old.count:0)+1};progressStats(b).failuresRecorded++;return true;}
function clearFailuresNear(s,b,p,r){p=point(p);if(!s||!p)return 0;var st=prog(s),n=0;for(var k in st.failures){var a=k.split(','),fp={x:+a[0],z:+a[1]};if(dist(fp,p)<=(r==null?3:r)){delete st.failures[k];n++;}}if(n)progressStats(b).failuresClearedOnArrival+=n;return n;}
function routeRemaining(s){var a=s._tacticalRoute;if(a&&a.steps)return a.steps.length-(+a.index||0);a=s._physicalPath;if(a&&a.points)return a.points.length-(+a.index||0);a=s._navCache;if(a&&a.path)return a.path.length-(+a.index||0);return null;}
function routeIndex(s){if(s._tacticalRoute&&isFinite(+s._tacticalRoute.index))return+s._tacticalRoute.index;if(s._physicalPath&&isFinite(+s._physicalPath.index))return+s._physicalPath.index;if(s._navCache&&isFinite(+s._navCache.index))return+s._navCache.index;return 0;}
function expected(s,pick,b){if(!s||s.dead||HOLD[pick&&pick.kind]||s.reloading||s.clearingStoppage||(+s.suppressedUntil||0)>b.time)return false;if(s.squad&&(s.squad.state==='retreat'||s.squad.commandPhase==='regroup'||s.squad.commandPhase==='retreat'))return false;if(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s))return false;if((s._movementYieldUntil||0)>b.time||(s._separatedAt||0)>b.time-1)return false;return true;}
/* One physical failure episode belongs to one winning goal. Recovery never republishes an
   order: rebuild once, observe, request one local alternate, observe, then report unreachable.
   Actual movement/waypoint progress or a new winner starts a fresh episode. */
function resetEpisode(s,st,p,pick,b){
  st.goal=p?clone(p):null;st.owner=String(pick&&pick.owner||'');st.kind=String(pick&&pick.kind||'');
  st.goalSince=b.time;st.samples=[];st.confirmCount=0;st.recoveries=0;st.recoveryAt=0;st.terminal=false;st.stuck=false;
  st.routeIndex=routeIndex(s);st.remaining=routeRemaining(s);s._movementGoalUnreachable=false;
}
function observe(s,b,p,pick){
  p=point(p);
  if(!s||!b||!p||!expected(s,pick,b)){
    if(s&&s._movementProgress&&s._movementProgress.goal)resetEpisode(s,s._movementProgress,null,pick,b);
    return null;
  }
  var st=prog(s),owner=String(pick&&pick.owner||''),kind=String(pick&&pick.kind||'');expire(st,b.time);
  if(!st.goal||dist(st.goal,p)>2.4||st.owner!==owner||st.kind!==kind)resetEpisode(s,st,p,pick,b);
  var h=pos(s);if(!h)return null;
  var last=st.samples[st.samples.length-1];
  if(last&&b.time-last.t<SAMPLE_DT)return null;
  st.samples.push({t:b.time,x:h.x,z:h.z});
  while(st.samples.length&&b.time-st.samples[0].t>WINDOW*1.6)st.samples.shift();
  if(dist(h,st.goal)<=FAR){clearFailuresNear(s,b,st.goal);resetEpisode(s,st,p,pick,b);return null;}
  var first=st.samples[0];if(!first||b.time-first.t<WINDOW||b.time-st.goalSince<WINDOW)return null;
  var net=Math.hypot(h.x-first.x,h.z-first.z),idx=routeIndex(s),rem=routeRemaining(s),odo=0;
  for(var i=1;i<st.samples.length;i++)odo+=Math.hypot(st.samples[i].x-st.samples[i-1].x,st.samples[i].z-st.samples[i-1].z);
  if(net>=NET||idx>(st.routeIndex||0)||(rem!=null&&st.remaining!=null&&rem<st.remaining)||odo>=NET){
    resetEpisode(s,st,p,pick,b);return null;
  }
  if(st.terminal||(st.recoveries&&b.time-st.recoveryAt<OBSERVE))return null;
  st.confirmCount++;if(st.confirmCount<CONFIRMS)return null;st.confirmCount=0;
  if(!st.stuck){st.stuck=true;progressStats(b).stuckDetections++;}
  if(st.recoveries===0){
    st.recoveries=1;st.recoveryAt=b.time;st.samples=[{t:b.time,x:h.x,z:h.z}];
    progressStats(b).recoveryAttempts++;progressStats(b).routeRebuilds++;return{rebuild:true,round:1};
  }
  if(st.recoveries===1&&GATED[kind]){
    st.recoveries=2;st.recoveryAt=b.time;st.samples=[{t:b.time,x:h.x,z:h.z}];
    progressStats(b).recoveryAttempts++;progressStats(b).alternateApproaches++;return{rebuild:true,alternate:true,round:2};
  }
  st.terminal=true;
  if(GATED[kind]){
    noteFailure(s,b,st.goal,'no-progress');s._movementGoalUnreachable=true;
    progressStats(b).unreachableFlags++;return{unreachable:true,round:3};
  }
  // A Meso formation slot is not a disposable Micro candidate. Keep the failed execution visible
  // while ordinary physical navigation retries; never invent another command or rebuild loop.
  return null;
}
function isStuck(s){return!!(s&&s._movementProgress&&s._movementProgress.stuck);}
function progressSummary(sim){var out=Object.assign({},progressStats(sim)),active=0,t=sim.time,supp=0;['us','ge'].forEach(function(f){var a=sim&&sim._roster&&sim._roster[f]||[];for(var i=0;i<a.length;i++){var st=a[i]._movementProgress;if(!st)continue;if(st.stuck&&!a[i].dead)active++;for(var k in st.failures)if(st.failures[k].until>t)supp++;}});out.activeStuck=active;out.suppressedCandidates=supp;sim._movementProgressSummary=JSON.parse(JSON.stringify(out));return out;}
function reset(sim){sim._tacticalRouteStats=freshRoute();sim._movementProgressStats=freshProgress();var a=root.BattleModules.unitsFor(sim);for(var i=0;i<a.length;i++){delete a[i]._tacticalRoute;a[i]._tacticalRouteCooldownUntil=0;delete a[i]._movementProgress;delete a[i]._movementGoalUnreachable;}publish(sim);}
function publish(sim){var r=JSON.parse(JSON.stringify(routeStats(sim)));sim._tacticalRouteSummary=r;var p=progressSummary(sim);if(sim._coordinationHealth){sim._coordinationHealth.tacticalRoutes=JSON.parse(JSON.stringify(r));sim._coordinationHealth.movementProgress=JSON.parse(JSON.stringify(p));}}
root.BattleTacticalRoute={version:'3.0-lean-execution',createIngress:createIngress,ingressVersion:ingressVersion,cancel:function(s,b){clearPlan(s,b,true);},resolve:resolveRoute,knownThreat:knownThreat,summary:function(sim){return sim&&sim._tacticalRouteSummary?JSON.parse(JSON.stringify(sim._tacticalRouteSummary)):null;}};
root.BattleMovementProgress={version:'3.0-lean-execution',observe:observe,candidateAllowed:candidateAllowed,gatedKind:function(k){return!!GATED[String(k||'')];},noteFailure:noteFailure,clearFailuresNear:clearFailuresNear,isStuck:isStuck,summary:progressSummary,reset:reset,tuning:{stuckWindow:WINDOW,stuckNet:NET,goalFar:FAR,failTTL:FAIL_TTL,confirmWindows:CONFIRMS,observeAfterAction:OBSERVE}};
root.BattleModules.registerSystem('movement-execution',{version:'3.0-lean-owner',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:publish});
root.BattleMovementExecution={version:'3.0-lean-owner'};
console.log('[MOVE] lean movement execution: committed micro-route + conservative recovery');
})(typeof window!=='undefined'?window:globalThis);
