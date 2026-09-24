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
  root.BattleModules={reg:{},systems:{},registerSystem(n,h){h.id=n;this.systems[n]=h;},listSystems(){return Object.values(this.systems);},getSystem(n){return this.systems[n];},registerObjectiveType(n,h){this.reg[n]=h;},getObjectiveType(n){return this.reg[n];},runHook(){},unitsFor(sim){return sim._units||[];}};
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
  let single=0,scenarios=0,coveredTotal=0,objectiveTotal=0,lateSwitches=0;
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
    // Static equal-position assignments should settle, not ping-pong solely as counts change.
    for(let pass=0;pass<30;pass++)for(const f of ['us','ge'])for(const sq of sim.factions[f].squads){
      const ch=root.BattleCommanderDoctrine.chooseObjective(sim,sq,false);
      if(ch){if(pass>=5&&sq.targetObjective!==ch.instance.id)lateSwitches++;sq.targetObjective=ch.instance.id;}
    }
    const covered=new Set(sim.factions.us.squads.map(sq=>sq.targetObjective)).size;
    scenarios++;coveredTotal+=covered;objectiveTotal+=s.objectives.length;
    if(covered<=1)single++;
  }
  check('saturation alone does not oscillate settled neutral assignments',lateSwitches===0,'late switches='+lateSwitches);
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

/* Current expanded-benchmark regressions. Exercise shipping commander hooks, not a second
   implementation of their decisions. */
function commandFixture(){
  const r=bootstrap();r.BattleSim={start(){}};
  r.SquadAI={updateSquad(){},ROLES:{},COMPOSITION:['rifleman']};r.BattleLeases=require('./harness.js').bootstrap({modules:false}).BattleLeases;
  load(r,'battle/commander-routes.js');load(r,'battle/commander-ai.js');
  const sq={id:'us-0',faction:'us',state:'advance',commandRole:'center',commandPhase:'assault',
    route:[{x:0,z:0},{x:0,z:0}],routeIndex:1,
    targetObjective:'outer',objective:{x:120,z:0},rally:{x:65,z:0},members:[],aliveCount:4};
  for(let i=0;i<4;i++)sq.members.push({id:'m'+i,role:i?'rifleman':'captain',faction:'us',dead:false,root:{position:{x:65,z:i-1.5}}});
  const sim={time:100,factions:{us:{squads:[sq]},ge:{squads:[]}},_units:sq.members,_roster:{us:sq.members,ge:[]},heightAt:()=>0,scene:{metadata:{}}};
  r.BattleObjectiveSystem.attach(sim,[{id:'outer',type:'capture-zone',x:120,z:0,radius:30,value:1}],{});
  return{r,sq,sim,town:{center:{x:0,z:0},radius:250}};
}
/* General issues the brief; the Captain hook executes it in the same command tick. */
function commandTick(r,sim,town){sim.time+=.45;r.BattleCommanderAI.update(sim,town,.45);r.BattleModules.getSystem('squad-command').onCommanderTick(sim,{town});}
section('an assigned objective mission survives approach-route and lease boundaries');
{
  const {r,sq,sim,town}=commandFixture();
  load(r,'battle/modules/16-squad-plan-stability.js');
  commandTick(r,sim,town);
  const mission=sq._macroMission;
  check('an assigned outer objective stays the movement goal outside the terminal radius',sq.objective.x===120&&sq.commandPhase==='assault',JSON.stringify(sq.objective)+' '+sq.commandPhase);
  sq.routeIndex=0;commandTick(r,sim,town);
  check('a stale route index cannot resurrect an old approach waypoint',sq.objective.x===120&&sq.commandPhase==='assault');
  const lease=sq._stablePlan;
  check('the Captain stages one plan for the brief it is executing',!!lease&&lease.missionVersion===mission.version);
  sim.time=lease.until+.1;commandTick(r,sim,town);commandTick(r,sim,town);
  check('lease expiry does not make Force Command reissue an unchanged assault',sq._macroMission===mission&&sq.objective.x===120&&r.BattleCommanderAI.missionState(sim).wakeCount===1);
  for(const m of sq.members)m.root.position.x=120;commandTick(r,sim,town);
  check('the Captain transitions assault to capture inside the zone without a new mission',sq.commandPhase==='capture'&&sq._macroMission===mission);
}
section('a single assigned squad can reach and capture an outer objective');
{
  const H=require('./harness.js'),r=H.bootstrap({modules:false});r.console=quiet;r.BABYLON.Vector3=H.vec;r.BABYLON.Color3.prototype.scale=function(){return this;};
  const base=bootstrap();r.BattleModules=base.BattleModules;
  r.BattleModules.runHook=function(name,sim,payload){for(const id of Object.keys(this.systems).sort()){const h=this.systems[id][name];if(h)h(sim,payload);}};
  r.BattleModules.unitsFor=sim=>sim._roster.us.concat(sim._roster.ge);
  r.BattleSim={start(){}};
  for(const f of ['battle/movement-resolver.js','battle/objective-system.js','battle/modules/01-capture-zone.js',
    'battle/commander-doctrine.js','battle/commander-routes.js','battle/commander-ai.js',
    'battle/modules/16-squad-plan-stability.js'])load(r,f);
  const sim=H.makeBattle(r,{seed:12345});sim.scene={metadata:{}};
  const sq=H.addSquad(r,sim,{id:'us-0',faction:'us',x:65,z:0,objective:{x:180,z:0},seed:12345});
  Object.assign(sq,{route:[{x:0,z:0},{x:0,z:0}],routeIndex:1,targetObjective:'outer',commandRole:'center',commandPhase:'assault'});
  r.BattleObjectiveSystem.attach(sim,[{id:'outer',type:'capture-zone',x:180,z:0,radius:28,value:1}],{});
  const town={center:{x:0,z:0},radius:250};let first=null,peakPresence=0,wrongGoal=0,step=0;
  H.run(r,sim,180,()=>{
    if(++step%3===0)r.BattleCommanderAI.update(sim,town,.45);
    const st=r.BattleObjectiveSystem.status(sim,'outer');peakPresence=Math.max(peakPresence,st.us||0);
    if(st.owner==='us'&&first===null)first=sim.time;
    if(first===null&&sq.objective.x===0)wrongGoal++;
  });
  check('normal squad/engagement/resolver layers capture an uncontested outer zone',first!==null,'capture='+first+'s, peak presence='+peakPresence);
  check('approach waypoint never replaces assigned intent before capture',wrongGoal===0,'wrong-goal frames='+wrongGoal);
  check('the formation supplies at least the two required capture weights',peakPresence>=2,'peak='+peakPresence);
  console.log('  probe: first capture '+(first===null?'none':first.toFixed(1)+'s')+', peak presence '+peakPresence+', obsolete-goal frames '+wrongGoal);
}
section('a stranded soldier cannot override the Captain regroup timeout');
{
  const {r,sq,sim,town}=commandFixture();
  r.BattleTelemetry={record(){}};
  load(r,'battle/modules/16-squad-plan-stability.js');
  commandTick(r,sim,town);
  sq.members[3].root.position.x=-100;
  sq.commandPhase='regroup';sq.objective={x:20,z:0};
  sq._regroupHysteresis={overSince:sim.time-20,accepted:true,enteredAt:sim.time-19,cooldownUntil:0,anchor:{x:20,z:0},entries:1,exits:0,suppressed:0,stragglerSuppressions:0,regroupRequests:1};
  commandTick(r,sim,town);
  check('the Captain releases a timed-out regroup straight back into its mission',sq.commandPhase!=='regroup'&&sq.objective.x===120);
  let held=0;
  for(let i=0;i<25;i++){commandTick(r,sim,town);if(sq.commandPhase==='regroup'||sq.objective.x!==120)held++;}
  check('the entire bypass survives subsequent commander and Captain ticks',held===0,'held ticks='+held);
}
section('benchmark alerts distinguish approach intent from absent orders');
{
  const file=path.join(REPO,'scripts/battle-benchmark-intent.cjs');
  // Load the old runner's actual inline predicates when running this test on the parent tree.
  // This makes the negative control test behavior, not merely the absence of a new file.
  let d;
  if(fs.existsSync(file))d=require(file);
  else{
    const source=fs.readFileSync(path.join(REPO,'scripts/run_battle_benchmark.mjs'),'utf8');
    const target=source.match(/const relevantTargetless = (.*);/)[1];
    const route=source.match(/if \((p && route.length.*)\) \{/)[1];
    const phases=source.match(/function phaseAllowsAdvance\(phase\) \{.*\}/)[0];
    d={targetless:new Function('sq','p','return '+target),routeActive:new Function('sq','p',
      phases+';const route=sq.route||[],routeIndex=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0)),phase=sq.commandPhase;return '+route)};
  }
  {
    const {sq}=commandFixture(),p={x:65,z:0};
    check('an objective mission is not measured against its obsolete route',!d.routeActive(sq,p));
    sq.targetObjective=null;sq.objective={x:0,z:0};
    check('a squad travelling a valid route has strategic intent',!d.targetless(sq,p)&&d.routeActive(sq,p));
    check('a squad at the terminal waypoint without an objective is targetless',d.targetless(sq,{x:0,z:0}));
    sq.route=[];check('missing route and objective remain detectable',d.targetless(sq,p));
    sq.aliveCount=0;check('an eliminated squad cannot have an actionable assignment gap',!d.targetless(sq,p));
  }
}
section('meeting engagements do not enter prepared-defender construction');
{
  const {r,sq,sim}=commandFixture();
  load(r,'battle/modules/00-battle-sides.js');
  load(r,'battle/modules/00-defense-plan.js');
  sim.obstacles=[];sim.scene=null; // Render stubs are unnecessary for construction geometry.
  sim._defensePlans={us:r.BattleDefensePlan.empty('us'),ge:r.BattleDefensePlan.empty('ge')};
  load(r,'battle/modules/21-defender-engineers.js');
  sim._sides=r.BattleSides.build({center:{x:0,z:0}},{defender:null});
  sim._objectives[0].state.owner='us';sq.members[0].role='engineer';sq.members[0].root.position={x:120,z:0};
  let error=null;try{r.BattleModules.getSystem('defender-engineers').onCommanderTick(sim,{dt:11});}catch(e){error=e.message;}
  check('an engineer holding a meeting objective skips unsupported construction',!error,error);
  check('skipping meeting construction creates no build state',!sim._engineerBuild);
  sim._sides=r.BattleSides.build({center:{x:0,z:0},objectives:[sim._objectives[0].def]},{defender:'us'});
  error=null;try{for(let i=0;i<3;i++)r.BattleModules.getSystem('defender-engineers').onCommanderTick(sim,{dt:11});}catch(e){error=e.message;}
  check('prepared-defender runtime construction still works and respects its two-work limit',!error&&sim._engineerBuild.counts['us|outer']===2,error);
}
section('provenance distinguishes real competing writers from sampling noise');
{
  const {r,sq,sim}=commandFixture();
  load(r,'battle/modules/36-order-provenance.js');
  const p=r.BattleOrderProvenance,fast=p;
  p.instrument(sim);
  for(let i=0;i<5;i++){
    sim.time+=.45;fast.withOwner('force-command','regroup centroid',()=>{sq.objective={x:120+i*.75,z:0};});p.sample(sim);
  }
  check('sub-threshold assigned points are not mislabeled as in-place writes',!p.history(sq,'objective',40).some(e=>e.owner==='in-place/unknown'));
  check('one commander cannot conflict with the provenance sampler',p.conflicts(sim).length===0);
  // Real in-place writes stay observable, but an unknown identity cannot establish competition.
  for(let i=0;i<3;i++){sim.time+=.45;fast.withOwner('force-command','goal',()=>{sq.objective={x:200+i*10,z:0};});sq.objective.x+=3;p.sample(sim);}
  check('unknown in-place changes remain in the trace',p.history(sq,'objective',40).some(e=>e.owner==='in-place/unknown'));
  check('unknown identity does not count as a competing system',p.conflicts(sim).length===0);
  for(const owner of ['force-command','squad-stability','force-command']){sim.time+=.45;fast.withOwner(owner,'deliberate boundary violation',()=>{sq.commandPhase=sq.commandPhase==='capture'?'assault':'capture';});}
  check('known writer ping-pong is still detected',p.conflicts(sim).some(c=>c.field==='commandPhase'));
}

section('physical wayfinding respects body clearance through hedgerows');
{
  const r=bootstrap(),N=r.BattleNavigation;
  load(r,'battle/modules/39-navigation-physicality-debug.js');
  const P=r.BattleNavigationPhysicality;
  // Exercise the shipping integrator, including steering and turn smoothing, without rendering.
  const movementSource=fs.readFileSync(path.join(REPO,'battle/battle-sim.js'),'utf8').replace('root.BattleSim={','root.stepMovementProbe=stepMovement;root.BattleSim={');
  const model={animateWalk(){},setCrouch(s,v){s.crouching=v;},setProne(s,v){s.prone=v;}};
  new Function('window','globalThis','console','BABYLON','BattleSoldierModel',movementSource)(r,r,quiet,r.BABYLON,model);
  function world(shapes){
    const scenario={buildings:[]},sim={time:0,heightAt:()=>0,obstacles:[],_roster:{us:[],ge:[]},scene:{metadata:{battleScenario:scenario}}};
    sim.obstacles.__physicalFootprints=shapes;N.installScenario(scenario);
    r.BattleModules.getSystem('navigation-physicality-debug').onBattleStart(sim);return sim;
  }
  function hedge(id,x,z,hx,hz){return{id,type:'hedge',shape:'obb',x,z,hx,hz,ux:1,uz:0,vx:0,vz:1};}
  function clearPath(start,points,shapes,margin){let p=start;for(const q of points){if(shapes.some(fp=>P.shapeHit(p,q,fp,margin)))return false;p=q;}return true;}
  const shapes=[hedge('left',-1.2,0,.8,8),hedge('right',1.2,0,.8,8)],sim=world(shapes);
  const start={x:0,z:-15},goal={x:0,z:15},plan=P.planPath(sim,start,goal);
  check('a sub-body-width hedge gap is not movement-clear',!N.movementClear({x:0,z:-7},{x:0,z:7}));
  check('the path detours around nearly touching hedges with planning clearance',plan.length>0&&clearPath(start,plan,shapes,P.routeMargin));
  const s={id:'walker',root:{position:{...start}},_navCache:null};let penetrations=0;
  for(let i=0;i<600&&Math.hypot(s.root.position.x-goal.x,s.root.position.z-goal.z)>.7;i++){
    sim.time+=.15;const p=s.root.position,w=N.nextWaypoint(sim,s,goal),d=Math.hypot(w.x-p.x,w.z-p.z),step=Math.min(.4,d);
    if(d<.001)continue;let to={x:p.x+(w.x-p.x)/d*step,z:p.z+(w.z-p.z)/d*step};
    if(!N.movementClear(p,to))to=N.resolveStep(p,to);
    if(!to)continue;if(!N.movementClear(p,to))penetrations++;s.root.position={...to};
  }
  check('rolling waypoints carry the soldier around the hedge gap',Math.hypot(s.root.position.x-goal.x,s.root.position.z-goal.z)<.7,JSON.stringify(s.root.position));
  check('integration recovery never returns a footprint-illegal step',penetrations===0,'illegal steps='+penetrations);
  // A formation slot in an impassable gap must never become a fabricated straight path.
  const trapped={x:0,z:0},bad=P.planPath(sim,start,trapped);
  check('unreachable narrow-gap goals never produce illegal route segments',clearPath(start,bad,shapes,P.routeMargin),JSON.stringify(bad));
  const circle={type:'rock',shape:'circle',x:0,z:0,radius:2},box=hedge('escape',0,0,2,8);
  check('buffer escape cannot tunnel across a circular obstacle',!!P.shapeHit({x:1,z:0},{x:-4,z:0},circle,P.navMargin));
  check('buffer escape cannot tunnel across a hedgerow',!!P.shapeHit({x:1,z:0},{x:-4,z:0},box,P.navMargin));
  check('tiny outward recovery steps are legal in a hedge buffer',!P.shapeHit({x:2.2,z:0},{x:2.2001,z:0},box,P.navMargin));
  const from={x:-3,z:0},into={x:-2,z:0},slid=N.resolveStep(from,into);
  check('wall sliding also respects hedgerow body collision',!slid||N.movementClear(from,slid));
  // Node generation can be bounded for speed; collision testing cannot omit the 33rd footprint.
  const crowded=Array.from({length:32},(_,i)=>({id:'rock'+i,type:'rock',shape:'circle',x:0,z:0,radius:3}));
  crowded.push({id:'upper-hedge',type:'hedge',shape:'circle',x:0,z:4.5,radius:1.6},{id:'lower-hedge',type:'hedge',shape:'circle',x:0,z:-4.5,radius:1.6});
  const dense=world(crowded),a={x:-12,z:0},b={x:12,z:0},densePath=P.planPath(dense,a,b);
  check('bounded waypoint candidates cannot omit collision geometry',densePath.length>0&&clearPath(a,densePath,crowded,P.routeMargin));
  const angle=.63,c=Math.cos(angle),sn=Math.sin(angle),rot=p=>({x:p.x*c-p.z*sn,z:p.x*sn+p.z*c});
  const wide=[hedge('wide-left',-2.3,0,.8,8),hedge('wide-right',2.3,0,.8,8)].map(fp=>Object.assign({},fp,rot(fp),{ux:c,uz:sn,vx:-sn,vz:c}));
  const open=world(wide),ws=rot(start),wg=rot(goal),widePath=P.planPath(open,ws,wg);
  check('a rotated passage wider than the clearance envelope remains usable',widePath.length>0&&clearPath(ws,widePath,wide,P.routeMargin));
  const enclosure=world([hedge('west',-6,0,.8,8),hedge('east',6,0,.8,8),hedge('south',0,-6,8,.8),hedge('north',0,6,8,.8)]);
  const boxed={id:'boxed',root:{position:{x:0,z:0}}},outside={x:20,z:0};
  const hold=N.nextWaypoint(enclosure,boxed,outside),blockedPlan=boxed._physicalPath;enclosure.time+=.15;
  N.nextWaypoint(enclosure,boxed,outside);
  check('no-path results hold safely and retry on a timer',hold.x===0&&hold.z===0&&blockedPlan.blocked&&boxed._physicalPath===blockedPlan);

  function walkPhysical(sim,start,dest,seconds){
    const man={id:'probe',root:{position:{...start},rotation:{y:0}},destination:{...dest},speed:2.9,fireCooldown:0};let illegal=0;
    for(let i=0;i<seconds/.15;i++){
      sim.time+=.15;const p={...man.root.position};r.stepMovementProbe(sim,man,.15);
      if(Math.hypot(p.x-man.root.position.x,p.z-man.root.position.z)>1e-8&&!N.movementClear(p,man.root.position))illegal++;
    }
    return{man,illegal};
  }
  /* Live v153 retreat freeze (real geometry, trimmed): the rolling planner's synthetic lookahead point
     landed inside a rock's route buffer. No path reaches an illegal intermediate goal, so a legal soldier
     with a legal, reachable destination held a blocked plan (moveSpeed 0, stuck=false) for 300 s. */
  {
    const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','retreat-lookahead-freeze.json'),'utf8'));
    const frozenWorld=world(fx.footprints),probe={id:'freeze',root:{position:{...fx.start}}},wp=N.nextWaypoint(frozenWorld,probe,fx.destination);
    check('an illegal lookahead point never blocks a reachable long-range destination',!probe._physicalPath.blocked&&Math.hypot(wp.x-fx.start.x,wp.z-fx.start.z)>.5,'blocked='+probe._physicalPath.blocked);
    const retreat=walkPhysical(world(fx.footprints),fx.start,fx.destination,60),moved=Math.hypot(retreat.man.root.position.x-fx.start.x,retreat.man.root.position.z-fx.start.z);
    check('the frozen retreater physically leaves along a legal route',moved>60&&retreat.illegal===0,'moved='+moved.toFixed(1)+' illegal='+retreat.illegal);
  }
  /* Live retreat freeze #2 (sweep-seed-03, six men of one squad): the building router only searched
     nodes within 360 m of each endpoint. A map-edge retreat goal had none, so it answered with a
     straight line through a building 25 m away and the rolling plan stayed blocked. */
  {
    const fx=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','retreat-building-far-goal.json'),'utf8'));
    function builtWorld(){const sim=world(fx.footprints);sim.scene.metadata.battleScenario.buildings=fx.buildings;N.installScenario(sim.scene.metadata.battleScenario);r.BattleModules.getSystem('navigation-physicality-debug').onBattleStart(sim);return sim;}
    const probe={id:'far-building',root:{position:{...fx.start}}};N.nextWaypoint(builtWorld(),probe,fx.destination);
    check('a far goal with no nearby building nodes still routes around buildings',!probe._physicalPath.blocked,'blocked='+probe._physicalPath.blocked);
    const walk=walkPhysical(builtWorld(),fx.start,fx.destination,90),moved=Math.hypot(walk.man.root.position.x-fx.start.x,walk.man.root.position.z-fx.start.z);
    check('the squad frozen behind a building physically leaves on a legal route',moved>80&&walk.illegal===0,'moved='+moved.toFixed(1)+' illegal='+walk.illegal);
  }
  const rockWorld=world([{id:'slot-rock',type:'rock',shape:'circle',x:0,z:0,radius:1}]);
  rockWorld.obstacles.push({type:'rock',x:0,z:0,radius:1});
  const slotWalk=walkPhysical(rockWorld,{x:-20,z:0},{x:0,z:0},35);
  const slotDistance=Math.hypot(slotWalk.man.root.position.x,slotWalk.man.root.position.z);
  check('a formation slot inside a rock settles nearby instead of circling forever',slotDistance<3&&slotWalk.man._physicalPath.points.length===0,'distance='+slotDistance);
  check('slot recovery keeps body clearance and preserves the resolved order',slotWalk.illegal===0&&slotDistance>1+P.navMargin&&slotWalk.man.destination.x===0&&slotWalk.man.destination.z===0);
  const room={id:'room',x:0,z:0,w:12,d:12,rot:.4,openings:[{id:'door',type:'door',side:'south',offset:0,width:2},{id:'window',type:'window',side:'north',offset:0,width:1.25,bottom:.92,top:2.08}]};
  const roomWorld=world([]);roomWorld.scene.metadata.battleScenario={buildings:[room]};N.installScenario(roomWorld.scene.metadata.battleScenario);
  const station=N.firingStations[0];
  check('window stations are inset by half the previous 1.55 metres',Math.abs(Math.hypot(station.x-station.windowX,station.z-station.windowZ)-.775)<1e-8);
  const windowWalk=walkPhysical(roomWorld,{x:0,z:0},station,15);
  check('soldiers actually reach the closer window station',Math.hypot(windowWalk.man.root.position.x-station.x,windowWalk.man.root.position.z-station.z)<=.35&&windowWalk.illegal===0);
  const entering=walkPhysical(roomWorld,{x:-Math.sin(room.rot)*12,z:-Math.cos(room.rot)*12},station,25);
  check('an exterior soldier reaches the window through the door without crossing walls',Math.hypot(entering.man.root.position.x-station.x,entering.man.root.position.z-station.z)<=.35&&entering.illegal===0);
  load(r,'battle/movement-resolver.js');
  const close={slotIndex:0,root:{position:{x:station.x,z:station.z-.6}},destination:{x:station.x,z:station.z-.6}};
  r.BattleMovementResolver.proposeCombat(close,station,roomWorld,'firing-station');r.BattleMovementResolver.resolve(close,roomWorld);
  check('the resolver accepts a sub-metre adjustment to a window station',close.destination.x===station.x&&close.destination.z===station.z);

  const crossingWorld=world([hedge('crossing-hedge',0,0,8,.8)]),crossingSquad={state:'advance',commandPhase:'approach',orderAnchor:{x:0,z:-10},rally:{x:0,z:-10},objective:{x:0,z:30},members:[]};
  const crossing={id:'crossing-man',slotIndex:4,root:{position:{x:0,z:-12},rotation:{y:0}},destination:{x:0,z:-12},orderDestination:null,_fireteamDestination:{x:0,z:0},squad:crossingSquad,speed:2.9,moveSpeed:0,fireCooldown:0};crossingSquad.members=[crossing];
  r.BattleMovementResolver.proposeOrder(crossing,crossing._fireteamDestination,crossingWorld,false);r.BattleMovementResolver.resolve(crossing,crossingWorld);
  check('a formation slot inside a transverse hedge resolves on the command-progress side',crossing.orderDestination.z>1.5,JSON.stringify(crossing.orderDestination));
  check('physical endpoint resolution preserves the Captain fireteam intent',crossing._fireteamDestination.x===0&&crossing._fireteamDestination.z===0&&crossing._movementResolver.order.intentPoint.z===0);
  check('the resolved formation endpoint itself has route-margin clearance',!P.shapeContains(crossing.orderDestination,crossingWorld.obstacles.__physicalFootprints[0],P.routeMargin),JSON.stringify(crossing.orderDestination));
  let crossingIllegal=0;
  for(let i=0;i<500&&Math.hypot(crossing.root.position.x-crossing.orderDestination.x,crossing.root.position.z-crossing.orderDestination.z)>.7;i++){
    crossingWorld.time+=.15;r.BattleMovementResolver.resolve(crossing,crossingWorld);const before={x:crossing.root.position.x,z:crossing.root.position.z};r.stepMovementProbe(crossingWorld,crossing,.15);
    if(Math.hypot(before.x-crossing.root.position.x,before.z-crossing.root.position.z)>1e-8&&!N.movementClear(before,crossing.root.position))crossingIllegal++;
  }
  check('a blocked formation intent routes around the hedge instead of parking on its near face',crossing.root.position.z>1.0&&Math.hypot(crossing.root.position.x-crossing.orderDestination.x,crossing.root.position.z-crossing.orderDestination.z)<=.7,JSON.stringify(crossing.root.position));
  check('hedge-crossing endpoint recovery never violates body clearance',crossingIllegal===0,'illegal steps='+crossingIllegal);

  const aimWorld=world([]),aim={root:{position:{x:0,z:0},rotation:{y:0}},destination:{x:0,z:0},speed:2.9,fireCooldown:0,_faceHint:{x:Math.sin(.02)*20,z:Math.cos(.02)*20}};
  r.stepMovementProbe(aimWorld,aim,1/60);
  check('small aim changes ease over frames instead of snapping to the target',aim.root.rotation.y>0&&aim.root.rotation.y<.02);
  for(let i=0;i<60;i++)r.stepMovementProbe(aimWorld,aim,1/60);
  check('eased aim settles promptly without overshooting',aim.root.rotation.y>.0199&&aim.root.rotation.y<=.02);
  aim.root.rotation.y=Math.PI-.01;aim._faceHint={x:Math.sin(-Math.PI+.01)*20,z:Math.cos(-Math.PI+.01)*20};
  r.stepMovementProbe(aimWorld,aim,1/60);
  check('aim across the angle wrap takes the short turn',aim.root.rotation.y>Math.PI-.01&&aim.root.rotation.y<Math.PI+.01);


}

console.log('\n'+(failures?failures+' of '+checks+' checks FAILED':'all '+checks+' checks passed'));
process.exit(failures?1:0);
