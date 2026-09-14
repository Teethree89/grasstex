/* Movement progress: structured stuck detection, graduated recovery, failed-candidate memory.

   The movement resolver owns goal AUTHORITY (who wins). This module owns goal PROGRESS (is the
   winning goal actually being reached). It is deliberately observational until a soldier is
   genuinely stuck: it samples the resolver's committed intent once per resolve tick, so there is
   no second global evaluation loop and no per-frame geometry work.

   Definitions:
   - A soldier is stuck only when he has an active movement goal with meaningful distance
     remaining, the goal is old enough, he is expected to be moving (not holding, reloading,
     clearing a stoppage, or occupying a firing station), and his net displacement over the window
     is tiny. Firing from cover, suppression pauses, reloads and bound pauses never qualify.
   - Recovery is graduated: (1) rebuild the route to the same goal, (2) suppress the failing
     candidate briefly and force a fresh local approach, (3) flag the goal unreachable so the
     owning subsystem (engagement bound/assault, window manager) abandons it cleanly. The flag is
     consumed once by the owner; nothing teleports and no geometry is blacklisted globally.
   - Failed-candidate memory is per-soldier, short-lived (12 s), and cleared around a point on
     arrival. Cover selection already consults candidateAllowed(); the resolver gates re-proposals
     of gated kinds against the same memory. */

(function(root){
'use strict';
if(root.BattleMovementProgress)return;

var EQUIV=2.4, SAMPLE_DT=.5, STUCK_WINDOW=6, STUCK_NET=1.5, GOAL_FAR=3,
    FAIL_TTL=12, RECOVER_GAP=4, GRID=1,
    HOLD_KINDS={hold:1,'reload-hold':1,'firing-station':1},
    GATED_KINDS={'cover-bound':1,'assault-bound-push':1};

function now(b){return b&&isFinite(+b.time)?+b.time:0;}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function posOf(s){return point(s&&s.root&&s.root.position);}
function dist(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function keyFor(p){return Math.round(p.x/GRID)+','+Math.round(p.z/GRID);}
function neighbourKeys(p){
  var cx=Math.round(p.x/GRID),cz=Math.round(p.z/GRID),out=[],ix,iz;
  for(ix=-1;ix<=1;ix++)for(iz=-1;iz<=1;iz++)out.push((cx+ix)+','+(cz+iz));
  return out;
}
function freshStats(){return{stuckDetections:0,recoveryAttempts:0,routeRebuilds:0,alternateApproaches:0,unreachableFlags:0,candidatesSuppressed:0,candidateChecks:0,failuresRecorded:0,failuresClearedOnArrival:0};}
function stats(sim){return sim._movementProgressStats||(sim._movementProgressStats=freshStats());}
function prog(s){
  if(!s._movementProgress)s._movementProgress={goal:null,goalSince:0,samples:[],stuck:false,stuckSince:0,recoveries:0,lastRecoveryAt:-999,failures:{}};
  return s._movementProgress;
}
function expireFailures(st,t){
  var k,changed=false;
  for(k in st.failures)if(st.failures[k].until<=t){delete st.failures[k];changed=true;}
  return changed;
}
function expectedToMove(s,pick){
  if(!s||s.dead)return false;
  if(HOLD_KINDS[pick&&pick.kind])return false;
  if(s.reloading||s.clearingStoppage)return false;
  if(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s))return false;
  return true;
}
function avoidanceActive(s,battle){
  var t=now(battle);
  return (s._movementYieldUntil||0)>t||(s._separatedAt||0)>t-1;
}

/* Short-lived per-soldier candidate memory. Cover selection and gated re-proposals consult this;
   retreat, regroup, reload holds and firing stations never consult it. */
function candidateAllowed(s,battle,pt){
  if(!s||!battle)return true;
  var p=point(pt);if(!p)return true;
  var st=prog(s),t=now(battle);expireFailures(st,t);
  stats(battle).candidateChecks++;
  var keys=neighbourKeys(p);
  for(var i=0;i<keys.length;i++){
    var f=st.failures[keys[i]];
    if(f&&f.until>t){stats(battle).candidatesSuppressed++;return false;}
  }
  return true;
}
function gatedKind(kind){return !!GATED_KINDS[String(kind||'')];}
function noteFailure(s,battle,pt,reason){
  var p=point(pt);if(!s||!p)return false;
  var st=prog(s),t=now(battle),k=keyFor(p),prev=st.failures[k];
  st.failures[k]={until:t+FAIL_TTL,reason:String(reason||'no-progress'),count:(prev?prev.count:0)+1,at:t};
  stats(battle).failuresRecorded++;
  return true;
}
function clearFailuresNear(s,battle,pt,radius){
  var p=point(pt);if(!s||!p)return 0;
  var st=prog(s),n=0,k;
  for(k in st.failures){
    var parts=String(k).split(','),fp={x:(+parts[0])*GRID,z:(+parts[1])*GRID};
    if(dist(fp,p)<=(radius==null?3:radius)){delete st.failures[k];n++;}
  }
  if(n)stats(battle).failuresClearedOnArrival+=n;
  return n;
}
function clearTracking(s){
  var st=prog(s);
  st.goal=null;st.samples=[];st.stuck=false;st.recoveries=0;
  if(s._movementGoalUnreachable)s._movementGoalUnreachable=false;
}

/* Called by the movement resolver once per committed intent. Returns a recovery advice object or
   null. Round 1 asks the caller to rebuild the route to the same goal; round 2 additionally
   suppresses the goal candidate so the next selection prefers an alternate; round 3 flags the
   goal unreachable for the owning subsystem to abandon. */
function observe(s,battle,goalPoint,pick){
  if(!s||!battle||s.dead)return null;
  var st=prog(s),t=now(battle),goal=point(goalPoint);
  expireFailures(st,t);
  if(!goal||!expectedToMove(s,pick)){if(st.goal||st.stuck)clearTracking(s);return null;}
  if(!st.goal||dist(st.goal,goal)>EQUIV){
    st.goal={x:goal.x,z:goal.z};st.goalSince=t;st.samples=[];st.stuck=false;st.recoveries=0;
    if(s._movementGoalUnreachable)s._movementGoalUnreachable=false;
  }
  var here=posOf(s);if(!here)return null;
  var last=st.samples[st.samples.length-1];
  if(!last||t-last.t>=SAMPLE_DT)st.samples.push({t:t,x:here.x,z:here.z});
  while(st.samples.length&&t-st.samples[0].t>STUCK_WINDOW*1.6)st.samples.shift();
  var remaining=dist(here,st.goal);
  if(remaining<=GOAL_FAR){st.stuck=false;return null;}
  var need=avoidanceActive(s,battle)?STUCK_WINDOW*1.5:STUCK_WINDOW;
  var first=st.samples[0];
  if(!first||t-first.t<need||t-st.goalSince<need)return null;
  var net=Math.hypot(here.x-first.x,here.z-first.z);
  if(net>=STUCK_NET){st.stuck=false;return null;}
  if(!st.stuck){st.stuck=true;st.stuckSince=t;stats(battle).stuckDetections++;}
  if(t-st.lastRecoveryAt<RECOVER_GAP)return null;
  st.lastRecoveryAt=t;st.recoveries++;stats(battle).recoveryAttempts++;
  if(st.recoveries<=1){stats(battle).routeRebuilds++;return{rebuild:true,round:st.recoveries};}
  if(st.recoveries<=2){
    noteFailure(s,battle,st.goal,'no-progress');
    stats(battle).alternateApproaches++;
    return{rebuild:true,alternate:true,round:st.recoveries};
  }
  s._movementGoalUnreachable=true;stats(battle).unreachableFlags++;
  return{rebuild:true,unreachable:true,round:st.recoveries};
}
function isStuck(s){return !!(s&&s._movementProgress&&s._movementProgress.stuck);}
function summary(sim){
  var out=Object.assign({},stats(sim)),active=0,suppressed=0,t=now(sim);
  ['us','ge'].forEach(function(f){
    var roster=sim&&sim._roster&&sim._roster[f]||[];
    for(var i=0;i<roster.length;i++){
      var st=roster[i]&&roster[i]._movementProgress;
      if(!st)continue;
      if(st.stuck&&!roster[i].dead)active++;
      for(var k in st.failures)if(st.failures[k].until>t)suppressed++;
    }
  });
  out.activeStuck=active;out.suppressedCandidates=suppressed;
  var pub=JSON.parse(JSON.stringify(out));
  sim._movementProgressSummary=pub;
  if(sim._coordinationHealth)sim._coordinationHealth.movementProgress=JSON.parse(JSON.stringify(out));
  return pub;
}
function reset(sim){
  sim._movementProgressStats=freshStats();
  ['us','ge'].forEach(function(f){
    var roster=sim&&sim._roster&&sim._roster[f]||[];
    for(var i=0;i<roster.length;i++){delete roster[i]._movementProgress;delete roster[i]._movementGoalUnreachable;}
  });
  summary(sim);
}

if(root.BattleModules)root.BattleModules.registerSystem('movement-progress',{version:'1.0',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:summary});
root.BattleMovementProgress={version:'1.0',observe:observe,candidateAllowed:candidateAllowed,gatedKind:gatedKind,noteFailure:noteFailure,clearFailuresNear:clearFailuresNear,isStuck:isStuck,summary:summary,reset:reset,
  tuning:{stuckWindow:STUCK_WINDOW,stuckNet:STUCK_NET,goalFar:GOAL_FAR,failTTL:FAIL_TTL,recoverGap:RECOVER_GAP}};
console.log('[MOVE] movement progress active: stuck detection + graduated recovery + candidate memory');
})(typeof window!=='undefined'?window:globalThis);
