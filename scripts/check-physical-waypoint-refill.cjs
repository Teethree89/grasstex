#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const REPO=path.resolve(__dirname,'..');
const quiet={log(){},warn(){},error(){}};
function load(root,rel){const c=fs.readFileSync(path.join(REPO,rel),'utf8');new Function('window','globalThis','console','BABYLON',c+'\n//# sourceURL='+rel)(root,root,quiet,root.BABYLON);}
const r={console:quiet};r.window=r;
r.BABYLON={Color3:function(){},MeshBuilder:{CreateLines:()=>({dispose(){}}),CreateSphere:()=>({position:{set(){}},dispose(){}})},StandardMaterial:function(){}};
r.BattleModules={systems:{},registerSystem(id,s){s.id=id;this.systems[id]=s;},getSystem(id){return this.systems[id];},listSystems(){return Object.values(this.systems);}};
load(r,'battle/battle-navigation.js');
load(r,'battle/modules/39-navigation-physicality-debug.js');
const N=r.BattleNavigation,scenario={buildings:[]};
N.installScenario(scenario);
const sim={time:0,heightAt:()=>0,obstacles:[],_roster:{us:[],ge:[]},scene:{metadata:{battleScenario:scenario}}};
r.BattleModules.getSystem('navigation-physicality-debug').onBattleStart(sim);
const soldier={id:'refill-probe',root:{position:{x:0,y:0,z:0}}},goal={x:0,z:180};
let waypoint=N.nextWaypoint(sim,soldier,goal),plan=soldier._physicalPath;
assert(plan&&plan.points.length>=4,'initial rolling plan should contain a useful lookahead queue');
const pointsArray=plan.points;
let observedRefill=false;
for(let i=0;i<4;i++){
  soldier.root.position.x=waypoint.x;soldier.root.position.z=waypoint.z;sim.time+=.15;
  const beforeCount=plan.points.length;
  waypoint=N.nextWaypoint(sim,soldier,goal);
  assert.strictEqual(soldier._physicalPath,plan,'low queue must be refilled without replacing the physical plan');
  assert.strictEqual(plan.points,pointsArray,'refill must extend the committed queue in place');
  if(beforeCount<=3&&plan.points.length>beforeCount)observedRefill=true;
}
assert(observedRefill,'probe should exercise the low-queue refill path');
assert.equal(plan.finalGoalX,goal.x);assert.equal(plan.finalGoalZ,goal.z);
console.log('PASS: low rolling waypoint queues refill in place without a full physical replan');
