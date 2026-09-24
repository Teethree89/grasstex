#!/usr/bin/env node
'use strict';
/* The fire pipeline is extended through SquadAI's declared slots, never by replacing SquadAI
   functions. 14-z-ballistic-raycast.js used to overwrite tryFire after 14-direct-fire-los-gate.js had
   wrapped it, silently discarding that gate; a module that replaced tryFire again would also drop
   the ammunition gate. These checks fail if that load-order dependence comes back. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}
const FIRE_MODULES=['battle/modules/14-direct-fire-los-gate.js','battle/modules/14-z-ballistic-raycast.js','battle/modules/46-ammunition-stoppages.js'];
function root(){
  const r=H.bootstrap({modules:false});
  r.BattleModules={registerSystem(){},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  const owner={tryFire:r.SquadAI.tryFire,areaFire:r.SquadAI.areaFire,updateSoldier:r.SquadAI.updateSoldier,engagement:r.BattleEngagement.updateSoldier};
  FIRE_MODULES.forEach(p=>load(r,p));
  return{r,owner};
}
function duel(r){
  const b=H.makeBattle(r),us=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']});
  const ge=H.addSquad(r,b,{id:'ge-0',faction:'ge',x:0,z:40,objective:{x:0,z:-100},composition:['rifleman']});
  const s=us.members[0];s.target=ge.members[0];s.fireCooldown=0;
  return{b,s};
}

test('no module replaces the owner fire or update functions',()=>{
  const {r,owner}=root();
  assert.equal(r.SquadAI.tryFire,owner.tryFire);
  assert.equal(r.SquadAI.areaFire,owner.areaFire);
  assert.equal(r.SquadAI.updateSoldier,owner.updateSoldier);
  assert.equal(r.BattleEngagement.updateSoldier,owner.engagement);
});
test('the declared fire order is ammunition, ballistics range, then trigger-time LOS',()=>{
  const {r}=root();
  assert.deepEqual(r.SquadAI.extensionOrder.fireGate,['ammunition','ballistics','direct-fire-los']);
  assert.deepEqual(r.SquadAI.extensionOrder.shotModel,['ballistics']);
});
test('an empty weapon cannot fire even with ballistics loaded',()=>{
  const {r}=root(),{b,s}=duel(r);
  s.weapon.ammo=0;s.weapon.reserveAmmo=0;
  assert.equal(r.SquadAI.tryFire(s,b),false);
  assert.equal(s.outOfAmmo,true);
});
test('a loaded weapon in range with a clear line fires through the ballistic shot model',()=>{
  const {r}=root(),{b,s}=duel(r);
  s.weapon.ammo=5;s.weapon.reserveAmmo=10;s._ammoState={reloads:0,stoppages:0,shots:0,lowCalled:false,dryCounted:false};
  assert.equal(r.SquadAI.tryFire(s,b),true);
  assert.equal(s._lastBallisticShot&&s._lastBallisticShot.mode,'raycast');
  assert.equal(s.weapon.ammo,4,'afterShot spends the round');
});
test('an undeclared extension is refused instead of silently changing the pipeline',()=>{
  const {r}=root();
  assert.throws(()=>r.SquadAI.extend('fireGate','unknown-gate',()=>true),/not declared/);
  assert.throws(()=>r.BattleEngagement.extend('afterDrill','unknown-drill',()=>{}),/not declared/);
});
console.log(n+' extension-order checks passed');
