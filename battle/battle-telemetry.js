/* Battle Sim / ww2fps AI lab telemetry + persistent decision logging.
   v21b keeps the v128 event semantics but serializes delivery: accelerated simulation can produce
   events much faster than wall time, so only one request may be in flight. Batches stay at the
   original safe 20-event size and failures back off instead of creating a fetch storm. */
(function(root){
  'use strict';
  var API_BASE=root.BATTLE_API_BASE||'/grasstex/',ENDPOINT=API_BASE+'battle_log.php';
  var queue=[],active=false,sessionId=null,mode='live',flushTimer=null,inFlight=null,retryAfter=0,seq=0,consoleLogging=!!root.BATTLE_DEBUG_TELEMETRY;
  var BATCH_MAX=20,RETRY_MS=4000,MAX_QUEUE=6000,delivery={batches:0,sentEvents:0,failedBatches:0,highWater:0,droppedEvents:0};
  function makeId(){return'b-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function safe(v){try{return JSON.parse(JSON.stringify(v));}catch(_){return{value:String(v)};}}
  function scenarioMeta(sim){var s=sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||root.BATTLE_SCENARIO||null;return{scenarioId:s&&s.id||null,scenarioSeed:s&&s.seed||null,trainingSeed:s&&s.metadata&&s.metadata.trainingSeed||null};}
  function ensure(sim,nextMode){if(active)return;sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',{mode:mode},sim,true);}
  function trimQueue(){if(queue.length<=MAX_QUEUE)return;var drop=queue.length-MAX_QUEUE;queue.splice(0,drop);delivery.droppedEvents+=drop;}
  function record(type,data,sim,internal){
    if(!active&&!internal)ensure(sim,'live');if(!active)return;var sm=scenarioMeta(sim);
    var e={session:sessionId,seq:++seq,mode:mode,build:root.BATTLE_BUILD||'dev',policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,scenarioId:sm.scenarioId,scenarioSeed:sm.scenarioSeed,trainingSeed:sm.trainingSeed,type:type,battleTime:sim&&isFinite(sim.time)?+sim.time.toFixed(3):null,clientTime:new Date().toISOString(),data:safe(data||{})};
    queue.push(e);trimQueue();delivery.highWater=Math.max(delivery.highWater,queue.length);
    if(consoleLogging&&(type.indexOf('decision')===0||type.indexOf('objective')===0||type.indexOf('policy-')===0||type==='reinforcement'||type==='module-spawn'||type==='battle-end'||type==='training-result'))console.log('[AI]',type,JSON.stringify(e.data));
    if(queue.length>=BATCH_MAX&&!inFlight&&Date.now()>=retryAfter)drain(false,false);
  }
  function send(events,beacon){if(!events.length||root.BATTLE_PREVIEW)return Promise.resolve(true); /* branch previews never write production logs */var body=JSON.stringify({events:events});if(beacon&&navigator.sendBeacon){try{return Promise.resolve(navigator.sendBeacon(ENDPOINT,new Blob([body],{type:'application/json'})));}catch(_){}}return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:body,cache:'no-store',keepalive:true}).then(function(r){return r.ok;}).catch(function(){return false;});}
  function drain(beacon,all){
    if(inFlight)return inFlight.then(function(ok){return ok&&all&&queue.length?drain(beacon,true):ok;});
    if(!queue.length)return Promise.resolve(true);
    if(!beacon&&Date.now()<retryAfter)return Promise.resolve(false);
    var batch=queue.splice(0,Math.min(BATCH_MAX,queue.length));delivery.batches++;
    inFlight=send(batch,!!beacon).then(function(ok){
      inFlight=null;
      if(ok){delivery.sentEvents+=batch.length;retryAfter=0;}
      else{delivery.failedBatches++;queue=batch.concat(queue);trimQueue();retryAfter=Date.now()+RETRY_MS;}
      if(ok&&all&&queue.length)return drain(beacon,true);
      if(ok&&!all&&queue.length>=BATCH_MAX)setTimeout(function(){if(!inFlight)drain(false,false);},0);
      return ok;
    });
    return inFlight;
  }
  function flush(beacon){return drain(!!beacon,true);}
  function start(sim,nextMode,meta){if(active)end(sim,'session-replaced');sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',Object.assign({mode:mode},meta||{}),sim,true);return sessionId;}
  function end(sim,reason,extra){if(!active)return Promise.resolve(true);record('battle-end',Object.assign({reason:reason||'ended'},extra||{}),sim,true);active=false;return flush(true);}
  /* Training uses an awaited ordinary fetch rather than sendBeacon so a match is durably handed
     off before its scene resources are torn down. */
  function checkpoint(sim,reason,extra){if(active){record('battle-end',Object.assign({reason:reason||'checkpoint'},extra||{}),sim,true);active=false;}return flush(false);}
  function setConsoleLogging(next){var previous=consoleLogging;consoleLogging=!!next;return previous;}
  function state(){return{active:active,sessionId:sessionId,mode:mode,queued:queue.length,seq:seq,endpoint:ENDPOINT,consoleLogging:consoleLogging,inFlight:!!inFlight,retryAfter:retryAfter,delivery:{batches:delivery.batches,sentEvents:delivery.sentEvents,failedBatches:delivery.failedBatches,highWater:delivery.highWater,droppedEvents:delivery.droppedEvents,batchMax:BATCH_MAX}};}
  flushTimer=setInterval(function(){if(queue.length&&!inFlight&&Date.now()>=retryAfter)drain(false,false);},1500);
  window.addEventListener('pagehide',function(){if(queue.length)flush(true);});window.addEventListener('beforeunload',function(){if(queue.length)flush(true);});
  root.BattleTelemetry={start:start,ensure:ensure,record:record,end:end,checkpoint:checkpoint,flush:flush,setConsoleLogging:setConsoleLogging,state:state};console.log('[TELEMETRY] runtime v21b serialized safe-batch delivery loaded');
})(typeof window!=='undefined'?window:globalThis);
