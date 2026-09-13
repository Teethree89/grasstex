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

section('a squad shares one contact');
{
  const {root,battle,us,ge}=duel({gap:60});
  H.run(root,battle,3);
  const c=root.SquadAI.squadContact(us,battle);
  check('the squad records a last known enemy position',!!c,'no shared contact');
  if(c){
    const nearest=ge.members.reduce((best,s)=>{
      const d=Math.hypot(s.root.position.x-c.x,s.root.position.z-c.z);
      return best===null||d<best?d:best;},null);
    check('the recorded position is where an enemy actually is',nearest<6,'nearest enemy is '+nearest.toFixed(1)+'m from the record');
    check('it names the man who saw them',us.members.some(m=>m.id===c.seenBy),'seenBy='+c.seenBy);
  }
  /* Intel expires rather than being believed forever. */
  battle.time+=root.SquadAI.CONTACT_MEMORY+1;
  check('intel goes stale',!root.SquadAI.squadContact(us,battle),'contact survived '+root.SquadAI.CONTACT_MEMORY+'s');
}

section('a shared contact pre-warns the rest of the squad');
{
  const {root,battle,us}=duel({gap:60});
  const man=rifleman(us);
  const base=root.BattleEngagement.reactTime(man,battle);
  us.contact={unit:{dead:false},x:0,z:30,at:battle.time,seenBy:999,stance:'stand'};
  const warned=root.BattleEngagement.reactTime(man,battle);
  check('a man whose squad called the contact reacts faster',warned<base,'base='+base.toFixed(2)+'s warned='+warned.toFixed(2)+'s');
  us.contact={unit:{dead:false},x:0,z:30,at:battle.time,seenBy:man.id,stance:'stand'};
  check('the man who found them gets no head start',root.BattleEngagement.reactTime(man,battle)===base,
    'own sighting shortened his own reaction');
}

section('men without a target suppress the position the squad knows about');
{
  const {root,battle,us}=duel({gap:60});
  H.run(root,battle,3);
  const before=battle.events.suppressiveShots;
  /* Nobody can see anyone any more, but the squad still knows where they were. */
  us.members.forEach(s=>{s.target=null;s._scanAt=battle.time+999;});
  H.run(root,battle,6);
  check('suppressing fire goes out with nobody in sight',battle.events.suppressiveShots>before,
    'suppressive shots='+(battle.events.suppressiveShots-before));
  check('it reaches men near the aimed position',battle.events.suppressed>0,'nobody was suppressed');
  check('at most '+root.BattleEngagement.tuning.MAX_SUPPRESSORS+' men suppress at once',
    (us.suppressorCount||0)<=root.BattleEngagement.tuning.MAX_SUPPRESSORS,'suppressors='+us.suppressorCount);
}

section('the machine gun gets the suppression job first');
{
  /* Assignment tested directly: after a lethal 10-v-10 the gunner may be dead or pinned, which
     says nothing about the preference order. */
  const {root,battle,us}=duel({gap:60});
  H.run(root,battle,2);
  const alive=us.members.filter(s=>!s.dead);
  alive.forEach(s=>{s.target=null;s.suppressedUntil=0;root.BattleEngagement.stateOf(s).state='alert';});
  us.contact={unit:{dead:false,root:{position:{x:0,z:28}}},x:0,z:28,at:battle.time,seenBy:999,stance:'stand'};
  const chosen=root.BattleEngagement.assignSuppressors(us,battle,us.members);
  const gunner=alive.find(s=>s.role==='gunner');
  check('somebody is given the job',chosen>0,'nobody assigned');
  check('the machine gun is first in line',!gunner||root.BattleEngagement.stateOf(gunner).suppressOrder,
    'gunner not assigned; assigned were '+alive.filter(s=>root.BattleEngagement.stateOf(s).suppressOrder).map(s=>s.role).join(','));
  check('a man out of reach is left alone',(()=>{
    alive.forEach(s=>{root.BattleEngagement.stateOf(s).suppressOrder=false;});
    us.contact={unit:{dead:false,root:{position:{x:0,z:400}}},x:0,z:400,at:battle.time,seenBy:999,stance:'stand'};
    return root.BattleEngagement.assignSuppressors(us,battle,us.members)===0;
  })(),'men were told to suppress a position 400m away');
}

section('suppressing fire pins but does not kill through cover');
{
  const {root,battle,us,ge}=duel({gap:60});
  H.run(root,battle,2);
  const man=rifleman(us),victim=ge.members.find(s=>!s.dead);
  man.target=null;man.fireCooldown=0;man.moving=false;man.moveSpeed=0;
  const point={x:victim.root.position.x,z:victim.root.position.z};
  const hpBefore=victim.hp,killsBefore=battle.events.kills;
  const reached=root.SquadAI.areaFire(man,point,battle);
  check('rounds on the position pin whoever is there',reached>0&&victim.suppressedUntil>battle.time,
    'reached='+reached+' suppressedUntil='+victim.suppressedUntil.toFixed(1)+' now='+battle.time.toFixed(1));
  check('and do no damage',victim.hp===hpBefore&&battle.events.kills===killsBefore,
    'hp '+hpBefore+' -> '+victim.hp+', kills +'+(battle.events.kills-killsBefore));
  check('it costs a shot like any other',man.fireCooldown>0,'no cooldown applied');
}

section('suppressing fire needs a shot at the position');
{
  /* A bank of tall cover right in front of the firing line: he cannot put a round on the spot. */
  const obstacles=[];
  for(let x=-30;x<=30;x+=4)obstacles.push({x:x,z:-20,y:0,radius:4,cover:.35,height:6,type:'bank'});
  const {root,battle,us}=duel({gap:60,obstacles});
  us.contact={unit:{dead:false},x:0,z:30,at:battle.time,seenBy:999,stance:'stand'};
  const man=rifleman(us);
  man.target=null;man.fireCooldown=0;
  man.root.rotation.y=Math.atan2(0-man.root.position.x,30-man.root.position.z);
  const before=battle.events.suppressiveShots;
  root.SquadAI.areaFire(man,{x:0,z:30},battle);
  check('a soldier will not fire into a hill',battle.events.suppressiveShots===before,'he fired anyway');
}

section('the firing line holds while the contact is current');
{
  const {root,battle,us}=duel({gap:60});
  H.run(root,battle,3);
  us.members.forEach(s=>{s.target=null;s._scanAt=battle.time+999;});
  H.run(root,battle,root.BattleEngagement.tuning.ALERT_HOLD+2);
  const suppressors=us.members.filter(s=>!s.dead&&root.BattleEngagement.stateOf(s).suppressOrder);
  check('a suppressor does not wander off when the alert timer lapses',
    suppressors.every(s=>root.BattleEngagement.stateOf(s).state==='alert'),
    'states: '+suppressors.map(s=>root.BattleEngagement.stateOf(s).state).join(','));
  /* Once the intel is stale everyone goes back to the advance. */
  us.contact=null;
  H.run(root,battle,root.BattleEngagement.tuning.ALERT_HOLD+2);
  const advancing=us.members.filter(s=>!s.dead&&root.BattleEngagement.stateOf(s).state==='advance').length;
  const alive=us.members.filter(s=>!s.dead).length;
  check('stale intel releases the squad',advancing===alive,advancing+' of '+alive+' resumed the advance');
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
