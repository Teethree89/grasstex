/* Battle Sim v19 evolutionary tactical-policy trainer.
   Five mutated policies fight the current persisted baseline twice each, mirrored US/GER.
   Tactical parameters learn; scenario rules do not. Registered future unit modules are
   included automatically in force scoring. */
(function(root){
  'use strict';
  if(!root.BattleAIPolicy||!root.BattleCommanderAI)return;

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function other(f){return f==='us'?'ge':'us';}
  function units(sim,faction){
    var all=root.BattleModules?root.BattleModules.unitsFor(sim):((sim._roster&&sim._roster[faction])||[]);
    return all.filter(function(u){return u&&u.faction===faction&&!u.dead&&u.countsForElimination!==false;});
  }
  function forceValue(sim,faction){var total=0;units(sim,faction).forEach(function(u){total+=u.scoreValue==null?1:+u.scoreValue;});return total;}
  function objectiveCounts(sim){var c=sim.objectiveControl||{};return c.counts||{us:c.us||0,ge:c.ge||0};}
  function fixedStep(sim,dt){sim._trainerStepActive=true;try{if(sim.step)sim.step(dt);else sim._frame(dt);}finally{sim._trainerStepActive=false;}}

  function scoreMatch(sim,candidateFaction){
    var enemy=other(candidateFaction),counts=objectiveCounts(sim),stats=sim.objectiveStats||{},caps=stats.capturesByFaction||{},pressure=stats.pressureSecondsByFaction||{},score=0;
    if(sim.winner===candidateFaction)score+=120;else if(sim.winner===enemy)score-=120;
    score+=((counts[candidateFaction]||0)-(counts[enemy]||0))*28;
    score+=(forceValue(sim,candidateFaction)-forceValue(sim,enemy))*1.25;
    score+=((caps[candidateFaction]||0)-(caps[enemy]||0))*16;
    score+=((pressure[candidateFaction]||0)-(pressure[enemy]||0))*.08;
    if(sim.winner===candidateFaction)score+=Math.max(0,sim.timeLimit-sim.time)*.10;
    if((stats.captures||0)===0)score-=22;
    return +score.toFixed(3);
  }
  function resultRecord(sim,candidateId,candidateFaction,score){
    var stats=sim.objectiveStats||{},counts=objectiveCounts(sim);
    return {candidateId:candidateId,candidateFaction:candidateFaction,winner:sim.winner||'none',time:+sim.time.toFixed(2),score:score,
      usAlive:units(sim,'us').length,geAlive:units(sim,'ge').length,usForceValue:+forceValue(sim,'us').toFixed(2),geForceValue:+forceValue(sim,'ge').toFixed(2),
      usObjectives:counts.us||0,geObjectives:counts.ge||0,capturesByFaction:stats.capturesByFaction||{},pressureSecondsByFaction:stats.pressureSecondsByFaction||{}};
  }

  async function runMatch(sim,rawRestart,town,baseline,candidate,candidateId,candidateFaction,status,matchNo,totalMatches){
    rawRestart();sim.manualEnded=false;sim.winner=null;sim.paused=false;sim.trainingMode=true;sim.timeScale=1;
    root.BattleAIPolicy.setMatchPolicies(sim,candidateFaction==='us'?candidate:baseline,candidateFaction==='ge'?candidate:baseline);
    if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'training',{candidateId:candidateId,candidateFaction:candidateFaction,match:matchNo,totalMatches:totalMatches});
    telemetry(sim,'policy-match-start',{candidateId:candidateId,candidateFaction:candidateFaction,policy:candidate});

    var fixedDt=.15,commandAccum=0,steps=0,maxSteps=Math.ceil((sim.timeLimit+3)/fixedDt);
    while(!sim.winner&&sim.time<sim.timeLimit+1&&steps<maxSteps){
      var batch=Math.min(160,maxSteps-steps);
      for(var i=0;i<batch&&!sim.winner;i++){
        fixedStep(sim,fixedDt);steps++;commandAccum+=fixedDt;
        while(commandAccum>=root.BattleCommanderAI.commandTick&&!sim.winner){commandAccum-=root.BattleCommanderAI.commandTick;root.BattleCommanderAI.update(sim,town,root.BattleCommanderAI.commandTick);}
      }
      if(status)status.textContent='Training '+matchNo+'/'+totalMatches+' · '+candidateId+' '+candidateFaction.toUpperCase()+' · '+Math.floor(sim.time)+'s';
      await new Promise(function(resolve){setTimeout(resolve,0);});
    }
    if(!sim.winner&&sim._checkWinner)sim._checkWinner();
    var score=scoreMatch(sim,candidateFaction),record=resultRecord(sim,candidateId,candidateFaction,score);
    telemetry(sim,'policy-match-result',record);if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'training-match-complete',record);return record;
  }

  function candidateSummary(entry){
    var results=entry.results,total=0,wins=0,losses=0;
    results.forEach(function(r){total+=r.score;if(r.winner===r.candidateFaction)wins++;else if(r.winner&&r.winner!=='draw'&&r.winner!=='none')losses++;});
    return {id:entry.id,avgScore:+(total/Math.max(1,results.length)).toFixed(3),wins:wins,losses:losses,results:results,policy:entry.policy};
  }

  async function train(sim,opts){
    opts=opts||{};if(sim._trainingRunning)return null;sim._trainingRunning=true;
    var button=opts.button||null,status=opts.status||document.getElementById('aiTestStatus'),town=sim.scene.metadata&&sim.scene.metadata.battleTown;if(button)button.disabled=true;
    if(!town){sim._trainingRunning=false;if(button)button.disabled=false;throw new Error('No battle scenario context for training');}

    var rawRestart=sim._controlRawRestart||sim.restart.bind(sim),saved={onFire:sim.onFire,onShot:sim.onShot,onCallout:sim.onCallout,onUpdate:sim.onUpdate,onWinner:sim.onWinner,timeScale:sim.timeScale,paused:sim.paused};
    sim.onFire=function(){};sim.onShot=function(){};sim.onCallout=function(){};sim.onUpdate=function(){};sim.onWinner=function(){};
    var baseline=root.BattleAIPolicy.get(),baselineRevision=root.BattleAIPolicy.revision,candidateCount=opts.candidates||5,strength=opts.mutationStrength==null?.16:+opts.mutationStrength,totalMatches=candidateCount*2,candidates=[];
    for(var c=0;c<candidateCount;c++)candidates.push({id:'g'+(baselineRevision+1)+'-c'+(c+1),policy:root.BattleAIPolicy.mutate(baseline,strength),results:[]});

    if(root.BattleTelemetry){root.BattleTelemetry.end(sim,'training-start');root.BattleTelemetry.start(sim,'training',{phase:'generation-metadata',baselineRevision:baselineRevision,totalMatches:totalMatches});}
    telemetry(sim,'policy-training-start',{revision:baselineRevision,candidates:candidateCount,totalMatches:totalMatches,baseline:baseline});
    candidates.forEach(function(candidate){telemetry(sim,'policy-candidate',{candidateId:candidate.id,policy:candidate.policy,distanceFromBaseline:root.BattleAIPolicy.distance(candidate.policy,baseline)});});
    if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'training-metadata-complete');

    var matchNo=0,promotion=null,summaries=[];
    try{
      for(var i=0;i<candidates.length;i++){
        var candidate=candidates[i];
        for(var sideIndex=0;sideIndex<2;sideIndex++){var side=sideIndex===0?'us':'ge';matchNo++;candidate.results.push(await runMatch(sim,rawRestart,town,baseline,candidate.policy,candidate.id,side,status,matchNo,totalMatches));}
        summaries.push(candidateSummary(candidate));
      }
      summaries.sort(function(a,b){return b.avgScore-a.avgScore;});
      var best=summaries[0],threshold=opts.promotionThreshold==null?12:+opts.promotionThreshold,shouldPromote=!!(best&&best.avgScore>=threshold&&best.wins>=1&&best.losses<2);
      var trainingSummary={baselineRevision:baselineRevision,totalMatches:totalMatches,promotionThreshold:threshold,best:best?{id:best.id,avgScore:best.avgScore,wins:best.wins,losses:best.losses}:null,candidates:summaries.map(function(s){return {id:s.id,avgScore:s.avgScore,wins:s.wins,losses:s.losses};}),promoted:shouldPromote};

      if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'training',{phase:'generation-summary',baselineRevision:baselineRevision});
      telemetry(sim,'policy-training-summary',trainingSummary);
      if(shouldPromote){
        promotion=await root.BattleAIPolicy.persist(best.policy,{score:best.avgScore,matches:best.results.length,baselineScore:0,candidateId:best.id,generation:baselineRevision+1,sourceBuild:root.BATTLE_BUILD||'dev'});
        telemetry(sim,'policy-promoted',{candidateId:best.id,revision:promotion.revision,score:best.avgScore,policy:best.policy});
      }
      if(root.BattleTelemetry)root.BattleTelemetry.end(sim,'training-generation-complete',{promoted:!!promotion,revision:root.BattleAIPolicy.revision});
      if(status)status.textContent=promotion?('AI learned policy r'+promotion.revision+' · '+best.id+' score '+best.avgScore+' · '+best.wins+'W/'+best.losses+'L'):('AI kept policy r'+root.BattleAIPolicy.revision+' · best candidate '+(best?best.avgScore:'n/a')+' below '+threshold);
      console.log('[TRAINING] v19 policy summary',trainingSummary,promotion||'no promotion');return {summary:trainingSummary,promotion:promotion,candidates:summaries};
    } finally {
      root.BattleAIPolicy.clearMatchPolicies(sim);rawRestart();sim.trainingMode=false;sim.timeScale=saved.timeScale;sim.onFire=saved.onFire;sim.onShot=saved.onShot;sim.onCallout=saved.onCallout;sim.onUpdate=saved.onUpdate;sim.onWinner=saved.onWinner;sim.paused=saved.paused;
      if(root.BattleTelemetry)root.BattleTelemetry.start(sim,'live',{afterTraining:true,policyRevision:root.BattleAIPolicy.revision});sim._trainingRunning=false;if(button)button.disabled=false;
    }
  }

  root.BattleAITrainer={train:train,scoreMatch:scoreMatch};
  console.log('[TRAINING] evolutionary policy trainer v19 loaded');
})(typeof window!=='undefined'?window:globalThis);
