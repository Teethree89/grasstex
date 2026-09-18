#!/usr/bin/env node
/* Physical endpoint allocation through the shipping resolver, navigator and movement integrator. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function fixture(shapes=[]){
  H.resetIds();const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,h){systems[id]=h;},unitsFor(sim){return sim._roster.us.concat(sim._roster.ge);}};
  r.BattleSoldierModel={animateWalk(){},setCrouch(s,v){s.crouching=v;},setProne(s,v){s.prone=v;}};
  function load(p){new Function('window','globalThis','console','BABYLON',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}},r.BABYLON);}
  load('battle/battle-navigation.js');load('battle/movement-resolver.js');load('battle/modules/39-navigation-physicality-debug.js');load('battle/modules/51-soldier-personal-space.js');
  const code=fs.readFileSync(path.join(H.REPO,'battle/battle-sim.js'),'utf8').replace('  BattleSim.prototype._frame=function','  root.stepMovementProbe=stepMovement;\n  BattleSim.prototype._frame=function');
  new Function('window','globalThis','BABYLON','BattleSoldierModel',code)(r,r,r.BABYLON,r.BattleSoldierModel);
  const sim=H.makeBattle(r),sq=H.addSquad(r,sim,{id:'us-0',faction:'us',x:0,z:-8,objective:{x:0,z:20},composition:['rifleman','rifleman','rifleman']});
  sim.obstacles.__physicalFootprints=shapes;const scenario={buildings:[]};sim.scene={metadata:{battleScenario:scenario}};r.__battle__=sim;r.BattleNavigation.installScenario(scenario);systems['navigation-physicality-debug'].onBattleStart(sim);
  const [a,b,c]=sq.members;Object.assign(a.root.position,{x:-2,z:-8});Object.assign(b.root.position,{x:2,z:-8});Object.assign(c.root.position,{x:20,z:-8});
  sq.members.forEach(s=>{s.destination={x:s.root.position.x,z:s.root.position.z};});
  const M=r.BattleMovementResolver,PS=r.BattleSoldierPersonalSpace;
  function order(s,p){M.proposeOrder(s,p,sim,true);return M.resolve(s,sim);}
  function tick(){sim.time+=.15;for(const s of sq.members){if(s.dead)continue;M.resolve(s,sim);const before={...s.root.position};r.stepMovementProbe(sim,s,.15);assert.ok(r.BattleNavigation.movementClear(before,s.root.position),'illegal terrain step');}systems['soldier-personal-space'].onSimulationStep(sim);}
  return{r,sim,sq,a,b,c,M,PS,systems,order,tick};
}
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
const hedge={id:'hedge',type:'hedge',shape:'obb',x:0,z:0,hx:8,hz:.8,ux:1,uz:0,vx:0,vz:1};
for(const terrain of ['open','hedge'])test('shared '+terrain+' endpoint settles with separate bodies and no destination churn',()=>{
  const f=fixture(terrain==='hedge'?[hedge]:[]),goal={x:0,z:terrain==='hedge'?-2:0};
  f.order(f.a,goal);f.order(f.b,goal);const destinations=[{...f.a.destination},{...f.b.destination}];
  assert.ok(distance(...destinations)>=f.PS.destinationSeparation-1e-6);
  assert.deepEqual(f.a._movementResolver.last.intentPoint,goal);assert.deepEqual(f.b._movementResolver.last.intentPoint,goal);
  let lateMinimum=Infinity,lateMovement=0;
  for(let i=0;i<400;i++){f.tick();if(i>200){lateMinimum=Math.min(lateMinimum,distance(f.a.root.position,f.b.root.position));lateMovement+=Number(f.a.moving)+Number(f.b.moving);}}
  assert.ok(lateMinimum>=f.PS.minSeparation-1e-6,lateMinimum);assert.equal(lateMovement,0);
  assert.deepEqual([f.a.destination,f.b.destination],destinations);
  assert.equal(f.a._movementResolver.changes,1);assert.equal(f.b._movementResolver.changes,1);
  console.log('  '+terrain+': late minimum '+lateMinimum.toFixed(3)+'m; late moving ticks '+lateMovement);
});
test('nearby distinct endpoints leave room for opposing arrival tolerances',()=>{
  const f=fixture();Object.assign(f.a.root.position,{x:3,z:0});Object.assign(f.b.root.position,{x:-3,z:0});
  f.order(f.a,{x:0,z:0});f.order(f.b,{x:.9,z:0});
  assert.ok(distance(f.a.destination,f.b.destination)>=1.6-1e-6);
  for(let i=0;i<200;i++)f.tick();assert.ok(distance(f.a.root.position,f.b.root.position)>=.9-1e-6);
});
test('endpoint allocation preserves doors, exact posts and stationary combat holds',()=>{
  const f=fixture(),room={id:'room',x:0,z:0,w:12,d:12,rot:0,openings:[{id:'door',type:'door',side:'south',offset:0,width:2},{id:'window',type:'window',side:'north',offset:0,width:1.25,bottom:.92,top:2.08}]};
  f.sim.scene.metadata.battleScenario.buildings=[room];f.r.BattleNavigation.installScenario(f.sim.scene.metadata.battleScenario);
  const station=f.r.BattleNavigation.firingStations[0];
  for(const kind of ['firing-station','reload-hold','hold','contact-reaction','cover-bound']){
    const p=f.PS.resolveDestination(f.sim,f.a,station,kind,false);assert.equal(p,station);
  }
  const door={x:0,z:-6};assert.equal(f.PS.resolveDestination(f.sim,f.a,door,'formation',true),door);
  // An allocated endpoint remains inside the same room and routes through the actual door.
  f.order(f.a,{x:0,z:0});f.order(f.b,{x:0,z:0});
  for(let i=0;i<400;i++)f.tick();
  for(const s of [f.a,f.b])assert.ok(distance(s.root.position,s.destination)<=.35);
});
test('occupied exact posts and body positions are unavailable to general destinations',()=>{
  const f=fixture();Object.assign(f.a.root.position,{x:0,z:0});f.a.destination={x:0,z:0};
  f.M.proposeCombat(f.a,{x:0,z:0},f.sim,'firing-station');f.M.resolve(f.a,f.sim);
  f.order(f.b,{x:0,z:0});assert.deepEqual(f.a.destination,{x:0,z:0});assert.ok(distance(f.b.destination,f.a.root.position)>=1.6-1e-6);
});
test('death, changed intent and restart release endpoint allocations',()=>{
  const f=fixture(),goal={x:0,z:0};f.order(f.a,goal);f.a.dead=true;f.order(f.b,goal);assert.deepEqual(f.b.destination,goal);
  f.sim.time+=2;f.order(f.b,{x:8,z:0});f.order(f.c,goal);assert.deepEqual(f.c.destination,goal);
  f.systems['soldier-personal-space'].onBattleRestart(f.sim);
  for(const s of f.sq.members)assert.equal(s._personalSpaceDestination,undefined);
  assert.equal(f.sim._personalSpaceDestinations,undefined);
});
console.log('All '+checks+' personal-space checks passed.');
