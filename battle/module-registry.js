/* Battle Sim v19 extension registry.
   New units/objectives/systems register here instead of hard-coding themselves into the
   commander or operator UI. Files under battle/modules/ are discovered and loaded by PHP. */
(function(root){
  'use strict';

  var registries={unitTypes:Object.create(null),objectiveTypes:Object.create(null),systems:Object.create(null)};

  function assertId(id){
    id=String(id||'').trim();
    if(!/^[a-z0-9][a-z0-9._-]*$/i.test(id))throw new Error('Invalid battle module id: '+id);
    return id;
  }
  function register(kind,id,spec){
    id=assertId(id);spec=spec||{};
    if(registries[kind][id])throw new Error('Battle module already registered: '+kind+'/'+id);
    spec.id=id;registries[kind][id]=spec;
    console.log('[MODULE] registered '+kind+'/'+id+(spec.version?' v'+spec.version:''));
    return spec;
  }
  function list(kind){return Object.keys(registries[kind]).sort().map(function(id){return registries[kind][id];});}
  function get(kind,id){return registries[kind][id]||null;}

  function registerUnitType(id,spec){return register('unitTypes',id,spec);}
  function registerObjectiveType(id,spec){return register('objectiveTypes',id,spec);}
  function registerSystem(id,spec){return register('systems',id,spec);}

  function addUnit(sim,unit,meta){
    if(!sim||!unit)return unit;
    sim._moduleUnits=sim._moduleUnits||[];
    if(sim._moduleUnits.indexOf(unit)<0)sim._moduleUnits.push(unit);
    unit.unitType=unit.unitType||(meta&&meta.unitType)||'unknown';
    if(unit.captureWeight==null)unit.captureWeight=(meta&&meta.captureWeight!=null)?+meta.captureWeight:1;
    return unit;
  }
  function unitsFor(sim){
    var out=[],seen=[];
    function push(u){if(!u||seen.indexOf(u)>=0)return;seen.push(u);out.push(u);}
    if(sim&&sim._roster){
      (sim._roster.us||[]).forEach(push);(sim._roster.ge||[]).forEach(push);
    }
    if(sim&&sim._moduleUnits)(sim._moduleUnits||[]).forEach(push);
    return out;
  }
  function nextEntityId(sim){
    var max=-1;unitsFor(sim).forEach(function(u){var n=+u.id;if(isFinite(n))max=Math.max(max,n);});
    return max+1;
  }
  function spawnUnitType(id,sim,faction,opts){
    var spec=get('unitTypes',id);
    if(!spec||typeof spec.spawn!=='function')throw new Error('Unit module cannot spawn: '+id);
    var result=spec.spawn(sim,faction,opts||{});
    if(root.BattleTelemetry)root.BattleTelemetry.record('module-spawn',{unitType:id,faction:faction,label:spec.label||id},sim);
    return result;
  }

  function runHook(name,sim,payload){
    list('systems').forEach(function(system){
      var fn=system&&system[name];
      if(typeof fn==='function'){
        try{fn(sim,payload||{});}catch(e){console.error('[MODULE] '+system.id+'.'+name+' failed',e);}
      }
    });
  }

  root.BattleModules={
    registerUnitType:registerUnitType,
    registerObjectiveType:registerObjectiveType,
    registerSystem:registerSystem,
    getUnitType:function(id){return get('unitTypes',id);},
    getObjectiveType:function(id){return get('objectiveTypes',id);},
    getSystem:function(id){return get('systems',id);},
    listUnitTypes:function(){return list('unitTypes');},
    listObjectiveTypes:function(){return list('objectiveTypes');},
    listSystems:function(){return list('systems');},
    addUnit:addUnit,
    unitsFor:unitsFor,
    nextEntityId:nextEntityId,
    spawnUnitType:spawnUnitType,
    runHook:runHook
  };
  console.log('[MODULE] registry v19 loaded');
})(typeof window!=='undefined'?window:globalThis);
