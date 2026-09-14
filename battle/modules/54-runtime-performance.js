/* Low-overhead browser performance telemetry for the Battle Sim.
   Samples frame/simulation cost and scene growth without changing simulation cadence. Detailed
   histories are bounded and only summarized every two wall-clock seconds. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleSim||root.BattleRuntimePerformance)return;

var VERSION='runtime-perf-v1',SAMPLE_MS=2000,RING=240,HISTORY=120,SOLDIER_SAMPLE_MASK=15;
function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function push(a,v,max){if(isFinite(v)){a.push(v);if(a.length>max)a.shift();}}
function avg(a){if(!a.length)return null;var n=0;for(var i=0;i<a.length;i++)n+=a[i];return n/a.length;}
function max(a){if(!a.length)return null;var n=-Infinity;for(var i=0;i<a.length;i++)if(a[i]>n)n=a[i];return n;}
function pct(a,p){if(!a.length)return null;var c=a.slice().sort(function(x,y){return x-y;}),i=Math.min(c.length-1,Math.max(0,Math.ceil(c.length*p)-1));return c[i];}
function round(v){return v==null||!isFinite(v)?null:+v.toFixed(2);}
function sceneCount(scene,key){var v=scene&&scene[key];return v&&typeof v.length==='number'?v.length:null;}
function observerCount(scene){if(!scene)return null;var names=['onBeforeRenderObservable','onAfterRenderObservable','onBeforeAnimationsObservable','onAfterAnimationsObservable'],n=0,seen=false;for(var i=0;i<names.length;i++){var o=scene[names[i]],a=o&&(o.observers||o._observers);if(a&&typeof a.length==='number'){n+=a.length;seen=true;}}return seen?n:null;}
function sceneSnapshot(scene){return{meshes:sceneCount(scene,'meshes'),transformNodes:sceneCount(scene,'transformNodes'),materials:sceneCount(scene,'materials'),textures:sceneCount(scene,'textures'),particleSystems:sceneCount(scene,'particleSystems'),animationGroups:sceneCount(scene,'animationGroups'),activeAnimatables:sceneCount(scene,'animatables'),observers:observerCount(scene)};}
function createState(sim){return sim._runtimePerformance={version:VERSION,startedAt:clock(),lastFrameAt:0,lastSampleAt:clock(),renderStart:0,lastSimDuration:0,frameMs:[],simMs:[],renderMs:[],history:[],latest:null,squadMs:0,squadCalls:0,soldierSampleMs:0,soldierSamples:0,soldierCalls:0,lastMoveRequests:0,lastMoveChanges:0,lastBattleTime:+sim.time||0};}
function telemetryState(){try{return root.BattleTelemetry&&root.BattleTelemetry.state?root.BattleTelemetry.state():null;}catch(_){return null;}}
function movementState(sim){var m=sim&&sim._movementGoalStats||{};return{requests:+m.requests||0,actualChanges:+m.actualChanges||0,orderNoopRetains:+m.orderNoopRetains||0,shadowedFormationRequestsIgnored:+m.shadowedFormationRequestsIgnored||0};}
function sample(sim,st,t){
  var wallSeconds=Math.max(.001,(t-st.lastSampleAt)/1000),battleDelta=Math.max(0,(+sim.time||0)-st.lastBattleTime),mv=movementState(sim),engine=sim.scene&&sim.scene.getEngine&&sim.scene.getEngine();
  var row={wallAt:Date.now(),battleTime:round(+sim.time||0),timeScale:round(+sim.timeScale||0),fpsCurrent:engine&&engine.getFps?round(engine.getFps()):null,frameMsAverage:round(avg(st.frameMs)),frameMsP95:round(pct(st.frameMs,.95)),frameMsMax:round(max(st.frameMs)),simUpdateMsAverage:round(avg(st.simMs)),simUpdateMsP95:round(pct(st.simMs,.95)),renderMsAverage:round(avg(st.renderMs)),ai:{squadMsPerWallSecond:round(st.squadMs/wallSeconds),squadCalls:st.squadCalls,soldierSampleMsPerWallSecond:round(st.soldierSampleMs/wallSeconds),soldierCalls:st.soldierCalls,soldierTimedSamples:st.soldierSamples},movement:{requestsPerWallSecond:round((mv.requests-st.lastMoveRequests)/wallSeconds),changesPerWallSecond:round((mv.actualChanges-st.lastMoveChanges)/wallSeconds),requestsPerSimSecond:battleDelta>0?round((mv.requests-st.lastMoveRequests)/battleDelta):null,changesPerSimSecond:battleDelta>0?round((mv.actualChanges-st.lastMoveChanges)/battleDelta):null,totalRequests:mv.requests,totalChanges:mv.actualChanges,orderNoopRetains:mv.orderNoopRetains,shadowedFormationRequestsIgnored:mv.shadowedFormationRequestsIgnored},telemetry:telemetryState(),scene:sceneSnapshot(sim.scene)};
  st.latest=row;st.history.push(row);if(st.history.length>HISTORY)st.history.shift();
  st.frameMs.length=0;st.simMs.length=0;st.renderMs.length=0;st.squadMs=0;st.squadCalls=0;st.soldierSampleMs=0;st.soldierSamples=0;st.soldierCalls=0;st.lastMoveRequests=mv.requests;st.lastMoveChanges=mv.actualChanges;st.lastBattleTime=+sim.time||0;st.lastSampleAt=t;return row;
}
function summary(sim){var st=sim&&sim._runtimePerformance;if(!st)return null;return{version:VERSION,latest:st.latest,history:st.history.slice(),historyLimit:HISTORY,scene:sceneSnapshot(sim.scene),telemetry:telemetryState()};}

if(root.SquadAI&&!root.SquadAI.__runtimePerfWrapped){
  var oldSquad=root.SquadAI.updateSquad,oldSoldier=root.SquadAI.updateSoldier,sampleSerial=0;
  if(typeof oldSquad==='function')root.SquadAI.updateSquad=function(sq,battle){var st=battle&&battle._runtimePerformance,t=st?clock():0;try{return oldSquad.apply(this,arguments);}finally{if(st){st.squadMs+=clock()-t;st.squadCalls++;}}};
  if(typeof oldSoldier==='function')root.SquadAI.updateSoldier=function(s,battle){var st=battle&&battle._runtimePerformance,doTime=!!(st&&((sampleSerial++&SOLDIER_SAMPLE_MASK)===0)),t=doTime?clock():0;try{return oldSoldier.apply(this,arguments);}finally{if(st){st.soldierCalls++;if(doTime){st.soldierSampleMs+=clock()-t;st.soldierSamples++;}}}};
  root.SquadAI.__runtimePerfWrapped=true;
}

var oldStart=root.BattleSim.start;
root.BattleSim.start=function(scene,opts){
  var sim=oldStart.apply(this,arguments),st=createState(sim),original=sim._frame;
  sim._frame=function(forcedDt){var t0=clock();if(st.lastFrameAt)push(st.frameMs,t0-st.lastFrameAt,RING);st.lastFrameAt=t0;st.renderStart=t0;var out=original.apply(sim,arguments),t1=clock();st.lastSimDuration=t1-t0;push(st.simMs,st.lastSimDuration,RING);if(t1-st.lastSampleAt>=SAMPLE_MS)sample(sim,st,t1);return out;};
  if(scene&&scene.onAfterRenderObservable&&scene.onAfterRenderObservable.add)st.afterObserver=scene.onAfterRenderObservable.add(function(){if(st.renderStart)push(st.renderMs,Math.max(0,clock()-st.renderStart-(st.lastSimDuration||0)),RING);});
  return sim;
};
root.BattleModules.registerSystem('runtime-performance',{version:VERSION});
root.BattleRuntimePerformance={version:VERSION,summary:summary,sceneSnapshot:sceneSnapshot};
console.log('[PERF] bounded runtime performance sampling active');
})(typeof window!=='undefined'?window:globalThis);
