/* Battle Sim v18 operator controls: reinforcements, end battle, objective detail, fast AI tests. */
(function(root){
  'use strict';
  if(!root.BattleSim||!root.SquadAI||!root.BattleSoldierModel||!root.BattleWeapons)return;
  var oldStart=root.BattleSim.start;

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function nextSoldierId(sim){var max=-1,all=sim._roster.us.concat(sim._roster.ge);for(var i=0;i<all.length;i++)max=Math.max(max,+all[i].id||0);return max+1;}
  function spawnReinforcement(sim,faction){
    var town=sim.scene.metadata&&sim.scene.metadata.battleTown;if(!town)return null;
    var index=sim.factions[faction].squads.length,laneCycle=[-140,-70,0,70,140],laneX=laneCycle[index%laneCycle.length]+(Math.floor(index/5)%3-1)*8;
    var z=faction==='us'?-110:110,objectiveZ=-z,home={x:laneX,z:z},objective={x:laneX,z:objectiveZ};
    var sq=root.SquadAI.createSquad(faction+'-reinforce-'+index,faction,home,objective),nextId=nextSoldierId(sim);
    for(var si=0;si<root.SquadAI.COMPOSITION.length;si++){
      var role=root.SquadAI.COMPOSITION[si],jx=laneX+(Math.random()-.5)*8,jz=z+(Math.random()-.5)*6;
      var model=root.BattleSoldierModel.createSoldier(sim.scene,faction,role,null);
      model.root.position.set(jx,root.BattleSim.heightAt(jx,jz),jz);model.root.rotation.y=objectiveZ>z?0:Math.PI;
      var weapon=root.BattleWeapons.attachWeapon(sim.scene,model.weaponSocket,root.SquadAI.ROLES[role].weapon);
      var soldier=root.SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:sq,slotIndex:si,model:model,weapon:weapon});
      sq.members.push(soldier);sim._roster[faction].push(soldier);sim.factions[faction].alive++;
    }
    sim.factions[faction].squads.push(sq);
    if(root.BattleCommanderAI&&root.BattleCommanderAI.assignSquad)root.BattleCommanderAI.assignSquad(sim,sq,town,index);
    telemetry(sim,'reinforcement',{faction:faction,squad:sq.id,count:sq.members.length,totalAlive:sim.factions[faction].alive});
    return sq;
  }

  function addButton(parent,label,id,handler){var b=document.createElement('button');b.id=id;b.type='button';b.textContent=label;b.style.cssText='flex:1;padding:6px 5px;background:#1c2116;border:1px solid #46512f;color:#e7e7dc;font-size:11px;border-radius:5px;cursor:pointer';b.addEventListener('click',handler);parent.appendChild(b);return b;}
  function installUi(sim){
    var hud=document.getElementById('hud');if(!hud||document.getElementById('battleOps'))return;
    var box=document.createElement('div');box.id='battleOps';box.style.cssText='margin-top:8px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px';
    var row=document.createElement('div');row.style.cssText='display:flex;gap:5px';box.appendChild(row);
    addButton(row,'+10 US','spawnUsBtn',function(){spawnReinforcement(sim,'us');});
    addButton(row,'+10 GER','spawnGeBtn',function(){spawnReinforcement(sim,'ge');});
    var row2=document.createElement('div');row2.style.cssText='display:flex;gap:5px;margin-top:5px';box.appendChild(row2);
    addButton(row2,'End battle','endBattleBtn',function(){endBattle(sim,'manual');});
    var train=addButton(row2,'Run 10 AI tests','trainAiBtn',function(){runScenarios(sim,10,train);});
    var status=document.createElement('div');status.id='aiTestStatus';status.style.cssText='margin-top:6px;color:#a8ab8e;font-size:10px;line-height:1.35';status.textContent='AI log: active';box.appendChild(status);
    var objective=document.createElement('div');objective.id='objectiveDetail';objective.style.cssText='margin-top:5px;color:#b9bea7;font-size:10px;line-height:1.35';box.appendChild(objective);
    hud.appendChild(box);
  }

  function endBattle(sim,reason){
    sim.pause();sim.manualEnded=true;
    if(root.BattleTelemetry)root.BattleTelemetry.end(sim,reason||'manual',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,objectives:sim.objectiveControl||null});
    var s=document.getElementById('aiTestStatus');if(s)s.textContent='Battle ended · decision logging stopped';
    console.log('[CONTROL] battle ended; telemetry flushed');
  }

  function objectiveText(sim){
    if(!sim.objectiveControl||!sim.objectiveControl.sectors)return '';
    var parts=[];Object.keys(sim.objectiveControl.sectors).forEach(function(id){var x=sim.objectiveControl.sectors[id],owner=x.owner==='neutral'?'N':x.owner.toUpperCase(),push=x.active?(' '+x.active.toUpperCase()+'→'+x.progress+'%'):'';parts.push(id+': '+owner+push);});return parts.join(' · ');
  }

  async function runScenarios(sim,count,button){
    if(sim._trainingRunning)return;sim._trainingRunning=true;if(button)button.disabled=true;
    var status=document.getElementById('aiTestStatus'),town=sim.scene.metadata&&sim.scene.metadata.battleTown;
    var rawRestart=sim._controlRawRestart||sim.restart.bind(sim),saved={onFire:sim.onFire,onShot:sim.onShot,onCallout:sim.onCallout,onUpdate:sim.onUpdate,onWinner:sim.onWinner,timeScale:sim.timeScale,paused:sim.paused};
    sim.onFire=function(){};sim.onShot=function(){};sim.onCallout=function(){};sim.onUpdate=function(){};sim.onWinner=function(){};sim.trainingMode=true;
    var results=[];
    try{
      for(var n=1;n<=count;n++){
        if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'training-next');
        rawRestart();sim.manualEnded=false;sim.paused=false;sim.timeScale=100;
        if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'training',{scenario:n,total:count});
        telemetry(sim,'training-start',{scenario:n,total:count});
        var loops=0;
        while(!sim.winner&&sim.time<sim.timeLimit+1&&loops<12000){
          for(var k=0;k<40&&!sim.winner;k++){
            sim._frame();loops++;
            if(root.BattleCommanderAI&&root.BattleCommanderAI.update&&loops%2===0)root.BattleCommanderAI.update(sim,town);
          }
          if(status)status.textContent='AI test '+n+'/'+count+' · sim '+Math.floor(sim.time)+'s';
          await new Promise(function(resolve){setTimeout(resolve,0);});
        }
        var r={scenario:n,winner:sim.winner||'none',time:+sim.time.toFixed(1),usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive,usObjectives:sim.objectiveControl?sim.objectiveControl.us:0,geObjectives:sim.objectiveControl?sim.objectiveControl.ge:0,captures:sim.objectiveStats?sim.objectiveStats.captures:0,neutralizations:sim.objectiveStats?sim.objectiveStats.neutralizations:0};
        results.push(r);telemetry(sim,'training-result',r);if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'training-complete',r);
      }
    }finally{
      rawRestart();sim.trainingMode=false;sim.timeScale=saved.timeScale;sim.onFire=saved.onFire;sim.onShot=saved.onShot;sim.onCallout=saved.onCallout;sim.onUpdate=saved.onUpdate;sim.onWinner=saved.onWinner;sim.paused=saved.paused;
      if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'live',{afterTraining:true});
      sim._trainingRunning=false;if(button)button.disabled=false;
    }
    var wins={us:0,ge:0,draw:0,none:0},sumTime=0,sumCaps=0;results.forEach(function(r){wins[r.winner]=(wins[r.winner]||0)+1;sumTime+=r.time;sumCaps+=r.captures;});
    var summary={battles:results.length,wins:wins,avgTime:+(sumTime/Math.max(1,results.length)).toFixed(1),avgCaptures:+(sumCaps/Math.max(1,results.length)).toFixed(2),results:results};
    telemetry(sim,'training-summary',summary);if(root.BattleTelemetry)root.BattleTelemetry.flush(false);
    if(status)status.textContent='10-test summary: US '+wins.us+' · GER '+wins.ge+' · draw '+wins.draw+' · avg '+summary.avgTime+'s · captures '+summary.avgCaptures;
    console.log('[TRAINING] summary',summary);
  }

  root.BattleSim.start=function(scene,opts){
    var sim=oldStart(scene,opts),rawRestart=sim.restart.bind(sim);sim._controlRawRestart=rawRestart;sim.manualEnded=false;
    if(root.BattleTelemetry)root.BattleTelemetry.ensure(sim,'live');
    sim.spawnReinforcement=function(faction){return spawnReinforcement(sim,faction);};
    sim.endBattle=function(reason){endBattle(sim,reason);};
    sim.restart=function(){var wasPaused=sim.paused;if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'restart');rawRestart();sim.manualEnded=false;sim.paused=wasPaused;if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'live',{restart:true});var s=document.getElementById('aiTestStatus');if(s)s.textContent='AI log: active';};
    installUi(sim);
    var previousUpdate=sim.onUpdate;
    sim.onUpdate=function(s){if(previousUpdate)previousUpdate(s);var o=document.getElementById('objectiveDetail');if(o)o.textContent=objectiveText(s);};
    telemetry(sim,'battle-start',{usAlive:sim.factions.us.alive,geAlive:sim.factions.ge.alive});
    return sim;
  };

  root.BattleControl={spawnReinforcement:spawnReinforcement,endBattle:endBattle,runScenarios:runScenarios};
  console.log('[CONTROL] runtime v18 loaded');
})(typeof window!=='undefined'?window:globalThis);
