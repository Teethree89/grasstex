#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),H=require('./harness');
let checks=0,failures=0;
function test(name,fn){try{fn();checks++;console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack);}}
function load(r,file){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,file),'utf8'))(r,r,{log(){},warn(){}});}
function fixture(obstacles,physical){
  H.resetIds();const r=H.bootstrap({modules:false}),systems={};
  r.BattleModules={registerSystem(id,h){systems[id]=h;},unitsFor:b=>b._roster.us.concat(b._roster.ge)};
  load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/39-navigation-physicality-debug.js');load(r,'battle/modules/52-survival-tactical-route.js');
  const b=H.makeBattle(r);b.obstacles=obstacles;b.obstacles.__physicalFootprints=physical||obstacles;b.obstacles.__physicalVersion=1;
  const scenario={buildings:[]};b.scene={metadata:{battleScenario:scenario}};r.__battle__=b;r.BattleNavigation.installScenario(scenario);
  const q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:-8,objective:{x:0,z:50},composition:['rifleman','rifleman','rifleman']});
  q.commandPhase='support-hold';q.state='engaged';q.inContact=true;
  q.members.forEach((s,i)=>{s.root.position.x=i*2;s.root.position.z=-8;s.target={root:{position:{x:0,y:0,z:60}}};});
  return{r,b,q,s:q.members[0],other:q.members[1],E:r.BattleEngagement,C:r.BattleCoverPositions};
}
function hedge(rot=0){return{id:'hedge',physicalId:'hedge',shape:'obb',type:'hedge',x:0,z:0,hx:14,hz:1,ux:Math.cos(rot),uz:Math.sin(rot),vx:-Math.sin(rot),vz:Math.cos(rot),radius:1,y:0,height:2,cover:.62};}
test('a held cover position is unavailable after the old fourteen-second lease expires',()=>{
  const f=fixture([{type:'rock',x:0,z:0,y:0,radius:1.3,height:1,cover:.55}]);
  const first=f.E.findCover(f.s,f.b);assert.ok(first);f.s.eng.cover=first;f.s.eng.state='engage';Object.assign(f.s.root.position,{x:first.x,z:first.z});
  f.b.time=30;const next=f.E.findCover(f.other,f.b);
  assert.ok(!next||Math.hypot(first.x-next.x,first.z-next.z)>=.9,'occupied cover was reassigned: '+JSON.stringify(next));
});
test('several soldiers can reserve distinct reachable slots along one long hedge',()=>{
  const f=fixture([hedge()]),positions=f.q.members.map(s=>{const p=f.E.findCover(s,f.b);assert.ok(p,'long hedge should have room for each soldier');s.eng.state='bound';s.eng.cover=p;return p;});
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Math.hypot(positions[i].x-positions[j].x,positions[i].z-positions[j].z)>=1.8-1e-6);
});
test('an end-on hedge threat cannot produce a point inside the hedgerow',()=>{
  const f=fixture([hedge()]);f.s.root.position.x=-18;f.s.root.position.z=0;f.s.target.root.position={x:60,y:0,z:0};
  const p=f.E.findCover(f.s,f.b);assert.ok(p);assert.ok(f.r.BattleNavigation.movementClear(p,p),'cover point is inside the hedge');assert.ok(p.x<-14);
});
function crate(id,x,z){return{id,physicalId:id,type:'crate',x,z,y:0,radius:.8,height:1,cover:.55};}
test('clustered cover yields no overlapping slots, keeping the newest obstacle\'s slots',()=>{
  const obs=[crate('a',0,0),crate('b',1.6,.4),crate('c',.6,1.8),crate('d',-1.4,1.1)],f=fixture(obs),slots=f.C.snapshot(f.b);
  assert.ok(slots.length>0,'cluster should still offer cover');
  for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)
    assert.ok(Math.hypot(slots[i].x-slots[j].x,slots[i].z-slots[j].z)>=f.C.spacing-.001,'overlap '+slots[i].id+' / '+slots[j].id);
  const newest=obs.length-1,raw=slots.filter(s=>s.id.startsWith('cover:'+newest+':')).length;
  assert.ok(raw>0,'the newest obstacle keeps its slots');
});
test('every cover slot is a spot the planner accepts as a standing position',()=>{
  const obs=[crate('a',0,0),crate('b',3.6,0),Object.assign(hedge(),{z:-3.4,hx:6}),crate('e',0,3.8)];
  const g=fixture(obs),P=g.r.BattleNavigationPhysicality,slots=g.C.snapshot(g.b);
  assert.ok(slots.length>0);
  for(const s of slots){const st=P.resolveStandGoal(g.b,null,s);assert.ok(st&&Math.hypot(st.x-s.x,st.z-s.z)<.01,'slot '+s.id+' is inside a body margin');}
});
function works(x0,z0,yaw,len){const out=[],steps=Math.max(2,Math.round(len/2.4));for(let i=0;i<=steps;i++){const t=(i/steps-.5)*len;out.push({x:x0+Math.sin(yaw)*t,z:z0+Math.cos(yaw)*t,y:0,radius:1.35,cover:.35,height:1,type:'work-sandbags'});}return out;}
test('no slot sits inside the stand-off margin of a defence line that is not a physical footprint',()=>{
  const line=works(0,10,Math.PI/2,14).concat(works(4,6,0,10)),f=fixture(line,[]),slots=f.C.snapshot(f.b);
  assert.ok(slots.length>0,'defence lines should still offer cover');
  for(const s of slots)for(const o of line)assert.ok(Math.hypot(s.x-o.x,s.z-o.z)-o.radius>=1.19,'slot '+s.id+' is inside the margin of the defence piece at '+o.x.toFixed(1)+','+o.z.toFixed(1));
});
test('a terrain hedge\'s approximating circles do not erase the hedge\'s own slots',()=>{
  const h=hedge(),circles=[-10,-5,0,5,10].map(x=>({x,z:0,y:0,radius:3.4,cover:.62,height:1.5,type:'hedge',physicalId:'hedge'})),f=fixture([h].concat(circles),[h]);
  assert.ok(f.C.snapshot(f.b).length>=20,'hedge lost its slots');
});
console.log(checks+' cover checks passed; '+failures+' failed.');if(failures)process.exitCode=1;
