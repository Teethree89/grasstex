/* Benchmark-only formation order ingress attribution.
   Identifies who calls MovementResolver.proposeOrder and whether that call changes the committed
   formation order away from the Meso fireteam destination. No runtime behavior is changed. */
(function(root){
'use strict';
if(root.BattleOrderIngressProfiler)return;
var EPS=.05,counts=Object.create(null),byProducer=Object.create(null),byTransition=Object.create(null),samples=[],wrapped=[];
function inc(k,n){counts[k]=(counts[k]||0)+(n==null?1:n);}
function incMap(m,k,n){m[k]=(m[k]||0)+(n==null?1:n);}
function p(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function d(a,b){a=p(a);b=p(b);return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function safe(v){return String(v==null||v===''?'none':v).replace(/[^a-zA-Z0-9_.:-]+/g,'_').slice(0,120);}
function top(m,n){return Object.keys(m).map(function(k){return{key:k,count:m[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,n||30);}
function sample(type,row){if(samples.length<180)samples.push(Object.assign({type:type},row||{}));}
function classifyStack(stack){
  stack=String(stack||'');
  if(/updateFireteams/.test(stack))return'meso-updateFireteams';
  if(/fallbackBehavior/.test(stack))return'fallbackBehavior';
  if(/issueOrders/.test(stack))return'legacy-issueOrders';
  if(/setDestination/.test(stack))return'setDestination';
  var lines=stack.split('\n');
  for(var i=1;i<lines.length;i++){
    var line=lines[i];
    if(/order-ingress-profiler|profiled|proposeOrder/.test(line))continue;
    var m=line.match(/at\s+([^\s(]+)/);if(m&&m[1])return'other:'+safe(m[1]);
  }
  return'other:unknown';
}
function wrap(){
  var R=root.BattleMovementResolver;if(!R||typeof R.proposeOrder!=='function')return;var fn=R.proposeOrder;if(fn.__orderIngressWrapped)return;
  function profiled(s,next,b,urgent){
    var st=s&&s._movementResolver,before=st&&st.order,oldPoint=p(before&&before.point),team=p(s&&s._fireteamDestination),raw=p(next),stack='';
    try{stack=(new Error()).stack||'';}catch(_){}
    var producer=classifyStack(stack),rawMatchesTeam=!!(team&&raw&&d(team,raw)<=EPS),rawDiffersTeam=!!(team&&raw&&d(team,raw)>EPS);
    inc('calls');inc('producer.'+producer);incMap(byProducer,producer);
    if(urgent)inc('urgent');else inc('normal');
    if(team){inc('withFireteam');if(rawMatchesTeam)inc('rawMatchesFireteam');if(rawDiffersTeam)inc('rawDiffersFireteam');}
    var out=fn.apply(this,arguments);st=s&&s._movementResolver;var after=st&&st.order,newPoint=p(after&&after.point),changed=before!==after||d(oldPoint,newPoint)>EPS;
    if(changed){
      inc('orderChanged');inc('orderChanged.producer.'+producer);incMap(byTransition,producer+'|changed');
      if(team&&newPoint&&d(newPoint,team)<=EPS)inc('orderChanged.matchesFireteam');
      else if(team){inc('orderChanged.differsFireteam');inc('orderChanged.differsFireteam.producer.'+producer);}
      if(rawMatchesTeam)inc('orderChanged.rawMatchesFireteam');
      if(rawDiffersTeam)inc('orderChanged.rawDiffersFireteam');
      if(samples.length<180)sample('order-change',{time:+(b&&b.time)||0,soldier:String(s&&s.id||''),producer:producer,urgent:!!urgent,raw:raw,fireteam:team,before:oldPoint,after:newPoint,rawMatchesFireteam:rawMatchesTeam,rawDiffersFireteam:rawDiffersTeam,afterDiffersFireteam:!!(team&&newPoint&&d(team,newPoint)>EPS),stack:stack.split('\n').slice(0,8)});
    }else{
      inc('orderRetained');inc('orderRetained.producer.'+producer);
      if(rawDiffersTeam)inc('shadowRejected.producer.'+producer);
    }
    return out;
  }
  profiled.__orderIngressWrapped=true;R.proposeOrder=profiled;wrapped.push({obj:R,key:'proposeOrder',fn:fn});
}
function reset(){counts=Object.create(null);byProducer=Object.create(null);byTransition=Object.create(null);samples=[];}
function snapshot(){return{version:'1.0',counts:Object.assign({},counts),producers:top(byProducer,30),transitions:top(byTransition,30),samples:samples.slice()};}
function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__orderIngressWrapped)w.obj[w.key]=w.fn;}wrapped=[];}
wrap();
root.BattleOrderIngressProfiler={version:'1.0',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);
