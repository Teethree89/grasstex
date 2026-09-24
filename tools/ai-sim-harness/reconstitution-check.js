#!/usr/bin/env node
'use strict';
/* Squad reconstitution (commander-ai.js reconstitute + the Squad Leader's assembly march): retreated squads
   whose survivors reach a full squad are grouped with the fewest squads, marched home and then to the
   centre of their home points, merged under one leader and re-tasked by the General. Runs the shipping
   squad, engagement, resolver, Squad Leader and General code with no enemy on the field. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),H=require('./harness');
function load(r,p){new Function('window','globalThis','console',fs.readFileSync(path.join(H.REPO,p),'utf8'))(r,r,{log(){},warn(){}});}
let n=0;function test(name,fn){fn();n++;console.log('PASS '+name);}

const C_TICK=.45,HOME_Z=-500,FORWARD=150,LANES=[-300,-100,100,300,500];
function world(opts){
  opts=opts||{};H.resetIds();
  const r=H.bootstrap({modules:false}),systems={},events=[];
  r.BattleModules={registerSystem(id,s){systems[id]=s;},getSystem(id){return systems[id];},runHook(){},unitsFor:b=>(b._roster.us||[]).concat(b._roster.ge||[])};
  r.BattleTelemetry={record(type,data){events.push({type,data});}};
  r.BattleSim={start(){}};
  load(r,'battle/commander-doctrine.js');load(r,'battle/commander-routes.js');load(r,'battle/commander-ai.js');
  load(r,'battle/movement-resolver.js');load(r,'battle/modules/16-squad-plan-stability.js');
  const b=H.makeBattle(r);b.macroCommandEnabled=opts.macro!==false;b.scene={metadata:{}};
  return{r,b,leader:systems['squad-command'],events,sq:[]};
}
/* A squad spawned at its lane's home, walked `forward` metres out (default 150), then cut down to
   `alive` men. `keep` picks which roles survive (default: the leader first, then riflemen). */
function squad(w,lane,alive,keep,forward){
  const q=H.addSquad(w.r,w.b,{id:'us-'+lane,faction:'us',x:LANES[lane],z:HOME_Z,objective:{x:LANES[lane],z:0}});
  q.route=[];q.commandRole='center';
  q.members.forEach(s=>{s.root.position.z+=forward==null?FORWARD:forward;s.destination={x:s.root.position.x,z:s.root.position.z};});
  const order=keep||['sergeant','rifleman','rifleman','rifleman','rifleman','rifleman','rifleman','scout','scout','gunner'];
  const survivors=[];order.forEach(role=>{const s=q.members.find(m=>m.role===role&&!survivors.includes(m));if(s&&survivors.length<alive)survivors.push(s);});
  q.members.forEach(s=>{if(!survivors.includes(s))w.b.killSoldier(s,null);});
  w.sq.push(q);return q;
}
function run(w,seconds,onTick){
  const C=w.r.BattleCommanderAI;let acc=0;
  H.run(w.r,w.b,seconds,function(b){acc+=H.AI_TICK;if(acc>=C.commandTick-1e-9){acc=0;C.update(b,null,C.commandTick);w.leader.onCommanderTick(b,{town:null});}if(onTick)onTick(b);});
}
const living=q=>q.members.filter(s=>!s.dead);
const recon=w=>w.r.BattleCommanderAI.missionState(w.b).reconstitution||{active:[],ended:[],merges:0,groupsFormed:0,groupsDissolved:0,promotions:0};
function invariants(w,expectAlive){
  const seen=new Set();
  w.b.factions.us.squads.forEach(q=>q.members.forEach(s=>{assert.ok(!seen.has(s.id)||s.dead,'soldier '+s.id+' is in two squads');seen.add(s.id);}));
  w.b._roster.us.filter(s=>!s.dead).forEach(s=>assert.ok(s.squad.members.includes(s),'living soldier '+s.id+' belongs to his own squad'));
  assert.equal(w.b.factions.us.alive,expectAlive,'merging never changes the side\'s alive count');
}
/* Run until the General has planned a group; returns it with every grouped squad's distance from home
   at that moment. */
function untilGrouped(w,limit){
  let seen=null;
  for(let t=0;t<limit&&!seen;t+=C_TICK)run(w,C_TICK,()=>{const g=recon(w).active[0];if(g&&!seen)seen={group:g,time:w.b.time,homeDist:g.squads.map(id=>{const q=w.sq.find(x=>x.id===id),p=w.r.BattleCommanderDoctrine.avgPos(q);return Math.hypot(p.x-q.home.x,p.z-q.home.z);}),atBase:g.squads.map(id=>w.sq.find(x=>x.id===id)._assembly.phase)};});
  assert.ok(seen,'no group planned within '+limit+'s');return seen;
}
function merged(w){const m=w.b.factions.us.squads.filter(q=>q.reconstitutedFrom);assert.equal(m.length,1,'exactly one re-formed squad');return m[0];}

test('three squads of four merge into one squad of twelve under one leader',()=>{
  const w=world();[0,1,2].forEach(l=>squad(w,l,4));
  let homeFirst=true;
  run(w,420,b=>w.sq.forEach(q=>{if(q._assembly&&q._assembly.phase==='to-rally'&&!q._sawRally){q._sawRally=true;const p=w.r.BattleCommanderDoctrine.avgPos(q);if(Math.abs(p.z-HOME_Z)>20)homeFirst=false;}}));
  const st=recon(w),q=merged(w);
  assert.equal(st.groupsFormed,1);assert.equal(st.merges,1);
  assert.ok(homeFirst,'no squad turned for the rally point before it was home');
  assert.equal(living(q).length,12);assert.equal(q.members.length,12,'the re-formed squad carries only living men');
  assert.equal(living(q).filter(s=>w.r.SquadAI.isLeader(s)).length,1,'exactly one leader');
  assert.equal(q.state==='retreat',false,'the re-formed squad is no longer retreating');
  const mergeAt=w.events.findIndex(e=>e.type==='decision-squad-merge'),next=w.events.slice(mergeAt).find(e=>e.type==='decision-mission-issued'&&e.data.squad===q.id);
  assert.ok(next&&next.data.reason==='squad-reconstituted'&&next.data.intent!=='reconstitute','the General re-tasked it straight after the merge');
  assert.ok(['issued','executing'].includes(q._macroMission.status));
  const others=w.sq.filter(x=>x!==q);assert.ok(others.every(x=>x.disbanded&&x.members.length===0&&x.mergedInto===q.id));
  invariants(w,12);
  const ev=w.events.map(e=>e.type);assert.ok(ev.includes('decision-reconstitute-group')&&ev.includes('decision-squad-merge'));
});
test('no group is planned until every squad in it is home and out of contact',()=>{
  const w=world();squad(w,0,4,null,40);squad(w,1,4,null,150);squad(w,2,4,null,420);
  const home=[];let grouped=null;
  run(w,420,b=>{w.sq.forEach((q,i)=>{if(!home[i]&&q._assembly&&q._assembly.phase!=='to-base')home[i]=b.time;});if(!grouped&&recon(w).active.length)grouped=b.time;});
  assert.ok(grouped,'a group was planned');
  assert.ok(home.every(t=>t<=grouped),'planned at '+grouped+'s, squads home at '+home.map(t=>t.toFixed(1)).join('/'));
  assert.ok(grouped-Math.min(...home)>60,'the near squads waited for the far one instead of being planned on the way');
  assert.equal(recon(w).groupsDissolved,0);merged(w);
});
test('the General rallies the group on the approach to its next objective and sends it there',()=>{
  const w=world();w.b._objectives=[{id:'church',def:{x:-40,z:0,radius:30,value:1},state:{owner:'ge'}}];
  [0,1,2].forEach(l=>squad(w,l,4));const seen=untilGrouped(w,120),g=seen.group;
  assert.equal(g.objectiveId,'church');
  assert.deepEqual(g.rally,{x:-40,z:HOME_Z+30},'on the spawn line, straight back from the objective, 30 m ahead');
  w.sq.forEach(q=>{assert.equal(q._macroMission.plannedObjectiveId,'church');assert.equal(q.targetObjective,null,'a retreating squad is never counted at the objective');});
  run(w,300);
  const q=merged(w),mergeAt=w.events.findIndex(e=>e.type==='decision-squad-merge'),next=w.events.slice(mergeAt).find(e=>e.type==='decision-mission-issued'&&e.data.squad===q.id);
  assert.equal(next.data.objectiveId,'church','the merged squad goes for the objective it rallied for');
  assert.equal(next.data.intent,'capture');
});
test('a rally point for a distant objective stays inside the side\'s lanes',()=>{
  const w=world();w.b._objectives=[{id:'far',def:{x:900,z:0,radius:30,value:1},state:{owner:'ge'}}];
  [0,1,2].forEach(l=>squad(w,l,4));const g=untilGrouped(w,120).group;
  assert.deepEqual(g.rally,{x:LANES[2],z:HOME_Z+30});
});
test('four squads of three merge into twelve',()=>{
  const w=world();[0,1,2,3].forEach(l=>squad(w,l,3));run(w,480);
  const q=merged(w);assert.equal(living(q).length,12);assert.equal(q.reconstitutedFrom.length,4);invariants(w,12);
});
test('eight survivors wait; a third retreating squad completes the group',()=>{
  const w=world();[0,1].forEach(l=>squad(w,l,4));run(w,200);
  assert.equal(recon(w).groupsFormed,0,'8 survivors never form a group');
  assert.ok(w.sq.every(q=>q.state==='retreat'&&!q.disbanded));
  squad(w,2,2);run(w,300);
  const q=merged(w);assert.equal(living(q).length,10);invariants(w,10);
});
test('a pool of five threes groups the four strongest; the fifth keeps waiting',()=>{
  const w=world();[0,1,2,3,4].forEach(l=>squad(w,l,3));const seen=untilGrouped(w,120);
  const st=recon(w);assert.equal(st.groupsFormed,1);assert.equal(st.active[0].squads.length,4);
  assert.ok(seen.homeDist.every(d=>d<=20)&&seen.atBase.every(p=>p==='at-base'||p==='to-rally'),'grouped at base: '+JSON.stringify(seen));
  assert.equal(st.active[0].rally.x,(LANES[0]+LANES[1]+LANES[2]+LANES[3])/4,'rally at the centre of the grouped home points');
  run(w,480);
  const q=merged(w),left=w.sq.filter(x=>!x.disbanded&&x!==q);
  assert.equal(living(q).length,12);assert.equal(left.length,1);assert.equal(left[0].state,'retreat');assert.ok(!left[0]._reconGroup);
  invariants(w,15);
});
test('the most senior leader takes command: a sergeant outranks a rifleman who stepped up',()=>{
  const w=world(),noLead=['rifleman','rifleman','rifleman','scout','gunner'];
  squad(w,0,4,noLead);squad(w,1,4,noLead);const c=squad(w,2,3);run(w,420);
  const q=merged(w),cap=c.members.find(s=>s.role==='sergeant');
  assert.equal(q,c,'the squad with a living leader keeps its identity');assert.equal(q.leaderId,cap.id);
  assert.equal(recon(w).promotions,0);invariants(w,11);
});
test('with every leader dead each squad\'s successor steps up and the merge keeps one of them',()=>{
  const w=world(),keep=['gunner','scout','rifleman','rifleman'];[0,1,2].forEach(l=>squad(w,l,4,keep).accuracyMultiplier=.8);run(w,420);
  const q=merged(w),lead=q.members.find(s=>s.id===q.leaderId);
  assert.equal(lead.role,'rifleman');assert.equal(recon(w).promotions,0,'successors already lead; the merge promotes nobody');
  assert.equal(w.events.filter(e=>e.type==='decision-leader-succession').length,3);
  assert.equal(q.accuracyMultiplier,1,'the leaderless accuracy penalty ends once someone leads');
  assert.equal(lead.slotIndex,0);assert.equal(q.members.filter(s=>s.role==='gunner'&&!s.slotRole).length,1,'one gun keeps the gunner slot');
  assert.ok(q.members.filter(s=>s.role==='gunner').every(s=>s===q.members.find(m=>m.slotIndex===1)||s.slotRole==='rifleman'));
  invariants(w,12);
});
test('a group that falls below strength dissolves back to the pool',()=>{
  const w=world();[0,1,2].forEach(l=>squad(w,l,4));untilGrouped(w,120);
  assert.equal(recon(w).active.length,1);
  living(w.sq[2]).slice(0,3).forEach(s=>w.b.killSoldier(s,null));run(w,300);
  const st=recon(w);assert.equal(st.groupsDissolved,1);assert.equal(st.merges,0);assert.equal(st.active.length,0);
  assert.ok(w.sq.every(q=>!q.disbanded&&!q._reconGroup&&q.state==='retreat'));
  assert.ok(w.sq.every(q=>!q._macroMission||q._macroMission.status==='failed'));invariants(w,9);
});
test('a re-formed squad holds together and retreats again only at 60% of full strength',()=>{
  const w=world();[0,1,2].forEach(l=>squad(w,l,4));run(w,420);
  const q=merged(w);let retreated=false;run(w,30,()=>{if(q.state==='retreat')retreated=true;});
  assert.equal(retreated,false,'no re-retreat without new casualties');
  living(q).filter(s=>!w.r.SquadAI.isLeader(s)).slice(0,7).forEach(s=>w.b.killSoldier(s,null));run(w,1);
  assert.notEqual(q.state,'retreat','5 of 10 left');
  living(q).filter(s=>!w.r.SquadAI.isLeader(s)).slice(0,1).forEach(s=>w.b.killSoldier(s,null));run(w,1);
  assert.equal(q.state,'retreat','4 of 10 left');
});
test('Macro OFF: no General, no reconstitution',()=>{
  const w=world({macro:false});[0,1,2].forEach(l=>squad(w,l,4));run(w,300);
  assert.equal(recon(w).groupsFormed,0);assert.ok(w.sq.every(q=>!q.disbanded));
});
test('the same battle reconstitutes identically',()=>{
  function trace(){const w=world();[0,1,2].forEach(l=>squad(w,l,4));run(w,420);return JSON.stringify(w.events.filter(e=>/reconstitute|merge|promoted|assembly/.test(e.type)));}
  assert.equal(trace(),trace());
});
console.log(n+' reconstitution checks passed');
