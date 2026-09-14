/* Movement progress: structured stuck detection, graduated recovery, failed-candidate memory.

   The movement resolver owns goal AUTHORITY (who wins). This module owns goal PROGRESS (is the
   winning goal actually being reached). It is deliberately observational until a soldier is
   genuinely stuck: it samples the resolver's committed intent once per resolve tick, so there is
   no second global evaluation loop and no per-frame geometry work.

   Definitions:
   - A soldier is stuck only when he has an active movement goal with meaningful distance
     remaining, the goal is old enough, he is expected to be moving (not holding, reloading,
     clearing a stoppage, suppressed, occupying a firing station, or yielding to local
     avoidance), and BOTH his net displacement over the window is tiny AND his route shows no
     progress (no waypoint advancement, no remaining-path reduction, no odometer movement).
     A curved detour with low Euclidean net progress but real route progress is NOT stuck.
     Firing from cover, suppression pauses, reloads, bound pauses and avoidance never qualify.
   - Recovery is an episode state machine, not a per-window repeat:
       suspected stall -> confirmed stall -> rebuild -> observe -> alternate approach
       -> observe -> genuinely unreachable.
     Each stage runs once per goal episode. A route rebuild or alternate approach rebases all
     progress evidence and opens an observation period before any further escalation, so one
     unresolved episode cannot emit a recovery every few seconds.
   - Genuine authoritative goal changes (new point, new owner, new kind) reset old stuck
     evidence instead of letting one window span two different goals.
   - Failed-candidate memory is per-soldier, short-lived (12 s), and cleared around a point on
     arrival. Only gated kinds (cover-bound, assault-bound-push) are ever suppressed, because
     only those have an alternate for the owner to pick; formation intent has no alternative,
     so a formation stall rebuilds once and then goes unreachable without recording a
     candidate failure. Cover selection already consults candidateAllowed(); the resolver gates
     re-proposals of gated kinds against the same memory. */

(function(root){
'use strict';
if(root.BattleMovementProgress)return;

var EQUIV=2.4, SAMPLE_DT=.5, STUCK_WINDOW=6, STUCK_NET=1.5, GOAL_FAR=3,
    FAIL_TTL=12, GRID=1,
    CONFIRM_WINDOWS=2, OBSERVE_AFTER_ACTION=8, UNREACHABLE_CONFIRMS=2,
    HOLD_KINDS={hold:1,'reload-hold':1,'firing-station':1,'contact-reaction':1},
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
  if(!s._movementProgress)s._movementProgress={goal:null,owner:null,kind:null,goalSince:0,samples:[],stuck:false,stuckSince:0,confirmCount:0,stage:'none',stageAt:0,observeUntil:0,recoveries:0,confirms:0,alternated:false,unreachableFlagged:false,lastRouteIndex:0,lastRemaining:Infinity,lastRecoveryAt:-999,failures:{}};
  return s._movementProgress;
}
function expireFailures(st,t){
  var k,changed=false;
  for(k in st.failures)if(st.failures[k].until<=t){delete st.failures[k];changed=true;}
  return changed;
}
/* A contact-reaction proposes the soldier's own position: holding still IS the order, so low
   net movement there is correct behavior, never stuckness. Suppression pauses likewise. */
function expectedToMove(s,pick,battle){
  if(!s||s.dead)return false;
  if(HOLD_KINDS[pick&&pick.kind])return false;
  if(s.reloading||s.clearingStoppage)return false;
  if((+s.suppressedUntil||0)>now(battle))return false;
  if(root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s))return false;
  return true;
}
function avoidanceActive(s,battle){
  var t=now(battle);
  return (s._movementYieldUntil||0)>t||(s._separatedAt||0)>t-1;
}
/* Remaining physical route length, when the navigation layers expose one. Null when unknown. */
function routeRemaining(s){
  var c=s._physicalPath;
  if(c&&Array.isArray(c.points)&&c.points.length){
    var idx=Math.max(0,Math.min(c.points.length,+c.index||0));
    return c.points.length-idx;
  }
  var n=s._navCache;
  if(n&&Array.isArray(n.path)&&n.path.length){
    var ni=Math.max(0,Math.min(n.path.length,+n.index||0));
    return n.path.length-ni;
  }
  var tr=s._tacticalRoute;
  if(tr&&Array.isArray(tr.steps)&&tr.steps.length){
    var ti=Math.max(0,Math.min(tr.steps.length,+tr.index||0));
    return tr.steps.length-ti;
  }
  return null;
}
function routeIndex(s){
  if(s._tacticalRoute&&isFinite(+s._tacticalRoute.index))return +s._tacticalRoute.index;
  if(s._physicalPath&&isFinite(+s._physicalPath.index))return +s._physicalPath.index;
  if(s._navCache&&isFinite(+s._navCache.index))return +s._navCache.index;
  return 0;
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
  st.goal=null;st.owner=null;st.kind=null;st.samples=[];st.stuck=false;
  st.confirmCount=0;st.stage='none';st.confirms=0;st.alternated=false;st.unreachableFlagged=false;
  st.recoveries=0;st.observeUntil=0;st.lastRemaining=Infinity;
  if(s._movementGoalUnreachable)s._movementGoalUnreachable=false;
}
/* Rebase progress evidence after a meaningful recovery action: the next measurement starts
   from the post-action state, so one episode cannot escalate on pre-action evidence. */
function rebaseEvidence(s,battle){
  var st=prog(s),t=now(battle),here=posOf(s);
  st.samples=here?[{t:t,x:here.x,z:here.z}]:[];
  st.goalSince=t;st.stuck=false;st.confirmCount=0;
  st.lastRouteIndex=routeIndex(s);st.lastRemaining=routeRemaining(s);
  st.observeUntil=t+OBSERVE_AFTER_ACTION;
}

/* Called by the movement resolver once per committed intent. Returns a recovery advice object or
   null. The episode runs: suspected -> confirmed -> rebuild -> observe -> alternate -> observe
   -> unreachable (flagged once per goal). Formation intent has no alternate candidate, so it
   rebuilds once and then goes unreachable without recording a candidate failure. This function
   never writes soldier.destination; it only advises, and the owning subsystem abandons goals. */
function observe(s,battle,goalPoint,pick){
  if(!s||!battle||s.dead)return null;
  var st=prog(s),t=now(battle),goal=point(goalPoint);
  expireFailures(st,t);
  if(!goal||!expectedToMove(s,pick,battle)){if(st.goal||st.stuck)clearTracking(s);return null;}
  var owner=pick&&pick.owner?String(pick.owner):'',kind=pick&&pick.kind?String(pick.kind):'';
  /* A genuine authoritative goal change resets old stuck evidence: new point, new owner, or
     new kind starts a fresh episode instead of spanning one window across two goals. */
  if(!st.goal||dist(st.goal,goal)>EQUIV||st.owner!==owner||st.kind!==kind){
    st.goal={x:goal.x,z:goal.z};st.owner=owner;st.kind=kind;
    st.goalSince=t;st.samples=[];st.stuck=false;st.confirmCount=0;
    st.stage='none';st.confirms=0;st.alternated=false;st.unreachableFlagged=false;st.recoveries=0;st.observeUntil=0;
    st.lastRouteIndex=routeIndex(s);st.lastRemaining=routeRemaining(s);
    if(s._movementGoalUnreachable)s._movementGoalUnreachable=false;
  }
  var here=posOf(s);if(!here)return null;
  var last=st.samples[st.samples.length-1];
  if(!last||t-last.t>=SAMPLE_DT)st.samples.push({t:t,x:here.x,z:here.z});
  while(st.samples.length&&t-st.samples[0].t>STUCK_WINDOW*1.6)st.samples.shift();
  var remaining=dist(here,st.goal);
  /* Arrival clears failure memory around the goal and ends the episode. */
  if(remaining<=GOAL_FAR){
    if(st.goal)clearFailuresNear(s,battle,st.goal);
    st.stuck=false;st.confirmCount=0;st.stage='none';st.confirms=0;
    return null;
  }
  /* Local avoidance / choke yielding gets grace: evidence keeps accumulating, but no new
     stuck declaration and no escalation while the soldier is being pushed around. */
  if(avoidanceActive(s,battle)){st.stuck=false;return null;}
  var need=STUCK_WINDOW;
  var first=st.samples[0];
  if(!first||t-first.t<need||t-st.goalSince<need)return null;
  var net=Math.hypot(here.x-first.x,here.z-first.z);
  /* Route progress excuses low Euclidean net progress: waypoint advancement, remaining-path
     reduction, or real odometer movement all count as valid movement on a curved detour. */
  var rIdx=routeIndex(s),rRem=routeRemaining(s),advanced=rIdx>st.lastRouteIndex,
      remShrank=(rRem!=null&&st.lastRemaining!=null&&rRem<st.lastRemaining);
  var odo=0,i;
  for(i=1;i<st.samples.length;i++)odo+=Math.hypot(st.samples[i].x-st.samples[i-1].x,st.samples[i].z-st.samples[i-1].z);
  var routeProgress=advanced||remShrank||odo>=STUCK_NET;
  if(net>=STUCK_NET||routeProgress){
    st.stuck=false;st.confirmCount=0;
    if(st.stage==='suspected')st.stage='none';
    st.lastRouteIndex=rIdx;st.lastRemaining=rRem;
    return null;
  }
  /* Low progress this window. Confirmation needs repeated windows so one poor sample,
     temporary congestion, combat interruption or a single bad window never escalates. */
  st.confirmCount++;
  if(st.confirmCount<CONFIRM_WINDOWS)return null;
  st.confirmCount=0;
  if(!st.stuck){st.stuck=true;st.stuckSince=t;stats(battle).stuckDetections++;}
  if(st.stage==='none')st.stage='suspected';
  /* Every escalation needs its observation period first. */
  if(t<st.observeUntil)return null;
  var gated=gatedKind(st.kind);
  /* One rebuild per goal episode, then one alternate (gated kinds only), then unreachable.
     st.recoveries / st.alternated make each stage fire exactly once even when an escalation
     is deferred by the observation period. */
  if(st.recoveries===0){
    st.stage='confirmed';st.confirms++;
    st.lastRecoveryAt=t;st.recoveries++;stats(battle).recoveryAttempts++;
    stats(battle).routeRebuilds++;st.stage='rebuilding';st.stageAt=t;
    rebaseEvidence(s,battle);
    return{rebuild:true,round:st.recoveries};
  }
  if(!gated){
    /* No alternate exists for this kind: one rebuild was already tried, so flag
       unreachable (once) for the owner to abandon. No candidate is recorded because
       formation intent must never be suppressed. */
    if(st.unreachableFlagged)return null;
    st.unreachableFlagged=true;
    s._movementGoalUnreachable=true;stats(battle).unreachableFlags++;
    return{rebuild:true,unreachable:true,round:st.recoveries};
  }
  if(!st.alternated){
    st.lastRecoveryAt=t;st.recoveries++;stats(battle).recoveryAttempts++;
    noteFailure(s,battle,st.goal,'no-progress');
    stats(battle).alternateApproaches++;
    st.alternated=true;st.stage='alternate';st.stageAt=t;
    rebaseEvidence(s,battle);
    return{rebuild:true,alternate:true,round:st.recoveries};
  }
  /* Genuinely unreachable requires repeated confirmed failure, including a full
     observation window after the alternate approach. Flagged once per goal episode. */
  st.confirms++;
  if(st.confirms<UNREACHABLE_CONFIRMS||st.unreachableFlagged)return null;
  st.unreachableFlagged=true;
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

if(root.BattleModules)root.BattleModules.registerSystem('movement-progress',{version:'2.0-episode',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:summary});
root.BattleMovementProgress={version:'2.0-episode',observe:observe,candidateAllowed:candidateAllowed,gatedKind:gatedKind,noteFailure:noteFailure,clearFailuresNear:clearFailuresNear,isStuck:isStuck,summary:summary,reset:reset,
  tuning:{stuckWindow:STUCK_WINDOW,stuckNet:STUCK_NET,goalFar:GOAL_FAR,failTTL:FAIL_TTL,confirmWindows:CONFIRM_WINDOWS,observeAfterAction:OBSERVE_AFTER_ACTION,unreachableConfirms:UNREACHABLE_CONFIRMS}};
console.log('[MOVE] movement progress active: episode stuck detection + graduated recovery + candidate memory');
})(typeof window!=='undefined'?window:globalThis);
