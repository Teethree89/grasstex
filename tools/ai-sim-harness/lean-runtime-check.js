#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
function root(){
  const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,s){systems[id]=s;},getSystem(id){return systems[id];},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleCommanderDoctrine={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};}};
  load(r,'battle/obstacle-field.js');load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/16-squad-plan-stability.js');load(r,'battle/modules/44-assault-forward-guard.js');load(r,'battle/modules/52-survival-tactical-route.js');
  return{r,systems};
}
test('only one consolidated owner exists for each tactical layer',()=>{
  const {r,systems}=root();
  assert.ok(systems['squad-command']);assert.ok(systems['combat-mobility']);assert.ok(systems['movement-execution']);
  assert.ok(r.BattleSquadStability&&r.BattleCombatMobility&&r.BattleMovementExecution);
});
test('engagement delegates combat locomotion to combat mobility',()=>{
  const src=fs.readFileSync(path.join(H.REPO,'battle/engagement.js'),'utf8');
  assert.match(src,/BattleCombatMobility&&root\.BattleCombatMobility\.request/);
  assert.doesNotMatch(src,/source:'engagement'/);
});
test('fireteam slots are produced by the squad-command owner',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});
  q.commandPhase='assault';r.SquadAI.updateSquad(q,b);
  assert.ok(q.members.every(s=>s._fireteamKey&&s._fireteamDestination));
});
test('committed combat plan suppresses transient cohesion rally',()=>{
  const {r,systems}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});
  q.commandPhase='assault';q.inContact=true;systems['squad-command'].onCommanderTick(b,{town:null});
  assert.ok(q._engagementPlan&&q._engagementPlan.status==='active');
  // The Captain is the only rally producer; a dispersed squad in a firefight is deployed, not scattered.
  q.members.forEach((s,i)=>{s.root.position.x=(i%2?-1:1)*60;});
  for(let i=0;i<10;i++){b.time+=.45;systems['squad-command'].onCommanderTick(b,{town:null});assert.equal(q.commandPhase,'assault');}
  assert.equal(systems['squad-command'].onSimulationStep,undefined,'no per-step phase revert should exist');
});
test('combat mobility coalesces repeated combat intents before resolver publication',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0];
  for(let i=0;i<8;i++)r.BattleCombatMobility.request(s,{x:2,z:3},b,'hold',.8,{origin:'engagement',reason:'contact'});
  assert.equal(b._combatMobilityStats.intentRequests,8);assert.equal(b._combatMobilityStats.intentPublishes,1);assert.equal(b._combatMobilityStats.intentCoalesced,7);
  assert.equal(s._movementResolver.combat.owner,'combat-mobility');assert.equal(s._movementResolver.combat.reason,'contact');
  b.time+=.6;r.BattleCombatMobility.request(s,{x:2,z:3},b,'hold',.8,{origin:'engagement',reason:'contact'});
  assert.equal(b._combatMobilityStats.intentPublishes,2);
});
test('combat mobility publishes material intent changes immediately',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0];
  r.BattleCombatMobility.request(s,{x:2,z:3},b,'hold',.8,{origin:'test',reason:'contact'});
  r.BattleCombatMobility.request(s,{x:8,z:3},b,'cover-bound',.8,{origin:'test',reason:'move cover'});
  assert.equal(b._combatMobilityStats.intentPublishes,2);assert.equal(s._movementResolver.combat.kind,'cover-bound');
});

test('one hedge prism blocks prone and standing LOS even when the shooter is close to it',()=>{
  const {r}=root(),F=r.BattleObstacleField;
  const hedge={id:'hedge-test',type:'hedge',shape:'obb',volume:'terrain-prism',x:0,z:0,hx:3,hz:1.1,ux:1,uz:0,vx:0,vz:1,y0:0,y1:0,height:2.2,radius:1.1,cover:.62};
  const obstacles=[hedge];obstacles.__physicalVersion=4;
  assert.equal(F.sightBlocked(obstacles,{x:0,z:-2,y:.42},{x:0,z:20,y:.42}),true);
  assert.equal(F.sightBlocked(obstacles,{x:0,z:-20,y:1.55},{x:0,z:20,y:1.55}),true);
  assert.equal(F.sightBlocked(obstacles,{x:0,z:-20,y:2.5},{x:0,z:20,y:2.5}),false);
  assert.equal(F.sightBlocker(obstacles,{x:0,z:-20,y:1.55},{x:0,z:20,y:1.55}),hedge);
});

test('meso cohesion may forgive laggers but never forward outrunners',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:100,z:0}});
  q.orderAnchor={x:0,z:0};q.rally={x:0,z:0};q.objective={x:100,z:0};
  for(let i=0;i<q.members.length;i++){q.members[i].root.position.x=(i-4)*.6;q.members[i].root.position.z=(i%2)*.5;}
  q.members[8].root.position.x=-75;q.members[9].root.position.x=75;
  const a=r.BattleRallyState.assessment(q,34);
  assert.ok(a.stragglers.includes(String(q.members[8].id)),'lagger should be catch-up eligible');
  assert.ok(!a.stragglers.includes(String(q.members[9].id)),'outrunner must remain in the core');
  assert.ok(a.outrunners.includes(String(q.members[9].id)));assert.equal(a.dispersed,true);
});

test('defensive fireteam posts survive contact flicker without A-B-A formation rewrites',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'ge-0',faction:'ge',x:0,z:0,objective:{x:0,z:-100}});
  q.commandPhase='defend';q.targetObjective='obj-home';q.objective={x:0,z:-20};
  if(r.BattleEngagement)r.BattleEngagement.updateSquad=function(){};
  r.SquadAI.updateSquad(q,b);
  for(const s of q.members){const d=s._fireteamDestination;s.root.position.x=d.x;s.root.position.z=d.z;s.orderDestination={x:d.x,z:d.z};s._defensePost=null;}
  b.time+=.2;q.inContact=false;r.SquadAI.updateSquad(q,b);
  const before=q.members.map(s=>({post:s._defensePost&&{x:s._defensePost.x,z:s._defensePost.z,key:s._defensePost.commandKey},dest:{...s._fireteamDestination}}));
  assert.ok(before.every(x=>x.post));
  b.time+=.2;q.inContact=true;r.SquadAI.updateSquad(q,b);
  const during=q.members.map(s=>({post:s._defensePost&&{x:s._defensePost.x,z:s._defensePost.z,key:s._defensePost.commandKey},dest:{...s._fireteamDestination}}));
  b.time+=.2;q.inContact=false;r.SquadAI.updateSquad(q,b);
  const after=q.members.map(s=>({post:s._defensePost&&{x:s._defensePost.x,z:s._defensePost.z,key:s._defensePost.commandKey},dest:{...s._fireteamDestination}}));
  assert.deepEqual(during,before);assert.deepEqual(after,before);
});

test('retreat is never classified unreachable by movement progress',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'ge-0',faction:'ge',x:0,z:0,objective:{x:0,z:-100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress;
  q.state='retreat';q.commandPhase='retreat';const pick={owner:'squad-command',kind:'retreat'};
  for(let i=0;i<80;i++){b.time+=.5;P.observe(s,b,{x:0,z:-100},pick);}
  assert.equal(P.isStuck(s),false);assert.equal(!!s._movementGoalUnreachable,false);
});
test('combat bound still gets one conservative recovery then unreachable',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress;
  const pick={owner:'combat-mobility',kind:'cover-bound'};let rebuilds=0;
  for(let i=0;i<70;i++){b.time+=.5;const a=P.observe(s,b,{x:0,z:20},pick);if(a&&a.rebuild)rebuilds++;}
  assert.ok(rebuilds>=1);assert.equal(s._movementGoalUnreachable,true);
});
test('failed cover candidate is temporarily suppressed',()=>{
  const {r}=root(),b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']}),s=q.members[0],P=r.BattleMovementProgress,p={x:5,z:5};
  assert.equal(P.candidateAllowed(s,b,p),true);P.noteFailure(s,b,p,'test');assert.equal(P.candidateAllowed(s,b,p),false);b.time+=13;assert.equal(P.candidateAllowed(s,b,p),true);
});
console.log('All '+n+' lean-runtime checks passed.');