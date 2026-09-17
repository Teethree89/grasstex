/* Vacant-owned-objective assault override.
   An objective may remain enemy-owned after its defenders are dead or have left.  When a squad is
   already assigned to that objective, an empty ownership flag is not a reason to stop and regroup
   100 m away.  Force Command keeps the strategic target and resumes the assault unless a live enemy
   is close enough to demand an immediate contact drill. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleObjectiveSystem||root.BattleVacantObjectiveAssault)return;
  var SYSTEM='force-command-vacant-objective-assault';
  var IMMEDIATE_THREAT=48;
  var ADVANCE_LEASE=6;

  function dist(a,b){return a&&b?Math.hypot((+a.x||0)-(+b.x||0),(+a.z||0)-(+b.z||0)):Infinity;}
  function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
  function alive(sq){return(sq&&sq.members||[]).filter(function(s){return s&&!s.dead&&s.root;});}
  function average(sq){var m=alive(sq),x=0,z=0;if(!m.length)return null;for(var i=0;i<m.length;i++){x+=+m[i].root.position.x||0;z+=+m[i].root.position.z||0;}return{x:x/m.length,z:z/m.length};}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function nearestEnemy(sim,sq,pos){
    var roster=sim&&sim.rosterOf?sim.rosterOf(enemyFaction(sq.faction)):sim&&sim._roster&&sim._roster[enemyFaction(sq.faction)]||[],best=Infinity;
    for(var i=0;i<roster.length;i++){var e=roster[i];if(!e||e.dead||!e.root)continue;best=Math.min(best,dist(pos,e.root.position));}
    return best;
  }
  function isVacantEnemyObjective(sim,sq,obj){
    if(!obj)return false;var st=root.BattleObjectiveSystem.status(sim,obj.id)||{},owner=st.owner||'neutral';
    if(owner==='neutral'||owner===sq.faction)return false;
    if(st.vacantOwner!=null)return !!st.vacantOwner;
    var w=st.weights||{},ownerWeight=+w[owner]||+st[owner]||0;
    return ownerWeight<=0&&st.active==null;
  }
  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function asForce(reason,fn){var p=root.BattleOrderProvenanceFastPath||root.BattleOrderProvenance;return p&&typeof p.withOwner==='function'?p.withOwner('force-command',reason,fn,'system:commander'):fn();}
  function push(sim,sq,now){
    if(!sq||sq.state==='retreat'||sq.commandRole==='garrison'||sq.commandRole==='reserve'||sq.targetObjective==null)return false;
    var obj=root.BattleObjectiveSystem.get(sim,sq.targetObjective);if(!obj||!isVacantEnemyObjective(sim,sq,obj))return false;
    var pos=average(sq),goal=point(obj.def);if(!pos||!goal)return false;
    var threat=nearestEnemy(sim,sq,pos);if(threat<IMMEDIATE_THREAT)return false;
    var radius=+obj.def.radius||30,d=dist(pos,goal),next=d<=radius*1.05?'capture':'assault',changed=sq.commandPhase!==next||sq._vacantObjectiveAdvanceId!==String(obj.id);
    asForce('vacant enemy objective '+obj.id,function(){
      sq.objective={x:goal.x,z:goal.z};sq.commandHoldUntil=0;sq.commandPhase=next;
      sq._vacantObjectiveAdvanceId=String(obj.id);sq._vacantObjectiveAdvanceUntil=now+ADVANCE_LEASE;
      /* Existing bounded-regroup recovery understands this lease and will not pin the squad to its
         previous centroid on the next command tick. */
      sq._regroupBypassUntil=Math.max(+sq._regroupBypassUntil||0,now+ADVANCE_LEASE);
    });
    if(changed)telemetry(sim,'decision-vacant-objective-advance',{faction:sq.faction,squad:sq.id,objective:String(obj.id),distance:+d.toFixed(2),nearestEnemy:isFinite(threat)?+threat.toFixed(2):null,phase:next});
    return true;
  }
  function tick(sim,ctx){
    if(!sim||sim.macroCommandEnabled===false||!ctx||ctx.macroCommandWake!==true)return;var now=+sim.time||0;
    ['us','ge'].forEach(function(f){var squads=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++)push(sim,squads[i],now);});
  }
  function reset(sim){['us','ge'].forEach(function(f){var squads=sim&&sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<squads.length;i++){squads[i]._vacantObjectiveAdvanceId=null;squads[i]._vacantObjectiveAdvanceUntil=0;}});}
  root.BattleModules.registerSystem(SYSTEM,{version:'66-vacant-objective-assault',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:tick});
  root.BattleVacantObjectiveAssault={version:'66-vacant-objective-assault',immediateThreat:IMMEDIATE_THREAT,advanceLease:ADVANCE_LEASE,isVacantEnemyObjective:isVacantEnemyObjective};
  if(typeof console!=='undefined')console.log('[COMMAND] vacant enemy-owned objectives now force continued assault');
})(typeof window!=='undefined'?window:globalThis);
