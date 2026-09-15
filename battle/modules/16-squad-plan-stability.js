/* M3C meso-level squad-command owner.
   Macro command says what the squad must achieve; this module is the Captain layer that turns that
   intent into one stable squad/fireteam plan. It owns:

     - one tactical command lease (`_engagementPlan`),
     - one cohesion/regroup state,
     - one set of committed fireteam slots,
     - bounded route/objective recovery.

   It does NOT choose soldier cover, stance, physical paths or soldier.destination. Those are micro
   responsibilities. Contact may change micro combat behaviour without silently rewriting the meso
   formation plan. */
(function(root){
'use strict';
if(!root.BattleModules||!root.SquadAI||!root.BattleCommanderAI||root.BattleSquadStability)return;

var oldUpdateSquad=root.SquadAI.updateSquad;
var ASSAULT_LEASE=26,DEFENSE_LEASE=38,QUIET_CLOSE=9,TEAM_LEASE=12;
var REGROUP_ENTER=1.35,REGROUP_RELEASE=.78,REGROUP_MIN=2.4,REGROUP_MAX=18,REGROUP_BYPASS=14,REENTRY=4;
var STRAGGLER_BYPASS=2.8,RECOVERY_COOLDOWN=8,URBAN_ARRIVAL_COHESION=.5;
var TACTICAL={contact:1,assault:1,flank:1,capture:1,defend:1,hold:1,'support-hold':1,'clear-town':1};
var DEFENSIVE={capture:1,defend:1,hold:1,'support-hold':1};
var EMERGENCY={retreat:1,regroup:1};

function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function copy(p){return p?{x:+p.x||0,z:+p.z||0}:null;}
function dist(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):Infinity;}
function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
function leaseSeconds(phase){return DEFENSIVE[phase]?DEFENSE_LEASE:ASSAULT_LEASE;}
function signature(sq){var p=sq&&sq.objective||{};return[String(sq&&sq.commandPhase||''),String(sq&&sq.targetObjective||''),Math.round((+p.x||0)/4),Math.round((+p.z||0)/4)].join('|');}
function captainAlive(sq){var a=sq&&sq.members||[];for(var i=0;i<a.length;i++)if(a[i]&&!a[i].dead&&a[i].role==='captain')return true;return false;}
function alive(sq){return(sq&&sq.members||[]).filter(function(s){return s&&!s.dead&&s.root&&s.root.position;});}
function average(sq){var a=alive(sq),x=0,z=0;if(!a.length)return null;for(var i=0;i<a.length;i++){x+=+a[i].root.position.x||0;z+=+a[i].root.position.z||0;}return{x:x/a.length,z:z/a.length};}
function median(a){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y;}),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])*.5;}
function cfg(sim,sq){try{return root.BattleCommanderAI.policyFor(sim,sq.faction)||{};}catch(_){return{};}}
function setPhase(sim,sq,next,why){if(!sq||sq.commandPhase===next)return;sq.commandPhase=next;telemetry(sim,'decision-phase',{faction:sq.faction,squad:sq.id,phase:next,why:why||''});}
function commandForward(sq){
  var a=sq.orderAnchor||sq.rally||{x:0,z:0},g=sq.objective||sq.home||a,dx=(+g.x||0)-(+a.x||0),dz=(+g.z||0)-(+a.z||0),l=Math.hypot(dx,dz);
  if(l<.1&&sq._formationForward){var f=sq._formationForward,fl=Math.hypot(+f.x||0,+f.z||0)||1;return{x:(+f.x||0)/fl,z:(+f.z||0)/fl};}
  return{x:dx/(l||1),z:dz/(l||1)};
}

function tasksFor(phase){
  if(phase==='defend'||phase==='hold')return{command:'control',alpha:'hold-left',bravo:'hold-right',charlie:'local-reserve'};
  if(phase==='flank')return{command:'control',alpha:'support-by-fire',bravo:'flank',charlie:'follow-assault'};
  if(phase==='capture'||phase==='clear-town')return{command:'control',alpha:'support-by-fire',bravo:'clear/maneuver',charlie:'secure'};
  if(phase==='support-hold')return{command:'control',alpha:'support-by-fire',bravo:'support-by-fire',charlie:'security'};
  return{command:'control',alpha:'support-by-fire',bravo:'maneuver',charlie:'assault/reserve'};
}
function teamKeyFor(s){var i=+s.slotIndex||0;if(i<=1)return'command';if(i===2||i===4||i===5)return'alpha';if(i===3||i===6||i===7)return'bravo';return'charlie';}
function syncTasks(sq,plan){var tasks=plan&&plan.tasks||null,a=sq&&sq.members||[];for(var i=0;i<a.length;i++){var s=a[i],key=s._fireteamKey||teamKeyFor(s);s._engagementTask=tasks&&key?tasks[key]||null:null;s._engagementPlanSerial=plan?plan.serial:null;}sq._engagementTasks=tasks?JSON.parse(JSON.stringify(tasks)):null;}
function planSnapshot(p){return p?{serial:p.serial,status:p.status,phase:p.phase,targetObjective:p.targetObjective,objective:copy(p.objective),createdAt:p.createdAt,activatedAt:p.activatedAt,lastContactAt:p.lastContactAt,quietSince:p.quietSince,until:p.until,tasks:p.tasks}:null;}
function closePlan(sim,sq,reason){var p=sq&&sq._engagementPlan;if(!p)return false;sq._lastEngagementPlan=planSnapshot(p);sq._lastEngagementPlan.closedAt=sim.time;sq._lastEngagementPlan.closeReason=reason||'closed';sq._engagementPlan=null;sq._stablePlan=null;syncTasks(sq,null);return true;}
function stagePlan(sim,sq){var phase=String(sq.commandPhase||'');if(!TACTICAL[phase]||sq.state==='retreat'||EMERGENCY[phase])return null;var serial=(+sq._engagementPlanSerial||0)+1,p={serial:serial,status:sq.inContact?'active':'staged',phase:phase,targetObjective:sq.targetObjective||null,objective:copy(sq.objective),signature:signature(sq),createdAt:sim.time,activatedAt:sq.inContact?sim.time:null,lastContactAt:sq.inContact?sim.time:null,quietSince:null,until:sim.time+leaseSeconds(phase),tasks:tasksFor(phase)};sq._engagementPlanSerial=serial;sq._engagementPlan=p;sq._stablePlan=p;syncTasks(sq,p);telemetry(sim,'decision-plan-commit',{faction:sq.faction,squad:sq.id,serial:serial,phase:phase,targetObjective:p.targetObjective,seconds:leaseSeconds(phase)});return p;}
function priorityDefense(sq){var r=sq&&sq._preparedDefenseRequest;if(r&&r.objectiveId)return true;r=sq&&sq._captureZoneDefenseRequest;return!!(r&&r.objectiveId);}
function holdCommittedPlan(sim,sq){
  if(!sim||!sq||sq.state==='retreat')return false;var p=sq._engagementPlan;if(!p)return false;
  if(priorityDefense(sq)&&sq.commandPhase==='defend'&&p.phase!=='defend'){closePlan(sim,sq,'defense superseded');return false;}
  if(sq.inContact||p.status==='active'||p.status==='quiet'){var quietAge=p.quietSince==null?0:sim.time-p.quietSince;if(!sq.inContact&&quietAge>=QUIET_CLOSE){closePlan(sim,sq,'contact clear');return false;}sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,sim.time+1.25);return true;}
  if(signature(sq)!==p.signature){closePlan(sim,sq,'commander intent changed');return false;}
  if(sim.time>=p.until){closePlan(sim,sq,'lease expired');sq._commandLeaseAwaitingEvaluation=true;return false;}
  return true;
}
function updatePlan(sim,sq){
  var p=sq._engagementPlan,phase=String(sq.commandPhase||''),sig=signature(sq);if(sq.state==='retreat'||phase==='retreat'){closePlan(sim,sq,'retreat');sq._planDormantSignature=null;return;}
  if(sq._planDormantSignature&&sq._planDormantSignature!==sig)sq._planDormantSignature=null;
  if(p){
    if(sq.inContact){sq._planDormantSignature=null;if(p.status!=='active'&&p.activatedAt==null)p.activatedAt=sim.time;p.status='active';p.lastContactAt=sim.time;p.quietSince=null;sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,sim.time+1.25);}
    else if(p.status==='active'||p.status==='quiet'){if(p.quietSince==null)p.quietSince=sim.time;p.status='quiet';if(sim.time-p.quietSince>=QUIET_CLOSE){sq._planDormantSignature=p.signature;closePlan(sim,sq,'contact clear');p=null;}else sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,sim.time+1.25);}
    if(p&&p.status==='staged'&&sig!==p.signature){closePlan(sim,sq,'intent replaced');p=null;}
    if(p&&p.status==='staged'&&sim.time>=p.until){closePlan(sim,sq,'lease expired');p=null;}
  }
  if(!sq._engagementPlan&&TACTICAL[phase]&&!EMERGENCY[phase]&&(sq.inContact||sq._planDormantSignature!==sig))stagePlan(sim,sq);else if(sq._engagementPlan){sq._stablePlan=sq._engagementPlan;syncTasks(sq,sq._engagementPlan);}
}

/* Cohesion is directional. A lagging man may be temporarily excluded so nine men do not march
   backwards to fetch one casualty-delayed rifleman. A man who ran AHEAD is never an ignorable
   straggler: he expands the core, forcing the Captain to restore cohesion instead of allowing two
   scouts to sprint into the next fight alone. Lateral outliers are also non-trimmable. */
function cohesionAssessment(sq,limit){
  var m=alive(sq),n=m.length;if(!n)return{center:copy(sq.rally)||{x:0,z:0},rawSpread:0,coreSpread:0,stragglers:[],outrunners:[],members:[],dispersed:false,allowed:0};
  var xs=[],zs=[],i;for(i=0;i<n;i++){xs.push(+m[i].root.position.x||0);zs.push(+m[i].root.position.z||0);}var med={x:median(xs),z:median(zs)},allowed=n>=9?2:(n>=5?1:0),far=[],lagging=[],blocking=[],f=commandForward(sq);
  for(i=0;i<n;i++){
    var p=m[i].root.position,d=dist(p,med);if(d<=limit)continue;
    var along=((+p.x||0)-med.x)*f.x+((+p.z||0)-med.z)*f.z,row={s:m[i],d:d,along:along};far.push(row);
    if(along<-Math.max(2,limit*.10))lagging.push(row);else blocking.push(row);
  }
  lagging.sort(function(a,b){return b.d-a.d;});var trim=lagging.slice(0,Math.min(allowed,lagging.length)),ids={};for(i=0;i<trim.length;i++)ids[String(trim[i].s.id)]=1;
  var core=m.filter(function(s){return!ids[String(s.id)];}),cx=0,cz=0;for(i=0;i<core.length;i++){cx+=+core[i].root.position.x||0;cz+=+core[i].root.position.z||0;}var center={x:cx/Math.max(1,core.length),z:cz/Math.max(1,core.length)},coreSpread=0;for(i=0;i<core.length;i++)coreSpread=Math.max(coreSpread,dist(core[i].root.position,center));
  var all={x:xs.reduce(function(a,b){return a+b;},0)/n,z:zs.reduce(function(a,b){return a+b;},0)/n},raw=0;for(i=0;i<n;i++)raw=Math.max(raw,dist(m[i].root.position,all));
  return{center:center,rawSpread:raw,coreSpread:coreSpread,stragglers:trim.map(function(x){return String(x.s.id);}),outrunners:blocking.map(function(x){return String(x.s.id);}),members:trim.map(function(x){return x.s;}),dispersed:blocking.length>0||lagging.length>allowed||coreSpread>limit,allowed:allowed};
}
function cohesionState(sq){return sq._regroupHysteresis||(sq._regroupHysteresis={overSince:null,accepted:false,enteredAt:0,cooldownUntil:0,anchor:null,lastForward:null,entries:0,exits:0,suppressed:0,stragglerSuppressions:0,regroupRequests:0});}
function saveForward(sq){return{phase:sq.commandPhase,objective:copy(sq.objective),targetObjective:sq.targetObjective||null,hold:+sq.commandHoldUntil||0,routeIndex:+sq.routeIndex||0};}
function restoreForward(sq,s){if(!s)return;sq.commandPhase=s.phase;if(s.objective)sq.objective=copy(s.objective);sq.targetObjective=s.targetObjective;sq.commandHoldUntil=Math.min(+sq.commandHoldUntil||0,s.hold);if((+sq.routeIndex||0)<s.routeIndex)sq.routeIndex=s.routeIndex;}
function markCatchup(ca,t){for(var i=0;i<ca.members.length;i++){var s=ca.members[i];s._cohesionCatchupUntil=t+4;s._destinationCommitUntil=0;}}
function updateCohesion(sim,sq){
  if(!sq||sq.state==='retreat')return;var c=cfg(sim,sq),limit=+(captainAlive(sq)?c.cohesionRadius:c.captainlessCohesion)||34,release=limit*REGROUP_RELEASE,st=cohesionState(sq),t=sim.time,ca=cohesionAssessment(sq,limit);sq._cohesionAssessment={rawSpread:+ca.rawSpread.toFixed(3),coreSpread:+ca.coreSpread.toFixed(3),stragglers:ca.stragglers.slice(),outrunners:ca.outrunners.slice(),allowed:ca.allowed,dispersed:ca.dispersed};
  var p=sq._engagementPlan,combatPlan=p&&(p.status==='active'||p.status==='quiet');if(sq.inContact||combatPlan){st.overSince=null;if(st.accepted){st.accepted=false;st.cooldownUntil=t+REENTRY;}if(sq.commandPhase!=='regroup')st.lastForward=saveForward(sq);sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,t+1.25);return;}
  if(st.accepted){var age=t-st.enteredAt;if((age>=REGROUP_MIN&&ca.coreSpread<=release)||age>=REGROUP_MAX){var timedOut=age>=REGROUP_MAX;st.accepted=false;st.exits++;st.cooldownUntil=t+REENTRY;sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,t+(timedOut?REGROUP_BYPASS:REENTRY));restoreForward(sq,st.lastForward);if(timedOut){var obj=sq.targetObjective&&root.BattleObjectiveSystem&&root.BattleObjectiveSystem.get&&root.BattleObjectiveSystem.get(sim,sq.targetObjective),op=point(obj&&obj.def||obj);sq._regroupTimedOutSerial=sq._regroupRecovery&&sq._regroupRecovery.serial||sq._regroupTimedOutSerial;if(op){sq.objective=op;if(!st.lastForward||st.lastForward.phase==='regroup')sq.commandPhase='approach';}}sq.commandHoldUntil=0;return;}sq.commandPhase='regroup';sq.objective=copy(st.anchor||ca.center);sq.commandHoldUntil=Math.max(+sq.commandHoldUntil||0,t+.6);return;}
  var requested=sq.commandPhase==='regroup'&&!sq.inContact;if(!requested){st.overSince=null;st.lastForward=saveForward(sq);return;}st.regroupRequests++;
  if(!ca.dispersed&&ca.stragglers.length){markCatchup(ca,t);st.stragglerSuppressions++;st.suppressed++;sq._regroupBypassUntil=t+STRAGGLER_BYPASS;restoreForward(sq,st.lastForward);return;}
  if(!ca.dispersed){st.suppressed++;restoreForward(sq,st.lastForward);return;}if(st.overSince==null)st.overSince=t;if(t<st.cooldownUntil||t-st.overSince<REGROUP_ENTER){st.suppressed++;restoreForward(sq,st.lastForward);return;}
  st.accepted=true;st.enteredAt=t;st.anchor=copy(ca.center);st.entries++;sq._regroupRecovery={serial:(+sq._regroupRecoverySerial||0)+1,startedAt:t,anchor:copy(st.anchor)};sq._regroupRecoverySerial=sq._regroupRecovery.serial;sq.objective=copy(st.anchor);sq.commandPhase='regroup';telemetry(sim,'decision-regroup-commit',{faction:sq.faction,squad:sq.id,serial:sq._regroupRecovery.serial,anchor:copy(st.anchor)});
}

function aliveTeam(sq,key){return(sq.members||[]).filter(function(s){return!s.dead&&teamKeyFor(s)===key;}).sort(function(a,b){return(+a.slotIndex||0)-(+b.slotIndex||0);});}
function desiredAnchor(sq,m){var x=0,z=0,n=0;for(var i=0;i<m.length;i++){var p=root.SquadAI.formationSlot(sq,m[i],m[i].slotIndex);if(p){x+=p.x;z+=p.z;n++;}}return n?{x:x/n,z:z/n}:null;}
function averageMembers(m){var x=0,z=0,n=0;for(var i=0;i<m.length;i++)if(m[i].root){x+=+m[i].root.position.x||0;z+=+m[i].root.position.z||0;n++;}return n?{x:x/n,z:z/n}:null;}
function forward(sq){return commandForward(sq);}
function teamSlot(sq,key,s,index,count,a){var f=forward(sq),r={x:-f.z,z:f.x},lat=0,fw=0;if(count===2){lat=index?-1.45:1.45;fw=index?-.45:.45;}else if(count>=3){if(index===0)fw=1.15;else if(index===1){lat=-1.7;fw=-.85;}else{lat=1.7;fw=-.85;}}if(key==='command'&&s.role==='captain'){lat=0;fw=.5;}return{x:a.x+r.x*lat+f.x*fw,z:a.z+r.z*lat+f.z*fw};}
/* A defensive post belongs to the Captain's command intent, not to a contact serial. Once a man has
   settled into his post, target acquisition/loss must not throw him back into formation and then
   recreate the same post a second later. It is released only when the defensive command signature
   materially changes. */
function holdPost(s,key){var p=s._defensePost;if(p&&p.commandKey===key)return p;if(!s.orderDestination||dist(s.root.position,s.orderDestination)>2.6)return null;s._defensePost={x:s.root.position.x,z:s.root.position.z,commandKey:key};return s._defensePost;}
/* Fireteam commitment is a meso command signature. Engagement-plan serials are micro/contact state
   and deliberately do not belong here; including them made target/contact churn republish the same
   formation anchor. */
function fireteamSignature(sq){var p=sq.objective||{};return[sq.commandPhase||'',sq.targetObjective||'',Math.round((+p.x||0)/4),Math.round((+p.z||0)/4),sq._regroupRecovery&&sq._regroupRecovery.serial||0].join('|');}
function updateFireteams(sq,battle){
  sq._fireteamOrders=sq._fireteamOrders||{};var defensive=!!DEFENSIVE[sq.commandPhase],defenseKey=signature(sq),regroup=sq.commandPhase==='regroup'&&sq.state!=='retreat';
  ['command','alpha','bravo','charlie'].forEach(function(key){var m=aliveTeam(sq,key);if(!m.length)return;var desired=desiredAnchor(sq,m);if(!desired)return;var live=averageMembers(m),sig=fireteamSignature(sq),cur=sq._fireteamOrders[key],urgent=sq.state==='retreat';
    if(!cur||urgent||cur.signature!==sig)cur=sq._fireteamOrders[key]={anchor:copy(desired),origin:copy(live),signature:sig,until:battle.time+(urgent?0:TEAM_LEASE),blocked:false};
    else if(regroup)cur.until=battle.time+TEAM_LEASE;
    else if(battle.time>=cur.until||dist(cur.anchor,desired)>20){var moved=live&&cur.origin&&dist(live,cur.origin)>=2.5,arrived=live&&dist(live,cur.anchor)<=4.5;if(moved||arrived)cur=sq._fireteamOrders[key]={anchor:copy(desired),origin:copy(live),signature:sig,until:battle.time+TEAM_LEASE,blocked:false};else cur.until=battle.time+TEAM_LEASE;}
    for(var i=0;i<m.length;i++){var s=m[i],d=teamSlot(sq,key,s,i,m.length,cur.anchor),prepared=defensive&&s._preparedDefensePost,post=prepared?null:(defensive?holdPost(s,defenseKey):null);s._fireteamKey=key;if(!defensive)s._defensePost=null;s._fireteamDestination=prepared?copy(prepared):(post?{x:post.x,z:post.z}:d);if(root.BattleMovementResolver)root.BattleMovementResolver.proposeOrder(s,s._fireteamDestination,battle,urgent);else s.orderDestination=copy(s._fireteamDestination);}
  });
}
root.SquadAI.updateSquad=function(sq,battle){oldUpdateSquad(sq,battle);if(battle)updateFireteams(sq,battle);};

function replanDue(sim,f){var h=sim&&sim._coordinationHealth,s=h&&h.sides&&h.sides[f];return!!(s&&s.replanDue);}
function inTown(town,p){return!!(town&&town.center&&p&&dist(p,town.center)<(+town.radius||250));}
function chooseOpen(sim,sq,pos){try{var c=root.BattleCommanderAI.chooseObjective(sim,sq,false);if(c&&c.instance){var st=root.BattleObjectiveSystem.status(sim,c.instance.id)||{};if(st.owner!==sq.faction)return c;}}catch(_){}var a=sim._objectives||[],best=null,score=Infinity;for(var i=0;i<a.length;i++){var o=a[i],st2=root.BattleObjectiveSystem.status(sim,o.id)||{},p=point(o.def||o);if(!p||st2.owner===sq.faction)continue;var sc=dist(pos,p)+(st2.active?80:0);if(sc<score){score=sc;best={instance:o,point:p};}}return best;}
function progressRecovery(sim,sq,town){
  if(!sq||sq.state==='retreat'||sq.commandRole==='garrison')return;var t=sim.time,c=cfg(sim,sq),pos=average(sq);if(!pos)return;var route=sq.route||[],idx=Math.max(0,Math.min(route.length-1,+sq.routeIndex||0));
  if(!sq.targetObjective&&route.length>1&&idx<route.length-1&&inTown(town,route[idx])){var limit=+(captainAlive(sq)?c.cohesionRadius:c.captainlessCohesion)||34,arrival=Math.max(+c.routeArrivalRadius||8,limit*URBAN_ARRIVAL_COHESION);if(dist(pos,route[idx])<=arrival){sq.routeIndex=idx+1;sq.objective=copy(route[idx+1]);sq.commandHoldUntil=0;idx++;}}
  if(sq.targetObjective||sq.commandRole==='reserve'||t-(+sq._forceRecoveryAt||-999)<RECOVERY_COOLDOWN)return;var atEnd=route.length&&idx>=route.length-1;if(!atEnd&&!replanDue(sim,sq.faction)&&!inTown(town,pos))return;var chosen=chooseOpen(sim,sq,pos);if(!chosen)return;sq.targetObjective=String(chosen.instance.id);sq.objective=copy(chosen.point);sq.commandHoldUntil=0;var radius=+chosen.instance.def.radius||30;setPhase(sim,sq,dist(pos,chosen.point)<=radius*(+c.captureCommitRatio||.82)?'capture':'assault','objective recovery '+chosen.instance.id);sq._forceRecoveryAt=t;
}

function summary(sim){var out={plans:0,active:0,quiet:0,regroups:0,fireteams:0};['us','ge'].forEach(function(f){var a=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<a.length;i++){var q=a[i],p=q._engagementPlan;if(p){out.plans++;if(p.status==='active')out.active++;if(p.status==='quiet')out.quiet++;}if(q._regroupHysteresis&&q._regroupHysteresis.accepted)out.regroups++;out.fireteams+=Object.keys(q._fireteamOrders||{}).length;}});sim._squadCommandSummary=out;sim._engagementPlanSummary={live:out.plans,active:out.active,quiet:out.quiet};sim._regroupHysteresisSummary={active:out.regroups,enterGrace:REGROUP_ENTER,exitRatio:REGROUP_RELEASE};return out;}
function reset(sim){['us','ge'].forEach(function(f){var a=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<a.length;i++){var q=a[i];q._engagementPlan=null;q._stablePlan=null;q._engagementPlanSerial=0;q._planDormantSignature=null;q._commandLeaseAwaitingEvaluation=false;q._regroupHysteresis=null;q._regroupRecovery=null;q._regroupRecoverySerial=0;q._regroupBypassUntil=0;q._fireteamOrders={};(q.members||[]).forEach(function(s){s._fireteamDestination=null;s._fireteamKey=null;s._defensePost=null;s._engagementTask=null;});}});summary(sim);}
function protectActivePlans(sim){['us','ge'].forEach(function(f){var a=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<a.length;i++){var q=a[i],p=q._engagementPlan;if(!p||!(p.status==='active'||p.status==='quiet'))continue;q._regroupBypassUntil=Math.max(+q._regroupBypassUntil||0,sim.time+1.25);if(q.commandPhase==='regroup'){q.commandPhase=p.phase;if(p.objective)q.objective=copy(p.objective);q.targetObjective=p.targetObjective;}}});}
function commanderTick(sim,payload){var town=payload&&payload.town||null;['us','ge'].forEach(function(f){var a=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<a.length;i++){var q=a[i];updateCohesion(sim,q);progressRecovery(sim,q,town);updatePlan(sim,q);}});summary(sim);}

root.BattleModules.registerSystem('squad-command',{version:'1.1-m3c-meso-owner',onBattleStart:reset,beforeBattleRestart:reset,onBattleRestart:reset,onSimulationStep:protectActivePlans,onCommanderTick:commanderTick});
root.BattleSquadStability={version:'1.1-m3c-meso-owner',planSeconds:{assault:ASSAULT_LEASE,defense:DEFENSE_LEASE},teamOrderSeconds:TEAM_LEASE,teamKeyFor:teamKeyFor,holdCommittedPlan:holdCommittedPlan,awaitingCommander:function(sq){return!!(sq&&sq._commandLeaseAwaitingEvaluation);}};
root.BattleEngagementPlans={version:'1.1-m3c-meso-owner',current:function(sq){return planSnapshot(sq&&sq._engagementPlan);},summary:function(sim){return sim&&sim._engagementPlanSummary?JSON.parse(JSON.stringify(sim._engagementPlanSummary)):null;}};
root.BattleRegroupHysteresis={version:'1.1-m3c-meso-owner',enterGrace:REGROUP_ENTER,exitRatio:REGROUP_RELEASE,minRegroup:REGROUP_MIN,reentryCooldown:REENTRY,assessment:cohesionAssessment,summary:function(sim){return sim&&sim._regroupHysteresisSummary?JSON.parse(JSON.stringify(sim._regroupHysteresisSummary)):null;}};
root.BattleForceProgressRecovery={version:'1.1-m3c-meso-owner',regroupMaxSeconds:REGROUP_MAX,regroupBypassSeconds:REGROUP_BYPASS,urbanArrivalCohesion:URBAN_ARRIVAL_COHESION};
root.BattleEngagementCommandLock={version:'1.1-m3c-meso-owner'};
console.log('[M3C] meso squad-command owner: stable Captain plan + cohesion + fireteam orders');
})(typeof window!=='undefined'?window:globalThis);