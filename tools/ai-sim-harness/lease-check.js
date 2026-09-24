#!/usr/bin/env node
'use strict';
/* Owned command leases (squad-ai.js BattleLeases): every Captain hold has one live lease with an
   owner, a reason and a release path, and ends with a recorded reason. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
function root(){
  const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,s){systems[id]=s;},getSystem(id){return systems[id];},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleCommanderDoctrine={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};}};
  load(r,'battle/movement-resolver.js');load(r,'battle/modules/16-squad-plan-stability.js');
  return{r,captain:systems['squad-command']};
}
function squad(r){const b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});return{b,q};}
function tick(captain,b,dt){b.time+=dt||.45;captain.onCommanderTick(b,{town:null});}

test('the lease primitive grants, extends, holds, ends and logs',()=>{
  const {r}=root(),L=r.BattleLeases,q={};
  L.grant(q,'hold','captain',0,5,'why','release');
  assert.equal(L.holds(q,'hold',4.99),true);assert.equal(L.holds(q,'hold',5),false);
  L.extend(q,'hold','captain',1,3,'shorter');assert.equal(L.until(q,'hold'),5,'extend never shortens');
  L.extend(q,'hold','captain',1,8,'longer');assert.equal(L.until(q,'hold'),8);assert.equal(L.get(q,'hold').reason,'longer');
  assert.deepEqual(L.active(q,2).map(l=>[l.kind,l.owner,l.remaining]),[['hold','captain',6]]);
  const ended=L.end(q,'hold',3,'done');assert.equal(ended.endReason,'done');assert.equal(L.get(q,'hold'),null);
  assert.equal(q._leases.ended.at(-1).kind,'hold');assert.equal(L.end(q,'hold',3,'again'),null);
});
test('a staged tactical plan is one Captain lease that lapses on the clock',()=>{
  const {r,captain}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='assault';tick(captain,b);
  const lease=L.get(q,'tactical-plan');
  assert.ok(q._engagementPlan&&lease,'plan and lease exist together');
  assert.equal(lease.owner,'captain');assert.match(lease.release,/lease expiry/);
  const serial=q._engagementPlan.serial;
  while(b.time<lease.until+.5)tick(captain,b);
  const log=q._leases.ended.filter(l=>l.kind==='tactical-plan');
  assert.equal(log[0].endReason,'lease expired','the first plan ended by its own lease');
  assert.notEqual(q._engagementPlan&&q._engagementPlan.serial,serial);
});
test('contact holds the plan lease open; quiet closes it after the quiet window',()=>{
  const {r,captain}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='assault';q.inContact=true;tick(captain,b);tick(captain,b);
  assert.equal(L.until(q,'tactical-plan'),Infinity,'held by contact, not the clock');
  assert.equal(q._missionHold,'tactical-plan','the firefight lease holds route execution');
  q.inContact=false;tick(captain,b);
  const quietAt=b.time,lease=L.get(q,'tactical-plan');
  assert.equal(lease.until,quietAt+9);
  while(b.time<quietAt+9-.01){tick(captain,b);assert.ok(L.get(q,'tactical-plan'),'still open while quiet');}
  tick(captain,b);
  assert.equal(L.get(q,'tactical-plan'),null);
  assert.equal(q._leases.ended.filter(l=>l.kind==='tactical-plan').at(-1).endReason,'contact clear');
});
test('a regroup is a Captain lease; contact ends it and starts the re-entry cooldown',()=>{
  const {r,captain}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='approach';
  q.members.forEach((s,i)=>{s.root.position.x=(i%2?-1:1)*(20+i*6);s.root.position.z=(i%3)*25;});
  for(let i=0;i<8&&!L.get(q,'regroup');i++)tick(captain,b);
  const rg=L.get(q,'regroup');
  assert.ok(rg,'a dispersed squad commits to a regroup');
  assert.equal(rg.owner,'captain');assert.ok(rg.data.anchor);assert.equal(q.commandPhase,'regroup');
  assert.deepEqual(q.orderAnchor,rg.data.anchor,'the squad re-forms on the rally point: fireteam slots hang off the order anchor');
  tick(captain,b);assert.equal(q._missionHold,'regroup','the regroup lease holds mission execution');
  q.inContact=true;tick(captain,b);
  assert.equal(L.get(q,'regroup'),null);
  assert.equal(q._leases.ended.filter(l=>l.kind==='regroup').at(-1).endReason,'contact');
  assert.ok(L.holds(q,'regroup-cooldown',b.time),'re-entry cooldown is its own named lease');
  assert.ok(L.holds(q,'regroup-bypass',b.time));
});
console.log(n+' lease checks passed');
