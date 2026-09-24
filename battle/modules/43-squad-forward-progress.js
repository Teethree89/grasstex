/* Rolling squad forward-progress diagnostics.
   A squad can travel a long distance without making useful progress (circling, route churn,
   regroup yo-yos, local avoidance loops). Strategic movement is measured toward the stable
   objective. An accepted regroup is different: moving backward to a captain's safe rally is
   intentional progress, so regroup windows are measured toward that fixed rally anchor instead. */
(function(root){
'use strict';
if(!root.BattleModules||root.BattleSquadForwardProgress)return;

var WINDOW=15,MIN_TRAVEL=12,MIN_NET=2.5,MIN_EFF=.15,ALERT_COOLDOWN=20,MAX_ALERTS=160;
var ADVANCE={approach:1,assault:1,capture:1,'clear-town':1,flank:1,'corner-check':1,regroup:1};

function clonePoint(p){return p&&isFinite(+p.x)&&isFinite(+p.z)?{x:+p.x,z:+p.z}:null;}
function dist(a,b){return !a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function centroid(sq){var m=sq&&sq.members||[],x=0,z=0,n=0;for(var i=0;i<m.length;i++){var s=m[i];if(!s||s.dead||!s.root||!s.root.position)continue;x+=+s.root.position.x||0;z+=+s.root.position.z||0;n++;}return n?{x:x/n,z:z/n}:null;}
function objectiveById(sim,id){var a=sim&&sim._objectives||[];for(var i=0;i<a.length;i++){var o=a[i];if(String(o&&o.id)===String(id)){var d=o.def||o;return clonePoint(d);}}return null;}
function strategicGoal(sim,sq){return objectiveById(sim,sq&&sq.targetObjective)||clonePoint(sq&&sq._routeFinalObjective)||clonePoint(sq&&sq.objective);}
function measuredGoal(sim,sq,ph){
  if(ph==='regroup'){
    var rh=sq&&sq._regroupHysteresis,a=rh&&rh.accepted&&clonePoint(rh.anchor);
    /* The commander may briefly propose regroup before hysteresis accepts it. Do not diagnose that
       transient against the strategic objective; there is no fixed regroup destination yet. */
    return a?{point:a,kind:'rally'}:null;
  }
  var g=strategicGoal(sim,sq);return g?{point:g,kind:'objective'}:null;
}
function key(sq){return String(sq.faction||'?')+':'+String(sq.id||'?');}
function state(sim){return sim._squadForwardProgress||(sim._squadForwardProgress={tracks:{},alerts:[],totalAlerts:0,byFaction:{us:0,ge:0},samples:0,lowEfficiencySamples:0});}
function phase(sq){return String(sq&&sq.commandPhase||'');}
function trim(hist,t){while(hist.length>1&&t-hist[0].t>WINDOW)hist.shift();}
function pushLoop(sim,sq,a){var lw=sim&&sim._aiLoopWatch;if(lw&&Array.isArray(lw.alerts))lw.alerts.push({kind:'low-forward-progress',severity:a.net<0?'hot':'warn',faction:sq.faction,squadId:sq.id,soldierId:null,time:a.at,travel:a.travel,net:a.net,destinationChanges:a.routeChanges||0,inContact:!!sq.inContact,phases:a.phases||[],rules:[],sequence:a.phases||[],message:'Squad travelled '+a.travel.toFixed(1)+'m but made only '+a.net.toFixed(1)+'m net '+a.goalKind+' progress in '+WINDOW+'s (eff '+Math.round(a.efficiency*100)+'%)'});}
function tickSquad(sim,sq){
  if(!sq||sq.state==='retreat')return;var ph=phase(sq);if(!ADVANCE[ph])return;
  var p=centroid(sq),mg=measuredGoal(sim,sq,ph);if(!p||!mg||!mg.point||!isFinite(dist(p,mg.point)))return;var g=mg.point,t=+sim.time||0,st=state(sim),k=key(sq),tr=st.tracks[k];
  if(!tr||tr.kind!==mg.kind||dist(tr.goal,g)>8)tr=st.tracks[k]={goal:g,kind:mg.kind,hist:[],last:p,lastRoute:+sq.routeIndex||0,routeChanges:0,lastAlert:-1e9};
  var step=dist(tr.last,p);if(isFinite(step)&&step<60)tr.travel=(tr.travel||0)+step;tr.last=p;
  var ri=+sq.routeIndex||0;if(ri!==tr.lastRoute){tr.routeChanges++;tr.lastRoute=ri;}
  tr.hist.push({t:t,x:p.x,z:p.z,d:dist(p,g),travel:tr.travel||0,phase:ph,routeChanges:tr.routeChanges});trim(tr.hist,t);
  if(tr.hist.length<2||t-tr.hist[0].t<WINDOW*.8)return;
  var first=tr.hist[0],last=tr.hist[tr.hist.length-1],travel=(last.travel||0)-(first.travel||0),net=first.d-last.d,eff=travel>0?net/travel:0;
  st.samples++;if(travel>=MIN_TRAVEL&&eff<MIN_EFF)st.lowEfficiencySamples++;if(travel<MIN_TRAVEL||net>=MIN_NET||eff>=MIN_EFF||t-tr.lastAlert<ALERT_COOLDOWN)return;tr.lastAlert=t;
  var phases=[],seen={};for(var i=0;i<tr.hist.length;i++){var hph=tr.hist[i].phase;if(!seen[hph]){seen[hph]=1;phases.push(hph);}}
  var coh=sq._cohesionAssessment||{},a={kind:'low-forward-progress',faction:sq.faction,squad:sq.id,at:+t.toFixed(2),window:WINDOW,travel:+travel.toFixed(2),net:+net.toFixed(2),efficiency:+eff.toFixed(3),distance:+last.d.toFixed(2),goalKind:mg.kind,routeChanges:(last.routeChanges||0)-(first.routeChanges||0),phases:phases,spread:isFinite(+coh.coreSpread)?+coh.coreSpread:null,rawSpread:isFinite(+coh.rawSpread)?+coh.rawSpread:null,stragglers:Array.isArray(coh.stragglers)?coh.stragglers.slice():[]};
  if(a.spread==null)try{if(root.BattleCommanderDoctrine){var c=root.BattleCommanderDoctrine.avgPos(sq);a.spread=+root.BattleCommanderDoctrine.maxSpread(sq,c).toFixed(2);}}catch(_){}
  st.totalAlerts++;if(st.byFaction[sq.faction]!=null)st.byFaction[sq.faction]++;st.alerts.push(a);if(st.alerts.length>MAX_ALERTS)st.alerts.shift();pushLoop(sim,sq,a);if(root.BattleTelemetry&&root.BattleTelemetry.record)root.BattleTelemetry.record('low-forward-progress',a,sim);
}
function tick(sim){var st=state(sim);['us','ge'].forEach(function(f){var a=sim.factions&&sim.factions[f]&&sim.factions[f].squads||[];for(var i=0;i<a.length;i++)tickSquad(sim,a[i]);});sim._squadForwardProgressSummary={windowSeconds:WINDOW,totalAlerts:st.totalAlerts,byFaction:{us:st.byFaction.us,ge:st.byFaction.ge},samples:st.samples,lowEfficiencySamples:st.lowEfficiencySamples,alerts:st.alerts.slice(-40)};if(sim._coordinationHealth)sim._coordinationHealth.forwardProgress=JSON.parse(JSON.stringify(sim._squadForwardProgressSummary));}
function reset(sim){sim._squadForwardProgress={tracks:{},alerts:[],totalAlerts:0,byFaction:{us:0,ge:0},samples:0,lowEfficiencySamples:0};sim._squadForwardProgressSummary={windowSeconds:WINDOW,totalAlerts:0,byFaction:{us:0,ge:0},samples:0,lowEfficiencySamples:0,alerts:[]};}

root.BattleModules.registerSystem('squad-forward-progress',{version:'1.1',onBattleStart:reset,onBattleRestart:reset,onCommanderTick:tick});
root.BattleSquadForwardProgress={version:'1.1',windowSeconds:WINDOW,summary:function(sim){return sim&&sim._squadForwardProgressSummary?JSON.parse(JSON.stringify(sim._squadForwardProgressSummary)):null;}};
console.log('[AI] forward-progress diagnostics distinguish objectives from rally movement');
})(typeof window!=='undefined'?window:globalThis);
