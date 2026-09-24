#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
let checks=0;
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
function fixture(){const r=H.bootstrap({modules:false}),systems={};r.BattleModules={registerSystem(id,s){systems[id]=s;},unitsFor:b=>b._roster.us.concat(b._roster.ge)};
 load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');load(r,'battle/modules/44-combat-urgency.js');
 load(r,'battle/modules/52-survival-tactical-route.js');
 const b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman','rifleman']});q.state='engaged';q.commandPhase='assault';q.inContact=true;q.orderAnchor={x:0,z:0};
 const s=q.members[0];s.root.position.x=0;s.root.position.z=0;s.destination={x:0,z:0};s.target={id:99,dead:false,root:{position:{x:0,y:0,z:100}}};s.eng=r.BattleEngagement.stateOf(s);s.eng.state='bound';s.eng.cover={x:0,z:10,quality:.5,distance:10};s.eng.until=10;
 return{r,b,q,s,M:r.BattleMovementResolver,R:r.BattleMovementProgress,systems};}
function test(name,f){f();checks++;console.log('PASS '+name);}
test('forward-approved bound remains authoritative as remaining distance drops below 1.5m',()=>{
 const {r,b,s,M}=fixture();M.proposeOrder(s,{x:25,z:20},b,true);M.proposeCombat(s,s.eng.cover,b,'cover-bound');M.resolve(s,b);
 s.root.position.z=8.6;b.time=.15;M.proposeCombat(s,s.eng.cover,b,'cover-bound');assert.equal(M.resolve(s,b).kind,'cover-bound');assert.equal(s.destination.z,10);
});
test('suppression ending does not revoke the lateral cover move it authorized',()=>{
  const {b,s,M}=fixture();s.eng.cover={x:10,z:0};s.suppressedUntil=1;M.proposeOrder(s,{x:0,z:25},b);M.proposeCombat(s,s.eng.cover,b,'cover-bound');M.resolve(s,b);
  b.time=2;M.proposeCombat(s,s.eng.cover,b,'cover-bound');assert.equal(M.resolve(s,b).kind,'cover-bound');
});
test('equivalent destinations within the deadband keep one committed route',()=>{
  const {b,s,M}=fixture();
  M.proposeOrder(s,{x:25,z:20},b,true);M.resolve(s,b);
  const first={x:s.destination.x,z:s.destination.z},changes=s._movementResolver.changes;
  M.proposeOrder(s,{x:26,z:21},b,false);M.resolve(s,b);
  assert.deepEqual(s.destination,first);assert.equal(s._movementResolver.changes,changes);
});
test('a materially distant destination is accepted once the order commit lapses',()=>{
  const {b,s,M}=fixture();
  M.proposeOrder(s,{x:2,z:20},b,true);M.resolve(s,b);
  const first={x:s.destination.x,z:s.destination.z};
  b.time=2;M.proposeOrder(s,{x:2,z:60},b,false);
  const last=M.resolve(s,b);
  assert.equal(last.kind,'formation');assert.deepEqual(s.destination,{x:2,z:60});
  assert.ok(Math.hypot(s.destination.x-first.x,s.destination.z-first.z)>5);
});
test('marginally better cover does not displace the committed bound (hysteresis)',()=>{
  const {b,s,M}=fixture();
  M.proposeCombat(s,{x:0,z:10},b,'cover-bound',null,{source:'engagement',reason:'moving to cover',score:10});M.resolve(s,b);
  M.proposeCombat(s,{x:10,z:10},b,'cover-bound',null,{source:'engagement',reason:'moving to cover',score:12});M.resolve(s,b);
  assert.deepEqual(s.destination,{x:0,z:10});
  M.proposeCombat(s,{x:10,z:10},b,'cover-bound',null,{source:'engagement',reason:'moving to cover',score:15});M.resolve(s,b);
  assert.deepEqual(s.destination,{x:10,z:10});
});
test('lower-priority proposals cannot displace an active bound; retreat always wins',()=>{
  const {b,q,s,M}=fixture();
  M.proposeOrder(s,{x:0,z:0},b,true);
  M.proposeCombat(s,{x:0,z:10},b,'cover-bound');M.resolve(s,b);
  assert.deepEqual(s.destination,{x:0,z:10});
  M.proposeCombat(s,{x:0,z:0},b,'hold');M.resolve(s,b);
  assert.deepEqual(s.destination,{x:0,z:10});
  q.state='retreat';
  M.proposeCombat(s,{x:0,z:10},b,'cover-bound');
  assert.equal(M.resolve(s,b).kind,'retreat');
});
test('a bound survives repeated tactical refreshes while closing on cover',()=>{
  const {b,s,M}=fixture();
  M.proposeOrder(s,{x:25,z:20},b,true);M.proposeCombat(s,s.eng.cover,b,'cover-bound');M.resolve(s,b);
  for(let i=0;i<5;i++){b.time+=.15;s.root.position.z+=1.6;M.proposeCombat(s,s.eng.cover,b,'cover-bound');assert.equal(M.resolve(s,b).kind,'cover-bound');}
  assert.deepEqual(s.destination,{x:0,z:10});assert.equal(s._movementResolver.changes,1);
});
test('small aim updates do not rebuild the movement route',()=>{
  const {b,s,M}=fixture();s.eng.state='assault';
  M.proposeCombat(s,{x:0,z:20},b,'assault-rush',null,{source:'engagement',reason:'assault'});M.resolve(s,b);
  const changes=s._movementResolver.changes;
  M.proposeCombat(s,{x:.5,z:20.3},b,'assault-rush',null,{source:'engagement',reason:'assault'});M.resolve(s,b);
  assert.equal(s._movementResolver.changes,changes);assert.deepEqual(s.destination,{x:0,z:20});
});
test('a genuinely stuck bound triggers graduated recovery then unreachable',()=>{
  const {r,b,s,M}=fixture();const P=r.BattleMovementProgress;assert.ok(P);
  M.proposeOrder(s,{x:0,z:0},b,true);M.proposeCombat(s,{x:0,z:20},b,'cover-bound');M.resolve(s,b);
  // Episode timing: one rebuild after confirmation (~6.5s), one alternate after the
  // observation period (~14.5s), unreachable after a further confirmed window (~22.5s).
  for(let i=0;i<24;i++){b.time+=.5;M.proposeCombat(s,{x:0,z:20},b,'cover-bound');M.resolve(s,b);}
  assert.equal(b._movementProgressStats.routeRebuilds,1);
  assert.equal(b._movementProgressStats.alternateApproaches,0);
  assert.ok(!s._movementGoalUnreachable);
  for(let i=0;i<36;i++){b.time+=.5;M.proposeCombat(s,{x:0,z:20},b,'cover-bound');M.resolve(s,b);}
  assert.equal(b._movementProgressStats.alternateApproaches,1);
  assert.equal(s._movementGoalUnreachable,true);
  assert.equal(P.isStuck(s),true);
  assert.equal(b._movementProgressStats.recoveryAttempts,2);
  assert.equal(s._movementResolver.changes,1);
});
test('failed candidates are avoided briefly, locally, then forgiven',()=>{
  const {r,b,s}=fixture();const P=r.BattleMovementProgress,bad={x:5,z:5},far={x:50,z:50};
  assert.equal(P.candidateAllowed(s,b,bad),true);
  P.noteFailure(s,b,bad,'no-progress');
  assert.equal(P.candidateAllowed(s,b,bad),false);
  assert.equal(P.candidateAllowed(s,b,far),true);
  b.time+=13;assert.equal(P.candidateAllowed(s,b,bad),true);
});
test('a suppressed bound goal yields to an alternate cover proposal',()=>{
  const {r,b,s,M}=fixture();const P=r.BattleMovementProgress;
  M.proposeCombat(s,{x:0,z:10},b,'cover-bound');M.resolve(s,b);
  P.noteFailure(s,b,{x:0,z:10},'no-progress');
  M.proposeCombat(s,{x:8,z:9},b,'cover-bound');M.resolve(s,b);
  assert.deepEqual(s.destination,{x:8,z:9});
});
console.log('All '+checks+' movement-state checks passed.');
