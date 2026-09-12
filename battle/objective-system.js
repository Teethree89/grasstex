/* Battle Sim v19 objective service.
   Objective behavior is supplied by registered objective modules. The commander only chooses
   where to send units; this service owns objective state, capture progress and telemetry. */
(function(root){
  'use strict';
  if(!root.BattleModules)return;

  function telemetry(sim,type,data){if(root.BattleTelemetry)root.BattleTelemetry.record(type,data,sim);}
  function unitsFor(sim){return root.BattleModules.unitsFor(sim).filter(function(u){return u&&!u.dead&&u.root&&u.root.position;});}
  function factionList(sim){return Object.keys(sim&&sim.factions||{us:1,ge:1});}

  function attach(sim,defs,context){
    defs=defs||[];sim._objectives=[];sim._objectiveById=Object.create(null);
    sim.objectiveStats={captures:0,neutralizations:0,capturesByFaction:{},neutralizationsByFaction:{},pressureSecondsByFaction:{}};
    factionList(sim).forEach(function(f){sim.objectiveStats.capturesByFaction[f]=0;sim.objectiveStats.neutralizationsByFaction[f]=0;sim.objectiveStats.pressureSecondsByFaction[f]=0;});
    sim.objectiveHold={};factionList(sim).forEach(function(f){sim.objectiveHold[f]=0;});

    defs.forEach(function(raw,index){
      var def=Object.assign({},raw||{}),id=String(def.id||('objective-'+index)),type=def.type||'capture-zone';
      var handler=root.BattleModules.getObjectiveType(type);
      if(!handler)throw new Error('Unknown objective type '+type+' for '+id);
      var instance={id:id,type:type,def:def,handler:handler,state:null,context:context||{}};
      instance.state=typeof handler.init==='function'?handler.init(instance,sim,api):{};
      sim._objectives.push(instance);sim._objectiveById[id]=instance;
    });
    refreshControl(sim);
    telemetry(sim,'objective-system-attached',{count:sim._objectives.length,types:sim._objectives.map(function(o){return o.type;})});
    return sim._objectives;
  }

  function refreshControl(sim){
    var control={};var counts={};factionList(sim).forEach(function(f){counts[f]=0;});
    (sim._objectives||[]).forEach(function(o){
      var h=o.handler,status=typeof h.status==='function'?h.status(o,sim,api):Object.assign({},o.state||{});
      status=status||{};status.id=o.id;status.type=o.type;status.label=o.def.label||o.id;
      control[o.id]=status;if(status.owner&&counts[status.owner]!=null)counts[status.owner]++;
    });
    sim.objectiveControl={us:counts.us||0,ge:counts.ge||0,sectors:control,objectives:control,counts:counts,total:Object.keys(control).length};
    return sim.objectiveControl;
  }

  function tick(sim,dt){
    if(!sim||!sim._objectives)return null;
    var helpers={telemetry:telemetry,unitsFor:unitsFor,stats:sim.objectiveStats};
    sim._objectives.forEach(function(o){if(typeof o.handler.tick==='function')o.handler.tick(o,sim,dt,helpers);});
    var control=refreshControl(sim),total=control.total;
    factionList(sim).forEach(function(f){sim.objectiveHold[f]=(total>0&&control.counts[f]===total)?(sim.objectiveHold[f]||0)+dt:0;});
    return control;
  }

  function reset(sim,defs,context){return attach(sim,defs,context);}
  function get(sim,id){return sim&&sim._objectiveById?sim._objectiveById[id]||null:null;}
  function status(sim,id){var o=get(sim,id);if(!o)return null;return typeof o.handler.status==='function'?o.handler.status(o,sim,api):o.state;}
  function definitionsFromTown(town){return town?(town.objectives||town.sectors||[]):[];}
  function ownedCount(sim,faction){var c=sim&&sim.objectiveControl;return c&&c.counts?c.counts[faction]||0:0;}
  function allOwnedBy(sim,faction){var c=sim&&sim.objectiveControl;return !!(c&&c.total>0&&ownedCount(sim,faction)===c.total);}
  function summary(sim){
    return {control:sim&&sim.objectiveControl||null,stats:sim&&sim.objectiveStats||null,hold:sim&&sim.objectiveHold||null};
  }

  var api={attach:attach,reset:reset,tick:tick,get:get,status:status,unitsFor:unitsFor,definitionsFromTown:definitionsFromTown,ownedCount:ownedCount,allOwnedBy:allOwnedBy,summary:summary};
  root.BattleObjectiveSystem=api;
  root.BattleModules.registerSystem('objectives',{version:'19',init:function(sim,payload){var town=payload&&payload.town;attach(sim,definitionsFromTown(town),{town:town});}});
  console.log('[OBJECTIVES] modular objective service v19 loaded');
})(typeof window!=='undefined'?window:globalThis);
