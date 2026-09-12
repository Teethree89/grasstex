/* Battle Sim / ww2fps AI lab v19 operator controls. */
(function(root){
  'use strict';
  if(!root.BattleSim)return;
  var oldStart=root.BattleSim.start,API_BASE=root.BATTLE_API_BASE||'/grasstex/';

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function addButton(parent,label,id,handler){var b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.style.cssText='flex:1;padding:6px 5px;background:#1c2116;border:1px solid #46512f;color:#e7e7dc;font-size:11px;border-radius:5px;cursor:pointer';b.addEventListener('click',handler);parent.appendChild(b);return b;}
  function row(parent){var r=document.createElement('div');r.style.cssText='display:flex;gap:5px;margin-top:5px';parent.appendChild(r);return r;}

  function spawnUnit(sim,faction,typeId){
    if(sim._trainingRunning)return null;
    if(!root.BattleModules)throw new Error('Battle module registry unavailable');
    var result=root.BattleModules.spawnUnitType(typeId,sim,faction,{}),count=result&&result.count!=null?result.count:(result&&result.units?result.units.length:1);
    telemetry(sim,'reinforcement',{faction:faction,unitType:typeId,count:count,totalAlive:sim.factions[faction]&&sim.factions[faction].alive});
    return result;
  }

  function objectiveText(sim){
    var control=sim.objectiveControl,objects=control&&(control.objectives||control.sectors);if(!objects)return '';
    var parts=[];Object.keys(objects).forEach(function(id){
      var x=objects[id]||{},owner=x.owner==='neutral'?'N':String(x.owner||'?').toUpperCase(),push=x.active?(' '+String(x.active).toUpperCase()+'→'+(x.progress||0)+'%'):'';
      parts.push((x.label||id)+': '+owner+push);
    });return parts.join(' · ');
  }

  function endBattle(sim,reason){
    if(sim._trainingRunning)return;
    sim.pause();sim.manualEnded=true;
    if(root.BattleTelemetry)root.BattleTelemetry.end(sim,reason||'manual',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,objectives:sim.objectiveControl||null,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0});
    var s=document.getElementById('aiTestStatus');if(s)s.textContent='Battle ended · decision logging stopped';
    console.log('[CONTROL] battle ended; telemetry flushed');
  }

  function formatStats(j){
    if(!j||!j.ok)return 'Log stats unavailable';
    var p=j.policy&&j.policy.revision!=null?(' · policy r'+j.policy.revision):'';
    return 'Logs: '+j.records+' events · '+j.battles+' battles · '+j.captures+' captures · '+j.sessions+' sessions'+p;
  }
  function refreshStats(target){
    return fetch(API_BASE+'battle_log_stats.php?days=7&ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){if(target)target.textContent=formatStats(j);return j;}).catch(function(){if(target)target.textContent='Log stats unavailable';return null;});
  }

  function installUi(sim){
    var hud=document.getElementById('hud');if(!hud||document.getElementById('battleOps'))return;
    var box=document.createElement('div');box.id='battleOps';box.style.cssText='margin-top:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px';

    var types=root.BattleModules?root.BattleModules.listUnitTypes().filter(function(t){return t.operatorSpawn;}):[];
    types.forEach(function(type,index){
      var r=row(box),n=type.spawnCount||1,label=type.buttonLabel||type.label||type.id;
      addButton(r,'+'+n+' US '+label,'spawn-us-'+index,function(){spawnUnit(sim,'us',type.id);});
      addButton(r,'+'+n+' GER '+label,'spawn-ge-'+index,function(){spawnUnit(sim,'ge',type.id);});
    });

    var actions=row(box);
    addButton(actions,'End battle','endBattleBtn',function(){endBattle(sim,'manual');});
    var train=addButton(actions,'Train AI · 10 battles','trainAiBtn',async function(){
      if(!root.BattleAITrainer)return;
      train.textContent='Training…';
      try{await root.BattleAITrainer.train(sim,{candidates:5,button:train,status:document.getElementById('aiTestStatus')});}
      catch(e){console.error('[TRAINING] failed',e);var s=document.getElementById('aiTestStatus');if(s)s.textContent='Training failed: '+(e&&e.message||e);}
      finally{train.textContent='Train AI · 10 battles';refreshStats(document.getElementById('logStats'));}
    });

    var statsRow=row(box);addButton(statsRow,'Refresh log stats','refreshStatsBtn',function(){refreshStats(document.getElementById('logStats'));});
    var status=document.createElement('div');status.id='aiTestStatus';status.style.cssText='margin-top:6px;color:#a8ab8e;font-size:10px;line-height:1.35';status.textContent='AI log: active · policy r'+(root.BattleAIPolicy?root.BattleAIPolicy.revision:0);box.appendChild(status);
    var logStats=document.createElement('div');logStats.id='logStats';logStats.style.cssText='margin-top:4px;color:#a8ab8e;font-size:10px;line-height:1.35';logStats.textContent='Logs: loading…';box.appendChild(logStats);
    var objective=document.createElement('div');objective.id='objectiveDetail';objective.style.cssText='margin-top:5px;color:#b9bea7;font-size:10px;line-height:1.35';box.appendChild(objective);
    hud.appendChild(box);

    setInterval(function(){var o=document.getElementById('objectiveDetail');if(o)o.textContent=objectiveText(sim);},500);
    refreshStats(logStats);setInterval(function(){refreshStats(logStats);},15000);
  }

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),rawRestart=sim.restart.bind(sim);sim._controlRawRestart=rawRestart;sim.manualEnded=false;
    if(root.BattleTelemetry)root.BattleTelemetry.ensure(sim,'live');
    sim.spawnUnit=function(faction,typeId){return spawnUnit(sim,faction,typeId);};
    sim.spawnReinforcement=function(faction){return spawnUnit(sim,faction,'infantry-squad');};
    sim.endBattle=function(reason){endBattle(sim,reason);};
    sim.restart=function(){
      var resumeAfter=sim.manualEnded||!sim.paused;
      if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'restart');rawRestart();sim.manualEnded=false;sim.paused=!resumeAfter;
      if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'live',{restart:true,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0});
      var s=document.getElementById('aiTestStatus');if(s)s.textContent='AI log: active · policy r'+(root.BattleAIPolicy?root.BattleAIPolicy.revision:0);
    };
    installUi(sim);
    telemetry(sim,'battle-start',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,policyRevision:root.BattleAIPolicy?root.BattleAIPolicy.revision:0,unitModules:root.BattleModules?root.BattleModules.listUnitTypes().map(function(x){return x.id;}):[]});
    return sim;
  };

  root.BattleControl={spawnUnit:spawnUnit,endBattle:endBattle,refreshStats:refreshStats,runScenarios:function(sim){return root.BattleAITrainer&&root.BattleAITrainer.train(sim,{candidates:5});}};
  console.log('[CONTROL] AI lab controls v19 loaded');
})(typeof window!=='undefined'?window:globalThis);
