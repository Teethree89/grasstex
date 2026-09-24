#!/usr/bin/env node
'use strict';
/* Leader succession (16-squad-plan-stability.js updateSuccession): when the squad leader is killed the
   squad is leaderless for the `succession` lease, then the most senior survivor (SquadAI.mostSenior)
   takes command and the leader's slot. Runs the shipping squad, engagement, resolver and Squad Leader
   code with no enemy on the field. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
const DELAY=6;
function world(){
  H.resetIds();const r=H.bootstrap({modules:false}),events=[];
  r.BattleModules={registerSystem(){},getSystem(){},runHook(){},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleTelemetry={record(type,data){events.push({type,data});}};
  r.BattleCommanderDoctrine={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};}};
  load(r,'battle/movement-resolver.js');load(r,'battle/modules/16-squad-plan-stability.js');
  const b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:200}});
  return{r,b,q,events,L:r.BattleLeases,S:r.SquadAI};
}
const leaders=w=>w.q.members.filter(s=>!s.dead&&w.S.isLeader(s));
const role=(w,r)=>w.q.members.filter(s=>!s.dead&&s.role===r);
function kill(w,s){w.b.killSoldier(s,null);if(s===w.S.leaderOf(w.q)||s.role==='sergeant')w.q.accuracyMultiplier=.8;}

test('a killed leader is replaced by the most senior survivor after the succession delay',()=>{
  const w=world();H.run(w.r,w.b,1);const sgt=role(w,'sergeant')[0];assert.equal(w.S.leaderOf(w.q),sgt);
  kill(w,sgt);const killedAt=w.b.time;let leaderless=0,most=0;
  H.run(w.r,w.b,DELAY+2,b=>{const l=leaders(w).length;most=Math.max(most,l);if(!l)leaderless=b.time;});
  const lead=w.S.leaderOf(w.q),rifle=role(w,'rifleman').sort((a,b)=>a.id-b.id)[0];
  assert.equal(most,1,'never more than one leader');
  assert.ok(leaderless-killedAt>=DELAY-0.2&&leaderless-killedAt<=DELAY+0.2,'leaderless for the delay: '+(leaderless-killedAt).toFixed(2)+'s');
  assert.equal(lead,rifle,'the lowest-id rifleman takes command');assert.equal(lead.slotIndex,0);assert.equal(w.q.leaderId,lead.id);
  assert.equal(w.q.accuracyMultiplier,1,'the leaderless penalty ends');
  const ended=w.q._leases.ended.filter(l=>l.kind==='succession').at(-1);assert.equal(ended.owner,'squad-leader');assert.equal(ended.endReason,'successor took command');
  const ev=w.events.filter(e=>e.type==='decision-leader-succession');assert.equal(ev.length,1);assert.equal(ev[0].data.soldier,lead.id);
});
test('the gunner stays on the gun while anyone else is alive',()=>{
  const w=world();w.q.members.filter(s=>s.role!=='gunner'&&s.role!=='scout').forEach(s=>kill(w,s));H.run(w.r,w.b,DELAY+1);
  assert.equal(w.S.leaderOf(w.q).role,'scout');
  role(w,'scout').forEach(s=>kill(w,s));H.run(w.r,w.b,DELAY+1);
  assert.equal(w.S.leaderOf(w.q).role,'gunner','the last man leads');
});
test('a killed successor is replaced in turn',()=>{
  const w=world();kill(w,role(w,'sergeant')[0]);H.run(w.r,w.b,DELAY+1);const first=w.S.leaderOf(w.q);
  kill(w,first);H.run(w.r,w.b,DELAY+1);const second=w.S.leaderOf(w.q);
  assert.ok(second&&second!==first&&second.role==='rifleman');
  assert.equal(w.events.filter(e=>e.type==='decision-leader-succession').length,2);
});
test('a squad with its leader holds no succession lease; a wiped-out squad promotes nobody',()=>{
  const w=world();H.run(w.r,w.b,10);assert.equal(w.L.get(w.q,'succession'),null);
  kill(w,role(w,'sergeant')[0]);H.run(w.r,w.b,1);assert.ok(w.L.get(w.q,'succession'));
  w.q.members.forEach(s=>kill(w,s));H.run(w.r,w.b,DELAY+1);
  assert.equal(w.L.get(w.q,'succession'),null,'the lease closes with the squad');
  assert.equal(w.events.filter(e=>e.type==='decision-leader-succession').length,0);
});
test('seniority: sergeant, rifleman, scout, then the gunner; lowest id breaks ties',()=>{
  const S=world().S,m=(id,role,dead)=>({id,role,dead:!!dead});
  assert.equal(S.mostSenior([m(1,'gunner'),m(2,'scout'),m(3,'rifleman'),m(4,'rifleman')]).id,3);
  assert.equal(S.mostSenior([m(1,'gunner'),m(5,'sergeant',true),m(6,'sergeant'),m(2,'rifleman')]).id,6);
  assert.equal(S.mostSenior([m(9,'gunner'),m(8,'scout')]).id,8);
  assert.equal(S.mostSenior([m(9,'gunner')]).id,9);
});
test('the same squad succeeds identically',()=>{
  function trace(){const w=world();kill(w,role(w,'sergeant')[0]);H.run(w.r,w.b,DELAY+1);kill(w,w.S.leaderOf(w.q));H.run(w.r,w.b,DELAY+1);return JSON.stringify(w.events.filter(e=>e.type==='decision-leader-succession'));}
  assert.equal(trace(),trace());
});
console.log(n+' succession checks passed');
