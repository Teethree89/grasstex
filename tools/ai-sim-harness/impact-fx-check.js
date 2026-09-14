#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'../..'),hooks={};
class Vector3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
class Color3{constructor(r,g,b){Object.assign(this,{r,g,b});}static Black(){return new Color3(0,0,0);}}
class Color4 extends Color3{constructor(r,g,b,a){super(r,g,b);this.a=a;}}
class Resource{constructor(name){this.name=name;}dispose(){this.disposed=true;}}
class ParticleSystem extends Resource{dispose(disposeTexture=true){super.dispose();if(disposeTexture)this.particleTexture.dispose();}start(){this.started=true;}}
class VertexData{static ComputeNormals(p,i,n){n.push(...p.map(()=>0));}applyToMesh(mesh){mesh.vertices=this.positions;}}
const B={Vector3,Color3,Color4,ParticleSystem,VertexData,Mesh:Resource,StandardMaterial:Resource,
  Texture:{BILINEAR_SAMPLINGMODE:2},RawTexture:{CreateRGBATexture(){return new Resource('particle texture');}}};
const r={console:{log(){},warn(){}},BABYLON:B,BattleModules:{registerSystem(id,h){hooks[id]=h;}},BattleSim:{start(){}}};r.window=r;vm.createContext(r);
function load(file){vm.runInContext(fs.readFileSync(path.join(repo,file),'utf8'),r,{filename:file});}
load('battle/modules/15-bullet-impact-fx.js');
const fx=r.BattleImpactFx,observable=()=>({add(){return{};},addOnce(){},remove(){}});
const sim={time:0,scene:{metadata:{},onBeforeRenderObservable:observable(),onDisposeObservable:observable()},heightAt:(x,z)=>x*.03+z*.02,random(){throw Error('Effects consumed the battle RNG');}};
let callbacks=0;sim.onShot=()=>callbacks++;fx.install(sim);fx.install(sim);
function shot(surface,body=false){return{mode:'raycast',surface,stoppedBy:body?'soldier':'environment',impact:{x:2,y:1,z:3},normal:{x:0,y:1,z:0}};}
for(const surface of ['dirt','wall','steel','hedge'])sim.onShot(null,null,false,10,shot(surface));
sim.onShot(null,null,true,10,shot('blood',true));
assert.equal(callbacks,5,'shot callbacks chain exactly once');
assert.equal(sim._impactFx.bursts.length,5);
assert.deepEqual(Array.from(sim._impactFx.bursts,b=>b.system.name),['impact-dirt','impact-cement','impact-metal','impact-vegetation','impact-blood']);
assert.equal(sim._impactFx.decals.length,1,'only body hits leave blood');
const vertices=sim._impactFx.decals[0].mesh.vertices;
for(let i=0;i<vertices.length;i+=3)assert.ok(Math.abs(vertices[i+1]-sim.heightAt(vertices[i],vertices[i+2])-.018)<1e-7,'decal follows sloping terrain');
fx.impact(sim,{...shot('dirt'),stoppedBy:'range'});assert.equal(sim._impactFx.bursts.length,5,'range exhaustion is not an impact');
const texture=sim._impactFx.texture;
for(let i=0;i<150;i++)fx.impact(sim,shot('blood',true));
assert.equal(sim._impactFx.bursts.length,fx.maxBursts);assert.equal(sim._impactFx.decals.length,fx.maxDecals);
assert.ok(!texture.disposed,'eviction preserves shared particle texture');
sim.time=80;fx.tick(sim);assert.equal(sim._impactFx.bursts.length,0);assert.ok(sim._impactFx.decals[0].mesh.visibility<1);
sim.time=91;fx.tick(sim);assert.equal(sim._impactFx.decals.length,0,'old decals expire');
sim.scene.metadata.battleScenario={buildings:[{x:2,z:3,w:10,d:10,rot:.4}]};
fx.impact(sim,shot('blood',true));
const indoor=sim._impactFx.decals[0].mesh.vertices;
for(let i=1;i<indoor.length;i+=3)assert.ok(indoor[i]>=sim.heightAt(2,3)+.098-1e-7,'indoor blood sits above the floor slab');
const liveBurst=sim._impactFx.bursts[0].system,liveDecal=sim._impactFx.decals[0].mesh;
hooks['bullet-impact-fx'].beforeBattleRestart(sim);
assert.ok(liveBurst.disposed&&liveDecal.disposed);assert.equal(sim._impactFx.bursts.length+sim._impactFx.decals.length,0);
console.log('PASS impact materials, callback chaining, terrain/floor decals, resource budgets, fading and restart cleanup');

// The ballistic result supplies the actual victim and blocking material; FX never guess from
// the intended target. Zero angular dispersion makes these geometry checks deterministic.
r.SquadAI={stanceOf:()=> 'stand',eyeHeight:()=>1.55};
load('battle/obstacle-field.js');load('battle/modules/14-z-ballistic-raycast.js');
function unit(x){return{root:{position:{x,y:0,z:0},rotation:{y:0}},hp:100,faction:'ge'};}
const shooter=unit(0);shooter.faction='us';shooter.weapon={stats:{range:90,accuracy:.98,falloffStart:90,damage:10}};
function resolve(obstacles,enemies,ground=()=>0){
  let result;const target=unit(30),battle={time:1,obstacles,heightAt:ground,random:()=>.25,rosterOf:()=>enemies,onShot(a,b,hit,d,meta){result=meta;},killSoldier(s){s.dead=true;}};
  r.BattleBallistics.resolve(shooter,target,battle);return result;
}
const nearer=unit(10),body=resolve([], [nearer]);assert.equal(body.victim,nearer);assert.equal(body.surface,'blood');assert.equal(body.stoppedBy,'soldier');
for(const type of ['hedge','rock','steel']){
  const hit=resolve([{x:15,z:0,y:0,height:3,radius:1,type}],[]);
  assert.equal(hit.stoppedBy,'environment');assert.equal(hit.surface,type);assert.ok(Number.isFinite(hit.normal.x));
}
const ground=resolve([],[],x=>x>40?3:0);assert.equal(ground.surface,'dirt');assert.equal(ground.stoppedBy,'environment');
shooter.weapon.stats.range=40;const miss=resolve([],[]);assert.equal(miss.stoppedBy,'range');shooter.weapon.stats.range=90;
r.BattleNavigation={lineOfSightBlocked(a,b){return b.x>=20?{a:{x:20,z:-5},b:{x:20,z:5}}:null;}};
const wall=resolve([],[]);assert.equal(wall.surface,'cement');assert.equal(wall.stoppedBy,'environment');assert.ok(wall.normal.x<0);
console.log('PASS ballistic body, ground, wall, vegetation and metal impact metadata; range misses');
