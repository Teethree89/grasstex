/* Benchmark-only inclusive wall-time profiler.
   Inject this after the Battle Sim page has loaded. It wraps public runtime entry points and
   registered system hooks without changing their arguments, return values, scheduling or state.
   Production never loads this file. */
(function(root){
  'use strict';
  if(root.BattleHotpathProfiler)return;

  var clock=(root.performance&&typeof root.performance.now==='function')?function(){return root.performance.now();}:function(){return Date.now();};
  var startedAt=clock(),stats=Object.create(null),wrapped=[];

  function bucket(label){return stats[label]||(stats[label]={label:label,calls:0,totalMs:0,maxMs:0});}
  function record(label,elapsed){var b=bucket(label);b.calls++;b.totalMs+=elapsed;if(elapsed>b.maxMs)b.maxMs=elapsed;}
  function wrap(obj,key,label){
    if(!obj||typeof obj[key]!=='function')return false;
    var fn=obj[key];if(fn.__battleHotpathWrapped)return false;
    function profiled(){var start=clock();try{return fn.apply(this,arguments);}finally{record(label,clock()-start);}}
    profiled.__battleHotpathWrapped=true;profiled.__battleHotpathOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});return true;
  }
  function wrapMany(obj,prefix,names){for(var i=0;i<names.length;i++)wrap(obj,names[i],prefix+'.'+names[i]);}
  function wrapSystems(){
    if(!root.BattleModules||!root.BattleModules.listSystems)return;
    var systems=root.BattleModules.listSystems();
    for(var i=0;i<systems.length;i++){
      var system=systems[i];if(!system||!system.id)continue;
      ['onSimulationStep','onCommanderTick'].forEach(function(hook){wrap(system,hook,'system:'+system.id+'.'+hook);});
    }
  }
  function install(){
    /* Parent timings first: these make it possible to reconcile expensive leaves against the
       enclosing simulation/command work without changing production scheduling. */
    wrapMany(root.__battle__,'simulation',['step','_frame','_checkWinner']);
    wrapMany(root.BattleCommanderAI,'commander',['update','advanceRoute']);
    wrapMany(root.BattleModules,'modules',['runHook']);

    wrapMany(root.BattleObstacleField,'obstacle',['sightBlocked','sightBlocker','coverAt','coverPotentialAt','nearby']);
    wrapMany(root.BattleNavigation,'navigation',['findPath','nextWaypoint','movementClear','resolveStep','lineOfSightBlocked']);
    wrapMany(root.BattleMovementResolver,'movement-resolver',['proposeOrder','proposeCombat','resolve']);
    wrapMany(root.SquadAI,'squad',['updateSquad']);
    wrapMany(root.BattleCombatMobility,'combat-mobility',['request']);
    wrapMany(root.BattleTacticalPositions,'tactical-position',['claim','release','update','waypoint','assign']);
    wrapMany(root.BattleCommanderRoutes,'commander-routes',['ensureAssignments','assignSquad','initForce','routeFor']);
    wrapMany(root.BattleCommanderDoctrine,'commander-doctrine',['chooseObjective','buildContext','nearestEnemyToSquad','objectiveValueScore','forceScore']);
    wrapMany(root.BattleEngagement,'engagement',['updateSoldier','updateSquad']);
    wrapSystems();
  }
  function reset(){stats=Object.create(null);startedAt=clock();}
  function snapshot(limit){
    var wallMs=Math.max(0,clock()-startedAt),rows=Object.keys(stats).map(function(k){var b=stats[k];return{label:b.label,calls:b.calls,totalMs:+b.totalMs.toFixed(3),maxMs:+b.maxMs.toFixed(3),avgUs:b.calls?+(b.totalMs*1000/b.calls).toFixed(2):0,wallPct:wallMs?+(b.totalMs/wallMs*100).toFixed(2):0};});
    rows.sort(function(a,b){return b.totalMs-a.totalMs;});if(limit>0)rows=rows.slice(0,limit);
    return{version:'1.1',wallMs:+wallMs.toFixed(3),rows:rows};
  }
  function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__battleHotpathWrapped)w.obj[w.key]=w.fn;}wrapped=[];}

  install();
  root.BattleHotpathProfiler={version:'1.1',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);