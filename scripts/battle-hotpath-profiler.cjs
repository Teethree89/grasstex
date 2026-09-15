/* Benchmark-only inclusive wall-time profiler.
   Inject this after the Battle Sim page has loaded. It wraps public runtime entry points and
   registered system hooks without changing their arguments, return values, scheduling or state.
   Production never loads this file. */
(function(root){
  'use strict';
  if(root.BattleHotpathProfiler)return;

  var clock=(root.performance&&typeof root.performance.now==='function')?function(){return root.performance.now();}:function(){return Date.now();};
  var startedAt=clock(),stats=Object.create(null),wrapped=[],scope=[];

  function bucket(label){return stats[label]||(stats[label]={label:label,calls:0,totalMs:0,maxMs:0});}
  function record(label,elapsed){var b=bucket(label);b.calls++;b.totalMs+=elapsed;if(elapsed>b.maxMs)b.maxMs=elapsed;}
  function recordCount(label){var b=bucket(label);b.calls++;}
  function safeLabel(v){return String(v==null||v===''?'unknown':v).replace(/[^a-zA-Z0-9_.:-]+/g,'_').slice(0,80);}
  function movementProducer(soldier){
    var st=soldier&&soldier._movementResolver,last=st&&(st.last||st.goal)||null;
    return{owner:safeLabel(last&&last.owner),kind:safeLabel(last&&last.kind),reason:safeLabel(last&&last.reason),tactical:safeLabel(last&&last.tacticalReason)};
  }
  function recordMovementAttribution(prefix,soldier){
    var p=movementProducer(soldier);
    recordCount(prefix+'.owner.'+p.owner);
    recordCount(prefix+'.kind.'+p.kind);
    recordCount(prefix+'.owner-kind.'+p.owner+'__'+p.kind);
    if(p.reason!=='unknown')recordCount(prefix+'.reason.'+p.reason);
    if(p.tactical!=='unknown')recordCount(prefix+'.tactical.'+p.tactical);
  }
  function wrap(obj,key,label){
    if(!obj||typeof obj[key]!=='function')return false;
    var fn=obj[key];if(fn.__battleHotpathWrapped)return false;
    function profiled(){var start=clock();try{return fn.apply(this,arguments);}finally{record(label,clock()-start);}}
    profiled.__battleHotpathWrapped=true;profiled.__battleHotpathOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});return true;
  }
  function wrapScoped(obj,key,label){
    if(!obj||typeof obj[key]!=='function')return false;
    var fn=obj[key];if(fn.__battleHotpathWrapped)return false;
    function profiled(){var start=clock();scope.push(label);try{return fn.apply(this,arguments);}finally{scope.pop();record(label,clock()-start);}}
    profiled.__battleHotpathWrapped=true;profiled.__battleHotpathOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});return true;
  }
  function wrapMany(obj,prefix,names){for(var i=0;i<names.length;i++)wrap(obj,names[i],prefix+'.'+names[i]);}
  function currentScope(){return scope.length?scope[scope.length-1]:'unscoped';}
  function wrapSightQuery(key){
    var obj=root.BattleObstacleField;if(!obj||typeof obj[key]!=='function')return false;
    var fn=obj[key];if(fn.__battleHotpathWrapped)return false;
    var label='obstacle.'+key;
    function profiled(){var parent=currentScope(),start=clock();try{return fn.apply(this,arguments);}finally{var elapsed=clock()-start;record(label,elapsed);record(label+'@'+parent,elapsed);}}
    profiled.__battleHotpathWrapped=true;profiled.__battleHotpathOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});return true;
  }
  function physicalVersion(sim){
    var N=root.BattleNavigation,o=sim&&sim.obstacles;if(!N||!o)return null;
    var p=o.__physicalFootprints,count;
    if(Array.isArray(p)&&p.length)count=p.length;
    else{count=0;for(var i=0;i<o.length;i++)if(o[i]&&({hedge:1,tree:1,log:1,wall:1,rock:1})[String(o[i].type||'').toLowerCase()])count++;}
    return String(N.version)+'|'+String(o.__physicalVersion||0)+'|'+String(count);
  }
  function dist(a,b){return!a||!b?Infinity:Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0));}
  function baseRebuildReason(sim,soldier,dest,before){
    if(!before)return'missing';
    if(root.BattleNavigation&&before.version!==root.BattleNavigation.version)return'version';
    if(dest&&isFinite(+dest.x)&&isFinite(+dest.z)&&Math.hypot(+dest.x-(+before.destX||0),+dest.z-(+before.destZ||0))>2)return'goal-shift';
    return'other';
  }
  function physicalReplanReason(sim,soldier,dest,before){
    if(!before)return'missing';
    var pv=physicalVersion(sim);if(pv!=null&&before.version!==pv)return'version';
    if(dest&&isFinite(+dest.x)&&isFinite(+dest.z)&&Math.hypot(+dest.x-(+before.finalGoalX||0),+dest.z-(+before.finalGoalZ||0))>1.4)return'goal-shift';
    var points=before.points||[];
    if(!points.length){
      if(sim&&+sim.time>=(+before.replanAt||Infinity))return'empty-timeout';
      if(!before.blocked&&soldier&&soldier.root&&dist(soldier.root.position,before.standGoal)>.88)return'empty-active';
      return'empty-other';
    }
    if(sim&&+sim.time>=(+before.replanAt||Infinity))return'periodic';
    if(points.length<=3)return'low-queue-or-segment';
    return'first-segment-invalid';
  }
  function wrapNavigationWaypoint(){
    var obj=root.BattleNavigation,key='nextWaypoint';
    if(!obj||typeof obj[key]!=='function')return false;
    var fn=obj[key];if(fn.__battleHotpathWrapped)return false;
    function profiled(sim,soldier,dest){
      var beforeNav=soldier&&soldier._navCache,beforePhysical=soldier&&soldier._physicalPath,start=clock();
      try{return fn.apply(this,arguments);}
      finally{
        var elapsed=clock()-start,afterNav=soldier&&soldier._navCache,afterPhysical=soldier&&soldier._physicalPath;
        record('navigation.nextWaypoint',elapsed);
        if(afterNav!==beforeNav){
          var br=baseRebuildReason(sim,soldier,dest,beforeNav);
          record('navigation.nextWaypoint.baseCacheRebuild',elapsed);recordCount('navigation.baseRebuildReason.'+br);
          if(br==='missing'||br==='goal-shift')recordMovementAttribution('navigation.baseRebuild.'+br,soldier);
        }else record('navigation.nextWaypoint.baseCacheReuse',elapsed);
        if(afterPhysical!==beforePhysical){
          var pr=physicalReplanReason(sim,soldier,dest,beforePhysical);
          record('navigation.nextWaypoint.physicalReplan',elapsed);recordCount('navigation.physicalReplanReason.'+pr);
          if(pr==='goal-shift'||pr==='missing')recordMovementAttribution('navigation.physicalReplan.'+pr,soldier);
        }else record('navigation.nextWaypoint.physicalReuse',elapsed);
      }
    }
    profiled.__battleHotpathWrapped=true;profiled.__battleHotpathOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});return true;
  }
  function wrapSystems(){
    if(!root.BattleModules||!root.BattleModules.listSystems)return;
    var systems=root.BattleModules.listSystems();
    for(var i=0;i<systems.length;i++){
      var system=systems[i];if(!system||!system.id)continue;
      ['onSimulationStep','onCommanderTick'].forEach(function(hook){wrapScoped(system,hook,'system:'+system.id+'.'+hook);});
    }
  }
  function install(){
    /* Parent timings first: these make it possible to reconcile expensive leaves against the
       enclosing simulation/command work without changing production scheduling. */
    wrapMany(root.__battle__,'simulation',['step','_frame','_checkWinner']);
    wrapScoped(root.BattleCommanderAI,'update','commander.update');wrap(root.BattleCommanderAI,'advanceRoute','commander.advanceRoute');
    wrapMany(root.BattleModules,'modules',['runHook']);

    wrapSightQuery('sightBlocked');wrapSightQuery('sightBlocker');
    wrapMany(root.BattleObstacleField,'obstacle',['coverAt','coverPotentialAt','nearby']);
    wrapNavigationWaypoint();
    wrapMany(root.BattleNavigation,'navigation',['findPath','movementClear','resolveStep','lineOfSightBlocked']);
    wrapMany(root.BattleMovementResolver,'movement-resolver',['proposeOrder','proposeCombat','resolve']);
    wrapScoped(root.SquadAI,'updateSoldier','squad.updateSoldier');wrapScoped(root.SquadAI,'updateSquad','squad.updateSquad');
    wrapMany(root.SquadAI,'squad',['hasLineOfSight','findTarget','canSuppress','areaFire','resolveFire']);
    wrapMany(root.BattleCombatMobility,'combat-mobility',['request']);
    wrapMany(root.BattleTacticalPositions,'tactical-position',['claim','release','update','waypoint','assign']);
    wrapMany(root.BattleCommanderRoutes,'commander-routes',['ensureAssignments','assignSquad','initForce','routeFor']);
    wrapMany(root.BattleCommanderDoctrine,'commander-doctrine',['chooseObjective','buildContext','nearestEnemyToSquad','objectiveValueScore','forceScore']);
    wrapScoped(root.BattleEngagement,'updateSoldier','engagement.updateSoldier');wrapScoped(root.BattleEngagement,'updateSquad','engagement.updateSquad');
    wrapSystems();
  }
  function reset(){stats=Object.create(null);startedAt=clock();scope.length=0;}
  function snapshot(limit){
    var wallMs=Math.max(0,clock()-startedAt),rows=Object.keys(stats).map(function(k){var b=stats[k];return{label:b.label,calls:b.calls,totalMs:+b.totalMs.toFixed(3),maxMs:+b.maxMs.toFixed(3),avgUs:b.calls?+(b.totalMs*1000/b.calls).toFixed(2):0,wallPct:wallMs?+(b.totalMs/wallMs*100).toFixed(2):0};});
    rows.sort(function(a,b){return b.totalMs-a.totalMs||b.calls-a.calls;});if(limit>0)rows=rows.slice(0,limit);
    return{version:'1.4',wallMs:+wallMs.toFixed(3),rows:rows};
  }
  function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__battleHotpathWrapped)w.obj[w.key]=w.fn;}wrapped=[];scope.length=0;}

  install();
  root.BattleHotpathProfiler={version:'1.4',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);