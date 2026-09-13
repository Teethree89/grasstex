/* Adds explicit occupancy/vacancy semantics to capture-zone status.
   Ownership persists after troops leave, so AI needs to distinguish "enemy owned" from
   "enemy actually present".  This is read-only objective metadata; capture rules are unchanged. */
(function(root){
  'use strict';
  if(!root.BattleModules||root.BattleObjectiveOccupancy)return;
  var type=root.BattleModules.getObjectiveType&&root.BattleModules.getObjectiveType('capture-zone');
  if(!type||typeof type.status!=='function')return;
  var oldStatus=type.status;
  function enrich(status){
    status=status||{};
    var weights=status.weights||{},keys=Object.keys(weights),total=0,present=[];
    for(var i=0;i<keys.length;i++){
      var f=keys[i],w=+weights[f]||0;if(w>0){total+=w;present.push(f);}
    }
    var owner=status.owner||'neutral',ownerWeight=owner&&owner!=='neutral'?(+weights[owner]||+status[owner]||0):0;
    status.presenceTotal=total;
    status.presentFactions=present;
    status.occupied=total>0;
    status.vacant=total<=0;
    status.contested=present.length>1;
    status.ownerPresent=owner==='neutral'?false:ownerWeight>0;
    status.vacantOwner=owner!=='neutral'&&!status.ownerPresent;
    return status;
  }
  type.status=function(instance,sim,api){return enrich(oldStatus(instance,sim,api));};
  root.BattleObjectiveOccupancy={version:'66-occupancy-state',enrich:enrich};
  if(typeof console!=='undefined')console.log('[OBJECTIVE] explicit occupied/vacant owner state active');
})(typeof window!=='undefined'?window:globalThis);
