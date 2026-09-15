/* Benchmark-only movement-goal transition attribution.
   Observes the Movement Resolver's committed high-level goal before/after resolve so a physical
   destination change can be attributed to a true Meso point change, an ownership handoff, or a
   resolver/order mismatch. Does not alter runtime state or return values. */
(function(root){
'use strict';
if(root.BattleMovementGoalTransitionProfiler)return;
var EPS=.05,PHYS_EPS=.11,counts=Object.create(null),transitions=Object.create(null),samples=[],wrapped=[];
function inc(k,n){counts[k]=(counts[k]||0)+(n==null?1:n);}
function incMap(m,k,n){m[k]=(m[k]||0)+(n==null?1:n);}
function p(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function d(a,b){a=p(a);b=p(b);return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function safe(v){return String(v==null||v===''?'none':v).replace(/[^a-zA-Z0-9_.:-]+/g,'_').slice(0,100);}
function snapGoal(g){return g?{owner:String(g.owner||''),kind:String(g.kind||''),reason:String(g.reason||''),point:p(g.point),signature:String(g.signature||'')}:null;}
function label(g){return g?safe(g.owner)+':'+safe(g.kind):'none';}
function sigParts(sig){var a=String(sig||'').split('|');return{phase:a[0]||'',target:a[1]||'',engagementSerial:a[2]||'',retreat:a[3]||''};}
function top(m,n){return Object.keys(m).map(function(k){return{key:k,count:m[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,n||30);}
function sample(type,row){if(samples.length<220)samples.push(Object.assign({type:type},row||{}));}
function wrap(){
  var R=root.BattleMovementResolver;if(!R||typeof R.resolve!=='function')return;var fn=R.resolve;if(fn.__goalTransitionWrapped)return;
  function profiled(s,b){
    var st=s&&s._movementResolver,beforeGoal=snapGoal(st&&st.goal),beforeDest=p(s&&s.destination),beforeOrder=snapGoal(st&&st.order),beforeTeam=p(s&&s._fireteamDestination),out=fn.apply(this,arguments);
    st=s&&s._movementResolver;var afterGoal=snapGoal(st&&st.goal),afterDest=p(s&&s.destination),afterOrder=snapGoal(st&&st.order),team=p(s&&s._fireteamDestination),t=+(b&&b.time)||0;
    inc('resolveCalls');
    var goalOwnerChanged=(beforeGoal?beforeGoal.owner:'')!==(afterGoal?afterGoal.owner:''),goalKindChanged=(beforeGoal?beforeGoal.kind:'')!==(afterGoal?afterGoal.kind:''),goalPointChanged=d(beforeGoal&&beforeGoal.point,afterGoal&&afterGoal.point)>EPS;
    if(goalOwnerChanged||goalKindChanged||goalPointChanged){inc('goalChanged');if(goalOwnerChanged)inc('goalOwnerChanged');if(goalKindChanged)inc('goalKindChanged');if(goalPointChanged)inc('goalPointChanged');incMap(transitions,label(beforeGoal)+' -> '+label(afterGoal));}

    var intra=!!(beforeGoal&&afterGoal&&beforeGoal.owner==='squad-stability'&&afterGoal.owner==='squad-stability'&&beforeGoal.kind==='formation'&&afterGoal.kind==='formation');
    if(intra&&goalPointChanged){
      inc('intraFormationPointChanged');
      var signatureChanged=beforeGoal.signature!==afterGoal.signature,oldSig=sigParts(beforeGoal.signature),newSig=sigParts(afterGoal.signature),orderCatchup=!!(beforeOrder&&d(beforeGoal.point,beforeOrder.point)>EPS&&d(afterGoal.point,beforeOrder.point)<=EPS);
      if(signatureChanged){
        inc('intraFormationPointChanged.signatureChanged');
        if(oldSig.phase!==newSig.phase)inc('intraFormationSignature.phase');
        if(oldSig.target!==newSig.target)inc('intraFormationSignature.target');
        if(oldSig.engagementSerial!==newSig.engagementSerial)inc('intraFormationSignature.engagementSerial');
        if(oldSig.retreat!==newSig.retreat)inc('intraFormationSignature.retreat');
        if(oldSig.phase===newSig.phase&&oldSig.target===newSig.target&&oldSig.retreat===newSig.retreat&&oldSig.engagementSerial!==newSig.engagementSerial)inc('intraFormationSignature.engagementSerialOnly');
      }else inc('intraFormationPointChanged.signatureStable');
      if(orderCatchup){inc('intraFormationPointChanged.snapToCurrentOrder');if(signatureChanged)inc('intraFormationPointChanged.signatureSnapToOrder');}
      else inc('intraFormationPointChanged.notOrderSnap');
      if(beforeOrder&&afterOrder&&d(beforeOrder.point,afterOrder.point)>EPS)inc('intraFormationPointChanged.orderChangedDuringResolve');
      if(t>1&&samples.length<220)sample('intra-formation-point-change',{time:t,soldier:String(s&&s.id||''),beforeGoal:beforeGoal,afterGoal:afterGoal,beforeOrder:beforeOrder,afterOrder:afterOrder,fireteam:team,signatureChanged:signatureChanged,signatureDelta:{before:oldSig,after:newSig},snapToCurrentOrder:orderCatchup,goalPointDelta:+d(beforeGoal.point,afterGoal.point).toFixed(3),goalToOrderBefore:beforeOrder&&isFinite(d(beforeGoal.point,beforeOrder.point))?+d(beforeGoal.point,beforeOrder.point).toFixed(3):null});
    }

    var physicalChanged=d(beforeDest,afterDest)>PHYS_EPS;
    if(physicalChanged){
      inc('physicalChanged');if(t>1)inc('physicalChanged.afterWarmup');
      var tr=label(beforeGoal)+' -> '+label(afterGoal);incMap(transitions,'physical|'+tr);
      if(afterGoal&&afterGoal.owner==='squad-stability'){
        inc('squadStabilityPhysical');if(t>1)inc('squadStabilityPhysical.afterWarmup');
        inc('squadStabilityPhysical.fromOwner.'+safe(beforeGoal&&beforeGoal.owner||'none'));
        inc('squadStabilityPhysical.fromKind.'+safe(beforeGoal&&beforeGoal.kind||'none'));
        if(beforeGoal&&beforeGoal.owner==='squad-stability'&&beforeGoal.kind==='formation'){
          inc('squadStabilityPhysical.intraFormation');
          if(goalPointChanged)inc('squadStabilityPhysical.intraFormation.pointChanged');
          else inc('squadStabilityPhysical.intraFormation.samePoint');
        }else inc('squadStabilityPhysical.ownershipReturn');
        if(team&&afterGoal.point&&d(team,afterGoal.point)<=EPS)inc('squadStabilityPhysical.goalMatchesFireteam');else inc('squadStabilityPhysical.goalDiffersFireteam');
        if(afterOrder&&afterGoal.point&&d(afterOrder.point,afterGoal.point)<=EPS)inc('squadStabilityPhysical.goalMatchesOrder');else inc('squadStabilityPhysical.goalDiffersOrder');
        if(afterOrder&&team&&d(afterOrder.point,team)<=EPS)inc('squadStabilityPhysical.orderMatchesFireteam');else inc('squadStabilityPhysical.orderDiffersFireteam');
      }
      if(t>1&&samples.length<220)sample('physical-change',{time:t,soldier:String(s&&s.id||''),beforeGoal:beforeGoal,afterGoal:afterGoal,beforeDestination:beforeDest,afterDestination:afterDest,beforeOrder:beforeOrder,afterOrder:afterOrder,beforeFireteam:beforeTeam,fireteam:team,goalPointDelta:isFinite(d(beforeGoal&&beforeGoal.point,afterGoal&&afterGoal.point))?+d(beforeGoal.point,afterGoal.point).toFixed(3):null,physicalDelta:isFinite(d(beforeDest,afterDest))?+d(beforeDest,afterDest).toFixed(3):null});
    }
    if(afterGoal&&afterGoal.owner==='squad-stability'){
      if(afterOrder&&team&&d(afterOrder.point,team)<=EPS)inc('squadStabilityResolve.orderMatchesFireteam');else inc('squadStabilityResolve.orderDiffersFireteam');
    }
    return out;
  }
  profiled.__goalTransitionWrapped=true;R.resolve=profiled;wrapped.push({obj:R,key:'resolve',fn:fn});
}
function reset(){counts=Object.create(null);transitions=Object.create(null);samples=[];}
function snapshot(){return{version:'1.1',counts:Object.assign({},counts),transitions:top(transitions,40),samples:samples.slice()};}
function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__goalTransitionWrapped)w.obj[w.key]=w.fn;}wrapped=[];}
wrap();
root.BattleMovementGoalTransitionProfiler={version:'1.1',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);
