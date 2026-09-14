#!/usr/bin/env node
/* Regression checks for the three defects the first three 100-battle benchmark runs exposed.

   These load the shipping sources in node - no Babylon, no browser - and assert the mechanism
   rather than an outcome, so they are stable across seeds. The seeds used are the actual worst
   battles from benchmarks/results/runs/{1,2,3} on the benchmark-results branch.

     node tools/ai-sim-harness/objective-nav-check.js
*/
'use strict';
const fs=require('fs'),path=require('path');
const REPO=path.resolve(__dirname,'..','..');

/* The exact seeds the stored reports rank worst: low capture counts, long intervals with no
   objective progress, and the heaviest movement-stall battles. */
const SEEDS=['push-1-0001','push-1-0030','push-1-0069','push-1-0070','push-2-s4-0008','push-2-s5-0018',
  'manual-benchmark-s2-0016','manual-benchmark-s4-0015'];

let failures=0,checks=0;
function check(name,ok,detail){checks++;if(ok)console.log('  PASS  '+name);else{failures++;console.log('  FAIL  '+name+(detail?'  ('+detail+')':''));}}
function section(n){console.log('\n== '+n+' ==');}
function load(root,rel){const c=fs.readFileSync(path.join(REPO,rel),'utf8');new Function('window','globalThis','console','BABYLON',c+'\n//# sourceURL='+rel)(root,root,root.console,root.BABYLON);}
/* The module banners are noise here; the checks below are the output that matters. */
const quiet={log(){},warn(){},error(){}};
function bootstrap(){
  const root={console:quiet};root.window=root;
  root.BABYLON={Color3:function(){},MeshBuilder:{CreateLines:()=>({dispose(){}}),CreateCylinder:()=>({position:{set(){}},dispose(){}}),CreateSphere:()=>({position:{set(){}},scaling:{set(){}},dispose(){}})},StandardMaterial:function(){this.dispose=function(){};}};
  root.BattleModules={reg:{},registerSystem(){},registerObjectiveType(n,h){this.reg[n]=h;},getObjectiveType(n){return this.reg[n];},runHook(){},unitsFor(sim){return sim._units||[];}};
  load(root,'battle/scenario-generator.js');
  load(root,'battle/battle-navigation.js');
  load(root,'battle/objective-system.js');
  load(root,'battle/modules/01-capture-zone.js');
  load(root,'battle/commander-doctrine.js');
  return root;
}
const root=bootstrap();
const NAV=root.BattleNavigation;

/* ------------------------------------------------------------------------------------------- */
section('a soldier never freezes permanently against a building');
/* Mirrors stepMovement() in battle/battle-sim.js: same waypoint source, same speed ramp, same
   blocked-step handling. If that function changes, change this. */
function walk(start,dest,seconds){
  const dt=.15,s={root:{position:{x:start.x,y:0,z:start.z}},speed:2.9,moveSpeed:0,_navCache:null,_hold:0};
  let blocked=0;
  for(let f=0;f<Math.round(seconds/dt);f++){
    const t=f*dt,w=NAV.nextWaypoint(null,s,dest)||dest,h={x:s.root.position.x,z:s.root.position.z};
    const dx=w.x-h.x,dz=w.z-h.z,d=Math.hypot(dx,dz);
    const want=d>.35?s.speed:0,cur=s.moveSpeed,rate=want>cur?4.2:6.5;
    s.moveSpeed=Math.max(0,cur+Math.max(-rate*dt,Math.min(rate*dt,want-cur)));
    if(d<=.35)return{arrived:true,blocked,travelled:Math.hypot(s.root.position.x-start.x,s.root.position.z-start.z)};
    if(s.moveSpeed<=.025)continue;
    const step=Math.min(d,s.moveSpeed*dt);let nx=h.x+dx/d*step,nz=h.z+dz/d*step;
    if(!NAV.movementClear(h,{x:nx,z:nz})){
      const slid=NAV.resolveStep(h,{x:nx,z:nz});
      if(slid){nx=slid.x;nz=slid.z;}
      else{if(!(t<s._hold)){s._navCache=null;s._hold=t+1.5;}s.moveSpeed=0;blocked++;continue;}
    }
    s.root.position.x=nx;s.root.position.z=nz;
  }
  return{arrived:false,blocked,travelled:Math.hypot(s.root.position.x-start.x,s.root.position.z-start.z)};
}
{
  let trials=0,deadlocked=0,blockedFrames=0,worst=null;
  for(const seed of SEEDS){
    const s=root.BattleScenarioGenerator.create(seed,{benchmark:true});
    NAV.installScenario(s);
    let a=12345;const rnd=()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};
    for(const b of s.buildings)for(let k=0;k<10;k++){
      const ang=rnd()*Math.PI*2,rad=Math.max(b.w,b.d)*(.25+rnd()*.55);
      const start={x:b.x+Math.cos(ang)*rad,z:b.z+Math.sin(ang)*rad};
      const obj=s.objectives[Math.floor(rnd()*s.objectives.length)];
      const dest={x:obj.x+(rnd()-.5)*20,z:obj.z+(rnd()-.5)*20};
      if(Math.hypot(start.x-dest.x,start.z-dest.z)<12)continue;
      trials++;
      const r=walk(start,dest,120);
      blockedFrames+=r.blocked;
      /* A man who spent most of two simulated minutes refused a step and went nowhere is stuck,
         not slow. This is what the benchmark's movement-stall detector sees. */
      if(!r.arrived&&r.blocked>200&&r.travelled<4){deadlocked++;if(!worst)worst=seed+' from ('+start.x.toFixed(0)+','+start.z.toFixed(0)+')';}
    }
  }
  check('no traversal deadlocks across the worst benchmark seeds',deadlocked===0,deadlocked+'/'+trials+' stuck, first at '+worst);
  check('no soldier is ever refused a step with nowhere to go',blockedFrames===0,blockedFrames+' blocked frames');
  check('the probe actually exercised the geometry',trials>500,'only '+trials+' traversals');
}

/* ------------------------------------------------------------------------------------------- */
section('Force Command spreads squads over the objectives it has');
{
  let single=0,scenarios=0,coveredTotal=0,objectiveTotal=0;
  for(const seed of SEEDS){
    const s=root.BattleScenarioGenerator.create(seed,{benchmark:true});
    const sim={time:0,factions:{us:{squads:[]},ge:{squads:[]}},_units:[],heightAt:()=>0,scene:{metadata:{}}};
    root.BattleObjectiveSystem.attach(sim,s.objectives,{town:s});
    const c=s.center;
    /* Five squads a side sitting on the shared route terminus, which is where advanceRoute leaves
       every non-reserve squad: same position, so the scoring alone has to separate them. */
    for(const f of ['us','ge'])for(let i=0;i<5;i++){
      const members=[];
      for(let m=0;m<10;m++)members.push({dead:false,role:m?'rifleman':'captain',root:{position:{x:c.x+(i-2)*3,y:0,z:c.z+(m-5)*1.5}}});
      sim.factions[f].squads.push({id:f+'-'+i,faction:f,members,aliveCount:10,state:'advance',rally:{x:c.x,z:c.z},targetObjective:null,commandRole:'center'});
    }
    for(let pass=0;pass<2;pass++)for(const f of ['us','ge'])for(const sq of sim.factions[f].squads){
      const ch=root.BattleCommanderDoctrine.chooseObjective(sim,sq,false);
      if(ch)sq.targetObjective=ch.instance.id;
    }
    const covered=new Set(sim.factions.us.squads.map(sq=>sq.targetObjective)).size;
    scenarios++;coveredTotal+=covered;objectiveTotal+=s.objectives.length;
    if(covered<=1)single++;
  }
  check('no scenario sends every squad to one objective',single===0,single+'/'+scenarios+' monopolised');
  check('most objectives get an assigned squad',coveredTotal/objectiveTotal>=.7,
    coveredTotal+' of '+objectiveTotal+' objectives assigned ('+(100*coveredTotal/objectiveTotal).toFixed(0)+'%)');
}

/* ------------------------------------------------------------------------------------------- */
section('capture progress survives a lapse in presence');
{
  function capture(lapseEvery,lapseFor){
    const sim={time:0,factions:{us:{squads:[]},ge:{squads:[]}},_units:[],heightAt:()=>0,scene:{metadata:{}}};
    root.BattleObjectiveSystem.attach(sim,[{id:'obj-center',type:'capture-zone',x:0,z:0,radius:34,value:1}],{});
    const men=[];for(let i=0;i<6;i++)men.push({faction:'us',dead:false,captureWeight:1,root:{position:{x:i*2,y:0,z:0}}});
    const dt=.15;
    for(let step=0;step<Math.round(240/dt);step++){
      sim.time+=dt;
      /* minPresence is 2 and a tie yields no leader, so ordinary events - a man drifting out of
         the ring, a casualty, an enemy matching numbers - drop `active` to nobody for a beat. */
      sim._units=(lapseEvery>0&&(sim.time%lapseEvery)<lapseFor)?men.slice(0,1):men;
      root.BattleObjectiveSystem.tick(sim,dt);
      if(root.BattleObjectiveSystem.status(sim,'obj-center').owner==='us')return +sim.time.toFixed(1);
    }
    return null;
  }
  const clean=capture(0,0),flickering=capture(8,2);
  check('an uninterrupted hold still captures at the designed rate',clean!==null&&clean<15,'took '+clean+'s');
  check('a repeatedly interrupted hold still captures',flickering!==null,'never captured in 240s');
  check('interruption costs time but does not reset the work',flickering!==null&&flickering<clean*3,
    'clean '+clean+'s vs interrupted '+flickering+'s');
}

console.log('\n'+(failures?failures+' of '+checks+' checks FAILED':'all '+checks+' checks passed'));
process.exit(failures?1:0);
