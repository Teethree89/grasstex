/* Battle Sim / ww2fps AI lab telemetry + persistent decision logging.
   v21 serializes network delivery: accelerated simulation can produce decision events much faster
   than wall time, so auto-flushes are coalesced behind one in-flight request instead of spawning
   overlapping fetches every 20 events. */
(function(root){
  'use strict';
  var API_BASE=root.BATTLE_API_BASE||'/grasstex/',ENDPOINT=API_BASE+'battle_log.php';
  var queue=[],active=false,sessionId=null,mode='live',flushTimer=null,autoTimer=null,inFlight=null,seq=0,consoleLogging=!!root.BATTLE_DEBUG_TELEMETRY;
  var AUTO_DELAY=900,AUTO_THRESHOLD=120,AUTO_BATCH=160;
  var delivery={batches:0,sentEvents:0,failedBatches:0,highWater:0};
  function makeId(){return'b-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function safe(v){try{return JSON.parse(JSON.stringify(v));}catch(_){return{value:String(v)};}}
  function scenarioMeta(sim){var s=sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||root.BATTLE_SCENARIO||null;return{scenarioId:s&&s.id||null,scenarioSeed:s&&s.seed||null,trainingSeed:s&&s.metadata&&s.metadata.trainingSeed||null};}
  function ensure(sim,nextMode){if(active)return;sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',{mode:mode},sim,true);}
  function scheduleAuto(){if(autoTimer||!queue.length)return;autoTimer=setTimeout(function(){autoTimer=null;drain(false,false);},AUTO_DELAY);}
  function record(type,data,sim,internal){
    if(!active&&!internal)ensure(sim,'live');if(!active)return;var sm=scenarioMeta(sim);
    var e={session:sessionId,seq:++seq,mode:mode,build:root.BATTLE_BUILD||'dev',policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,scenarioId:sm.scenarioId,scenarioSeed:sm.scenarioSeed,trainingSeed:sm.trainingSeed,type:type,battleTime:sim&&isFinite(sim.time)?+sim.time.toFixed(3):null,clientTime:new Date().toISOString(),data:safe(data||{})};
    queue.push(e);delivery.highWater=Math.max(delivery.highWater,queue.length);if(consoleLogging&&(type.indexOf('decision')===0||type.indexOf('objective')===0||type.indexOf('policy-')===0||type==='reinforcement'||type==='module-spawn'||type==='battle-end'||type==='training-result'))console.log('[AI]',type,JSON.stringify(e.data));
    if(queue.length>=AUTO_THRESHOLD&&!autoTimer)autoTimer=setTimeout(function(){autoTimer=null;drain(false,false);},0);else scheduleAuto();
  }
  function send(events,beacon){if(!events.length)return Promise.resolve(true);var body=JSON.stringify({events:events});if(beacon&&navigator.sendBeacon){try{return Promise.resolve(navigator.sendBeacon(ENDPOINT,new Blob([body],{type:'application/json'})));}catch(_){}}return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:body,cache:'no-store',keepalive:true}).then(function(r){return r.ok;}).catch(function(){return false;});}
  function drain(beacon,all){
    if(inFlight)return inFlight.then(function(ok){return ok&&all&&queue.length?drain(beacon,true):ok;});
    if(!queue.length)return Promise.resolve(true);
    var count=(beacon||all)?queue.length:Math.min(AUTO_BATCH,queue.length),batch=queue.splice(0,count);delivery.batches++;
    inFlight=send(batch,!!beacon).then(function(ok){if(ok)delivery.sentEvents+=batch.length;else{delivery.failedBatches++;queue=batch.concat(queue);delivery.highWater=Math.max(delivery.highWater,queue.length);}inFlight=null;if(ok&&all&&queue.length)return drain(beacon,true);if(queue.length)scheduleAuto();return ok;});
    return inFlight;
  }
  function flush(beacon){if(autoTimer){clearTimeout(autoTimer);autoTimer=null;}return drain(!!beacon,true);}
  function start(sim,nextMode,meta){if(active)end(sim,'session-replaced');sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',Object.assign({mode:mode},meta||{}),sim,true);return sessionId;}
  function end(sim,reason,extra){if(!active)return Promise.resolve(true);record('battle-end',Object.assign({reason:reason||'ended'},extra||{}),sim,true);active=false;return flush(true);}
  function checkpoint(sim,reason,extra){if(active){record('battle-end',Object.assign({reason:reason||'checkpoint'},extra||{}),sim,true);active=false;}return flush(false);}
  function setConsoleLogging(next){var previous=consoleLogging;consoleLogging=!!next;return previous;}
  function state(){return{active:active,sessionId:sessionId,mode:mode,queued:queue.length,seq:seq,endpoint:ENDPOINT,consoleLogging:consoleLogging,inFlight:!!inFlight,delivery:{batches:delivery.batches,sentEvents:delivery.sentEvents,failedBatches:delivery.failedBatches,highWater:delivery.highWater,autoBatch:AUTO_BATCH,autoThreshold:AUTO_THRESHOLD}};}
  flushTimer=setInterval(function(){if(queue.length&&!inFlight)drain(false,false);},1500);window.addEventListener('pagehide',function(){if(queue.length)flush(true);});window.addEventListener('beforeunload',function(){if(queue.length)flush(true);});
  root.BattleTelemetry={start:start,ensure:ensure,record:record,end:end,checkpoint:checkpoint,flush:flush,setConsoleLogging:setConsoleLogging,state:state};console.log('[TELEMETRY] runtime v21 serial delivery loaded');
})(typeof window!=='undefined'?window:globalThis);
