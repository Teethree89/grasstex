#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../tools/ai-sim-harness/harness');
function load(r, file) {
  new Function('window', 'globalThis', 'console', fs.readFileSync(path.join(H.REPO, file), 'utf8'))(r, r, {log(){}, warn(){}});
}
function fixture() {
  const r = H.bootstrap({modules:false}), systems = {};
  r.BattleModules = {registerSystem(id, s){systems[id] = s;}, unitsFor:b=>b._roster.us.concat(b._roster.ge)};
  r.BattleCommanderAI = {policyFor(){return {};}};
  load(r, 'battle/movement-resolver.js');
  load(r, 'battle/modules/16-squad-plan-stability.js');
  load(r, 'battle/modules/44-combat-urgency.js');
  const b = H.makeBattle(r), q = H.addSquad(r, b, {id:'us-0', faction:'us', x:0, z:0,
    objective:{x:0,z:100}, composition:['captain','rifleman','rifleman','rifleman','rifleman','rifleman']});
  q.commandPhase = 'assault'; q.orderAnchor = {x:0,z:0};
  const s = q.members[2]; s.root.position.x=0; s.root.position.z=0; s.destination={x:0,z:0};
  r.SquadAI.updateSquad(q,b);
  return {r,b,q,s,M:r.BattleMovementResolver,E:r.BattleEngagement};
}
function combat(f, visible=true) {
  const {b,q,s,E}=f;
  q.inContact=true; q._assaultAuthorized=true; q._boundTeam='alpha'; q._boundUntil=10;
  s._fireteamKey='alpha';
  s.target=visible?{id:99,dead:false,root:{position:{x:0,y:0,z:40}}}:null;
  const e=E.stateOf(s); e.state=visible?'engage':'alert'; e.until=10; e.reviewAt=100; e.boundOrder=true;
  return e;
}
let failed=0;
function test(name, fn) { try {fn(); console.log('PASS: '+name);} catch(error) {failed++; console.error('FAIL: '+name+'\n'+error.stack);} }

test('Micro consumes Captain formation without republishing Meso intent',()=>{
  const {b,q,s,M,E}=fixture(), order=s._movementResolver.order;
  const before=b._movementGoalStats.bySource['squad-stability'].requests;
  for(let i=0;i<20;i++){b.time+=.15; E.updateSoldier(s,b); M.resolve(s,b);}
  assert.equal(b._movementGoalStats.bySource['squad-stability'].requests,before);
  assert.equal(s._movementResolver.order,order);
  assert.equal(M.resolve(s,b).kind,'formation');
  q.state='retreat'; E.updateSoldier(s,b); assert.equal(M.resolve(s,b).kind,'retreat');
  assert.equal(b._movementGoalStats.bySource['squad-stability'].requests,before);
});

test('assault mission alone does not authorize an individual rush',()=>{
  const f=fixture(),e=combat(f); e.boundOrder=false;
  f.q._boundUntil=0; f.E.decide(f.s,f.b,'test no cover'); f.M.resolve(f.s,f.b);
  assert.equal(e.state,'engage'); assert.equal(f.s._movementResolver.last.kind,'hold');
});

test('a consumed bound window cannot start another independent push',()=>{
  const f=fixture(),e=combat(f); e.boundOrder=false;
  f.E.updateSoldier(f.s,f.b); f.M.resolve(f.s,f.b);
  assert.equal(e.state,'engage'); assert.equal(f.s._movementResolver.last.kind,'hold');
});

test('one authorized no-cover bound commits once through target loss and arrival',()=>{
  const f=fixture(),e=combat(f,false),{s,b,E,M}=f;
  E.updateSoldier(s,b); M.resolve(s,b);
  assert.equal(e.state,'assault'); assert.equal(e.boundOrder,false);
  assert.equal(s._movementResolver.last.kind,'assault-rush');
  const goal={...e.assaultGoal}; assert.ok(goal.z>1.25&&goal.z<=6.5);
  b.time=.15; E.updateSoldier(s,b); M.resolve(s,b); assert.deepEqual(e.assaultGoal,goal);
  s.root.position.x=goal.x; s.root.position.z=goal.z;
  b.time=.3; E.updateSoldier(s,b); M.resolve(s,b);
  b.time=.45; E.updateSoldier(s,b); M.resolve(s,b);
  assert.notEqual(e.state,'assault'); assert.equal(s._movementResolver.last.kind,'hold');
  assert.equal(s.destination.z,goal.z,'completion must hold at arrival instead of starting another push');
});

test('Captain never calls the moving fireteam its own base of fire',()=>{
  const {q,b,E}=fixture(); q.members=q.members.filter(s=>[2,4,5].includes(s.slotIndex));
  for(const s of q.members){s._fireteamKey='alpha';s.target={id:99,root:{position:{x:0,y:0,z:100}}};E.stateOf(s).state='engage';}
  q.inContact=true; q._nextBoundAt=0; q._boundUntil=0;
  E.updateSquad(q,b);
  assert.equal(q._boundUntil,0,'a fireteam cannot move when that leaves no base of fire');
  assert.ok(q.members.every(s=>!E.stateOf(s).boundOrder));
});

test('a defensive Captain mission does not issue offensive bounds',()=>{
  const {q,b,E}=fixture(); q.commandPhase='defend'; q.inContact=true; q._nextBoundAt=0;
  for(const s of q.members){s.target={id:99,root:{position:{x:0,y:0,z:100}}};E.stateOf(s).state='engage';}
  E.updateSquad(q,b);
  assert.equal(q._boundUntil||0,0); assert.ok(q.members.every(s=>!E.stateOf(s).boundOrder));
});
if(failed)process.exitCode=1;
