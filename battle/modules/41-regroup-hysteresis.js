/* Prevent cohesion chatter from turning forward movement into a regroup yo-yo.
   Force Command still owns strategic intent. This layer adds hysteresis plus captain-authored
   safe rally breadcrumbs: a persistent regroup uses the newest recently-safe point behind the
   squad, falling back to the fixed entry centroid only when no breadcrumb is still valid. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleCommanderDoctrine||root.BattleRegroupHysteresis)return;

var ENTER_GRACE=1.35,EXIT_RATIO=.78,MIN_REGROUP=2.4,REENTRY_COOLDOWN=4.0,FLAP_WINDOW=45,FLAP_COUNT=3;
var RALLY_SAFE_FOR=10,RALLY_MIN_STEP=18,RALLY_MAX_AGE=180,RALLY_MAX_BACK=60,RALLY_ENEMY_RADIUS=32,RALLY_KEEP=5;
var D=root.BattleCommanderDoctrine,lastReason={};

function now(sim){return +sim.time||0;}
function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function distance(a,b){return a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;}
function captain(sq){var m=sq&&sq.members||[];for(var i=0;i<m.length;i++)if(m[i]&&!m[i].dead&&m[i].role==='captain')return m[i];return null;}
function captainAlive(sq){return!!captain(sq);}
function cfgFor(sim,sq){try{return root.BattleCommanderAI&&root.BattleCommanderAI.policyFor?root.BattleCommanderAI.policyFor(sim,sq.faction):null;}catch(_){return null;}}
function spreadOf(sq){try{var p=D.avgPos(sq);return{p:p,spread:D.maxSpread(sq,p)};}catch(_){return null;}}
function key(sq){return String(sq.faction||'?')+':'+String(sq.id||'?');}
function snapshot(sq){return{phase:sq.commandPhase||'approach',objective:point(sq.objective),targetObjective:sq.targetObjective||null,hold:+sq.commandHoldUntil||0,routeIndex:+sq.routeIndex||0};}
function restore(sq,s){if(!s)return;sq.commandPhase=s.phase;if(s.objective)sq.objective={x:s.objective.x,z:s.objective.z};sq.targetObjective=s.targetObjective;sq.commandHoldUntil=Math.min(+sq.commandHoldUntil||0,s.hold);if((+sq.routeIndex||0)<s.routeIndex)sq.routeIndex=s.routeIndex;}
function state(sq){
  var st=sq._regroupHysteresis;
  if(!st)st=sq._regroupHysteresis={overSince:null,accepted:false,enteredAt:0,cooldownUntil:0,lastForward:null,anchor:null,rallies:[],safeSince:null,lastContactAt:-1e9,entries:[],flaps:0,suppressed:0,rallyUses:0};
  /* v1.3 added rally memory. Harnesses, hot-loaded pages, or squads that already carried a v1.2
     state object must be upgraded in place instead of assuming every new field exists. */
  if(!Array.isArray(st.rallies))st.rallies=[];
  if(!Array.isArray(st.entries))st.entries=[];
  if(st.safeSince===undefined)st.safeSince=null;
  if(st.lastContactAt===undefined)st.lastContactAt=-1e9;
  if(st.anchor===undefined)st.anchor=null;
  if(st.rallyUses===undefined)st.rallyUses=0;
  if(st.flaps===undefined)st.flaps=0;
  if(st.suppressed===undefined)st.suppressed=0;
  return st;
}
function clearAccepted(st){st.accepted=false;st.overSince=null;st.anchor=null;}
function soldierPoint(s){return s&&s.root&&s.root.position?{x:+s.root.position.x||0,z:+s.root.position.z||0}:null;}
function enemyNear(sim,sq,p,r){var foe=sq.faction==='us'?'ge':'us',a=sim.factions&&sim.factions[foe]&&sim.factions[foe].soldiers||[];if(!a.length){var squads=sim.factions&&sim.factions[foe]&&sim.factions[foe].squads||[];for(var q=0;q<squads.length;q++)a=a.concat(squads[q].members||[]);}for(var i=0;i<a.length;i++){var ep=!a[i].dead?soldierPoint(a[i]):null;if(ep&&distance(p,ep)<r)return true;}return false;}
function reachable(from,to){try{if(!root.BattleNavigation)return true;if(root.BattleNavigation.movementClear&&root.BattleNavigation.movementClear(from,to))return true;var path=root.BattleNavigation.findPath&&root.BattleNavigation.findPath(from,to);return!!(path&&path.length);}catch(_){return false;}}
function markContact(st,sq,t){if(sq.inContact){st.lastContactAt=t;st.safeSince=null;return true;}var m=sq.members||[];for(var i=0;i<m.length;i++){var s=m[i],e=s&&s.eng;if(s&&((+s.suppressedUntil||0)>t||(e&&isFinite(+e.lastSeenAt)&&t-(+e.lastSeenAt)<RALLY_SAFE_FOR))){st.lastContactAt=t;st.safeSince=null;return true;}}return false;}
function maybeDropRally(sim,sq,st,sp,t,limit){var cap=captain(sq),cp=soldierPoint(cap);if(!cap||!cp||markContact(st,sq,t)||enemyNear(sim,sq,cp,RALLY_ENEMY_RADIUS)){st.safeSince=null;return;}if(sp.spread>limit*.82){st.safeSince=null;return;}if(st.safeSince==null)st.safeSince=t;if(t-st.safeSince<RALLY_SAFE_FOR)return;var last=st.rallies.length?st.rallies[st.rallies.length-1]:null;if(last&&distance(last,cp)<RALLY_MIN_STEP)return;st.rallies.push({x:cp.x,z:cp.z,at:t,routeIndex:+sq.routeIndex||0,objectiveId:sq.targetObjective||null});while(st.rallies.length>RALLY_KEEP)st.rallies.shift();st.safeSince=t;if(root.BattleTelemetry)root.BattleTelemetry.record('rally-drop',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),x:+cp.x.toFixed(2),z:+cp.z.toFixed(2)},sim);}
function validRally(sim,sq,r,centroid,t){if(!r||t-r.at>RALLY_MAX_AGE||distance(r,centroid)>RALLY_MAX_BACK)return false;if(enemyNear(sim,sq,r,RALLY_ENEMY_RADIUS))return false;if(!reachable(centroid,r))return false;return true;}
function chooseRally(sim,sq,st,centroid,t){for(var i=st.rallies.length-1;i>=0;i--)if(validRally(sim,sq,st.rallies[i],centroid,t))return point(st.rallies[i]);return null;}
function publish(sim){var totalEntries=0,totalFlaps=0,totalSuppressed=0,totalRallies=0,totalRallyUses=0,byFaction={us:{entries:0,flaps:0,suppressed:0,rallies:0,rallyUses:0},ge:{entries:0,flaps:0,suppressed:0,rallies:0,rallyUses:0}};['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){if(!squads[i]._regroupHysteresis)continue;var st=state(squads[i]),e=st.entries.length,fl=st.flaps||0,su=st.suppressed||0,ra=st.rallies.length,ru=st.rallyUses||0;totalEntries+=e;totalFlaps+=fl;totalSuppressed+=su;totalRallies+=ra;totalRallyUses+=ru;byFaction[f].entries+=e;byFaction[f].flaps+=fl;byFaction[f].suppressed+=su;byFaction[f].rallies+=ra;byFaction[f].rallyUses+=ru;}});sim._regroupHysteresisSummary={entries:totalEntries,flaps:totalFlaps,suppressed:totalSuppressed,rallies:totalRallies,rallyUses:totalRallyUses,byFaction:byFaction,enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO};if(sim._coordinationHealth)sim._coordinationHealth.regroupHysteresis=JSON.parse(JSON.stringify(sim._regroupHysteresisSummary));}
function loopAlert(sim,sq,t,spread,limit){var lw=sim&&sim._aiLoopWatch;if(!lw||!Array.isArray(lw.alerts))return;lw.alerts.push({kind:'regroup-flap',severity:'hot',faction:sq.faction,squadId:sq.id,soldierId:null,time:+t.toFixed(2),travel:0,net:0,destinationChanges:0,inContact:false,phases:['approach','regroup','approach'],rules:[],sequence:['advance','regroup','advance','regroup'],message:'Repeated cohesion regroup entries while travelling; spread '+spread.toFixed(1)+'m vs '+limit.toFixed(1)+'m limit'});}
function noteEntry(sim,sq,st,t,spread,limit,centroid){st.enteredAt=t;st.accepted=true;var rally=chooseRally(sim,sq,st,centroid,t);st.anchor=rally||point(centroid);if(rally)st.rallyUses++;st.entries.push(t);while(st.entries.length&&t-st.entries[0]>FLAP_WINDOW)st.entries.shift();if(st.entries.length>=FLAP_COUNT){st.flaps++;st.entries=[];loopAlert(sim,sq,t,spread,limit);if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-flap',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+spread.toFixed(2),limit:+limit.toFixed(2)},sim);}if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-enter',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+spread.toFixed(2),limit:+limit.toFixed(2),anchor:st.anchor,rally:!!rally},sim);}
function tickSquad(sim,sq){if(!sq||sq.state==='retreat')return;var cfg=cfgFor(sim,sq),sp=spreadOf(sq);if(!cfg||!sp)return;var t=now(sim),st=state(sq),limit=+(captainAlive(sq)?cfg.cohesionRadius:cfg.captainlessCohesion)||34,release=limit*EXIT_RATIO;var reason=lastReason[key(sq)]||'',spreadRegroup=sq.commandPhase==='regroup'&&reason.indexOf('spread ')===0;maybeDropRally(sim,sq,st,sp,t,limit);if(t<(+sq._regroupBypassUntil||0)){clearAccepted(st);st.cooldownUntil=Math.max(st.cooldownUntil,sq._regroupBypassUntil);if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);return;}if(sq.inContact){st.overSince=null;if(st.accepted){clearAccepted(st);st.cooldownUntil=t+REENTRY_COOLDOWN;}if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);return;}if(st.accepted){if(t-st.enteredAt>=MIN_REGROUP&&sp.spread<=release){clearAccepted(st);st.cooldownUntil=t+REENTRY_COOLDOWN;if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-exit',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+sp.spread.toFixed(2),release:+release.toFixed(2)},sim);if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);return;}if(sq.commandPhase!=='regroup')sq.commandPhase='regroup';var anchor=st.anchor||sp.p;sq.objective={x:anchor.x,z:anchor.z};sq.commandHoldUntil=Math.max(+sq.commandHoldUntil||0,t+Math.min(.6,+cfg.regroupHold||.4));return;}if(sp.spread>limit){if(st.overSince==null)st.overSince=t;}else st.overSince=null;if(spreadRegroup){if(t>=st.cooldownUntil&&st.overSince!=null&&t-st.overSince>=ENTER_GRACE){noteEntry(sim,sq,st,t,sp.spread,limit,sp.p);return;}st.suppressed++;restore(sq,st.lastForward);return;}if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);}
function reset(sim){lastReason={};['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)delete squads[i]._regroupHysteresis;});sim._regroupHysteresisSummary={entries:0,flaps:0,suppressed:0,rallies:0,rallyUses:0,byFaction:{us:{entries:0,flaps:0,suppressed:0,rallies:0,rallyUses:0},ge:{entries:0,flaps:0,suppressed:0,rallies:0,rallyUses:0}},enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO};}
if(root.BattleTelemetry&&root.BattleTelemetry.record){var baseRecord=root.BattleTelemetry.record;root.BattleTelemetry.record=function(type,data,sim){if(type==='decision-phase'&&data&&data.squad!=null)lastReason[String(data.faction||'?')+':'+String(data.squad)]=String(data.why||'');return baseRecord.apply(this,arguments);};}
root.BattleModules.registerSystem('regroup-hysteresis',{version:'1.3.1',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)tickSquad(sim,squads[i]);});publish(sim);}});
root.BattleRegroupHysteresis={version:'1.3.1',enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO,minRegroup:MIN_REGROUP,reentryCooldown:REENTRY_COOLDOWN,summary:function(sim){return sim&&sim._regroupHysteresisSummary?JSON.parse(JSON.stringify(sim._regroupHysteresisSummary)):null;}};
console.log('[COMMAND] regroup hysteresis + captain safe-rally breadcrumbs active');
})(typeof window!=='undefined'?window:globalThis);
