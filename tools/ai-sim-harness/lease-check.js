#!/usr/bin/env node
'use strict';
/* Owned command leases (squad-ai.js BattleLeases): every Squad Leader hold has one live lease with an
   owner, a reason and a release path, and ends with a recorded reason. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
function root(){
  const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,s){systems[id]=s;},getSystem(id){return systems[id];},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleCommanderDoctrine={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};}};
  load(r,'battle/movement-resolver.js');load(r,'battle/modules/16-squad-plan-stability.js');
  return{r,leader:systems['squad-command']};
}
function squad(r){const b=H.makeBattle(r),q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100}});return{b,q};}
function tick(leader,b,dt){b.time+=dt||.45;leader.onCommanderTick(b,{town:null});}

test('the lease primitive grants, extends, holds, ends and logs',()=>{
  const {r}=root(),L=r.BattleLeases,q={};
  L.grant(q,'hold','squad-leader',0,5,'why','release');
  assert.equal(L.holds(q,'hold',4.99),true);assert.equal(L.holds(q,'hold',5),false);
  L.extend(q,'hold','squad-leader',1,3,'shorter');assert.equal(L.until(q,'hold'),5,'extend never shortens');
  L.extend(q,'hold','squad-leader',1,8,'longer');assert.equal(L.until(q,'hold'),8);assert.equal(L.get(q,'hold').reason,'longer');
  assert.deepEqual(L.active(q,2).map(l=>[l.kind,l.owner,l.remaining]),[['hold','squad-leader',6]]);
  const ended=L.end(q,'hold',3,'done');assert.equal(ended.endReason,'done');assert.equal(L.get(q,'hold'),null);
  assert.equal(q._leases.ended.at(-1).kind,'hold');assert.equal(L.end(q,'hold',3,'again'),null);
});
test('a staged tactical plan is one Squad Leader lease that lapses on the clock',()=>{
  const {r,leader}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='assault';tick(leader,b);
  const lease=L.get(q,'tactical-plan');
  assert.ok(q._engagementPlan&&lease,'plan and lease exist together');
  assert.equal(lease.owner,'squad-leader');assert.match(lease.release,/lease expiry/);
  const serial=q._engagementPlan.serial;
  while(b.time<lease.until+.5)tick(leader,b);
  const log=q._leases.ended.filter(l=>l.kind==='tactical-plan');
  assert.equal(log[0].endReason,'lease expired','the first plan ended by its own lease');
  assert.notEqual(q._engagementPlan&&q._engagementPlan.serial,serial);
});
test('contact holds the plan lease open; quiet closes it after the quiet window',()=>{
  const {r,leader}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='assault';q.inContact=true;tick(leader,b);tick(leader,b);
  assert.equal(L.until(q,'tactical-plan'),Infinity,'held by contact, not the clock');
  assert.equal(q._missionHold,'tactical-plan','the firefight lease holds route execution');
  q.inContact=false;tick(leader,b);
  const quietAt=b.time,lease=L.get(q,'tactical-plan');
  assert.equal(lease.until,quietAt+9);
  while(b.time<quietAt+9-.01){tick(leader,b);assert.ok(L.get(q,'tactical-plan'),'still open while quiet');}
  tick(leader,b);
  assert.equal(L.get(q,'tactical-plan'),null);
  assert.equal(q._leases.ended.filter(l=>l.kind==='tactical-plan').at(-1).endReason,'contact clear');
});
test('a regroup is a Squad Leader lease; contact ends it and starts the re-entry cooldown',()=>{
  const {r,leader}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='approach';
  q.members.forEach((s,i)=>{s.root.position.x=(i%2?-1:1)*(20+i*6);s.root.position.z=(i%3)*25;});
  for(let i=0;i<8&&!L.get(q,'regroup');i++)tick(leader,b);
  const rg=L.get(q,'regroup');
  assert.ok(rg,'a dispersed squad commits to a regroup');
  assert.equal(rg.owner,'squad-leader');assert.ok(rg.data.anchor);assert.equal(q.commandPhase,'regroup');
  assert.deepEqual(q.orderAnchor,rg.data.anchor,'the squad re-forms on the rally point: fireteam slots hang off the order anchor');
  tick(leader,b);assert.equal(q._missionHold,'regroup','the regroup lease holds mission execution');
  q.inContact=true;tick(leader,b);
  assert.equal(L.get(q,'regroup'),null);
  assert.equal(q._leases.ended.filter(l=>l.kind==='regroup').at(-1).endReason,'contact');
  assert.ok(L.holds(q,'regroup-cooldown',b.time),'re-entry cooldown is its own named lease');
  assert.ok(L.holds(q,'regroup-bypass',b.time));
});
test('prune ends only expired pure-timer leases; state-bearing leases survive expiry',()=>{
  const {r}=root(),L=r.BattleLeases,q={};
  L.grant(q,'bound','squad-leader',0,3,'t');L.grant(q,'regroup-bypass','squad-leader',0,2,'t');
  L.grant(q,'objective-security','capture-zone',0,1,'t');L.grant(q,'succession','squad-leader',0,1,'t');L.grant(q,'regroup','squad-leader',0,1,'t');
  assert.equal(L.prune(q,2.5),1,'only the expired timer (bypass) goes at t=2.5');
  assert.equal(q._leases.ended.at(-1).kind,'regroup-bypass');assert.equal(q._leases.ended.at(-1).endReason,'expired');assert.equal(q._leases.ended.at(-1).endedAt,2);
  assert.equal(L.prune(q,10),1,'then bound');
  for(const k of ['objective-security','succession','regroup'])assert.ok(L.get(q,k),k+' keeps its expired record');
});
test('active leases are ordered by declared priority and carry progress',()=>{
  const {r,leader}=root(),L=r.BattleLeases,{b,q}=squad(r);
  q.commandPhase='approach';
  q.members.forEach((s,i)=>{s.root.position.x=(i%2?-1:1)*(20+i*6);s.root.position.z=(i%3)*25;});
  for(let i=0;i<8&&!L.get(q,'regroup');i++)tick(leader,b);
  L.grant(q,'corner-hold','squad-leader',b.time,b.time+5,'t');
  const act=L.active(q,b.time);
  assert.ok(act.length>=2);
  for(let i=1;i<act.length;i++)assert.ok(act[i-1].priority>=act[i].priority,'sorted by priority');
  assert.equal(L.top(q,b.time).kind,'regroup');
  assert.match(act[0].progress.detail,/core spread \d+ → \d+ m/);
});
console.log(n+' lease checks passed');
