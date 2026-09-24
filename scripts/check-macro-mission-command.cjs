'use strict';
// Run against any checkout with GRASSTEX_SOURCE_ROOT to preserve the same negative-control probe.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const repo=process.env.GRASSTEX_SOURCE_ROOT||path.resolve(__dirname,'..');
let failed=0,passed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
// The real lease primitive from squad-ai.js; the rest of SquadAI is stubbed.
const LEASES=require(path.join(repo,'tools/ai-sim-harness/harness')).bootstrap({modules:false}).BattleLeases;
function fixture(){
  const events=[],systems={},r={console:{log(){},warn(){}},Math,JSON,isFinite};r.window=r;
  r.BattleLeases=LEASES;r.BattleSim={start(){}};r.SquadAI={updateSquad(){},formationSlot(){return null;},formationFor(){return'wedge';}};
  r.BattleTelemetry={record(type,data){events.push({type,data});}};
  r.BattleModules={registerSystem(id,h){systems[id]=h;},unitsFor(sim){return sim._roster.us.concat(sim._roster.ge);},runHook(name,sim,payload){for(const h of Object.values(systems))if(h[name])h[name](sim,payload);}};
  r.BattleObjectiveSystem={get(sim,id){return sim._objectives.find(o=>o.id===id);},status(sim,id){return this.get(sim,id)?.state||{};},tick(){}};
  vm.createContext(r);for(const file of ['battle/commander-doctrine.js','battle/commander-routes.js','battle/commander-ai.js','battle/modules/15-vacant-objective-assault.js','battle/modules/16-squad-plan-stability.js'])vm.runInContext(fs.readFileSync(path.join(repo,file),'utf8'),r,{filename:file});
  let decisions=0,action='assault';
  r.BattleAIPolicy={genomeFor(){return{parameters:r.BattleCommanderDoctrine.FALLBACK,doctrine:r.BattleCommanderDoctrine.FALLBACK_DOCTRINE};},decide(){decisions++;return{id:'probe',action,when:[]};}};
  const soldier={id:'captain',role:'captain',dead:false,faction:'us',root:{position:{x:0,z:0}}};
  const sq={id:'us-0',faction:'us',state:'advance',commandRole:'center',commandPhase:'assault',targetObjective:'a',objective:{x:100,z:0},rally:{x:0,z:0},home:{x:0,z:0},route:[{x:0,z:0},{x:50,z:0}],routeIndex:1,members:[soldier],aliveCount:1};
  const sim={time:0,factions:{us:{squads:[sq]},ge:{squads:[]}},_roster:{us:[soldier],ge:[]},_objectives:[{id:'a',def:{x:100,z:0,radius:20,value:1},state:{owner:'neutral'}},{id:'b',def:{x:200,z:0,radius:20,value:1},state:{owner:'neutral'}}],objectiveControl:{counts:{us:0,ge:0}},objectiveHold:{us:0,ge:0}};
  const town={center:{x:50,z:0},radius:80};
  function tick(){sim.time+=.45;r.BattleCommanderAI.update(sim,town,.45);} // Captain executes from its own onCommanderTick hook
  return{r,sq,sim,town,events,tick,systems,get decisions(){return decisions;},set action(v){action=v;}};
}
test('accepted objective survives local doctrine/contact noise without strategic reevaluation',()=>{
  const f=fixture();f.tick();const point=JSON.stringify(f.sq.objective),decisions=f.decisions;f.action='hold';
  for(let i=0;i<30;i++){f.sq.inContact=!!(i%2);f.tick();}
  assert.equal(f.decisions,decisions,'doctrine ran again during unchanged active mission');assert.equal(JSON.stringify(f.sq.objective),point);
  assert.equal(f.sq._macroMission.status,'executing');
});
test('Captain follows initial route while Macro sleeps, including Macro OFF',()=>{
  const f=fixture();f.sq.targetObjective=null;f.sq.routeIndex=0;f.tick();
  assert.ok(f.sq._macroMission?.objectiveId,'Macro must brief the final objective before route execution');
  const version=f.sq._macroMission.version,decisions=f.decisions;f.sim.macroCommandEnabled=false;
  f.sq.members[0].root.position.x=50;for(let i=0;i<6;i++)f.tick(); // includes the Captain's own corner-check pause
  assert.equal(f.sq._macroMission.version,version);assert.equal(f.decisions,decisions);assert.equal(f.sq.objective.x,100,'Captain did not finish approach route autonomously');
});
test('owned defense is an ongoing mission, not completion every commander tick',()=>{
  const f=fixture();f.sim._objectives[0].state.owner='us';f.sq._preparedDefenseRequest={objectiveId:'a',point:{x:100,z:0}};f.tick();
  const mission=f.sq._macroMission;assert.ok(mission);for(let i=0;i<30;i++)f.tick();assert.strictEqual(f.sq._macroMission,mission);assert.equal(mission.intent,'defend');assert.equal(mission.status,'executing');
});
test('capture completes exactly once and selects a remaining objective',()=>{
  const f=fixture();f.tick();const old=f.sq._macroMission;assert.ok(old);f.sim._objectives[0].state.owner='us';f.tick();
  assert.equal(old.status,'completed');assert.equal(f.sq._macroMission.objectiveId,'b');const next=f.sq._macroMission;f.tick();assert.strictEqual(f.sq._macroMission,next);
});
test('removed objective invalidates the mission without resurrecting its route',()=>{
  const f=fixture();f.tick();const old=f.sq._macroMission;assert.ok(old);f.sim._objectives.shift();f.tick();assert.equal(old.status,'invalid');assert.equal(f.sq._macroMission.objectiveId,'b');assert.equal(f.sq.objective.x,200);
});
test('prolonged stall wakes once per strategic interval and can recur without progress',()=>{
  const f=fixture();f.tick();f.sim._coordinationHealth={lastObjectiveProgressAt:0,sides:{us:{objectiveStallSeconds:121,replanDue:true}}};f.sim.time=121;f.tick();
  const first=f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='strategic-stall').length;assert.equal(first,1);
  for(let i=0;i<10;i++)f.tick();assert.equal(f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='strategic-stall').length,1);
  f.sim._coordinationHealth.sides.us.objectiveStallSeconds=241;f.sim.time=241;f.tick();assert.equal(f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='strategic-stall').length,2);
});
test('reserve commitment is one strategic event and does not revive reserve status',()=>{
  const f=fixture();f.sq.commandRole='reserve';f.sq.targetObjective=null;f.tick();assert.equal(f.sq._macroMission?.intent,'reserve');
  f.sim.objectiveControl.counts.ge=1;f.tick();assert.equal(f.sq._lastMacroMission.status,'completed');assert.notEqual(f.sq._macroMission.intent,'reserve');const version=f.sq._macroMission.version;
  for(let i=0;i<10;i++)f.tick();assert.equal(f.sq._macroMission.version,version);assert.equal(f.events.filter(e=>e.type==='decision-reserve-commit').length,1);
});
test('a persistent request is accepted once and its removal is explicit reassessment',()=>{
  const f=fixture();f.tick();f.sq._captureZoneDefenseRequest={objectiveId:'a',point:{x:100,z:0}};f.tick();const mission=f.sq._macroMission;assert.equal(mission?.intent,'defend');
  f.sq._captureZoneDefenseRequest={objectiveId:'a',point:{x:100,z:0},requestedAt:1};f.tick();assert.strictEqual(f.sq._macroMission,mission);
  f.sq._captureZoneDefenseRequest=null;f.tick();assert.notStrictEqual(f.sq._macroMission,mission);assert.equal(mission.status,'superseded');
});
test('vacant-objective extension never rewrites another squad on a global wake',()=>{
  const f=fixture();f.sim._objectives[0].state={owner:'ge',vacantOwner:true};f.tick();
  assert.deepEqual(Object.keys(f.systems).filter(id=>id!=='squad-command'),[],'a module besides the Captain still registers a squad-state hook');
  f.sq.objective={x:71,z:0};f.sq.commandPhase='regroup';f.tick();
  assert.equal(f.sq.objective.x,100,'Captain did not restore the vacant objective mission');assert.equal(f.sq._macroMission.action,'assault');
});
test('a brief decides doctrine once and goes straight for its objective',()=>{
  const f=fixture();f.sq.targetObjective=null;f.sq.routeIndex=0;f.tick();
  const mission=f.sq._macroMission;assert.equal(mission.action,'assault');assert.equal(f.decisions,1);assert.equal(f.sq.objective.x,100);
  for(let i=0;i<20;i++){f.sq.inContact=!!(i%3);f.tick();}
  assert.strictEqual(f.sq._macroMission,mission);assert.equal(f.decisions,1,'doctrine re-evaluated during an unchanged mission');
});
test('Captain regroup is Meso-owned: no General wake, no restore writes, mission resumes',()=>{
  const f=fixture();const extra=[];
  for(let i=0;i<5;i++){const m={id:'r'+i,role:'rifleman',dead:false,faction:'us',root:{position:{x:0,z:0}}};extra.push(m);f.sq.members.push(m);f.sim._roster.us.push(m);}
  f.tick();const mission=f.sq._macroMission,wakes=f.r.BattleCommanderAI.missionState(f.sim).wakeCount,phase=f.sq.commandPhase;
  assert.equal(f.sq.objective.x,100);
  extra[0].root.position.x=-60;extra[1].root.position.x=60;extra[2].root.position.z=70; // genuinely dispersed, including outrunners
  let regroupTicks=0,phaseWrites=0,lastPhase=f.sq.commandPhase;
  for(let i=0;i<12;i++){f.tick();if(f.sq.commandPhase==='regroup')regroupTicks++;if(f.sq.commandPhase!==lastPhase){phaseWrites++;lastPhase=f.sq.commandPhase;}}
  assert.ok(regroupTicks>0,'Captain never regrouped a dispersed squad');assert.equal(phaseWrites,1,'regroup entered more than once or flapped');
  for(const m of extra)m.root.position={x:0,z:0};
  for(let i=0;i<12;i++)f.tick();
  assert.equal(f.sq.commandPhase,phase);assert.equal(f.sq.objective.x,100);assert.strictEqual(f.sq._macroMission,mission);
  assert.equal(f.r.BattleCommanderAI.missionState(f.sim).wakeCount,wakes,'General woke for a Captain regroup');
});
test('a doctrine hold is reviewed once when its Captain lease ends, not every tick',()=>{
  const f=fixture();f.action='hold';f.tick();assert.equal(f.sq._macroMission.action,'hold');assert.equal(f.sq.commandPhase,'hold');
  const lease=f.r.BattleSquadStability.planSeconds.defense,decisions=f.decisions;
  for(let i=0;i<Math.ceil((lease-1)/.45);i++)f.tick();assert.equal(f.decisions,decisions,'hold was re-evaluated before its lease ended');
  for(let i=0;i<6;i++)f.tick();assert.equal(f.decisions,decisions+1,'expected exactly one doctrine review at lease end');
  assert.equal(f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='doctrine-review').length,1);
});
test('contact freezes Captain leg and phase under the same mission',()=>{
  const f=fixture();f.tick();assert.equal(f.sq.commandPhase,'assault');
  f.sq.inContact=true;f.tick();assert.ok(f.sq._engagementPlan&&f.sq._engagementPlan.status==='active');
  const index=f.sq.routeIndex,phase=f.sq.commandPhase,objective=JSON.stringify(f.sq.objective);
  f.sq.members[0].root.position.x=100;for(let i=0;i<10;i++)f.tick(); // inside the zone: no assault->capture rewrite mid-firefight
  assert.equal(f.sq.routeIndex,index);assert.equal(f.sq.commandPhase,phase);assert.equal(JSON.stringify(f.sq.objective),objective);
});
test('a stall never re-tasks a mission younger than the stall window',()=>{
  const f=fixture();f.sim.time=100;f.tick();const mission=f.sq._macroMission;
  f.sim._coordinationHealth={lastObjectiveProgressAt:0,sides:{us:{objectiveStallSeconds:121,replanDue:true}}};f.sim.time=121;f.tick();
  const stalls=()=>f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='strategic-stall').length;
  assert.strictEqual(f.sq._macroMission,mission);assert.equal(stalls(),0,'a 21 s old mission woke the General for a faction stall');
  f.sim._coordinationHealth.sides.us.objectiveStallSeconds=241;f.sim.time=241;f.tick();
  assert.equal(stalls(),1,'a mission older than the stall window must be reassessed');
});
test('pressure flicker on an objective already being defended is not a new brief',()=>{
  const f=fixture();f.sim._objectives.forEach(o=>o.state.owner='us');f.tick();const mission=f.sq._macroMission;assert.equal(mission.intent,'defend');
  for(let i=0;i<10;i++){f.sq._captureZoneDefenseRequest=i%2?{objectiveId:'a',point:{x:100,z:0}}:null;f.tick();}
  assert.strictEqual(f.sq._macroMission,mission);
  assert.equal(f.events.filter(e=>e.type==='decision-macro-replan'&&e.data.reason==='request-changed').length,0);
});
test('Macro OFF from the start: no brief, the Captain walks the assigned approach route',()=>{
  const f=fixture();f.sim.macroCommandEnabled=false;f.town.radius=20;f.sq.targetObjective=null;f.sq.routeIndex=0;f.sq.route=[{x:0,z:0},{x:20,z:30},{x:50,z:0}];
  f.tick();assert.equal(f.sq._macroMission,undefined);assert.equal(f.sq.objective.x,20);
  f.sq.members[0].root.position={x:20,z:30};for(let i=0;i<4;i++)f.tick();
  assert.equal(f.sq.objective.x,50);assert.equal(f.decisions,0);assert.equal(f.r.BattleCommanderAI.missionState(f.sim).wakeCount,0);
});
console.log(`macro-mission-command: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
