'use strict';
/* Deterministic owner-boundary check for the M3C Macro switch.
   Verifies that disabling Macro suppresses Force Command assignment work while commander-tick
   bookkeeping and downstream module hooks continue to run. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=globalThis;
let ensured=0,objectiveTicks=0,hooks=0,telemetry=[];

root.BattleSim={start:function(){throw new Error('start not used by this check');}};
root.SquadAI={updateSquad:function(){}};
root.BattleCommanderRoutes={
  ensureAssignments:function(){ensured++;},assignSquad:function(){},initForce:function(){}
};
root.BattleCommanderDoctrine={
  dist:function(){return 0;},avgPos:function(){return{x:0,z:0};},maxSpread:function(){return 0;},captain:function(){return null;},enemyFaction:function(f){return f==='us'?'ge':'us';},
  policyFor:function(){return{decisionSnapshotSeconds:5};},doctrineFor:function(){return{};},genomeFor:function(){return{};},forceUnits:function(){return[];},
  objectiveValueScore:function(){return 0;},forceScore:function(){return 0;},chooseObjective:function(){return null;},buildContext:function(){return{};},nearestEnemyToSquad:function(){return{distance:Infinity};}
};
root.BattleObjectiveSystem={tick:function(){objectiveTicks++;}};
root.BattleModules={runHook:function(name,sim,payload){if(name==='onCommanderTick'){hooks++;if(payload.macroCommandEnabled!==sim.macroCommandEnabled)throw new Error('hook payload did not expose Macro state');}}};
root.BattleTelemetry={record:function(type,data){telemetry.push({type:type,data:data});}};

const commanderPath=path.resolve(__dirname,'../../battle/commander-ai.js');
vm.runInThisContext(fs.readFileSync(commanderPath,'utf8'),{filename:commanderPath});
if(!root.BattleCommanderAI)throw new Error('BattleCommanderAI did not load');

function sim(enabled){return{time:10,macroCommandEnabled:enabled,factions:{us:{squads:[]},ge:{squads:[]}},objectiveControl:{counts:{}},objectiveHold:{us:0,ge:0},_nextDecisionSnapshot:99};}
let off=sim(false);
root.BattleCommanderAI.update(off,null,.45);
if(ensured!==0)throw new Error('Macro OFF still ran Force Command assignment work');
if(objectiveTicks!==1)throw new Error('Macro OFF stopped objective bookkeeping');
if(hooks!==1)throw new Error('Macro OFF stopped commander/module hooks');

let on=sim(true);
root.BattleCommanderAI.update(on,null,.45);
if(ensured!==1)throw new Error('Macro ON did not run Force Command assignment work');
if(objectiveTicks!==2||hooks!==2)throw new Error('Macro ON changed non-Macro commander cadence');

root.BattleCommanderAI.setMacroEnabled(on,false);
if(root.BattleCommanderAI.isMacroEnabled(on)!==false)throw new Error('setMacroEnabled(false) did not persist');
if(!telemetry.some(function(e){return e.type==='decision-macro-command'&&e.data.enabled===false;}))throw new Error('Macro toggle telemetry missing');

console.log('macro-command-toggle-check: PASS');
