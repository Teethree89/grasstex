#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
function root(){
  const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,s){systems[id]=s;},getSystem(id){return systems[id];},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleCommanderAI={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};},chooseObjective(){return null;}};
  load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/16-squad-plan-stability.js');load(r,'battle/modules/44-assault-forward-guard.js');load(r,'battle/modules/52-survival-tactical-route.js');
  return{r,systems};
}
test('only one consolidated owner exists for each tactical layer',()=>{
  const {r,systems}=root();
  assert.ok(systems['squad-command']);assert.ok(systems['combat-mobility']);assert.ok(systems['movement-execution']);
  assert.ok(r.BattleSquadStability&&r.BattleCombatMobility&&r.BattleMovementExecution);
});
test('fireteam slots are produced by the squad-command owner',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});
  q.commandPhase='assault';r.SquadAI.updateSquad(q,b);
  assert.ok(q.members.every(s=>s._fireteamKey&&s._fireteamDestination));
});
test('committed combat plan suppresses transient cohesion regroup',()=>{
  const {r,systems}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});
  q.commandPhase='assault';q.inContact=true;systems['squad-command'].onCommanderTick(b,{town:null});
  assert.ok(q._engagementPlan&&q._engagementPlan.status==='active');
  q.commandPhase='regroup';systems['squad-command'].onSimulationStep(b);assert.equal(q.commandPhase,'assault');
});
test('retreat is never classified unreachable by movement progress',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'ge-0',faction:'ge',x:0,z:0,objective:{x:0,z:-100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress;
  q.state='retreat';q.commandPhase='retreat';const pick={owner:'squad-command',kind:'retreat'};
  for(let i=0;i<80;i++){b.time+=.5;P.observe(s,b,{x:0,z:-100},pick);}
  assert.equal(P.isStuck(s),false);assert.equal(!!s._movementGoalUnreachable,false);
});
test('combat bound still gets one conservative recovery then unreachable',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress;
  const pick={owner:'engagement',kind:'cover-bound'};let rebuilds=0;
  for(let i=0;i<70;i++){b.time+=.5;const a=P.observe(s,b,{x:0,z:20},pick);if(a&&a.rebuild)rebuilds++;}
  assert.ok(rebuilds>=1);assert.equal(s._movementGoalUnreachable,true);
});
test('failed cover candidate is temporarily suppressed',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress,p={x:5,z:5};
  assert.equal(P.candidateAllowed(s,b,p),true);P.noteFailure(s,b,p,'test');assert.equal(P.candidateAllowed(s,b,p),false);b.time+=13;assert.equal(P.candidateAllowed(s,b,p),true);
});
console.log('All '+n+' lean-runtime checks passed.');
