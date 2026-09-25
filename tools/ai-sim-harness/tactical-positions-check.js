#!/usr/bin/env node
/* Ownership regressions using shipping engagement, navigation, ammo, resolver and locomotion. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const H=require('./harness');
let checks=0;
function load(r,file){new Function('window','globalThis','console','BABYLON',fs.readFileSync(path.join(H.REPO,file),'utf8'))(r,r,{log(){},warn(){},error(){}},r.BABYLON);}
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function fixture({physical=true,inside=false}={}){
  H.resetIds();const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,h){systems[id]=h;},listSystems(){return Object.entries(systems).map(([id,h])=>({id,...h}));},unitsFor(sim){return sim._roster.us.concat(sim._roster.ge);}};
  r.BattleSoldierModel={animateWalk(){},setCrouch(s,v){s.crouching=v;},setProne(s,v){s.prone=v;},kill(s){s.dead=true;}};
  r.BattleCommanderAI={policyFor(){return{cohesionRadius:34,captainlessCohesion:26,routeArrivalRadius:8,captureCommitRatio:.82};},chooseObjective(){return null;}};
  load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/16-squad-plan-stability.js');
  load(r,'battle/modules/20-building-hardpoints.js');
  if(physical)load(r,'battle/modules/39-navigation-physicality-debug.js');
  load(r,'battle/modules/46-ammunition-stoppages.js');
  load(r,'battle/modules/51-soldier-personal-space.js');load(r,'battle/modules/52-survival-tactical-route.js');load(r,'battle/modules/99-session-diagnostics-export.js');
  // Execute the real integrator and death path with rendering stubbed, as the navigation suite does.
  let code=fs.readFileSync(path.join(H.REPO,'battle/battle-sim.js'),'utf8');
  code=code.replace('  BattleSim.prototype._frame=function','  root.stepMovementProbe=stepMovement;root.killProbe=BattleSim.prototype.killSoldier;\n  BattleSim.prototype._frame=function');
  new Function('window','globalThis','BABYLON','BattleSoldierModel',code)(r,r,r.BABYLON,r.BattleSoldierModel);
  const sim=H.makeBattle(r),sq=H.addSquad(r,sim,{id:'us-0',faction:'us',x:0,z:-14,objective:{x:0,z:0},composition:['rifleman','rifleman','sergeant','gunner']});
  const room={id:'room',x:0,z:0,w:12,d:12,rot:0,openings:[
    {id:'rear',type:'door',side:'south',offset:0,width:2},
    {id:'front',type:'door',side:'north',offset:3,width:2},
    {id:'window',type:'window',side:'north',offset:0,width:1.25,bottom:.92,top:2.08}]};
  const scenario={buildings:[room]};sim.scene={metadata:{battleScenario:scenario}};r.__battle__=sim;r.BattleNavigation.installScenario(scenario);
  sq.state='engaged';sq.commandPhase='support-hold';sq.inContact=true;sq.targetObjective='house';
  systems['squad-command'].onCommanderTick(sim,{town:null});
  sq.members.forEach((s,i)=>{s._fireteamKey=i===2?'command':'alpha';s._engagementTask=i===2?'control':'support-by-fire';s.root.position.x=i*3;s.root.position.z=inside?0:-14;s.destination={x:s.root.position.x,z:s.root.position.z};r.BattleAmmunition.initialize(s);});
  const s=sq.members[0],other=sq.members[1],leader=sq.members[2],P=r.BattleTacticalPositions,M=r.BattleMovementResolver,N=r.BattleNavigation;
  const threat={x:0,z:40},enemy={id:99,hp:100,dead:false,root:{position:{...threat,y:0}},faction:'ge'};
  s.target=enemy;sq.contact={...threat,at:sim.time,unit:enemy};
  const st=N.firingStations[0];
  function claim(man=s){return P.claim(man,sim,st,threat);}
  function tick(dt=.15){sim.time+=dt;r.BattleEngagement.updateSoldier(s,sim);M.resolve(s,sim);r.stepMovementProbe(sim,s,dt);systems['building-hardpoints'].onSimulationStep(sim);}
  return{r,sim,sq,s,other,leader,P,M,N,st,threat,enemy,systems,claim,tick};
}
test('one station has one assignee, including soldier id zero and another faction',()=>{
  const f=fixture();assert.equal(f.s.id,0);const t=f.claim();assert.ok(t);f.other.faction='ge';assert.equal(f.claim(f.other),null);assert.equal(f.P.current(f.s),t);assert.equal(f.P.summary(f.sim).claimCollisionsPrevented,1);
});
test('selection skips a held window without calling it a collision',()=>{
  const f=fixture();assert.ok(f.claim());f.P.release(f.other,f.sim,'test');f.other._nextStationClaimAt=0;
  const before=f.P.summary(f.sim);
  f.systems['building-hardpoints'].onCommanderTick(f.sim);
  const after=f.P.summary(f.sim);
  assert.equal(after.claimCollisionsPrevented,before.claimCollisionsPrevented);
  assert.ok(after.reservedStationsSkipped>before.reservedStationsSkipped,'the held window was skipped');
  assert.equal(f.P.current(f.other),null);
});
test('personal target loss, target death and a target behind the window retain the same task',()=>{
  const f=fixture();const t=f.claim();f.s.target=null;f.sim.time=15;f.sq.contact=null;
  for(let i=0;i<30;i++)f.tick();assert.equal(f.P.current(f.s),t);
  f.s.target={...f.enemy,dead:true};f.tick();assert.equal(f.P.current(f.s),t);
  f.s.target={...f.enemy,root:{position:{x:0,y:0,z:-50}}};f.tick();assert.equal(f.P.current(f.s),t);
});
test('reload and stoppage preserve reservation, pause ingress, then resume the committed route',()=>{
  const f=fixture(),t=f.claim(),route=t.route;
  for(const flag of ['reloading','clearingStoppage']){
    f.s[flag]=true;f.s.target=null;const p={x:f.s.root.position.x,z:f.s.root.position.z};
    for(let i=0;i<12;i++)f.tick();assert.equal(f.P.current(f.s),t);assert.equal(t.route,route);assert.deepEqual(f.s.destination,p);
    f.s[flag]=false;f.tick();assert.equal(f.M.resolve(f.s,f.sim).kind,'firing-station');assert.equal(t.route,route);
  }
});
test('death releases immediately through the shipping kill path and the station can be reused',()=>{
  const f=fixture();f.claim();f.r.killProbe.call(f.sim,f.s,null);assert.equal(f.P.current(f.s),null);assert.ok(f.claim(f.other));assert.equal(f.P.summary(f.sim).releaseReasons.death,1);
});
for(const [reason,change] of [
  ['retreat',f=>{f.sq.state='retreat';}],['regroup',f=>{f.sq.commandPhase='regroup';}],
  ['incapacitated',f=>{f.s.incapacitated=true;}],['explicit-task-change',f=>{f.sq.commandPhase='assault';}],
  ['explicit-task-change',f=>{f.sq.targetObjective='different-house';}],
  ['engagement-ended',f=>{f.sim.winner='us';}],['station-invalid',f=>{f.N.installScenario({buildings:[]});}]
])test(reason+' releases through the manager',()=>{const f=fixture();f.claim();change(f);f.M.resolve(f.s,f.sim);assert.equal(f.P.current(f.s),null);assert.equal(f.P.summary(f.sim).releaseReasons[reason],1);assert.notEqual(f.M.resolve(f.s,f.sim)?.kind,'firing-station');});
test('Micro task, target and engagement-plan churn cannot revoke a Squad Leader-owned post',()=>{
  const f=fixture(),t=f.claim();
  f.s._engagementTask='maneuver';f.sq._engagementPlan.serial++;f.s.target=null;f.sq.inContact=false;f.sq.contact=null;
  f.sim.time=10;f.systems['squad-command'].onCommanderTick(f.sim,{town:null});f.P.update(f.s,f.sim);
  assert.equal(f.P.current(f.s),t);assert.equal(f.P.summary(f.sim).assignmentsReleased,0);
});
test('normal allocation excludes the squad leader and maneuver team; occupied slots count without personal targets',()=>{
  const f=fixture();assert.equal(f.claim(f.leader),null);f.other._engagementTask='maneuver';assert.equal(f.claim(f.other),null);
  f.P.assign(f.sim);assert.equal(f.P.current(f.leader),null);assert.equal(f.P.summary(f.sim).captainWindowAssignments,0);assert.equal(f.P.summary(f.sim).currentLiveAssignments,1);
});
test('rear door, complete ingress and station hold survive target flicker without path replanning',()=>{
  const f=fixture(),t=f.claim(),route=t.route;assert.equal(route.door,'rear');
  const searches=f.sim._tacticalRouteStats.pathSearches;let occupied=false,illegal=0,physicalSearches=0;
  const findPath=f.N.findPath;f.N.findPath=function(...args){physicalSearches++;return findPath.apply(this,args);};
  for(let i=0;i<500;i++){
    f.s.target=null;const before={...f.s.root.position};
    f.M.proposeOrder(f.s,{x:60,z:-60},f.sim,true);f.tick();
    if(!f.N.movementClear(before,f.s.root.position))illegal++;
    assert.equal(f.P.current(f.s),t);assert.equal(t.route,route);
    if(t.occupiedAt!=null){occupied=true;assert.equal(f.M.resolve(f.s,f.sim).kind,'firing-station');assert.ok(Math.hypot(f.s.root.position.x-f.st.x,f.s.root.position.z-f.st.z)<=.35);}
  }
  assert.equal(illegal,0);assert.ok(occupied);assert.equal(t.status,'holding');assert.equal(f.P.summary(f.sim).assignmentsOccupied,1);assert.equal(f.sim._tacticalRouteStats.pathSearches,searches);assert.equal(physicalSearches,0);
  const final=f.s.destination;f.sim.time+=10;f.M.resolve(f.s,f.sim);assert.equal(f.s.destination,final);
});
test('safe-door approach does not shortcut through the exposed front door',()=>{
  const f=fixture();f.s.root.position.x=3;f.s.root.position.z=15;const t=f.claim();assert.ok(t);assert.equal(t.route.door,'rear');
  const outside=t.route.steps.findIndex(p=>Math.hypot(p.x,p.z+7.55)<.1);assert.ok(outside>=0);
  for(const p of t.route.steps.slice(0,outside))assert.ok(Math.abs(p.x)>=6||Math.abs(p.z)>=6,JSON.stringify(t.route.steps));
});
test('a soldier already within occupancy tolerance receives an exact station task',()=>{
  const f=fixture({inside:true});f.s.root.position.x=f.st.x;f.s.root.position.z=f.st.z-.2;
  assert.ok(f.claim());f.P.update(f.s,f.sim);assert.equal(f.P.current(f.s).status,'occupying');
});
test('occupied station survives separation while approaching soldiers remain movable',()=>{
  const f=fixture({inside:true}),t=f.claim();Object.assign(f.s.root.position,f.st);f.P.update(f.s,f.sim);
  Object.assign(f.other.root.position,{x:f.st.x+.1,z:f.st.z});const p={...f.s.root.position};
  f.systems['soldier-personal-space'].onSimulationStep(f.sim);assert.deepEqual(f.s.root.position,p);assert.ok(f.other.root.position.x>f.st.x+.1);assert.ok(t.occupiedAt!=null);
});
test('engagement quiet closure cannot revoke a still-valid Squad Leader positional order',()=>{
  const f=fixture(),t=f.claim();f.s.target=null;f.sq.inContact=false;f.sq.contact=null;
  f.systems['squad-command'].onCommanderTick(f.sim,{town:null});f.sim.time=8;f.P.update(f.s,f.sim);assert.equal(f.P.current(f.s),t);
  f.sim.time=10;f.systems['squad-command'].onCommanderTick(f.sim,{town:null});f.P.update(f.s,f.sim);assert.equal(f.P.current(f.s),t);assert.equal(f.P.summary(f.sim).assignmentsReleased,0);
});
test('stable Meso fireteam orders are coalesced before the movement resolver',()=>{
  const f=fixture();f.sq.commandPhase='support-hold';f.sq.inContact=false;f.sq.members.forEach(s=>{s.target=null;});
  for(let i=0;i<80;i++){f.r.SquadAI.updateSquad(f.sq,f.sim);f.sim.time+=.15;}
  const p=f.sim._squadCommandPublishStats,m=f.sim._movementGoalStats?.bySource?.['squad-stability']||{requests:0};
  assert.ok(p.intentChecks>=300,p);assert.ok(p.intentCoalesced>p.intentPublishes*5,p);assert.ok(m.requests<=p.intentPublishes,m);
});
test('unreachable station is rejected; real obstacle changes invalidate one cached route',()=>{
  const f=fixture(),t=f.claim(),route=t.route;
  f.sim.obstacles.__physicalVersion=1;f.P.update(f.s,f.sim);assert.notEqual(t.route,route);assert.equal(f.P.summary(f.sim).ingressRoutesInvalidated,1);
  f.sim.obstacles.push({type:'rock',x:f.st.x,z:f.st.z,radius:2});f.sim.obstacles.__physicalVersion++;
  f.P.update(f.s,f.sim);assert.equal(f.P.current(f.s),null);assert.equal(f.P.summary(f.sim).releaseReasons['station-unreachable'],1);
});
test('full diagnostics export includes live route, releases, roles and lifetime; restart clears registry',()=>{
  const f=fixture();f.claim();f.sim.time=4;f.P.release(f.s,f.sim,'explicit-task-change');f.claim(f.other);f.sim.time=6;
  const out=f.r.BattleDiagnosticsExport.build(f.sim),d=out.tacticalPositions;
  assert.equal(d.assignmentsCreated,2);assert.equal(d.assignmentsReleased,1);assert.equal(d.currentLiveAssignments,1);assert.equal(d.averageAssignmentLifetime,3);assert.equal(d.assignmentsByRole.rifleman,2);
  assert.ok(out.factions.us.squads[0].members[1].positionalTask.route.steps.length);assert.doesNotThrow(()=>JSON.stringify(out));
  f.P.release(f.other,f.sim,'explicit-task-change');f.claim();assert.equal(f.P.summary(f.sim).reassignments,1);
  f.systems['building-hardpoints'].beforeBattleRestart(f.sim);assert.equal(f.P.current(f.s),null);assert.equal(f.P.summary(f.sim).assignmentsCreated,0);assert.ok(f.claim(f.other));
});
test('unavailable weapons cannot count as suppressors or effective window fire',()=>{
  const f=fixture({inside:true});f.claim();Object.assign(f.s.root.position,f.st);f.P.update(f.s,f.sim);f.r.BattleEngagement.updateSoldier(f.s,f.sim);
  f.sq.members.forEach(s=>{s.reloading=true;s.target=null;});f.r.BattleEngagement.updateSquad(f.sq,f.sim);
  assert.equal(f.sq.effectiveCount,0);assert.equal(f.sq.suppressorCount,0);assert.ok(f.P.current(f.s));
});
console.log('All '+checks+' tactical-position checks passed.');
