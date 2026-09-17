#!/usr/bin/env node
/* Movement recovery episode + goal-ownership regressions on the shipping code.
 *
 * Covers the v128 recovery-layer findings: episode state machine, goal-change resets,
 * route-progress awareness, combat/avoidance grace, tightened unreachable criteria,
 * kind-aware candidate suppression, tactical ownership boundaries, bound preservation
 * across target flicker, retreat override, and cover hysteresis.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
let checks=0;
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
function test(name,f){H.resetIds();f();checks++;console.log('PASS '+name);}
/* Resolver + progress only: no engagement states, no tactical route. */
function bareFixture(){
  const r=H.bootstrap({modules:false});
  r.BattleModules={registerSystem(){},unitsFor:b=>b._roster.us.concat(b._roster.ge)};
  load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/44-assault-forward-guard.js');
  load(r,'battle/modules/52-survival-tactical-route.js');
  const b=H.makeBattle(r);
  const q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman']});
  q.state='engaged';q.commandPhase='assault';q.inContact=true;
  const s=q.members[0];
  s.root.position.x=0;s.root.position.z=0;s.destination={x:0,z:0};
  s.target={id:99,dead:false,root:{position:{x:0,y:0,z:100}}};
  s.eng=r.BattleEngagement.stateOf(s);s.eng.state='bound';
  s.eng.cover={x:0,z:10,quality:.5,distance:10};s.eng.until=100;
  return{r,b,q,s,M:r.BattleMovementResolver,P:r.BattleMovementProgress};
}
function holdStill(s,x,z){s.root.position.x=x;s.root.position.z=z;}
function mpStats(b){return b._movementProgressStats||{stuckDetections:0,recoveryAttempts:0,routeRebuilds:0,alternateApproaches:0,unreachableFlags:0,candidatesSuppressed:0,candidateChecks:0,failuresRecorded:0,failuresClearedOnArrival:0};}
function tickCombat(M,s,b,pt,kind){
  M.proposeCombat(s,pt,b,kind||'cover-bound');M.resolve(s,b);
}

test('goal change resets old stuck evidence',()=>{
  const{b,s,M,P}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:0,z:20});
  for(let i=0;i<8;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});} // 4s of no progress: suspected, not yet confirmed
  assert.equal(mpStats(b).recoveryAttempts,0);
  tickCombat(M,s,b,{x:40,z:20}); // genuine authoritative goal change
  const st=s._movementProgress;
  assert.deepEqual(st.goal,{x:40,z:20});
  assert.equal(st.confirmCount,0);assert.equal(st.stuck,false);assert.equal(st.recoveries,0);
  for(let i=0;i<8;i++){b.time+=.5;tickCombat(M,s,b,{x:40,z:20});}
  assert.equal(mpStats(b).recoveryAttempts,0);
  assert.ok(P&&typeof P.observe==='function');
});

test('owner/kind change resets the episode even when the point barely moves',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:0,z:20});
  for(let i=0;i<8;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});}
  // A different owner taking over the same area starts a fresh episode.
  b.time+=.5;
  M.proposeCombat(s,{x:0.5,z:20.3},b,'cover-bound',undefined,{source:'combat-urgency',reason:'suppressed cover move'});
  M.resolve(s,b);
  assert.equal(s._movementResolver.last.kind,'cover-bound');
  assert.equal(s._movementProgress.goalSince,b.time);
  assert.equal(s._movementProgress.confirmCount,0);
  // A hold takes over: nothing to track, so old stuck evidence is dropped entirely.
  s.eng.state='engage'; // bound commitment ends: the old cover-bound is no longer valid
  b.time+=.5;
  M.proposeCombat(s,{x:0.5,z:20.3},b,'hold');M.resolve(s,b);
  assert.equal(s._movementResolver.last.kind,'hold');
  assert.equal(s._movementProgress.goal,null);
  assert.equal(s._movementProgress.confirmCount,0);
  assert.equal(s._movementProgress.stuck,false);
});

test('curved-route odometer progress does not trigger false stuck',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:30,z:0});
  // Walk a small circle far from the goal: net displacement stays tiny, odometer grows.
  for(let i=0;i<40;i++){
    b.time+=.5;
    const a=i/40*Math.PI*2*3;
    holdStill(s,Math.cos(a)*0.5,Math.sin(a)*0.5);
    tickCombat(M,s,b,{x:30,z:0});
  }
  assert.equal(s._movementProgress.stuck,false);
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
});

test('waypoint advancement excuses low Euclidean net progress',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:30,z:0});
  const steps=[];for(let i=0;i<60;i++)steps.push({x:i,z:0});
  s._tacticalRoute={kind:'cover-bound',owner:'engagement',intent:{x:30,z:0},steps:steps,index:0,createdAt:0};
  for(let i=0;i<40;i++){
    b.time+=.5;
    holdStill(s,Math.sin(i)*0.1,Math.cos(i*0.7)*0.1); // shuffles in place: net and odometer tiny
    if(s._tacticalRoute.index<steps.length-1)s._tacticalRoute.index++; // but waypoints advance
    tickCombat(M,s,b,{x:30,z:0});
  }
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
  delete s._tacticalRoute;
});

test('legitimate combat hold and suppression never trigger recovery',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);
  for(let i=0;i<40;i++){b.time+=.5;M.proposeCombat(s,{x:0,z:0},b,'hold');M.resolve(s,b);}
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
  // Suppressed soldier told to reach cover: the suppression pause is not stuckness.
  s.suppressedUntil=b.time+1000;
  for(let i=0;i<40;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});}
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
  s.suppressedUntil=0;
});

test('contact-reaction at the current position never counts as stuck',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);
  for(let i=0;i<40;i++){b.time+=.5;M.proposeCombat(s,{x:0,z:0},b,'contact-reaction');M.resolve(s,b);}
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
});

test('local avoidance gets grace, then normal detection resumes',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:0,z:20});
  s._movementYieldUntil=b.time+1000; // choke yield / separation push active
  for(let i=0;i<40;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});}
  assert.equal(mpStats(b).stuckDetections,0);
  assert.equal(mpStats(b).recoveryAttempts,0);
  s._movementYieldUntil=0;
  for(let i=0;i<60;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});}
  assert.ok(mpStats(b).routeRebuilds>=1);
});

test('one poor window never escalates; full episode stages fire exactly once',()=>{
  const{b,s,M}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:0,z:20});
  for(let i=0;i<12;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});} // single 6s window: suspected only
  assert.equal(mpStats(b).recoveryAttempts,0);
  assert.ok(!s._movementGoalUnreachable);
  for(let i=0;i<68;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});} // full 40s episode
  assert.equal(mpStats(b).routeRebuilds,1);
  assert.equal(mpStats(b).alternateApproaches,1);
  assert.equal(mpStats(b).recoveryAttempts,2);
  assert.equal(mpStats(b).unreachableFlags,1);
  assert.equal(s._movementGoalUnreachable,true);
  for(let i=0;i<20;i++){b.time+=.5;tickCombat(M,s,b,{x:0,z:20});} // no per-window repeats
  assert.equal(mpStats(b).recoveryAttempts,2);
  assert.equal(mpStats(b).unreachableFlags,1);
});

test('formation stalls rebuild without recording suppressible candidates',()=>{
  const{b,s,M,P}=bareFixture();
  M.proposeOrder(s,{x:0,z:50},b,true); // far formation slot, but the soldier never moves
  for(let i=0;i<80;i++){b.time+=.5;holdStill(s,0,0);M.resolve(s,b);} // pure formation intent, no movement
  assert.ok(mpStats(b).routeRebuilds>=1);
  assert.equal(mpStats(b).failuresRecorded,0); // nothing to suppress: no alternate exists
  assert.equal(P.candidateAllowed(s,b,{x:0,z:100}),true);
});

test('gated stalls record one failure and the candidate stays suppressed until expiry',()=>{
  const{b,s,P}=bareFixture();
  const bad={x:5,z:5},far={x:50,z:50};
  assert.equal(P.candidateAllowed(s,b,bad),true);
  P.noteFailure(s,b,bad,'no-progress');
  assert.equal(mpStats(b).failuresRecorded,1);
  assert.equal(P.candidateAllowed(s,b,bad),false);
  assert.equal(mpStats(b).candidatesSuppressed,1);
  assert.equal(P.candidateAllowed(s,b,far),true);
  b.time+=13;assert.equal(P.candidateAllowed(s,b,bad),true);
});

test('gated re-proposals of a suppressed goal retain the incumbent',()=>{
  const{b,s,M,P}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);
  tickCombat(M,s,b,{x:0,z:10}); // committed bound
  const committed={x:s.destination.x,z:s.destination.z};
  P.noteFailure(s,b,{x:0,z:10},'no-progress');
  M.proposeCombat(s,{x:0,z:10},b,'cover-bound');M.resolve(s,b); // same suppressed point
  assert.deepEqual(s.destination,committed);
  M.proposeCombat(s,{x:8,z:9},b,'cover-bound');M.resolve(s,b); // genuine alternate accepted
  assert.deepEqual(s.destination,{x:8,z:9});
});

test('movement-progress never writes destinations itself',()=>{
  const{b,s,M,P}=bareFixture();
  M.proposeOrder(s,{x:0,z:0},b,true);tickCombat(M,s,b,{x:0,z:20});
  const before={x:s.destination.x,z:s.destination.z};
  for(let i=0;i<50;i++){b.time+=.5;P.observe(s,b,{x:0,z:20},{owner:'engagement',kind:'cover-bound'});}
  assert.deepEqual(s.destination,before);
});

/* Engagement ownership: bound locomotion vs aim tracking. */
function engageFixture(){
  const r=H.bootstrap({modules:false});
  r.BattleModules={registerSystem(){},unitsFor:b=>b._roster.us.concat(b._roster.ge)};
  load(r,'battle/battle-navigation.js');load(r,'battle/movement-resolver.js');
  load(r,'battle/modules/44-assault-forward-guard.js');
  load(r,'battle/modules/52-survival-tactical-route.js');
  const b=H.makeBattle(r);
  b.obstacles=[];
  const q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:50},composition:['rifleman']});
  q.state='engaged';q.commandPhase='assault';q.inContact=true;q._assaultAuthorized=true;
  const s=q.members[0];
  s.root.position.x=0;s.root.position.z=0;s.destination={x:0,z:0};
  return{r,b,q,s,M:r.BattleMovementResolver,E:r.BattleEngagement};
}
function enemyAt(x,z){return{id:99,hp:100,dead:false,root:{position:{x:x,y:0,z:z}}};}
function lastKind(s){return s._movementResolver&&s._movementResolver.last&&s._movementResolver.last.kind;}

test('brief target loss preserves a committed assault rush',()=>{
  const{b,q,s,M,E}=engageFixture();
  const e=E.stateOf(s);
  e.state='assault';e.since=b.time;e.until=b.time+30;e.assaultGoal={x:0,z:20};
  s.target=enemyAt(0,40);
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(e.state,'assault');assert.equal(lastKind(s),'assault-rush');
  const goal={x:s.destination.x,z:s.destination.z};
  s.target=null; // sight flickers for a beat
  for(let i=0;i<6;i++){b.time+=.15;E.updateSoldier(s,b);M.resolve(s,b);}
  assert.equal(e.state,'assault');
  assert.equal(lastKind(s),'assault-rush');
  assert.deepEqual(s.destination,goal);
  void q;
});

test('sustained disengagement eventually returns authority to formation',()=>{
  const{b,q,s,M,E}=engageFixture();
  const e=E.stateOf(s);
  M.proposeOrder(s,{x:0,z:50},b,false); // Squad Command publishes the standing order once; Engagement never republishes it
  s.target=null;q.contact=null;
  e.state='alert';e.since=b.time;e.until=b.time+2;e.threatSector=null;
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(e.state,'alert'); // holds the sector first: aim tracking, not locomotion
  assert.equal(lastKind(s),'hold');
  b.time+=3; // alert window lapses with nobody to fight
  E.updateSoldier(s,b);
  assert.equal(e.state,'advance');
  b.time+=1; // let the last alert hold expire so formation authority visibly resumes
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(lastKind(s),'formation');
  void q;void M;
});

test('authorized cover bound survives target-loss and reacquisition noise',()=>{
  const{b,q,s,M,E}=engageFixture();
  const e=E.stateOf(s);
  e.state='bound';e.since=b.time;e.until=b.time+30;
  e.cover={x:0,z:10,quality:.5,distance:10};
  s.target=enemyAt(0,40);
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(e.state,'bound');assert.equal(lastKind(s),'cover-bound');
  s.target=null;
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(e.state,'bound');assert.equal(lastKind(s),'cover-bound');
  s.target=enemyAt(5,42); // reacquired elsewhere: still the same committed bound
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(e.state,'bound');assert.equal(lastKind(s),'cover-bound');
  assert.deepEqual({x:e.cover.x,z:e.cover.z},{x:0,z:10});
  void q;
});

test('retreat still overrides a committed bound immediately',()=>{
  const{b,q,s,M,E}=engageFixture();
  const e=E.stateOf(s);
  e.state='bound';e.since=b.time;e.until=b.time+30;
  e.cover={x:0,z:10,quality:.5,distance:10};
  s.target=enemyAt(0,40);
  E.updateSoldier(s,b);M.resolve(s,b);
  assert.equal(lastKind(s),'cover-bound');
  q.state='retreat';
  E.updateSoldier(s,b);
  assert.equal(M.resolve(s,b).kind,'retreat');
});

test('cover hysteresis retains the incumbent, then switches on meaningful gain',()=>{
  const r=H.bootstrap({modules:false});
  const b=H.makeBattle(r);
  const obA={x:4,z:6,y:0,radius:1.2,cover:.5,height:2,type:'rock'};
  const obB={x:2,z:4,y:0,radius:1.2,cover:.5,height:2,type:'rock'};
  b.obstacles=[obA,obB];b.time=0;
  const threat=enemyAt(0,100);
  const s={id:0,faction:'us',role:'rifleman',slotIndex:2,speed:2.9,
    root:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0}},destination:{x:0,z:0},
    squad:{id:'us-0',faction:'us'},target:threat,suppressedUntil:0};
  const E=r.BattleEngagement,e=E.stateOf(s);
  e.state='bound';
  const first=E.findCover(s,b,{threat:threat});
  assert.ok(first&&isFinite(first.x));
  e.cover={x:first.x,z:first.z,quality:first.quality};
  // obB's point is strictly better but within the +4 hysteresis band: incumbent retained.
  const retained=E.findCover(s,b,{threat:threat});
  assert.ok(Math.abs(retained.x-e.cover.x)<1e-9&&Math.abs(retained.z-e.cover.z)<1e-9);
  // A meaningfully better candidate (big close hard cover) displaces it.
  const obC={x:1,z:3,y:0,radius:2.5,cover:.2,height:2.5,type:'rock'};
  b.obstacles.push(obC);
  const switched=E.findCover(s,b,{threat:threat});
  assert.equal(switched.obstacle,obC);
});

test('identical fireteam slots are proposed once, not every squad tick',()=>{
  const r=H.bootstrap(); // full squad modules, as in the live game
  load(r,'battle/movement-resolver.js');
  const b=H.makeBattle(r);
  const q=H.addSquad(r,b,{id:'us-0',faction:'us',x:0,z:0,objective:{x:0,z:100},composition:['rifleman','rifleman']});
  q.state='engaged';q.commandPhase='assault';q.inContact=false;
  const req=()=>((b._movementGoalStats&&b._movementGoalStats.requests)||0);
  r.SquadAI.updateSquad(q,b);
  const afterFirst=req();
  assert.ok(afterFirst>0);
  // Nothing changed: no layer may re-propose a full second set per member. Growth per
  // identical update stays bounded by one refresh set, and settles to zero.
  r.SquadAI.updateSquad(q,b);
  assert.ok(req()-afterFirst<=2);
  r.SquadAI.updateSquad(q,b);
  assert.ok(req()-afterFirst<=2);
  const beforeChange=req();
  q.objective={x:60,z:120}; // genuine intent change proposes again
  r.SquadAI.updateSquad(q,b);
  assert.ok(req()-beforeChange>=4);
  // And the slots are still correct destinations.
  for(const m of q.members)assert.deepEqual(m.orderDestination,m._fireteamDestination);
});

console.log('All '+checks+' movement-recovery checks passed.');
