/* Engineers: turning ground you hold into ground you can hold.

   Every squad now carries one pioneer (SquadAI.ROLES.engineer). This module is what he is for.

   When his squad is sitting on an objective his side owns and nobody is shooting, he picks the
   thing the position is most obviously missing - a fighting position if there is none, then a
   parapet, then wire out in front - sites it with exactly the same terrain scoring the defender's
   prepared plan used, walks to it, and digs. When it is finished it joins the cover field and its
   posts join his side's plan, so the next man to dig in there has somewhere prepared to stand.

   Three deliberate constraints:

     - He never digs while the squad is in contact. A job interrupted by a firefight resumes where
       it stopped (the clock lives in engagement.js's `fortify` state, which only runs while he is
       actually on the site).
     - He works to a budget, like the prepared plan does, so a long battle does not end with the
       whole map paved in sandbags.
     - The threat direction he sites against is the CURRENT one. When the attacker takes an
       objective, his engineers fortify it facing back the way they came, because that is where the
       counterattack is coming from. This falls out for free from asking BattleSides for a model
       with the occupier as defender.

   This module decides what is worth building and where. engagement.js decides how the man behaves
   while he builds it, and modules/21-defense-works.js puts the finished work into the world. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI||!root.BattleSides||!root.BattleDefensePlan)return;

  /* Seconds of work per point of engineering cost, plus a fixed setting-out time. At the sim's
     usual 2x time scale a rifle pit is about eight seconds of wall clock. */
  var DIG_BASE=10,DIG_PER_EFFORT=5;
  var JOB_RANGE=34,MIN_JOB_GAP=6,FORTIFY_COOLDOWN=8;

  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function scenarioOf(sim){var m=sim&&sim.scene&&sim.scene.metadata;return m&&(m.battleScenario||m.battleTown)||null;}
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function engineersOf(sq){return(sq.members||[]).filter(function(s){return!s.dead&&s.role==='engineer';});}
  function objectiveStatus(sim,id){
    return root.BattleObjectiveSystem?root.BattleObjectiveSystem.status(sim,id):null;
  }

  /* One siting context per faction, built the first time that faction's engineers have something to
     do. Asking BattleSides for "this faction is the defender" is what orients the works against
     whoever is coming, rather than against whoever was coming at the start of the battle. */
  function contextFor(sim,faction){
    var cache=sim._engineerContexts||(sim._engineerContexts={});
    if(cache[faction])return cache[faction];
    var scenario=scenarioOf(sim);if(!scenario)return null;
    var sides=sim._sides&&sim._sides.defender===faction?sim._sides:root.BattleSides.build(scenario,{defender:faction});
    /* Field engineering during a battle is a fraction of what a prepared position gets, and the
       sectors are "wherever we end up", not the commander's chosen span. */
    var ctx=root.BattleDefensePlan.createContext(scenario,sides,{
      sectors:sides.sectors,density:.25,salt:'engineer',
      heightAt:sim.heightAt,obstacles:sim.obstacles});
    ctx.sides=sides;
    cache[faction]=ctx;
    return ctx;
  }
  function sectorFor(ctx,objectiveId){
    var list=ctx.sides.sectors||[];
    for(var i=0;i<list.length;i++)if(list[i].objectiveId===objectiveId)return list[i];
    return null;
  }

  /* What this objective is missing, in the order a real section would do it: something to fight
     from, then something to fight from behind, then something to slow the approach down. */
  function nextWorkType(sim,faction,objectiveId){
    var plan=sim._defensePlans&&sim._defensePlans[faction],bucket=plan&&plan.bySector[objectiveId];
    var works=bucket?bucket.works:[],combat=0,parapet=0,belt=0;
    for(var i=0;i<works.length;i++){
      var t=works[i].type;
      if(root.BattleDefensePlan.COMBAT[t])combat++;
      if(t==='sandbags')parapet++;
      if(t==='wire')belt++;
    }
    if(combat<2)return'foxholes';
    if(parapet<2)return'sandbags';
    if(belt<2)return'wire';
    if(combat<4)return'foxholes';
    return null;
  }
  /* Fighting positions go on the objective's forward lip; obstacles go out in front of it. */
  function siteFor(ctx,sector,type){
    var p={x:sector.x,z:sector.z},frame=root.BattleSides.tacticalFrame(ctx.sides,p);
    var out=type==='wire'?sector.radius*1.05:sector.radius*.55;
    var lateral=(ctx.rng()-.5)*sector.radius*1.2;
    var q=root.BattleSides.offsetPoint(p,frame,-out,lateral);
    return{type:type,x:q.x,z:q.z,ang:frame.acrossYaw,
      why:'Field-fortified by engineers on ground their side already holds.'};
  }

  function startJob(sim,sq,s,objectiveId){
    var ctx=contextFor(sim,s.faction);if(!ctx)return null;
    var sector=sectorFor(ctx,objectiveId);if(!sector)return null;
    var type=nextWorkType(sim,s.faction,objectiveId);
    if(!type){s._fortifyNextAt=(sim.time||0)+FORTIFY_COOLDOWN*4;return null;}
    var spec=root.BattleDefensePlan.WORKS[type],out=[];
    var work=root.BattleDefensePlan.siteWork(ctx,sector,out,siteFor(ctx,sector,type));
    if(!work){s._fortifyNextAt=(sim.time||0)+FORTIFY_COOLDOWN;return null;}
    /* siteWork already charged the context's budget and materialised the work. It does not exist
       on the battlefield until the engineer has actually dug it, so it is parked on the job. */
    ctx.works.push(work);
    s._fortifyJob={x:work.x,z:work.z,type:type,objectiveId:objectiveId,work:work,
      seconds:DIG_BASE+spec.cost[1]*DIG_PER_EFFORT,worked:0,lastAt:null,complete:false};
    telemetry(sim,'engineer-job',{faction:s.faction,squad:sq.id,soldier:s.id,work:type,
      objective:objectiveId,seconds:s._fortifyJob.seconds});
    return s._fortifyJob;
  }
  function finishJob(sim,s){
    var job=s._fortifyJob;if(!job)return;
    s._fortifyJob=null;s._fortifyNextAt=(sim.time||0)+FORTIFY_COOLDOWN;
    var ctx=contextFor(sim,s.faction),sector=ctx&&sectorFor(ctx,job.objectiveId);
    if(root.BattleDefenseWorks)root.BattleDefenseWorks.commitWork(sim,s.faction,job.work,sector);
    telemetry(sim,'engineer-work-complete',{faction:s.faction,soldier:s.id,work:job.type,
      objective:job.objectiveId,posts:job.work.posts.length,x:+job.work.x.toFixed(1),z:+job.work.z.toFixed(1)});
  }
  function abandonJob(sim,s,why){
    var job=s._fortifyJob;if(!job)return;
    s._fortifyJob=null;s._fortifyNextAt=(sim.time||0)+FORTIFY_COOLDOWN;
    telemetry(sim,'engineer-job-abandoned',{faction:s.faction,soldier:s.id,work:job.type,why:why||'',
      worked:+((job.worked||0).toFixed(1))});
  }

  /* Which objective, if any, this squad is currently holding for its own side. */
  function heldObjective(sim,sq){
    var id=sq._objectiveDefenseId||sq.garrisonObjective||sq.targetObjective;
    if(!id)return null;
    var status=objectiveStatus(sim,id);
    if(!status||status.owner!==sq.faction)return null;
    return id;
  }

  function updateEngineers(sim){
    if(!sim||!sim.factions)return;
    ['us','ge'].forEach(function(faction){
      var squads=sim.factions[faction]&&sim.factions[faction].squads||[];
      squads.forEach(function(sq){
        var engineers=engineersOf(sq);if(!engineers.length)return;
        var objectiveId=heldObjective(sim,sq),holding=!!objectiveId&&sq.state!=='retreat';
        engineers.forEach(function(s){
          if(s._fortifyJob&&s._fortifyJob.complete){finishJob(sim,s);return;}
          if(!holding||sq.inContact){
            /* Only give the job up entirely if the reason it cannot continue is durable: losing the
               objective or being pulled off it. A firefight just pauses him. */
            if(s._fortifyJob&&!holding)abandonJob(sim,s,objectiveId?'squad left the objective':'objective lost');
            return;
          }
          if(s._fortifyJob){
            /* He wandered - a bound, a withdrawal - and the site is now out of reach. */
            if(dist(s.root.position.x,s.root.position.z,s._fortifyJob.x,s._fortifyJob.z)>JOB_RANGE*2)
              abandonJob(sim,s,'site out of reach');
            return;
          }
          if((sim.time||0)<(s._fortifyNextAt||0))return;
          /* A post is a position he is supposed to be holding; digging starts from the position he
             already has, not instead of it. */
          if(s._defensePost&&dist(s.root.position.x,s.root.position.z,s._defensePost.x,s._defensePost.z)>MIN_JOB_GAP)return;
          startJob(sim,sq,s,objectiveId);
        });
      });
    });
  }

  function reset(sim){
    sim._engineerContexts=null;
    ['us','ge'].forEach(function(f){
      (sim._roster&&sim._roster[f]||[]).forEach(function(s){s._fortifyJob=null;s._fortifyNextAt=0;});
    });
  }

  root.BattleEngineerWorks={update:updateEngineers,nextWorkType:nextWorkType,digSeconds:function(type){
    var spec=root.BattleDefensePlan.WORKS[type];return spec?DIG_BASE+spec.cost[1]*DIG_PER_EFFORT:0;}};

  root.BattleModules.registerSystem('engineer-works',{
    version:'30-engineers',
    onBattleStart:function(sim){reset(sim);},
    beforeBattleRestart:function(sim){reset(sim);},
    onBattleRestart:function(sim){reset(sim);},
    onCommanderTick:function(sim){updateEngineers(sim);}
  });
  console.log('[ENGINEER] pioneers fortify held objectives');
})(typeof window!=='undefined'?window:globalThis);
