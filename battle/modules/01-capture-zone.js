/* Built-in modular objective: timed occupation/capture zone. */
(function(root){
  'use strict';
  if(!root.BattleModules)return;

  function distance2(a,b){var dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
  function countPresence(instance,sim,helpers){
    var def=instance.def,r=(+def.radius||20),r2=r*r,weights={};
    helpers.unitsFor(sim).forEach(function(unit){
      var f=unit.faction;if(!f)return;
      if(distance2(unit.root.position,def)>r2)return;
      var w=unit.captureWeight==null?1:+unit.captureWeight;if(!(w>0))return;
      weights[f]=(weights[f]||0)+w;
    });
    return weights;
  }
  function leadingFaction(weights,minPresence){
    var ranked=Object.keys(weights).map(function(f){return {faction:f,weight:weights[f]};}).sort(function(a,b){return b.weight-a.weight;});
    if(!ranked.length||ranked[0].weight<minPresence)return null;
    if(ranked[1]&&ranked[0].weight<=ranked[1].weight)return null;
    return ranked[0];
  }
  function init(instance){
    return {owner:instance.def.initialOwner||'neutral',active:null,lastActive:null,progress:0,phase:'idle',weights:{}};
  }
  function tick(instance,sim,dt,helpers){
    var def=instance.def,state=instance.state,captureSeconds=+def.captureSeconds||12,minPresence=+def.minPresence||2;
    var weights=countPresence(instance,sim,helpers),leader=leadingFaction(weights,minPresence),active=leader&&leader.faction||null;
    state.weights=weights;

    if(active!==state.lastActive){
      if(active)helpers.telemetry(sim,'objective-pressure',{objective:instance.id,sector:instance.id,faction:active,weights:weights,owner:state.owner});
      state.progress=0;state.lastActive=active;
    }
    state.active=active;

    if(!active){
      state.phase='idle';state.progress=Math.max(0,state.progress-dt*.35);return;
    }
    if(state.owner===active){state.phase='held';state.progress=0;return;}

    var opposition=0;Object.keys(weights).forEach(function(f){if(f!==active)opposition+=weights[f]||0;});
    var advantage=Math.max(1,(weights[active]||0)-opposition),rate=1+Math.min(2,Math.max(0,advantage-1))*.25;
    state.phase=state.owner==='neutral'?'capturing':'neutralizing';state.progress+=dt*rate;
    helpers.stats.pressureSecondsByFaction[active]=(helpers.stats.pressureSecondsByFaction[active]||0)+dt;

    if(state.progress<captureSeconds)return;
    if(state.owner!=='neutral'){
      var previous=state.owner;state.owner='neutral';state.progress=0;
      helpers.stats.neutralizations++;helpers.stats.neutralizationsByFaction[active]=(helpers.stats.neutralizationsByFaction[active]||0)+1;
      helpers.telemetry(sim,'objective-neutralized',{objective:instance.id,sector:instance.id,by:active,previousOwner:previous});
      return;
    }
    state.owner=active;state.progress=0;state.phase='held';
    helpers.stats.captures++;helpers.stats.capturesByFaction[active]=(helpers.stats.capturesByFaction[active]||0)+1;
    helpers.telemetry(sim,'objective-captured',{objective:instance.id,sector:instance.id,faction:active,seconds:captureSeconds});
  }
  function status(instance){
    var s=instance.state,captureSeconds=+instance.def.captureSeconds||12,pct=Math.round(Math.min(100,s.progress/captureSeconds*100));
    return {owner:s.owner,active:s.active,progress:pct,phase:s.phase,weights:Object.assign({},s.weights),us:s.weights.us||0,ge:s.weights.ge||0,radius:+instance.def.radius||20};
  }

  root.BattleModules.registerObjectiveType('capture-zone',{version:'19',label:'Timed capture zone',init:init,tick:tick,status:status});
})(typeof window!=='undefined'?window:globalThis);
