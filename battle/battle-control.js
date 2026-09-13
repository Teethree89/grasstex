/* Battle Sim / ww2fps AI lab v22 operator controls. */
(function(root){
  'use strict';
  root.BATTLE_BUILD='v22';
  try{var buildEl=document.getElementById('buildVersion');if(buildEl)buildEl.textContent='v22';document.title='WW2FPS AI Lab v22';}catch(_){}
  if(!root.BattleSim)return;
  var oldStart=root.BattleSim.start,API_BASE=root.BATTLE_API_BASE||'/grasstex/';
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function addButton(parent,label,id,handler){var b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.style.cssText='flex:1;padding:6px 5px;background:#1c2116;border:1px solid #46512f;color:#e7e7dc;font-size:11px;border-radius:5px;cursor:pointer';b.addEventListener('click',handler);parent.appendChild(b);return b;}
  function row(parent){var r=document.createElement('div');r.style.cssText='display:flex;gap:5px;margin-top:5px';parent.appendChild(r);return r;}
  function scenario(sim){return sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown)||null;}

  function spawnUnit(sim,faction,typeId){if(sim._trainingRunning)return null;if(!root.BattleModules)throw new Error('Battle module registry unavailable');var result=root.BattleModules.spawnUnitType(typeId,sim,faction,{}),count=result&&result.count!=null?result.count:(result&&result.units?result.units.length:1);telemetry(sim,'reinforcement',{faction:faction,unitType:typeId,count:count,totalAlive:sim.factions[faction]&&sim.factions[faction].alive});return result;}
  /* Live engagement readout. "Are they actually fighting or just walking about" should be
     answerable from the HUD, not only from the telemetry log. */
  function engagementText(sim){
    if(!root.BattleEngagement)return'Engagement pipeline not loaded';
    var counts={},contact=0,total=0;
    ['us','ge'].forEach(function(f){
      (sim._roster&&sim._roster[f]||[]).forEach(function(s){
        if(s.dead)return;total++;
        var st=root.BattleEngagement.stateOf(s).state||'advance';
        counts[st]=(counts[st]||0)+1;
      });
      (sim.factions&&sim.factions[f]&&sim.factions[f].squads||[]).forEach(function(sq){if(sq.inContact)contact++;});
    });
    var order=['advance','alert','orient','bound','engage','pinned','assault','station','withdraw'];
    var parts=order.filter(function(k){return counts[k];}).map(function(k){return k+' '+counts[k];});
    Object.keys(counts).forEach(function(k){if(order.indexOf(k)<0)parts.push(k+' '+counts[k]);});
    return contact+' squads in contact · '+(parts.join(' · ')||'no men')+' ('+total+' alive)';
  }
  function objectiveText(sim){var control=sim.objectiveControl,objects=control&&(control.objectives||control.sectors);if(!objects)return'';var parts=[];Object.keys(objects).forEach(function(id){var x=objects[id]||{},owner=x.owner==='neutral'?'N':String(x.owner||'?').toUpperCase(),push=x.active?(' '+String(x.active).toUpperCase()+'→'+(x.progress||0)+'%'):'';parts.push((x.label||id)+': '+owner+push);});return parts.join(' · ');}
  function endBattle(sim,reason){if(sim._trainingRunning)return;sim.pause();sim.manualEnded=true;if(root.BattleTelemetry)root.BattleTelemetry.end(sim,reason||'manual',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,objectives:sim.objectiveControl||null,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0});var s=document.getElementById('aiTestStatus');if(s)s.textContent='Battle ended · decision logging stopped';console.log('[CONTROL] battle ended; telemetry flushed');}
  function formatStats(j){if(!j||!j.ok)return'Log stats unavailable';var p=j.policy&&j.policy.revision!=null?(' · genome r'+j.policy.revision):'';return'Logs: '+j.records+' events · '+j.battles+' battles · '+j.captures+' captures · '+j.sessions+' sessions'+p;}
  function refreshStats(target){return fetch(API_BASE+'battle_log_stats.php?days=7&ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(target)target.textContent=formatStats(j);return j;}).catch(function(){if(target)target.textContent='Log stats unavailable';return null;});}
  function newScenario(sim){
    if(sim._trainingRunning||!root.BattleScenarioGenerator||!root.BattleTownObjectives)return;var seed=root.BattleScenarioGenerator.newSeed('live');var wasPaused=sim.paused;
    root.BattleTownObjectives.regenerate(sim.scene,sim.heightAt,seed,{manualScenario:true},sim);sim.restart();sim.paused=wasPaused;telemetry(sim,'scenario-generated',{seed:seed,scenarioId:scenario(sim)&&scenario(sim).id,fingerprint:scenario(sim)&&scenario(sim).fingerprint});console.log('[CONTROL] new scenario seed='+seed);
  }

  function installUi(sim){
    var hud=document.getElementById('hud');if(!hud||document.getElementById('battleOps'))return;var box=document.createElement('div');box.id='battleOps';box.style.cssText='margin-top:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px';
    var types=root.BattleModules?root.BattleModules.listUnitTypes().filter(function(t){return t.operatorSpawn;}):[];types.forEach(function(type,index){var r=row(box),n=type.spawnCount||1,label=type.buttonLabel||type.label||type.id;addButton(r,'+'+n+' US '+label,'spawn-us-'+index,function(){spawnUnit(sim,'us',type.id);});addButton(r,'+'+n+' GER '+label,'spawn-ge-'+index,function(){spawnUnit(sim,'ge',type.id);});});
    var actions=row(box);addButton(actions,'End battle','endBattleBtn',function(){endBattle(sim,'manual');});var train=addButton(actions,'Genome v2 Training','trainAiBtn',function(){showTrainingDialog(sim,train);});
    var maps=row(box);addButton(maps,'New seeded map','newScenarioBtn',function(){newScenario(sim);});addButton(maps,'Training review ↗','trainingReviewBtn',function(){window.open(API_BASE+'battle_metrics.php','_blank','noopener');});
    var statsRow=row(box);addButton(statsRow,'Refresh log stats','refreshStatsBtn',function(){refreshStats(document.getElementById('logStats'));});
    var status=document.createElement('div');status.id='aiTestStatus';status.style.cssText='margin-top:6px;color:#a8ab8e;font-size:10px;line-height:1.35';status.textContent='AI log: active · genome r'+(root.BattleAIPolicy?root.BattleAIPolicy.revision:0);box.appendChild(status);
    var scenarioInfo=document.createElement('div');scenarioInfo.id='scenarioInfo';scenarioInfo.style.cssText='margin-top:4px;color:#b9bea7;font-size:10px;line-height:1.35;word-break:break-all';box.appendChild(scenarioInfo);
    var logStats=document.createElement('div');logStats.id='logStats';logStats.style.cssText='margin-top:4px;color:#a8ab8e;font-size:10px;line-height:1.35';logStats.textContent='Logs: loading…';box.appendChild(logStats);
    var engagement=document.createElement('div');engagement.id='engagementDetail';engagement.style.cssText='margin-top:5px;color:#cfd6b6;font-size:10px;line-height:1.35';box.appendChild(engagement);
    var objective=document.createElement('div');objective.id='objectiveDetail';objective.style.cssText='margin-top:5px;color:#b9bea7;font-size:10px;line-height:1.35';box.appendChild(objective);hud.appendChild(box);
    setInterval(function(){var o=document.getElementById('objectiveDetail');if(o)o.textContent=objectiveText(sim);var eg=document.getElementById('engagementDetail');if(eg)eg.textContent=engagementText(sim);var sc=scenario(sim),e=document.getElementById('scenarioInfo');if(e&&sc)e.textContent='Scenario '+sc.id+' · seed '+sc.seed+' · '+sc.buildings.length+' buildings · '+sc.objectives.length+' objectives';},500);refreshStats(logStats);setInterval(function(){refreshStats(logStats);},15000);
  }

  function showTrainingDialog(sim,trainButton){
    var overlay=document.getElementById('genomeTrainingDialog');
    if(!overlay){
      overlay=document.createElement('div');overlay.id='genomeTrainingDialog';overlay.style.cssText='position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,7,4,.76);font:13px/1.45 Arial,sans-serif;color:#edf0de';
      overlay.innerHTML='<div role="dialog" aria-modal="true" aria-labelledby="genomeTrainingTitle" style="width:min(420px,100%);box-sizing:border-box;border:1px solid #66784a;border-radius:10px;background:#141a11;box-shadow:0 20px 70px rgba(0,0,0,.5);padding:18px"><div id="genomeTrainingTitle" style="font-size:18px;font-weight:700">Genome v2 Training</div><div id="genomeTrainingPrompt" style="margin-top:7px;color:#c5cbb2">Choose how to run this generation.</div><div id="genomeTrainingChoices" style="display:flex;gap:8px;margin-top:16px"><button type="button" data-training-mode="screen" style="flex:1;padding:10px 8px;border:1px solid #788c58;border-radius:6px;background:#27331e;color:#f0f4e8;cursor:pointer">On screen<br><small>6 matches · responsive</small></button><button type="button" data-training-mode="headless" style="flex:1;padding:10px 8px;border:1px solid #788c58;border-radius:6px;background:#33451f;color:#f0f4e8;cursor:pointer">Headless<br><small>24 matches · no rendering</small></button></div><div id="genomeTrainingProgress" style="display:none;margin-top:18px"><div id="genomeTrainingProgressLabel" style="color:#dce5ce">Preparing training…</div><div style="height:10px;margin-top:7px;overflow:hidden;border:1px solid #66784a;border-radius:999px;background:#090c08"><div id="genomeTrainingProgressFill" style="width:0;height:100%;background:#9bbd54;transition:width .12s linear"></div></div></div><div style="display:flex;justify-content:flex-end;margin-top:18px"><button id="genomeTrainingClose" type="button" style="padding:7px 14px;border:1px solid #66784a;border-radius:6px;background:#20291a;color:#edf0de;cursor:pointer">Close</button></div></div>';
      document.body.appendChild(overlay);
    }
    var choices=overlay.querySelector('#genomeTrainingChoices'),prompt=overlay.querySelector('#genomeTrainingPrompt'),progress=overlay.querySelector('#genomeTrainingProgress'),label=overlay.querySelector('#genomeTrainingProgressLabel'),fill=overlay.querySelector('#genomeTrainingProgressFill'),close=overlay.querySelector('#genomeTrainingClose');
    function closeDialog(){if(!sim._trainingRunning)overlay.style.display='none';}
    close.onclick=closeDialog;overlay.onclick=function(e){if(e.target===overlay)closeDialog();};overlay.style.display='flex';choices.style.display='flex';progress.style.display='none';prompt.textContent='Choose how to run this generation.';close.disabled=false;
    Array.prototype.forEach.call(choices.querySelectorAll('[data-training-mode]'),function(choice){choice.onclick=async function(){if(sim._trainingRunning||!root.BattleAITrainer)return;var headless=choice.getAttribute('data-training-mode')==='headless';choices.style.display='none';progress.style.display='block';close.disabled=true;fill.style.width='0%';label.textContent=(headless?'Headless':'On-screen')+' training · preparing…';prompt.textContent=headless?'Rendering is paused while the full 24-match generation runs.':'The six-match generation yields every frame so the battle remains visible.';trainButton.disabled=true;trainButton.textContent='Training…';function onProgress(p){var completed=(p.matchNo-1)+Math.min(1,p.maxSteps?+p.steps/p.maxSteps:0),percent=Math.max(0,Math.min(100,completed/p.totalMatches*100));fill.style.width=percent.toFixed(1)+'%';label.textContent=(p.headless?'Headless':'On-screen')+' · '+(p.phase==='complete'?'complete':('match '+p.matchNo+'/'+p.totalMatches))+' · '+percent.toFixed(1)+'%';}try{await root.BattleAITrainer.train(sim,{candidates:headless?4:3,scenarios:headless?3:1,headless:headless,renderLoop:root.__battleRenderLoop__,button:trainButton,status:document.getElementById('aiTestStatus'),onProgress:onProgress});fill.style.width='100%';label.textContent=(headless?'Headless':'On-screen')+' training complete · 100%';prompt.textContent='Results were saved to the training log.';}catch(e){console.error('[TRAINING] failed',e);label.textContent='Training failed: '+(e&&e.message||e);prompt.textContent='No policy promotion was applied from this run.';}finally{close.disabled=false;trainButton.disabled=false;trainButton.textContent='Genome v2 Training';refreshStats(document.getElementById('logStats'));}};});
  }

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),rawRestart=sim.restart.bind(sim);sim._controlRawRestart=rawRestart;sim.manualEnded=false;if(root.BattleTelemetry)root.BattleTelemetry.ensure(sim,'live');sim.spawnUnit=function(faction,typeId){return spawnUnit(sim,faction,typeId);};sim.spawnReinforcement=function(faction){return spawnUnit(sim,faction,'infantry-squad');};sim.endBattle=function(reason){endBattle(sim,reason);};
    sim.restart=function(){var resumeAfter=sim.manualEnded||!sim.paused;if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'restart');rawRestart();sim.manualEnded=false;sim.paused=!resumeAfter;var sc=scenario(sim);if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'live',{restart:true,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,scenarioSeed:sc&&sc.seed,scenarioId:sc&&sc.id});var s=document.getElementById('aiTestStatus');if(s)s.textContent='AI log: active · genome r'+(root.BattleAIPolicy?root.BattleAIPolicy.revision:0);};
    installUi(sim);var sc=scenario(sim);telemetry(sim,'battle-start',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,scenarioSeed:sc&&sc.seed,scenarioId:sc&&sc.id,fingerprint:sc&&sc.fingerprint,unitModules:root.BattleModules?root.BattleModules.listUnitTypes().map(function(x){return x.id;}):[]});return sim;
  };
  root.BattleControl={spawnUnit:spawnUnit,endBattle:endBattle,refreshStats:refreshStats,newScenario:newScenario,runScenarios:function(sim){return root.BattleAITrainer&&root.BattleAITrainer.train(sim,{candidates:4,scenarios:3,headless:true,renderLoop:root.__battleRenderLoop__});}};console.log('[CONTROL] AI lab controls v22 loaded');
})(typeof window!=='undefined'?window:globalThis);
