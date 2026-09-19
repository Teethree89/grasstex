/* End-of-session full diagnostics export.
   Adds a one-click JSON dump to the existing win/end banner without changing battle behavior.
   The exporter snapshots simulation state on demand so normal play and headless benchmarks do not
   pay an ongoing telemetry-copy cost. */
(function(root){
'use strict';
if(root.BattleDiagnosticsExport)return;

var activeSim=null;

function finite(v){return typeof v==='number'&&isFinite(v)?v:null;}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function safePlain(value,depth,seen){
  depth=depth==null?7:depth;seen=seen||[];
  if(value==null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return isFinite(value)?value:null;
  if(typeof value==='function'||depth<=0)return undefined;
  if(seen.indexOf(value)>=0)return '[circular]';
  if(Array.isArray(value)){
    seen.push(value);var a=[];
    for(var i=0;i<value.length;i++){var av=safePlain(value[i],depth-1,seen);if(av!==undefined)a.push(av);}
    seen.pop();return a;
  }
  if(typeof value==='object'){
    /* Rendering objects are enormous and circular. Diagnostics records their gameplay-facing state
       elsewhere, so do not serialize Babylon scene/mesh/material internals by accident. */
    if(value.getClassName||value.getScene||value._scene||value._engine)return '[render-object]';
    seen.push(value);var out={};
    Object.keys(value).forEach(function(k){
      if(k==='scene'||k==='root'||k==='mesh'||k==='socket'||k==='rig'||k==='animationBinding'||k==='poseRoot'||k==='weaponSocket')return;
      var v=safePlain(value[k],depth-1,seen);if(v!==undefined)out[k]=v;
    });
    seen.pop();return out;
  }
  return String(value);
}
function engagement(s){return s&&s.eng?safePlain(s.eng,4):null;}
function soldier(s){
  var w=s&&s.weapon||{},p=s&&s.root&&s.root.position||{};
  return{
    id:s&&s.id,faction:s&&s.faction,role:s&&s.role,dead:!!(s&&s.dead),hp:finite(+s.hp),maxHp:finite(+s.maxHp),
    position:{x:finite(+p.x),y:finite(+p.y),z:finite(+p.z)},destination:point(s&&s.destination),orderDestination:point(s&&s.orderDestination),
    targetId:s&&s.target?s.target.id:null,state:s&&s.state||null,gait:s&&s._locomotionGait||null,speed:finite(+(s&&s.speed)),moveSpeed:finite(+(s&&s.moveSpeed)),
    moving:!!(s&&s.moving),movementStopReason:s&&s._movementStopReason||null,crouching:!!(s&&(s.crouching||s.tacticalCrouch)),prone:!!(s&&s.prone),crawling:!!(s&&s.crawling),
    suppressedUntil:finite(+(s&&s.suppressedUntil)),setUp:!!(s&&s.setUp),reloading:!!(s&&s.reloading),reloadUntil:finite(+(s&&s.reloadUntil)),
    clearingStoppage:!!(s&&s.clearingStoppage),stoppageUntil:finite(+(s&&s.stoppageUntil)),outOfAmmo:!!(s&&s.outOfAmmo),
    weapon:{kind:w.kind||null,ammo:finite(+w.ammo),reserveAmmo:finite(+w.reserveAmmo),magSize:finite(+w.magSize),heat:finite(+w.heat),jammed:!!w.jammed},
    ammoState:safePlain(s&&s._ammoState,3),engagement:engagement(s),
    movement:safePlain(s&&s._movementResolver?{last:s._movementResolver.last,changes:s._movementResolver.changes,requests:s._movementResolver.requests,history:(s._movementResolver.history||[]).slice(-6)}:null,5),
    movementProgress:safePlain(s&&s._movementProgress?{stuck:!!s._movementProgress.stuck,recoveries:s._movementProgress.recoveries||0,goalUnreachable:!!s._movementGoalUnreachable}:null,3),
    positionalTask:root.BattleTacticalPositions?safePlain(root.BattleTacticalPositions.current(s),7):null
  };
}
function rallyState(sq){
  var st=sq&&sq._rallyState;
  if(!st)return{accepted:false,anchor:null,enteredAt:0,entries:0,exits:0,suppressed:0,stragglerSuppressions:0,rallyRequests:0,releasableAtEntry:0,entryReasons:null,exitReasons:null,lastEntry:null,lastExit:null,bypassUntil:finite(+sq._rallyBypassUntil)};
  return{
    accepted:!!st.accepted,anchor:point(st.anchor),enteredAt:finite(+st.enteredAt),entries:finite(+st.entries),
    exits:finite(+st.exits),suppressed:finite(+st.suppressed),stragglerSuppressions:finite(+st.stragglerSuppressions),
    rallyRequests:finite(+st.rallyRequests),releasableAtEntry:finite(+st.releasableAtEntry),
    entryReasons:safePlain(st.entryReasons,2),exitReasons:safePlain(st.exitReasons,2),
    missionVersion:finite(+st.missionVersion),lastEntry:safePlain(st.lastEntry,3),lastExit:safePlain(st.lastExit,3),bypassUntil:finite(+sq._rallyBypassUntil)
  };
}
function squad(sq){
  return{
    id:sq.id,faction:sq.faction,state:sq.state||null,commandPhase:sq.commandPhase||null,commandRole:sq.commandRole||null,
    aliveCount:finite(+sq.aliveCount),captainAlive:sq.captainAlive!==false,inContact:!!sq.inContact,targetObjective:sq.targetObjective||null,
    objective:point(sq.objective),rally:point(sq.rally),routeIndex:finite(+sq.routeIndex),route:safePlain(sq.route,3),
    commandHoldUntil:finite(+sq.commandHoldUntil),accuracyMultiplier:finite(+sq.accuracyMultiplier),
    /* Entry/exit reasons, not just counts: the roadmap's regroup-churn item needs to know which
       gate admitted each entry and which clause released it. `entries` alone cannot say. */
    rally:rallyState(sq),
    /* Macro brief (General-owned) vs Captain execution (Meso-owned): the two halves of the mission contract. */
    mission:safePlain(sq._macroMission?Object.assign({},sq._macroMission,{key:undefined}):null,4),lastMission:safePlain(sq._lastMacroMission?Object.assign({},sq._lastMacroMission,{key:undefined}):null,4),
    captainRequest:safePlain(sq._macroMissionRequest,3),
    missionExecution:sq._missionExecution?{version:sq._missionExecution.mission?sq._missionExecution.mission.version:null,acceptedAt:finite(+sq._missionExecution.acceptedAt),holdPoint:point(sq._missionExecution.holdPoint)}:null,
    contact:safePlain(sq._contact,4),members:(sq.members||[]).map(soldier)
  };
}
function objectives(sim){
  var list=sim&&sim._objectives||[];
  return list.map(function(o){
    var status=null;try{status=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status?root.BattleObjectiveSystem.status(sim,o.id):o.state||null;}catch(_){}
    return{id:o.id,type:o.type||o.def&&o.def.type||null,def:safePlain(o.def,4),status:safePlain(status,4)};
  });
}
function diagnosticFields(sim){
  var out={},deny={_roster:1,_moduleUnits:1,_rng:1,_disposables:1,_renderObserver:1,scene:1,factions:1};
  Object.keys(sim||{}).forEach(function(k){
    if(deny[k])return;
    if(!/(health|summary|stats|metric|telemetry|loop|coordination|ammunition|assault|objectiveControl|objectiveHold)/i.test(k))return;
    var v=safePlain(sim[k],6);if(v!==undefined)out[k]=v;
  });
  return out;
}
function consoleDump(){
  if(typeof document==='undefined')return null;
  var el=document.getElementById('debugConsole');return el?el.innerText:null;
}
function buildPayload(sim){
  sim=sim||activeSim;if(!sim)throw new Error('No active battle simulation');
  var scenario=sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||null;
  var systems=[];try{systems=root.BattleModules?root.BattleModules.listSystems().map(function(s){return{id:s.id,version:s.version||null};}):[];}catch(_){}
  var policy=null;try{policy=root.BattleAIPolicy&&root.BattleAIPolicy.get?root.BattleAIPolicy.get():null;}catch(_){}
  var ammo=null;try{ammo=root.BattleAmmunition&&root.BattleAmmunition.summary?root.BattleAmmunition.summary(sim):null;}catch(_){}
  return{
    format:'grasstex-battle-full-diagnostics-v1',
    exportedAt:new Date().toISOString(),
    build:root.BATTLE_BUILD||root.BATTLE_BUILD_DEPLOYED||'dev',ref:root.BATTLE_REF||null,
    page:typeof location!=='undefined'?location.href:null,userAgent:typeof navigator!=='undefined'?navigator.userAgent:null,
    battle:{time:finite(+sim.time),timeLimit:finite(+sim.timeLimit),timeScale:finite(+sim.timeScale),paused:!!sim.paused,winner:sim.winner||null,winReason:sim.winReason||null,manualEnded:!!sim.manualEnded},
    scenario:safePlain(scenario,7),
    telemetry:root.BattleTelemetry&&root.BattleTelemetry.state?root.BattleTelemetry.state():null,
    policy:{revision:root.BattleAIPolicy&&root.BattleAIPolicy.revision!=null?root.BattleAIPolicy.revision:null,genome:safePlain(policy,7)},
    modules:systems,
    objectives:objectives(sim),
    objectiveControl:safePlain(sim.objectiveControl,6),objectiveHold:safePlain(sim.objectiveHold,4),
    ammunition:ammo,
    tacticalPositions:root.BattleTacticalPositions?root.BattleTacticalPositions.summary(sim):null,
    coverPositions:root.BattleCoverPositions?root.BattleCoverPositions.snapshot(sim):null,
    macroCommand:{enabled:sim.macroCommandEnabled!==false,mode:sim._macroMissionState&&sim._macroMissionState.mode||'event-driven',state:safePlain(sim._macroMissionState,5)},
    ownership:sim._orderProvenance?{events:(sim._orderProvenance.seq||0),conflicts:(sim._orderProvenance.conflicts||[]).length,recentConflicts:safePlain((sim._orderProvenance.conflicts||[]).slice(0,20).map(function(c){return{kind:c.kind,time:c.time,field:c.field,squad:c.squad,soldier:c.soldier,owners:c.owners};}),4)}:null,
    factions:{
      us:{alive:sim.factions&&sim.factions.us&&sim.factions.us.alive,kills:sim.factions&&sim.factions.us&&sim.factions.us.kills,squads:(sim.factions&&sim.factions.us&&sim.factions.us.squads||[]).map(squad)},
      ge:{alive:sim.factions&&sim.factions.ge&&sim.factions.ge.alive,kills:sim.factions&&sim.factions.ge&&sim.factions.ge.kills,squads:(sim.factions&&sim.factions.ge&&sim.factions.ge.squads||[]).map(squad)}
    },
    runtimeDiagnostics:diagnosticFields(sim),
    console:consoleDump()
  };
}
function cleanName(v){return String(v||'battle').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'battle';}
function exportCurrent(sim){
  var payload=buildPayload(sim),seed=payload.scenario&&payload.scenario.seed||'battle',build=payload.build||'dev';
  var stamp=payload.exportedAt.replace(/[:.]/g,'-'),name='battle-full-diag-'+cleanName(seed)+'-'+cleanName(build)+'-'+stamp+'.json';
  if(typeof document==='undefined'||typeof Blob==='undefined'||!root.URL||!root.URL.createObjectURL)return payload;
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=root.URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){root.URL.revokeObjectURL(url);},1500);
  return payload;
}
function installButton(){
  if(typeof document==='undefined'||document.getElementById('bannerExportDiagnostics'))return;
  var restart=document.getElementById('bannerRestart'),host=restart&&restart.parentNode;if(!host)return;
  var b=document.createElement('button');b.id='bannerExportDiagnostics';b.type='button';b.textContent='Export Full Diagnostics';b.title='Download full battle state, squads, soldiers, ammo, objectives and runtime diagnostics as JSON';
  b.style.marginLeft='8px';b.style.background='#243247';b.style.borderColor='#58749a';
  b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();try{exportCurrent(activeSim);}catch(err){console.error('[DIAG] export failed',err);}});
  host.appendChild(b);
}

/* This module sorts last, so it sees the fully wrapped BattleSim.start and only remembers the
   returned simulation. It does not participate in movement, AI or benchmark results. */
if(root.BattleSim&&typeof root.BattleSim.start==='function'){
  var oldStart=root.BattleSim.start;
  root.BattleSim.start=function(scene,opts){activeSim=oldStart.apply(this,arguments);return activeSim;};
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
}
root.BattleDiagnosticsExport={version:'1.0',build:buildPayload,exportCurrent:exportCurrent,current:function(){return activeSim;}};
console.log('[DIAG] end-session full diagnostics export ready');
})(typeof window!=='undefined'?window:globalThis);
