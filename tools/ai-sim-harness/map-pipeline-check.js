#!/usr/bin/env node
/* One battlefield, one geometry pipeline.

   The live page builds its field through BattleTerrainFeatures.scatter(), which module 08 wraps to
   coalesce hedge chunks into runtime volumes. Scenario regeneration (benchmark harness, AI trainer
   and the manual scenario control) must publish exactly the same physical/tactical geometry for the
   same seed. When it bypassed that entry point, benchmark worlds carried ~4x the hedge footprints of
   a normal page load and ran 10-70x slower on identical maps.

   Loads the shipping sources in node with a permissive Babylon stub: meshes are irrelevant here,
   only the published obstacle and footprint data is asserted.

     node tools/ai-sim-harness/map-pipeline-check.js
*/
'use strict';
const fs=require('fs'),path=require('path');
const REPO=path.resolve(__dirname,'..','..');
const SEEDS=['standard-benchmark-meeting-s1-b0001-0001','standard-benchmark-us-defend-s1-b0002-0001','standard-benchmark-ge-defend-s2-b0001-0001'];

let failures=0,checks=0;
function check(name,ok,detail){checks++;if(ok)console.log('  PASS  '+name);else{failures++;console.log('  FAIL  '+name+(detail?'  ('+detail+')':''));}}
function section(n){console.log('\n== '+n+' ==');}

/* Any Babylon construction or call yields a stateful stub; assigned properties read back. */
function stub(){
  const store=new Map();
  const target=function(){};
  const proxy=new Proxy(target,{
    get(t,prop){
      if(prop===Symbol.toPrimitive)return()=>0;
      if(prop==='then')return undefined;
      if(!store.has(prop))store.set(prop,stub());
      return store.get(prop);
    },
    set(t,prop,value){store.set(prop,value);return true;},
    apply(){return stub();},
    construct(){return stub();}
  });
  return proxy;
}
const quiet={log(){},warn(){},error(){}};
function load(root,rel){const c=fs.readFileSync(path.join(REPO,rel),'utf8');new Function('window','globalThis','console','BABYLON',c+'\n//# sourceURL='+rel)(root,root,quiet,root.BABYLON);}
function world(){
  const root={console:quiet,BABYLON:stub()};root.window=root;
  /* Same relative order as battle_sim_local.php: core terrain, pre-commander runtime, then modules. */
  load(root,'battle/terrain-features.js');
  load(root,'battle/scenario-generator.js');
  load(root,'battle/battle-navigation.js');
  load(root,'battle/town-objectives.js');
  load(root,'battle/modules/08-m3c-hedge-volume-coalescer.js');
  const scene={metadata:{}};
  const heightAt=(x,z)=>Math.sin(x*.013)*1.7+Math.cos(z*.011)*1.3;
  return{root,scene,heightAt};
}
function signature(list){return(list||[]).map(f=>[f.id,f.type,f.shape,(+f.x).toFixed(3),(+f.z).toFixed(3)].join(':')).join('|');}
function geometry(obstacles){
  const physical=obstacles&&obstacles.__physicalFootprints||[];
  return{obstacles:obstacles?obstacles.length:0,physical:physical.length,physicalSig:signature(physical),tacticalSig:signature(obstacles)};
}

for(const seed of SEEDS){
  section(seed);
  /* Page load: the only entry point the live page uses. */
  const page=world();
  const pageBase=page.root.BattleTerrainFeatures.scatter(page.scene,page.heightAt,{fieldW:2000,fieldD:1200,scenarioSeed:seed});
  const pageGeo=geometry(pageBase.obstacles);
  const pageStats=page.root.BattleHedgeVolumeCoalescer.stats();

  /* Benchmark path: bootstrap page on another seed, then regenerate the benchmark seed. */
  const bench=world(),sim={obstacles:null};
  bench.root.BattleTerrainFeatures.scatter(bench.scene,bench.heightAt,{fieldW:2000,fieldD:1200,scenarioSeed:seed.replace(/-\d{4}$/,'')+'-bootstrap'});
  const scenario=bench.root.BattleTownObjectives.regenerate(bench.scene,bench.heightAt,seed,{benchmark:true,benchmarkIndex:0},sim);
  const benchGeo=geometry(sim.obstacles);

  check('page load coalesces hedge chunks into runtime volumes',pageStats.physicalBefore>pageStats.physicalAfter&&pageGeo.physical===pageStats.physicalAfter,JSON.stringify(pageStats));
  check('regenerate publishes the same physical footprint count as page load',benchGeo.physical===pageGeo.physical,'regenerate='+benchGeo.physical+' page='+pageGeo.physical);
  check('regenerate publishes identical physical footprints',benchGeo.physicalSig===pageGeo.physicalSig);
  check('regenerate publishes identical tactical obstacles',benchGeo.obstacles===pageGeo.obstacles&&benchGeo.tacticalSig===pageGeo.tacticalSig,'regenerate='+benchGeo.obstacles+' page='+pageGeo.obstacles);
  check('regenerate installs the rendered scenario for battle and navigation',!!scenario&&scenario.seed===seed&&bench.scene.metadata.battleScenario===scenario&&bench.root.BattleNavigation.scenario===scenario);

  /* A trainer or benchmark worker regenerates repeatedly in one page; geometry must not accumulate. */
  const again={obstacles:null};
  bench.root.BattleTownObjectives.regenerate(bench.scene,bench.heightAt,seed,{benchmark:true,benchmarkIndex:1},again);
  const againGeo=geometry(again.obstacles);
  check('repeated regeneration does not accumulate geometry',againGeo.physicalSig===pageGeo.physicalSig&&againGeo.tacticalSig===pageGeo.tacticalSig,'repeat='+againGeo.physical+'/'+againGeo.obstacles);
}

console.log('\n'+(checks-failures)+'/'+checks+' map pipeline checks passed');
process.exit(failures?1:0);
