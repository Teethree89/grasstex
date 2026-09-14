/* Built-in modular objective: timed occupation/capture zone.
   Capture zones own marker/control state and publish a short post-capture security request. Force
   Command consumes that request and remains the sole writer of squad objective/phase/target fields. */
(function(root){
  'use strict';
  if(!root.BattleModules)return;

  var POST_CAPTURE_HOLD=18,DEFENSE_ENTER_RATIO=.92,DEFENSE_RELEASE_RATIO=1.35;
  var COLOR_NEUTRAL={r:1,g:.76,b:.16},COLOR_US={r:.20,g:.56,b:1},COLOR_GE={r:1,g:.25,b:.18},COLOR_CONTESTED={r:1,g:1,b:1};

  function distance2(a,b){var dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
  function distance(a,b){return Math.sqrt(distance2(a,b));}
  function color3(c){return new BABYLON.Color3(c.r,c.g,c.b);}
  function objectivePoint(instance){var d=instance&&instance.def||{};return{x:+d.x||0,z:+d.z||0};}
  function enemyFaction(f){return f==='us'?'ge':'us';}
  function squadAverage(sq){
    var alive=[],x=0,z=0;
    for(var i=0;i<(sq.members||[]).length;i++)if(!sq.members[i].dead)alive.push(sq.members[i]);
    if(!alive.length)return sq.rally?{x:sq.rally.x,z:sq.rally.z}:{x:0,z:0};
    for(i=0;i<alive.length;i++){x+=alive[i].root.position.x;z+=alive[i].root.position.z;}
    return{x:x/alive.length,z:z/alive.length};
  }

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
    return {owner:instance.def.initialOwner||'neutral',active:null,lastActive:null,progress:0,progressBy:null,phase:'idle',weights:{}};
  }
  function tick(instance,sim,dt,helpers){
    var def=instance.def,state=instance.state,captureSeconds=+def.captureSeconds||12,minPresence=+def.minPresence||2;
    var weights=countPresence(instance,sim,helpers),leader=leadingFaction(weights,minPresence),active=leader&&leader.faction||null;
    state.weights=weights;

    if(active!==state.lastActive){
      if(active)helpers.telemetry(sim,'objective-pressure',{objective:instance.id,sector:instance.id,faction:active,weights:weights,owner:state.owner});
      state.lastActive=active;
    }
    state.active=active;

    /* Losing the lead is not the same as losing the ground.
       This used to slam progress to zero on every change of `active`, including the change to
       nobody - and `active` goes to nobody whenever presence dips under minPresence for a moment
       or the two sides momentarily tie, which is constantly. Twelve seconds of work was wiped by
       one man stepping outside the ring or one casualty, so a contested zone could never be taken
       and the decay below was unreachable dead code. Progress now decays while the zone is empty
       and is only cancelled outright when the other side actually takes over the work. */
    if(!active){
      state.phase='idle';state.progress=Math.max(0,state.progress-dt*.35);
      if(state.progress<=0)state.progressBy=null;
      return;
    }
    if(state.progressBy&&state.progressBy!==active)state.progress=0;
    state.progressBy=active;
    if(state.owner===active){state.phase='held';state.progress=0;state.progressBy=null;return;}

    var opposition=0;Object.keys(weights).forEach(function(f){if(f!==active)opposition+=weights[f]||0;});
    var advantage=Math.max(1,(weights[active]||0)-opposition),rate=1+Math.min(2,Math.max(0,advantage-1))*.25;
    state.phase=state.owner==='neutral'?'capturing':'neutralizing';state.progress+=dt*rate;
    helpers.stats.pressureSecondsByFaction[active]=(helpers.stats.pressureSecondsByFaction[active]||0)+dt;

    if(state.progress<captureSeconds)return;
    if(state.owner!=='neutral'){
      var previous=state.owner;state.owner='neutral';state.progress=0;state.progressBy=null;
      helpers.stats.neutralizations++;helpers.stats.neutralizationsByFaction[active]=(helpers.stats.neutralizationsByFaction[active]||0)+1;
      helpers.telemetry(sim,'objective-neutralized',{objective:instance.id,sector:instance.id,by:active,previousOwner:previous});
      return;
    }
    state.owner=active;state.progress=0;state.progressBy=null;state.phase='held';
    helpers.stats.captures++;helpers.stats.capturesByFaction[active]=(helpers.stats.capturesByFaction[active]||0)+1;
    helpers.telemetry(sim,'objective-captured',{objective:instance.id,sector:instance.id,faction:active,seconds:captureSeconds});
  }
  function status(instance){
    var s=instance.state,captureSeconds=+instance.def.captureSeconds||12,pct=Math.round(Math.min(100,s.progress/captureSeconds*100));
    return {owner:s.owner,active:s.active,progress:pct,phase:s.phase,weights:Object.assign({},s.weights),us:s.weights.us||0,ge:s.weights.ge||0,radius:+instance.def.radius||20};
  }

  function disposeMarkers(sim){
    var markers=sim&&sim._captureZoneMarkers;if(!markers)return;
    Object.keys(markers).forEach(function(id){var m=markers[id];if(!m)return;['ring','pole','cap'].forEach(function(k){try{if(m[k])m[k].dispose();}catch(_){}});try{if(m.material)m.material.dispose();}catch(_){}});
    sim._captureZoneMarkers=null;sim._captureZoneMarkerScenario=null;
  }
  function markerScenarioId(sim,payload){var town=payload&&payload.town||sim&&sim.scene&&sim.scene.metadata&&(sim.scene.metadata.battleScenario||sim.scene.metadata.battleTown);return town&&town.id||'default';}
  function markerColor(st){
    var us=+(st&&st.us||0),ge=+(st&&st.ge||0);
    if(us>0&&ge>0&&!st.active)return COLOR_CONTESTED;
    if(st&&st.active==='us'&&st.owner!=='us')return COLOR_US;
    if(st&&st.active==='ge'&&st.owner!=='ge')return COLOR_GE;
    if(st&&st.owner==='us')return COLOR_US;
    if(st&&st.owner==='ge')return COLOR_GE;
    return COLOR_NEUTRAL;
  }
  function createMarker(sim,obj){
    if(typeof BABYLON==='undefined'||!sim||!sim.scene)return null;
    var scene=sim.scene,def=obj.def||{},cx=+def.x||0,cz=+def.z||0,r=+def.radius||20,points=[],segments=56;
    for(var i=0;i<=segments;i++){var a=i/segments*Math.PI*2,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;points.push(new BABYLON.Vector3(x,sim.heightAt(x,z)+.24,z));}
    var ring=BABYLON.MeshBuilder.CreateLines('objective-ring-'+obj.id,{points:points},scene);ring.isPickable=false;ring.color=color3(COLOR_NEUTRAL);ring.alpha=.96;ring.renderingGroupId=2;
    var y=sim.heightAt(cx,cz),pole=BABYLON.MeshBuilder.CreateCylinder('objective-pole-'+obj.id,{height:9,diameter:.42,tessellation:8},scene);pole.position.set(cx,y+4.5,cz);pole.isPickable=false;pole.renderingGroupId=2;
    var cap=BABYLON.MeshBuilder.CreateSphere('objective-cap-'+obj.id,{diameter:2.4,segments:8},scene);cap.position.set(cx,y+9.2,cz);cap.isPickable=false;cap.renderingGroupId=2;
    var material=new BABYLON.StandardMaterial('objective-marker-mat-'+obj.id,scene);material.diffuseColor=color3(COLOR_NEUTRAL);material.emissiveColor=color3(COLOR_NEUTRAL).scale(.72);material.specularColor=BABYLON.Color3.Black();material.disableLighting=false;pole.material=material;cap.material=material;
    return{ring:ring,pole:pole,cap:cap,material:material};
  }
  function ensureMarkers(sim,payload){
    if(!sim||!sim._objectives||typeof BABYLON==='undefined')return;
    var scenarioId=markerScenarioId(sim,payload);
    if(sim._captureZoneMarkerScenario!==scenarioId){disposeMarkers(sim);sim._captureZoneMarkerScenario=scenarioId;sim._captureZoneMarkers={};}
    var markers=sim._captureZoneMarkers||(sim._captureZoneMarkers={});
    sim._objectives.forEach(function(obj){if(obj.type==='capture-zone'&&!markers[obj.id])markers[obj.id]=createMarker(sim,obj);});
  }
  function updateMarkers(sim,payload){
    ensureMarkers(sim,payload);var markers=sim&&sim._captureZoneMarkers;if(!markers)return;
    (sim._objectives||[]).forEach(function(obj){
      var marker=markers[obj.id];if(!marker)return;var st=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status(sim,obj.id)||obj.state||{},c=markerColor(st),col=color3(c);
      marker.ring.color=col;marker.material.diffuseColor=col;marker.material.emissiveColor=col.scale(st.phase==='capturing'||st.phase==='neutralizing'?1:.72);
      var pulse=st.phase==='capturing'||st.phase==='neutralizing'?1+Math.sin((sim.time||0)*5)*.10:1;marker.cap.scaling.set(pulse,pulse,pulse);
    });
  }

  function objectiveForSquad(sim,sq){
    var request=sq._captureZoneDefenseRequest,preferred=request&&request.objectiveId||sq._objectiveDefenseId||sq.targetObjective,objs=sim._objectives||[],i,obj,p,r,d,best=null;
    if(preferred&&root.BattleObjectiveSystem){obj=root.BattleObjectiveSystem.get(sim,preferred);if(obj&&obj.type==='capture-zone')return obj;}
    p=squadAverage(sq);
    for(i=0;i<objs.length;i++){
      obj=objs[i];if(obj.type!=='capture-zone')continue;r=+obj.def.radius||20;d=distance(p,objectivePoint(obj));
      if(d<=r*DEFENSE_ENTER_RATIO&&(!best||d<best.distance))best={instance:obj,distance:d};
    }
    return best&&best.instance||null;
  }
  function requestDefense(sim,sq,obj,p,why){
    var point=objectivePoint(obj),prior=sq._captureZoneDefenseRequest,changed=!prior||prior.objectiveId!==obj.id;
    sq._captureZoneDefenseRequest={objectiveId:obj.id,point:{x:point.x,z:point.z},anchor:changed?{x:p.x,z:p.z}:prior.anchor,requestedAt:+(sim.time||0),reason:why||'secure'};
    if(changed){
      if(root.BattleTelemetry)root.BattleTelemetry.record('objective-defense-request',{faction:sq.faction,squad:sq.id,objective:obj.id,reason:why||'secure'},sim);
    }
  }
  function releaseDefense(sim,sq,reason){
    var request=sq._captureZoneDefenseRequest;if(!request)return;
    if(root.BattleTelemetry)root.BattleTelemetry.record('objective-defense-release',{faction:sq.faction,squad:sq.id,objective:request.objectiveId,reason:reason||'released'},sim);
    sq._captureZoneDefenseRequest=null;sq._captureZoneSecureUntil=0;
  }
  function defendCaptureZones(sim){
    ['us','ge'].forEach(function(faction){
      var squads=sim.factions&&sim.factions[faction]&&sim.factions[faction].squads||[];
      squads.forEach(function(sq){
        if(!sq||sq.state==='retreat'){releaseDefense(sim,sq,'retreat');return;}
        var obj=objectiveForSquad(sim,sq);if(!obj){releaseDefense(sim,sq,'left objective');return;}
        var st=root.BattleObjectiveSystem&&root.BattleObjectiveSystem.status(sim,obj.id)||obj.state||{},p=squadAverage(sq),point=objectivePoint(obj),r=+obj.def.radius||20,d=distance(p,point),enemy=enemyFaction(faction),friendlyWeight=+(st[faction]||0),enemyWeight=+(st[enemy]||0);
        var request=sq._captureZoneDefenseRequest,inside=d<=r*DEFENSE_ENTER_RATIO,already=!!(request&&request.objectiveId===obj.id),enemyPresent=enemyWeight>0,ours=st.owner===faction,taking=!ours&&inside&&(friendlyWeight>0||st.active===faction),contested=inside&&friendlyWeight>0&&enemyPresent;
        if(taking||contested){
          sq._captureZoneSecureUntil=Math.max(sq._captureZoneSecureUntil||0,(sim.time||0)+POST_CAPTURE_HOLD);requestDefense(sim,sq,obj,p,contested?'contested objective':'capturing objective');return;
        }
        if(ours&&inside){
          if(!sq._captureZoneSecureUntil)sq._captureZoneSecureUntil=(sim.time||0)+POST_CAPTURE_HOLD;
          if(enemyPresent||already&&(sim.time||0)<sq._captureZoneSecureUntil){requestDefense(sim,sq,obj,p,enemyPresent?'defending pressure':'securing captured objective');return;}
        }
        if(already&&ours&&d<=r*DEFENSE_RELEASE_RATIO&&(sim.time||0)<(sq._captureZoneSecureUntil||0)){requestDefense(sim,sq,obj,p,'securing perimeter');return;}
        releaseDefense(sim,sq,ours?'objective secure':'objective lost');
      });
    });
  }

  root.BattleModules.registerObjectiveType('capture-zone',{version:'29-objective-defense',label:'Timed capture zone',init:init,tick:tick,status:status});
  root.BattleModules.registerSystem('capture-zone-tactics',{
    version:'29-objective-defense',
    onBattleStart:function(sim,payload){ensureMarkers(sim,payload);updateMarkers(sim,payload);},
    onBattleRestart:function(sim,payload){
      ['us','ge'].forEach(function(f){(sim.factions&&sim.factions[f]&&sim.factions[f].squads||[]).forEach(function(sq){sq._captureZoneDefenseRequest=null;sq._captureZoneSecureUntil=0;});});
      updateMarkers(sim,payload);
    },
    onCommanderTick:function(sim,payload){defendCaptureZones(sim);updateMarkers(sim,payload);}
  });
  console.log('[OBJECTIVE] capture zones v29: visible markers + defensive secure state active');
})(typeof window!=='undefined'?window:globalThis);
