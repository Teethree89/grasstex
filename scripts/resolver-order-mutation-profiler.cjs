/* Benchmark-only resolver mutation tracer.
   Localizes changes to _movementResolver.order while resolve() is executing. This is diagnostic
   only: it observes object/point identity around public calls used by resolve and never changes
   runtime values or return values. */
(function(root){
'use strict';
if(root.BattleResolverOrderMutationProfiler)return;
var EPS=.000001,counts=Object.create(null),samples=[],wrapped=[],active=typeof WeakMap!=='undefined'?new WeakMap():null,ids=typeof WeakMap!=='undefined'?new WeakMap():null,nextId=1;
function inc(k,n){counts[k]=(counts[k]||0)+(n==null?1:n);}
function p(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function d(a,b){a=p(a);b=p(b);return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function id(v){if(!v||!ids)return v?1:0;var q=ids.get(v);if(!q){q=nextId++;ids.set(v,q);}return q;}
function snap(s){var st=s&&s._movementResolver,o=st&&st.order,g=st&&st.goal;return{stateId:id(st),orderId:id(o),orderPointId:id(o&&o.point),order:p(o&&o.point),orderIntent:p(o&&o.intentPoint),orderSignature:String(o&&o.signature||''),goalId:id(g),goalPointId:id(g&&g.point),goal:p(g&&g.point),goalSignature:String(g&&g.signature||''),orderIsGoal:!!(o&&g&&o===g),pointIsGoalPoint:!!(o&&g&&o.point===g.point),orderDestination:p(s&&s.orderDestination),fireteam:p(s&&s._fireteamDestination)};}
function changed(a,b){return a&&b&&(a.stateId!==b.stateId||a.orderId!==b.orderId||d(a.order,b.order)>EPS||a.orderPointId!==b.orderPointId);}
function note(ctx,stage,before,after){if(!ctx||!changed(before,after))return;ctx.stages.push(stage);inc('stage.'+stage);if(before.stateId!==after.stateId)inc('change.stateReplaced');if(before.orderId!==after.orderId)inc('change.orderReplaced');if(d(before.order,after.order)>EPS)inc('change.orderPointValue');if(before.orderPointId!==after.orderPointId)inc('change.orderPointObject');}
function wrapStage(obj,key,label){if(!obj||typeof obj[key]!=='function')return;var fn=obj[key];if(fn.__resolverMutationWrapped)return;function profiled(){var s=arguments[0],ctx=active&&active.get(s),before=ctx?snap(s):null,out=fn.apply(this,arguments),after=ctx?snap(s):null;if(ctx)note(ctx,label,before,after);return out;}profiled.__resolverMutationWrapped=true;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});}
function installStages(){wrapStage(root.BattleTacticalPositions,'update','tacticalPositions.update');wrapStage(root.BattleTacticalPositions,'waypoint','tacticalPositions.waypoint');wrapStage(root.BattleMovementProgress,'observe','movementProgress.observe');wrapStage(root.BattleTacticalRoute,'resolve','tacticalRoute.resolve');}
function wrapResolve(){var R=root.BattleMovementResolver;if(!R||typeof R.resolve!=='function')return;var fn=R.resolve;if(fn.__resolverMutationWrapped)return;function profiled(s,b){var before=snap(s),ctx={stages:[],time:+(b&&b.time)||0,before:before};if(active&&s)active.set(s,ctx);var out;try{out=fn.apply(this,arguments);}finally{if(active&&s)active.delete(s);}var after=snap(s);inc('resolveCalls');if(changed(before,after)){inc('orderChangedDuringResolve');if(ctx.stages.length)inc('orderChangedDuringResolve.publicStage');else inc('orderChangedDuringResolve.privatePath');if(before.stateId===after.stateId&&before.orderId===after.orderId&&d(before.order,after.order)>EPS)inc('orderChangedDuringResolve.sameOrderObjectPointMutation');if(before.orderId!==after.orderId)inc('orderChangedDuringResolve.orderReplacement');if(samples.length<160)samples.push({time:ctx.time,soldier:String(s&&s.id||''),stages:ctx.stages.slice(),before:before,after:after});}return out;}profiled.__resolverMutationWrapped=true;R.resolve=profiled;wrapped.push({obj:R,key:'resolve',fn:fn});}
function reset(){counts=Object.create(null);samples=[];ids=typeof WeakMap!=='undefined'?new WeakMap():null;nextId=1;}
function snapshot(){return{version:'1.3-lightweight',counts:Object.assign({},counts),samples:samples.slice()};}
function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__resolverMutationWrapped)w.obj[w.key]=w.fn;}wrapped=[];}
installStages();wrapResolve();
root.BattleResolverOrderMutationProfiler={version:'1.3-lightweight',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);
