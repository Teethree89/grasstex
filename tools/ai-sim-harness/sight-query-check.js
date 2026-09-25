#!/usr/bin/env node
/* Fast geometry queries answer exactly what the full test answers.

   Line of sight and wall clearance are the hottest calls in a battle, so both prune: sightBlocked
   walks only the grid cells a ray crosses and stops at the first hit, and the navigation wall test
   skips walls whose padded bounding box misses the segment. Pruning may only save time. On real
   scenarios (the page's own scatter + hedge coalescer), every ray must get the same yes/no from
   sightBlocked as from the unpruned nearest-hit sightBlocker, and every step the same movementClear
   with the wall boxes switched off.

     node tools/ai-sim-harness/sight-query-check.js
*/
'use strict';
const fs=require('fs'),path=require('path');
const REPO=path.resolve(__dirname,'..','..');
const SEEDS=['standard-benchmark-meeting-s1-b0001-0001','standard-benchmark-us-defend-s1-b0002-0001','standard-benchmark-ge-defend-s2-b0001-0001'];

let failures=0,checks=0;
function check(name,ok,detail){checks++;if(ok)console.log('  PASS  '+name);else{failures++;console.log('  FAIL  '+name+(detail?'  ('+detail+')':''));}}
function section(n){console.log('\n== '+n+' ==');}
function stub(){
  const store=new Map(),target=function(){};
  return new Proxy(target,{
    get(t,prop){if(prop===Symbol.toPrimitive)return()=>0;if(prop==='then')return undefined;if(!store.has(prop))store.set(prop,stub());return store.get(prop);},
    set(t,prop,value){store.set(prop,value);return true;},apply(){return stub();},construct(){return stub();}
  });
}
const quiet={log(){},warn(){},error(){}};
function load(root,rel){const c=fs.readFileSync(path.join(REPO,rel),'utf8');new Function('window','globalThis','console','BABYLON',c+'\n//# sourceURL='+rel)(root,root,quiet,root.BABYLON);}
function rng(seed){let a=seed|0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

for(const seed of SEEDS){
  section(seed);
  const root={console:quiet,BABYLON:stub()};root.window=root;
  for(const f of ['battle/obstacle-field.js','battle/terrain-features.js','battle/scenario-generator.js','battle/battle-navigation.js','battle/town-objectives.js','battle/modules/08-m3c-hedge-volume-coalescer.js'])load(root,f);
  const heightAt=(x,z)=>Math.sin(x*.013)*1.7+Math.cos(z*.011)*1.3,scene={metadata:{}},sim={obstacles:null};
  root.BattleTerrainFeatures.scatter(scene,heightAt,{fieldW:2000,fieldD:1200,scenarioSeed:seed+'-bootstrap'});
  const scenario=root.BattleTownObjectives.regenerate(scene,heightAt,seed,{benchmark:true,benchmarkIndex:0},sim);
  const F=root.BattleObstacleField,N=root.BattleNavigation,obstacles=sim.obstacles,c=scenario.center||{x:0,z:0},rand=rng(seed.length*7919);

  /* Rays from soldier eye heights, most of them near the settlement and its hedges, some map-long. */
  let rays=0,blocked=0,disagree=0,first=null;
  for(let i=0;i<30000;i++){
    const spread=i%5?260:900,ax=c.x+(rand()-.5)*spread,az=c.z+(rand()-.5)*spread,len=i%3?rand()*120:rand()*700,th=rand()*Math.PI*2;
    const a={x:ax,z:az,y:heightAt(ax,az)+[.42,1.05,1.55][i%3]},bx=ax+Math.cos(th)*len,bz=az+Math.sin(th)*len,b={x:bx,z:bz,y:heightAt(bx,bz)+[.55,1.2,1.75][(i>>1)%3]};
    const fast=F.sightBlocked(obstacles,a,b),full=!!F.sightBlocker(obstacles,a,b);
    rays++;if(full)blocked++;
    if(fast!==full){disagree++;if(!first)first={a,b,fast,full};}
  }
  check('sightBlocked agrees with the nearest-hit sightBlocker on every ray',disagree===0,disagree+'/'+rays+' disagree, first '+JSON.stringify(first));
  check('the rays exercise both answers',blocked>rays*.05&&blocked<rays*.95,blocked+'/'+rays+' blocked');

  /* Steps and long legs around the buildings, where the wall boxes do the pruning. */
  const walls=N.walls,saved=walls.map(w=>[w.minX,w.maxX,w.minZ,w.maxZ]),queries=[];
  for(let i=0;i<20000;i++){
    const ax=c.x+(rand()-.5)*300,az=c.z+(rand()-.5)*300,len=i%2?rand()*2:rand()*250,th=rand()*Math.PI*2;
    queries.push([{x:ax,z:az},{x:ax+Math.cos(th)*len,z:az+Math.sin(th)*len}]);
  }
  const pruned=queries.map(q=>N.movementClear(q[0],q[1]));
  walls.forEach(w=>{w.minX=w.minZ=-Infinity;w.maxX=w.maxZ=Infinity;});
  const unpruned=queries.map(q=>N.movementClear(q[0],q[1]));
  walls.forEach((w,i)=>{[w.minX,w.maxX,w.minZ,w.maxZ]=saved[i];});
  const diff=pruned.filter((v,i)=>v!==unpruned[i]).length,clear=unpruned.filter(Boolean).length;
  check('movementClear with wall boxes matches the unpruned wall test',walls.length>0&&diff===0,diff+'/'+queries.length+' differ over '+walls.length+' walls');
  check('the steps exercise both answers',clear>0&&clear<queries.length,clear+'/'+queries.length+' clear');
}

console.log('\n'+(checks-failures)+'/'+checks+' sight query checks passed');
process.exit(failures?1:0);
