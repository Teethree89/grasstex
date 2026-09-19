/* Benchmark-only Meso fireteam churn attribution.
   Inject after the Battle Sim runtime has loaded. This observes SquadAI.updateSquad and
   MovementResolver.proposeOrder without changing return values, scheduling, or state. */
(function(root){
'use strict';
if(root.BattleMesoChurnProfiler)return;

var EPS=.05,objects=typeof WeakMap!=='undefined'?new WeakMap():null,nextObjectId=1;
var counts=Object.create(null),bySquad=Object.create(null),byTeam=Object.create(null),byKindTransition=Object.create(null),bySignatureTransition=Object.create(null),samples=[];
var previousProposal=Object.create(null),wrapped=[];

function inc(key,n){counts[key]=(counts[key]||0)+(n==null?1:n);}
function incMap(map,key,n){map[key]=(map[key]||0)+(n==null?1:n);}
function safe(v){return String(v==null||v===''?'none':v).replace(/[^a-zA-Z0-9_.|:-]+/g,'_').slice(0,160);}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function dist(a,b){a=point(a);b=point(b);return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function objId(v){if(!v||!objects)return v?1:0;var id=objects.get(v);if(!id){id=nextObjectId++;objects.set(v,id);}return id;}
function teamKey(s){if(s&&s._fireteamKey)return String(s._fireteamKey);var i=+(s&&s.slotIndex)||0;if(i<=1)return'command';if(i===2||i===4||i===5)return'alpha';if(i===3||i===6||i===7)return'bravo';return'charlie';}
function publishKind(key){var a=String(key||'').split('|');return a.length?a[a.length-1]:'none';}
function signatureParts(sig){var a=String(sig||'').split('|');return{phase:a[0]||'',target:a[1]||'',cellX:a[2]||'',cellZ:a[3]||'',rally:a[4]||''};}
function signatureDiff(a,b){a=signatureParts(a);b=signatureParts(b);var out=[];['phase','target','cellX','cellZ','rally'].forEach(function(k){if(a[k]!==b[k])out.push(k);});return out.length?out:['unknown'];}
function top(map,limit){return Object.keys(map).map(function(k){return{key:k,count:map[k]};}).sort(function(a,b){return b.count-a.count;}).slice(0,limit||20);}
function sample(type,data){if(samples.length>=120)return;samples.push(Object.assign({type:type},data||{}));}
function teamOrders(sq){var out=Object.create(null),o=sq&&sq._fireteamOrders||{};['command','alpha','bravo','charlie'].forEach(function(k){var q=o[k];if(!q)return;out[k]={id:objId(q),signature:String(q.signature||''),anchor:point(q.anchor),origin:point(q.origin),forward:point(q.forward),until:+q.until||0};});return out;}
function squadSnapshot(sq,battle){return{time:+(battle&&battle.time)||0,id:String(sq&&sq.id||''),phase:String(sq&&sq.commandPhase||''),target:String(sq&&sq.targetObjective||''),state:String(sq&&sq.state||''),objective:point(sq&&sq.objective),orders:teamOrders(sq),publishStats:Object.assign({},battle&&battle._squadCommandPublishStats||{})};}

function classifyOrderChange(sq,battle,key,before,after){
  if(!before&&after){inc('fireteamOrder.created');incMap(byTeam,key);return;}
  if(before&&!after){inc('fireteamOrder.removed');return;}
  if(!before||!after||before.id===after.id)return;
  inc('fireteamOrder.recommitted');incMap(byTeam,key);
  if(before.signature!==after.signature){
    inc('fireteamOrder.recommit.signatureChanged');
    var diff=signatureDiff(before.signature,after.signature);diff.forEach(function(k){inc('signatureComponent.'+k);});
    incMap(bySignatureTransition,safe(before.signature)+' -> '+safe(after.signature));
    sample('signature-recommit',{time:+battle.time||0,squad:String(sq.id||''),team:key,diff:diff,before:before.signature,after:after.signature});
  }else{
    inc('fireteamOrder.recommit.sameSignature');
    var expired=(+battle.time||0)+1e-9>=before.until;
    var anchorMoved=dist(before.anchor,after.anchor)>EPS;
    var frameMoved=dist(before.forward,after.forward)>EPS;
    if(expired)inc('sameSignature.expired');
    if(anchorMoved)inc('sameSignature.anchorMoved');
    if(frameMoved)inc('sameSignature.frameMoved');
    if(!expired&&!anchorMoved&&!frameMoved)inc('sameSignature.other');
    sample('same-signature-recommit',{time:+battle.time||0,squad:String(sq.id||''),team:key,expired:expired,anchorDelta:+dist(before.anchor,after.anchor).toFixed(3),frameDelta:isFinite(dist(before.forward,after.forward))?+dist(before.forward,after.forward).toFixed(3):null});
  }
}

function wrapUpdateSquad(){
  var obj=root.SquadAI,key='updateSquad';if(!obj||typeof obj[key]!=='function')return;
  var fn=obj[key];if(fn.__mesoChurnWrapped)return;
  function profiled(sq,battle){
    var before=squadSnapshot(sq,battle),out=fn.apply(this,arguments),after=squadSnapshot(sq,battle),keys=['command','alpha','bravo','charlie'];
    inc('squadUpdates');incMap(bySquad,String(sq&&sq.id||'unknown'));
    for(var i=0;i<keys.length;i++)classifyOrderChange(sq,battle,keys[i],before.orders[keys[i]],after.orders[keys[i]]);
    var bp=+before.publishStats.intentPublishes||0,ap=+after.publishStats.intentPublishes||0,bc=+before.publishStats.intentCoalesced||0,ac=+after.publishStats.intentCoalesced||0;
    if(ap>bp)inc('intentPublishes',ap-bp);if(ac>bc)inc('intentCoalesced',ac-bc);
    if(before.phase!==after.phase){inc('squad.phaseChanged');inc('phaseTransition.'+safe(before.phase)+'->'+safe(after.phase));}
    if(before.target!==after.target)inc('squad.targetChanged');
    if(dist(before.objective,after.objective)>EPS)inc('squad.objectiveChanged');
    return out;
  }
  profiled.__mesoChurnWrapped=true;profiled.__mesoChurnOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});
}

function wrapProposeOrder(){
  var obj=root.BattleMovementResolver,key='proposeOrder';if(!obj||typeof obj[key]!=='function')return;
  var fn=obj[key];if(fn.__mesoChurnWrapped)return;
  function profiled(s,next,battle,urgent){
    var team=point(s&&s._fireteamDestination),raw=point(next),isTeam=team&&raw&&dist(team,raw)<=EPS;
    if(isTeam){
      inc('proposeOrder.fireteam');
      var sq=s&&s.squad||{},tk=teamKey(s),order=sq._fireteamOrders&&sq._fireteamOrders[tk],row={time:+(battle&&battle.time)||0,soldier:String(s&&s.id||''),squad:String(sq.id||''),team:tk,orderId:objId(order),signature:String(order&&order.signature||''),publishKey:String(s&&s._fireteamPublishKey||''),kind:publishKind(s&&s._fireteamPublishKey),destination:team};
      incMap(byTeam,tk);inc('publishKind.'+safe(row.kind));
      var prev=previousProposal[row.soldier];
      if(prev){
        var dd=dist(prev.destination,row.destination),orderChanged=prev.orderId!==row.orderId,sigChanged=prev.signature!==row.signature,keyChanged=prev.publishKey!==row.publishKey,kindChanged=prev.kind!==row.kind;
        if(dd>EPS){
          inc('fireteamDestination.changed');incMap(bySquad,row.squad);incMap(byTeam,tk);
          if(orderChanged)inc('destinationChange.orderRecommit');else inc('destinationChange.sameOrder');
          if(sigChanged){inc('destinationChange.signatureChanged');signatureDiff(prev.signature,row.signature).forEach(function(k){inc('destinationSignatureComponent.'+k);});}
          else inc('destinationChange.sameSignature');
          if(keyChanged)inc('destinationChange.publishKeyChanged');else inc('destinationChange.samePublishKey');
          if(kindChanged){inc('destinationChange.kindChanged');incMap(byKindTransition,safe(prev.kind)+'->'+safe(row.kind));}
          else inc('destinationChange.sameKind');
          if(!orderChanged&&!sigChanged&&!keyChanged)inc('destinationChange.slotDrift');
          sample('destination-change',{time:row.time,soldier:row.soldier,squad:row.squad,team:tk,delta:+dd.toFixed(3),orderChanged:orderChanged,sigChanged:sigChanged,keyChanged:keyChanged,kind:row.kind,signature:row.signature});
        }else{
          inc('fireteamDestination.same');
          if(orderChanged)inc('sameDestination.orderRecommit');
          if(keyChanged)inc('sameDestination.publishKeyChanged');
        }
      }else inc('proposeOrder.firstForSoldier');
      previousProposal[row.soldier]=row;
    }else inc('proposeOrder.nonFireteam');
    return fn.apply(this,arguments);
  }
  profiled.__mesoChurnWrapped=true;profiled.__mesoChurnOriginal=fn;obj[key]=profiled;wrapped.push({obj:obj,key:key,fn:fn});
}

function reset(){counts=Object.create(null);bySquad=Object.create(null);byTeam=Object.create(null);byKindTransition=Object.create(null);bySignatureTransition=Object.create(null);samples=[];previousProposal=Object.create(null);}
function snapshot(){return{version:'1.0',counts:Object.assign({},counts),topSquads:top(bySquad,20),topTeams:top(byTeam,10),kindTransitions:top(byKindTransition,20),signatureTransitions:top(bySignatureTransition,30),samples:samples.slice()};}
function restore(){for(var i=wrapped.length-1;i>=0;i--){var w=wrapped[i];if(w.obj&&w.obj[w.key]&&w.obj[w.key].__mesoChurnWrapped)w.obj[w.key]=w.fn;}wrapped=[];}

wrapUpdateSquad();wrapProposeOrder();
root.BattleMesoChurnProfiler={version:'1.0',reset:reset,snapshot:snapshot,restore:restore};
})(typeof window!=='undefined'?window:globalThis);
