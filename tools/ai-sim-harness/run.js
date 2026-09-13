#!/usr/bin/env node
/* Behaviour checks for the engagement pipeline.

   These are the claims the AI pass is supposed to make true, written as assertions a change can
   break: soldiers recognise a target, stop, get down, shoot from a committed stance, and move
   forward only as an ordered bound. Run with:  node tools/ai-sim-harness/run.js  */
'use strict';
const H=require('./harness.js');

let failures=0,checks=0;
function check(name,ok,detail){
  checks++;
  if(ok)console.log('  PASS  '+name);
  else{failures++;console.log('  FAIL  '+name+(detail?'  ('+detail+')':''));}
}
function section(name){console.log('\n== '+name+' ==');}
function rifleman(sq){return sq.members.find(s=>s.role==='rifleman');}
function cover(x,z,type){
  const spec={rock:{radius:1.3,cover:.55,height:.85},hedge:{radius:3.4,cover:.62,height:1.5},wall:{radius:1.6,cover:.5,height:1.05}}[type||'rock'];
  return{x:x,z:z,y:0,radius:spec.radius,cover:spec.cover,height:spec.height,type:type||'rock'};
}
/* Two lone squads facing each other at a set range, with whatever cover the case wants. */
function duel(opts){
  opts=opts||{};
  const root=H.bootstrap(opts);
  const battle=H.makeBattle(root,{obstacles:opts.obstacles||[]});
  const gap=opts.gap==null?70:opts.gap;
  const us=H.addSquad(root,battle,{id:'us-0',faction:'us',x:0,z:-gap/2,objective:{x:0,z:gap/2},facing:0,composition:opts.composition});
  const ge=H.addSquad(root,battle,{id:'ge-0',faction:'ge',x:0,z:gap/2,objective:{x:0,z:-gap/2},facing:Math.PI,composition:opts.composition});
  return{root,battle,us,ge};
}

/* ---------------------------------------------------------------------------------------------- */
section('contact is recognised before it is shot at');
{
  const {root,battle,us}=duel({gap:60});
  const man=rifleman(us);
  let firstOrient=null,firstShot=null;
  const startFired=battle.events.fired;
  H.run(root,battle,4,()=>{
    const e=root.BattleEngagement.stateOf(man);
    if(firstOrient===null&&e.state==='orient')firstOrient=battle.time;
    if(firstShot===null&&battle.events.fired>startFired)firstShot=battle.time;
  });
  check('a rifleman enters orient on contact',firstOrient!==null,'never oriented');
  check('nobody fires on the frame they acquire',firstShot===null||firstOrient===null||firstShot>firstOrient,
    'orient='+firstOrient+' firstShot='+firstShot);
  check('somebody has opened fire within 4s',battle.events.fired>startFired,'shots='+(battle.events.fired-startFired));
}

section('a soldier in the open goes to ground rather than standing');
{
  const {root,battle,us}=duel({gap:120});
  H.run(root,battle,14);
  const down=us.members.filter(s=>!s.dead&&s.target&&(s.prone||s.crouching)).length;
  const engaged=us.members.filter(s=>!s.dead&&s.target).length;
  const standing=us.members.filter(s=>!s.dead&&s.target&&!s.prone&&!s.crouching).length;
  check('men in contact are crouched or prone',engaged>0&&down===engaged,'engaged='+engaged+' down='+down+' standing='+standing);
  const prone=us.members.filter(s=>!s.dead&&s.target&&s.prone).length;
  check('long-range contact puts riflemen prone',prone>0,'prone='+prone);
}

section('cover is used when it is there');
{
  const obstacles=[];
  for(let x=-14;x<=14;x+=7)obstacles.push(cover(x,-24,'hedge'));
  const {root,battle,us}=duel({gap:70,obstacles});
  let reached=0;
  H.run(root,battle,20,()=>{
    us.members.forEach(s=>{
      if(s.dead)return;
      const q=root.BattleObstacleField.coverPotentialAt(battle.obstacles,s.root.position.x,s.root.position.z);
      if(q<=root.BattleEngagement.tuning.USEFUL_COVER)s._reachedCover=true;
    });
  });
  reached=us.members.filter(s=>s._reachedCover).length;
  check('men move into nearby cover',reached>=2,'reached='+reached+' of '+us.members.length);
}

section('a squad in contact stops marching (base of fire)');
{
  /* Covered field at rifle range, so the fight lasts long enough to observe the bound cycle
     instead of both squads wiping each other out in the open. */
  const obstacles=[];
  for(let x=-40;x<=40;x+=7)obstacles.push(cover(x,-46,'hedge'));
  for(let x=-40;x<=40;x+=7)obstacles.push(cover(x,46,'hedge'));
  const {root,battle,us}=duel({gap:130,obstacles});
  H.run(root,battle,3);
  const anchorAtContact={x:us.orderAnchor.x,z:us.orderAnchor.z};
  let boundSeconds=0,contactSeconds=0;
  H.run(root,battle,40,()=>{
    if(us.inContact)contactSeconds+=H.AI_TICK;
    if(battle.time<(us._boundUntil||0))boundSeconds+=H.AI_TICK;
  });
  const anchorMoved=Math.hypot(us.orderAnchor.x-anchorAtContact.x,us.orderAnchor.z-anchorAtContact.z);
  check('the squad spends the fight in contact',contactSeconds>10,'contact seconds='+contactSeconds.toFixed(1));
  check('bounds are authorised at all',boundSeconds>0,'bound seconds=0');
  check('bounds are a fraction of the fight, not the default',boundSeconds<contactSeconds*.6,
    'bound '+boundSeconds.toFixed(1)+'s of '+contactSeconds.toFixed(1)+'s in contact');
  check('the order anchor advances only in steps',anchorMoved<=70,'moved '+anchorMoved.toFixed(1)+'m in '+contactSeconds.toFixed(0)+'s of contact');
}

section('bound authorisation needs a base of fire');
{
  const {root,battle,us}=duel({gap:60});
  H.run(root,battle,3);
  /* Everybody pinned: nobody is left shooting, so nobody is sent forward. */
  us.members.forEach(s=>{s.suppressedUntil=battle.time+30;});
  us._nextBoundAt=battle.time;us._boundUntil=0;
  root.BattleEngagement.updateSquad(us,battle);
  check('a wholly pinned squad is not sent forward',(us._boundUntil||0)<=battle.time,'boundUntil='+us._boundUntil);
  us.members.forEach(s=>{s.suppressedUntil=0;});
  H.run(root,battle,1);
  us._nextBoundAt=battle.time;us._boundUntil=0;
  root.BattleEngagement.updateSquad(us,battle);
  const ordered=us.members.filter(s=>!s.dead&&root.BattleEngagement.stateOf(s).boundOrder).length;
  const holding=us.members.filter(s=>!s.dead&&!root.BattleEngagement.stateOf(s).boundOrder).length;
  check('an unpinned squad bounds one team and holds the rest',(us._boundUntil||0)>battle.time&&ordered>0&&holding>0,
    'boundUntil='+us._boundUntil+' movers='+ordered+' holding='+holding);
  check('the machine gunner is never a mover',us.members.every(s=>s.role!=='gunner'||!root.BattleEngagement.stateOf(s).boundOrder),
    'gunner was ordered to bound');
}

section('suppression pins men flat');
{
  const {root,battle,us}=duel({gap:100});
  H.run(root,battle,3);
  const man=rifleman(us);
  man.suppressedUntil=battle.time+6;
  H.run(root,battle,2);
  const e=root.BattleEngagement.stateOf(man);
  check('a suppressed rifleman in the open is pinned',e.state==='pinned'||man.prone,'state='+e.state+' prone='+man.prone);
  check('a pinned man holds his ground',Math.hypot(man.destination.x-man.root.position.x,man.destination.z-man.root.position.z)<1.5,
    'destination is '+Math.hypot(man.destination.x-man.root.position.x,man.destination.z-man.root.position.z).toFixed(1)+'m away');
}

section('stance does not churn');
{
  const {root,battle,us}=duel({gap:90});
  const man=rifleman(us);
  let last=null,changes=0,movingWithTarget=0,ticksWithTarget=0;
  H.run(root,battle,30,()=>{
    us.members.forEach(s=>{
      if(s.dead||!s.target)return;
      ticksWithTarget++;
      if(s.moving)movingWithTarget++;
    });
    if(man.dead)return;
    const stance=man.prone?'prone':(man.crouching?'crouch':'stand');
    if(stance!==last){last=stance;changes++;}
  });
  check('one man changes stance a handful of times in 30s',changes<=8,'changes='+changes);
  const movingFraction=ticksWithTarget?movingWithTarget/ticksWithTarget:0;
  check('men with a target are mostly stationary',movingFraction<.35,'moving '+(movingFraction*100).toFixed(0)+'% of engaged ticks');
}

section('contact broken is held, not forgotten');
{
  const {root,battle,us,ge}=duel({gap:60});
  H.run(root,battle,3);
  const man=rifleman(us);
  check('has a target after 3s',!!man.target,'no target');
  ge.members.forEach(s=>battle.killSoldier(s));
  H.run(root,battle,1.5);
  const e=root.BattleEngagement.stateOf(man);
  check('loses the target and holds the sector',e.state==='alert','state='+e.state);
  H.run(root,battle,root.BattleEngagement.tuning.ALERT_HOLD+1);
  check('resumes the advance once the sector is clear',root.BattleEngagement.stateOf(man).state==='advance',
    'state='+root.BattleEngagement.stateOf(man).state);
}

section('full fight still resolves');
{
  const obstacles=[];
  for(let x=-60;x<=60;x+=8)obstacles.push(cover(x,-18,'hedge'));
  for(let x=-60;x<=60;x+=8)obstacles.push(cover(x,18,'hedge'));
  for(let i=0;i<40;i++)obstacles.push(cover(-70+i*3.5,(i%7-3)*6,'rock'));
  const {root,battle,us,ge}=duel({gap:90,obstacles});
  H.run(root,battle,180);
  const usAlive=us.members.filter(s=>!s.dead).length,geAlive=ge.members.filter(s=>!s.dead).length;
  check('shots were fired',battle.events.fired>50,'fired='+battle.events.fired);
  check('the firefight produced casualties',battle.events.kills>0,'kills='+battle.events.kills);
  check('it is not a mutual wipe in 3 minutes',usAlive>0||geAlive>0,'us='+usAlive+' ge='+geAlive);
  console.log('        (us '+usAlive+'/10, ge '+geAlive+'/10, '+battle.events.fired+' shots, '+battle.events.hits+' hits, '+battle.events.kills+' killed)');
}

console.log('\n'+(failures?failures+' of '+checks+' checks FAILED':'all '+checks+' checks passed'));
process.exit(failures?1:0);
