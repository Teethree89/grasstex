/* Benchmark-only physical destination provenance.
   Wraps Movement Resolver and the tactical waypoint producers without changing behavior. */
(function(root){
'use strict';
if(root.BattlePhysicalPointProfiler)return;

var EPS=.11,counts=Object.create(null),byOwner=Object.create(null),byKind=Object.create(null),byRouteReason=Object.create(null),byTransition=Object.create(null),samples=[];
var active=typeof WeakMap!=='undefined'?new WeakMap():null,previous=typeof WeakMap!=='undefined'?new WeakMap():null,wrapped=[];

function inc(k,n){counts[k]=(counts[k]||0)+(n==null?1:n);}
function incMap(m,k,n){k=String(k==null||k===''?'none':k);m[k]=(m[k]||0)+(n==null?1:n);}
function p(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function d(a,b){a=p(a);b=p(b);return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function same(a,b,e){return d(a,b)<=(e==null?EPS:e);}
function safe(v){return String(v==null||v===''?'none':v).replace(/[^a-zA-Z0-9_.|:-]+/g,'_').slice(0,140);}
function top(m,n){return Object.keys(m).map(k=>({key:k,count:m[k]})).sort((a,b)=>b.count-a.count).slice(0,n||20);}
function sample(type,row){if(samples.length<160)samples.push(Object.assign({type:type},row||{}));}
function routeSnapshot(s){var r=s&&s._tacticalRoute;if(!r)return null;return{kind:String(r.kind||''),owner:String(r.owner||''),reason:String(r.reason||''),index:+r.index||0,total:r.steps&&r.steps.length||0,intent:p(r.intent),step:r.steps&&p(r.steps[+r.index||0])};}

function wrapRoute(){var T=root.BattleTacticalRoute;if(!T||typeof T.resolve!=='function')return;var fn=T.resolve;if(fn.__physicalPointWrapped)return;
  function profiled(s,b,pick){
    var ctx=active&&active.get(s),before=routeSnapshot(s),out=fn.apply(this,arguments),after=routeSnapshot(s);
    if(ctx){ctx.pick={owner:String(pick&&pick.owner||''),kind:String(pick&&pick.kind||''),reason:String(pick&&pick.reason||''),point:p(pick&&pick.point),urgent:!!(pick&&pick.urgent)};ctx.routeResult=out?{point:p(out.point),reason:String(out.reason||''),intent:p(out.intent),step:+out.step||0,total:+out.total||0}:null;ctx.routeBefore=before;ctx.routeAfter=after;}
    inc('tacticalRoute.resolveCalls');
    if(out){inc('tacticalRoute.returnedWaypoint');incMap(byRouteReason,String(out.reason||'unknown'));}
    else inc('tacticalRoute.noWaypoint');
    if(!before&&after){inc('tacticalRoute.planCreated');incMap(byRouteReason,String(after.reason||'unknown'));}
    else if(before&&!after)inc('tacticalRoute.planCleared');
    else if(before&&after){
      if(before.index!==after.index){inc('tacticalRoute.stepAdvanced',Math.max(1,after.index-before.index));incMap(byRouteReason,String(after.reason||before.reason||'unknown'));}
      if(before.reason!==after.reason)incMap(byTransition,safe(before.reason)+'->'+safe(after.reason));
      if(d(before.intent,after.intent)>EPS)inc('tacticalRoute.intentChanged');
    }
    return out;
  }
  profiled.__physicalPointWrapped=true;T.resolve=profiled;wrapped.push({obj:T,key:'resolve',fn:fn});
}

function wrapStations(){var T=root.BattleTacticalPositions;if(!T||typeof T.waypoint!=='function')return;var fn=T.waypoint;if(fn.__physicalPointWrapped)return;
  function profiled(s,b){var out=fn.apply(this,arguments),ctx=active&&active.get(s);if(ctx)ctx.stationResult=p(out&&out.point||out);inc('firingStation.waypointCalls');if(out)inc('firingStation.returnedWaypoint');return out;}
  profiled.__physicalPointWrapped=true;T.waypoint=profiled;wrapped.push({obj:T,key:'waypoint',fn:fn});
}

function classifyChange(s,b,ctx,before,after){
  var pick=ctx.pick||null,route=ctx.routeResult||null,station=ctx.stationResult||null,raw=route&&route.point||station||pick&&pick.point||null;
  var owner=pick&&pick.owner||s&&s._movementProposalOwner||'unknown',kind=pick&&pick.kind||'unknown',producer='direct-pick';
  if(route&&route.point)producer='tactical-route';else if(station)producer='firing-station';else if(!pick)producer='unobserved';
  var legalized=raw&&after&&!same(raw,after,EPS);
  if(legalized)producer+='+legalize';
  inc('physicalDestination.changed');inc('producer.'+producer);incMap(byOwner,owner);incMap(byKind,kind);if(route)incMap(byRouteReason,route.reason||'unknown');
  var prev=previous&&previous.get(s);
  var highChanged=!prev||!pick||!prev.pick||!same(prev.pick.point,pick.point,.05)||prev.pick.owner!==owner||prev.pick.kind!==kind;
  if(highChanged)inc('physicalChange.highLevelPickChanged');else inc('physicalChange.sameHighLevelPick');
  if(route){
    var routeChanged=!prev||!prev.route||!same(prev.route.point,route.point,.05)||prev.route.reason!==route.reason||prev.route.step!==route.step;
    if(routeChanged)inc('physicalChange.routeWaypointChanged');else inc('physicalChange.sameRouteWaypoint');
    if(ctx.routeBefore&&ctx.routeAfter&&ctx.routeBefore.index!==ctx.routeAfter.index)inc('physicalChange.routeStepAdvanced');
    if(!ctx.routeBefore&&ctx.routeAfter)inc('physicalChange.routePlanCreated');
  }
  if(legalized)inc('physicalChange.legalizedEndpoint');
  if(owner==='squad-stability'){
    inc('squadStabilityPhysical.changed');inc('squadStabilityProducer.'+producer);
    if(highChanged)inc('squadStabilityPhysical.highLevelPickChanged');else inc('squadStabilityPhysical.sameHighLevelPick');
    if(route&&(!prev||!prev.route||!same(prev.route.point,route.point,.05)||prev.route.step!==route.step))inc('squadStabilityPhysical.routeWaypointChanged');
  }
  if(samples.length<160&&(owner==='squad-stability'||route||legalized))sample('physical-change',{time:+(b&&b.time)||0,soldier:String(s&&s.id||''),owner:owner,kind:kind,producer:producer,delta:+d(before,after).toFixed(3),highChanged:highChanged,pick:pick&&pick.point,route:route,routeBefore:ctx.routeBefore,routeAfter:ctx.routeAfter,raw:raw,final:after});
  if(previous)previous.set(s,{pick:pick?{owner:owner,kind:kind,point:p(pick.point)}:null,route:route?{point:p(route.point),reason:route.reason,step:route.step}:null,final:p(after),producer:producer});
}

function wrapResolver(){var R=root.BattleMovementResolver;if(!R||typeof R.resolve!=='function')return;var fn=R.resolve;if(fn.__physicalPointWrapped)return;
  function profiled(s,b){
    var before=p(s&&s.destination),ctx={pick:null,routeResult:null,stationResult:null,routeBefore:null,routeAfter:null};if(active&&s)active.set(s,ctx);
    var out;try{out=fn.apply(this,arguments);}finally{if(active&&s)active.delete(s);}
    var after=p(s&&s.destination);inc('movementResolver.resolveCalls');
    if(!same(before,after,EPS))classifyChange(s,b,ctx,before,after);else if(after){inc('physicalDestination.same');var pick=ctx.pick;if(previous&&s&&pick){var prev=previous.get(s)||{};previous.set(s,{pick:{owner:String(pick.owner||''),kind:String(pick.kind||''),point:p(pick.point)},route:ctx.routeResult?{point:p(ctx.routeResult.point),reason:ctx.routeResult.reason,step:ctx.routeResult.step}:prev.route||null,final:after,producer:prev.producer||null});}}
    return out;
  }
  profiled.__physicalPointWrapped=true;R.resolve=profiled;wrapped.push({obj:R,key:'resolve',fn:fn});
}

function reset(){counts=Object.create(null);byOwner=Object.create(null);byKind=Object.create(null);byRouteReason=Object.create(null);byTransition=Object.create(null);samples=[];previous=typeof WeakMap!=='undefined'?new WeakMap():null;}
function snapshot(){return{version:'1.0',counts:Object.assign({},counts),owners:top(byOwner,20),kinds:top(byKind,20),routeReasons:top(byRouteReason,20),routeTransitions:top(byTransition,20),samples:samples.slice()};}
function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__physicalPointWrapped)w.obj[w.key]=w.fn;}wrapped=[];}

wrapRoute();wrapStations();wrapResolver();
root.BattlePhysicalPointProfiler={version:'1.0',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);
