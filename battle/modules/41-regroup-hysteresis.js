/* Prevent cohesion chatter from turning forward movement into a regroup yo-yo.
   Force Command still owns strategic intent. This post-command constraint only delays a
   spread-triggered regroup until the squad has stayed genuinely over its cohesion envelope,
   and then holds that regroup until the formation is comfortably back inside it.

   It also publishes explicit regroup-entry/flap diagnostics into coordination health and Loop
   Watch so the benchmark can observe short repeated regroup episodes that the old 30-second
   long-regroup detector could miss completely. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleCommanderDoctrine||root.BattleRegroupHysteresis)return;

var ENTER_GRACE=1.35,EXIT_RATIO=.78,MIN_REGROUP=2.4,REENTRY_COOLDOWN=4.0,FLAP_WINDOW=45,FLAP_COUNT=3;
var D=root.BattleCommanderDoctrine,lastReason={};

function now(sim){return +sim.time||0;}
function point(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function captainAlive(sq){var m=sq&&sq.members||[];for(var i=0;i<m.length;i++)if(m[i]&&!m[i].dead&&m[i].role==='captain')return true;return false;}
function cfgFor(sim,sq){try{return root.BattleCommanderAI&&root.BattleCommanderAI.policyFor?root.BattleCommanderAI.policyFor(sim,sq.faction):null;}catch(_){return null;}}
function spreadOf(sq){try{var p=D.avgPos(sq);return{p:p,spread:D.maxSpread(sq,p)};}catch(_){return null;}}
function key(sq){return String(sq.faction||'?')+':'+String(sq.id||'?');}
function snapshot(sq){return{phase:sq.commandPhase||'approach',objective:point(sq.objective),targetObjective:sq.targetObjective||null,hold:+sq.commandHoldUntil||0,routeIndex:+sq.routeIndex||0};}
function restore(sq,s){if(!s)return;sq.commandPhase=s.phase;if(s.objective)sq.objective={x:s.objective.x,z:s.objective.z};sq.targetObjective=s.targetObjective;sq.commandHoldUntil=Math.min(+sq.commandHoldUntil||0,s.hold);if((+sq.routeIndex||0)<s.routeIndex)sq.routeIndex=s.routeIndex;}
function state(sq){return sq._regroupHysteresis||(sq._regroupHysteresis={overSince:null,accepted:false,enteredAt:0,cooldownUntil:0,lastForward:null,entries:[],flaps:0,suppressed:0});}
function publish(sim){
  var totalEntries=0,totalFlaps=0,totalSuppressed=0,byFaction={us:{entries:0,flaps:0,suppressed:0},ge:{entries:0,flaps:0,suppressed:0}};
  ['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){var st=squads[i]._regroupHysteresis;if(!st)continue;var e=st.entries.length,fl=st.flaps||0,su=st.suppressed||0;totalEntries+=e;totalFlaps+=fl;totalSuppressed+=su;byFaction[f].entries+=e;byFaction[f].flaps+=fl;byFaction[f].suppressed+=su;}});
  sim._regroupHysteresisSummary={entries:totalEntries,flaps:totalFlaps,suppressed:totalSuppressed,byFaction:byFaction,enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO};
  if(sim._coordinationHealth)sim._coordinationHealth.regroupHysteresis=JSON.parse(JSON.stringify(sim._regroupHysteresisSummary));
}
function loopAlert(sim,sq,t,spread,limit){
  var lw=sim&&sim._aiLoopWatch;if(!lw||!Array.isArray(lw.alerts))return;
  lw.alerts.push({kind:'regroup-flap',severity:'hot',faction:sq.faction,squadId:sq.id,soldierId:null,time:+t.toFixed(2),travel:0,net:0,destinationChanges:0,inContact:false,phases:['approach','regroup','approach'],rules:[],sequence:['advance','regroup','advance','regroup'],message:'Repeated cohesion regroup entries while travelling; spread '+spread.toFixed(1)+'m vs '+limit.toFixed(1)+'m limit'});
}
function noteEntry(sim,sq,st,t,spread,limit){
  st.enteredAt=t;st.accepted=true;st.entries.push(t);while(st.entries.length&&t-st.entries[0]>FLAP_WINDOW)st.entries.shift();
  if(st.entries.length>=FLAP_COUNT){st.flaps++;st.entries=[];loopAlert(sim,sq,t,spread,limit);if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-flap',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+spread.toFixed(2),limit:+limit.toFixed(2)},sim);}
  if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-enter',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+spread.toFixed(2),limit:+limit.toFixed(2)},sim);
}
function tickSquad(sim,sq){
  if(!sq||sq.state==='retreat')return;
  var cfg=cfgFor(sim,sq),sp=spreadOf(sq);if(!cfg||!sp)return;
  var t=now(sim),st=state(sq),limit=+(captainAlive(sq)?cfg.cohesionRadius:cfg.captainlessCohesion)||34,release=limit*EXIT_RATIO;
  var reason=lastReason[key(sq)]||'',spreadRegroup=sq.commandPhase==='regroup'&&reason.indexOf('spread ')===0;

  if(sq.inContact){st.overSince=null;if(st.accepted){st.accepted=false;st.cooldownUntil=t+REENTRY_COOLDOWN;}if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);return;}

  if(st.accepted){
    if(t-st.enteredAt>=MIN_REGROUP&&sp.spread<=release){st.accepted=false;st.cooldownUntil=t+REENTRY_COOLDOWN;st.overSince=null;if(root.BattleTelemetry)root.BattleTelemetry.record('regroup-exit',{faction:sq.faction,squad:sq.id,at:+t.toFixed(2),spread:+sp.spread.toFixed(2),release:+release.toFixed(2)},sim);if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);return;}
    /* Force Command may try to resume as soon as spread dips one centimetre below the old hard
       threshold. Keep the accepted regroup until the lower release threshold is met. */
    if(sq.commandPhase!=='regroup')sq.commandPhase='regroup';
    sq.objective={x:sp.p.x,z:sp.p.z};sq.commandHoldUntil=Math.max(+sq.commandHoldUntil||0,t+Math.min(.6,+cfg.regroupHold||.4));
    return;
  }

  if(sp.spread>limit){if(st.overSince==null)st.overSince=t;}else st.overSince=null;

  if(spreadRegroup){
    if(t>=st.cooldownUntil&&st.overSince!=null&&t-st.overSince>=ENTER_GRACE){noteEntry(sim,sq,st,t,sp.spread,limit);return;}
    /* A path around a hedge/building can momentarily stretch a formation. That is not a command
       reversal. Restore the last forward intent until the excursion proves persistent. */
    st.suppressed++;restore(sq,st.lastForward);return;
  }

  if(sq.commandPhase!=='regroup')st.lastForward=snapshot(sq);
}
function reset(sim){lastReason={};['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)delete squads[i]._regroupHysteresis;});sim._regroupHysteresisSummary={entries:0,flaps:0,suppressed:0,byFaction:{us:{entries:0,flaps:0,suppressed:0},ge:{entries:0,flaps:0,suppressed:0}},enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO};}

/* Capture Force Command's own phase reason without taking ownership of the phase. */
if(root.BattleTelemetry&&root.BattleTelemetry.record){var baseRecord=root.BattleTelemetry.record;root.BattleTelemetry.record=function(type,data,sim){if(type==='decision-phase'&&data&&data.squad!=null)lastReason[String(data.faction||'?')+':'+String(data.squad)]=String(data.why||'');return baseRecord.apply(this,arguments);};}

root.BattleModules.registerSystem('regroup-hysteresis',{version:'1.1',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:function(sim){['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)tickSquad(sim,squads[i]);});publish(sim);}});
root.BattleRegroupHysteresis={version:'1.1',enterGrace:ENTER_GRACE,exitRatio:EXIT_RATIO,minRegroup:MIN_REGROUP,reentryCooldown:REENTRY_COOLDOWN,summary:function(sim){return sim&&sim._regroupHysteresisSummary?JSON.parse(JSON.stringify(sim._regroupHysteresisSummary)):null;}};
console.log('[COMMAND] regroup hysteresis + flap diagnostics active');
})(typeof window!=='undefined'?window:globalThis);
