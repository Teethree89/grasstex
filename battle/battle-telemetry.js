/* Battle Sim / ww2fps AI lab v20 telemetry + persistent decision logging. */
(function(root){
  'use strict';
  var API_BASE=root.BATTLE_API_BASE||'/grasstex/',ENDPOINT=API_BASE+'battle_log.php';
  var queue=[],active=false,sessionId=null,mode='live',flushTimer=null,seq=0;
  function makeId(){return'b-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function safe(v){try{return JSON.parse(JSON.stringify(v));}catch(_){return{value:String(v)};}}
  function scenarioMeta(sim){var s=sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||root.BATTLE_SCENARIO||null;return{scenarioId:s&&s.id||null,scenarioSeed:s&&s.seed||null,trainingSeed:s&&s.metadata&&s.metadata.trainingSeed||null};}
  function ensure(sim,nextMode){if(active)return;sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',{mode:mode},sim,true);}
  function record(type,data,sim,internal){
    if(!active&&!internal)ensure(sim,'live');if(!active)return;var sm=scenarioMeta(sim);
    var e={session:sessionId,seq:++seq,mode:mode,build:root.BATTLE_BUILD||'dev',policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,scenarioId:sm.scenarioId,scenarioSeed:sm.scenarioSeed,trainingSeed:sm.trainingSeed,type:type,battleTime:sim&&isFinite(sim.time)?+sim.time.toFixed(3):null,clientTime:new Date().toISOString(),data:safe(data||{})};
    queue.push(e);if(type.indexOf('decision')===0||type.indexOf('objective')===0||type.indexOf('policy-')===0||type==='reinforcement'||type==='module-spawn'||type==='battle-end'||type==='training-result')console.log('[AI]',type,JSON.stringify(e.data));if(queue.length>=20)flush(false);
  }
  function send(events,beacon){if(!events.length)return Promise.resolve(true);var body=JSON.stringify({events:events});if(beacon&&navigator.sendBeacon){try{return Promise.resolve(navigator.sendBeacon(ENDPOINT,new Blob([body],{type:'application/json'})));}catch(_){}}return fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:body,cache:'no-store',keepalive:true}).then(function(r){return r.ok;}).catch(function(){return false;});}
  function flush(beacon){if(!queue.length)return Promise.resolve(true);var batch=queue.splice(0,queue.length);return send(batch,!!beacon).then(function(ok){if(!ok)queue=batch.concat(queue);return ok;});}
  function start(sim,nextMode,meta){if(active)end(sim,'session-replaced');sessionId=makeId();mode=nextMode||'live';active=true;seq=0;record('session-start',Object.assign({mode:mode},meta||{}),sim,true);return sessionId;}
  function end(sim,reason,extra){if(!active)return;record('battle-end',Object.assign({reason:reason||'ended'},extra||{}),sim,true);active=false;flush(true);}
  function state(){return{active:active,sessionId:sessionId,mode:mode,queued:queue.length,seq:seq,endpoint:ENDPOINT};}
  flushTimer=setInterval(function(){if(queue.length)flush(false);},4000);window.addEventListener('pagehide',function(){if(queue.length)flush(true);});window.addEventListener('beforeunload',function(){if(queue.length)flush(true);});
  root.BattleTelemetry={start:start,ensure:ensure,record:record,end:end,flush:flush,state:state};console.log('[TELEMETRY] runtime v20 loaded');
})(typeof window!=='undefined'?window:globalThis);
