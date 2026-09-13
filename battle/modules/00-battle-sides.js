/* Attacker and defender.
   Pure battle-side doctrine derived from the scenario and the operator's defender choice.
   The model mirrors ww2fps defensive depth: contact / security / main / depth, then limits the
   prepared ground to the selected command echelon's practical span of control. */
(function(root){
  'use strict';

  var ECHELONS={
    sergeant:  {label:'Sergeant',  formation:'squad',     span:1, budget:.55, coordination:.18},
    lieutenant:{label:'Lieutenant',formation:'platoon',   span:2, budget:.72, coordination:.38},
    captain:   {label:'Captain',   formation:'company',   span:3, budget:1,   coordination:.62},
    major:     {label:'Major',     formation:'battalion', span:4, budget:1.18,coordination:.82},
    general:   {label:'General',   formation:'formation', span:99,budget:1.32,coordination:1}
  };
  var BANDS={ge:[.31,.46,.73],us:[.32,.46,.73]};
  var DEFAULT_ECHELON='captain',DEFAULT_DENSITY=.6;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function other(f){return f==='us'?'ge':'us';}
  function valid(f){return f==='us'||f==='ge';}

  function spawnPoint(scenario,faction){
    var zones=scenario&&scenario.spawnZones,zone=zones&&zones[faction],center=scenario&&scenario.center||{x:0,z:0};
    var lanes=zone&&zone.lanes||[],x=center.x||0;
    if(lanes.length){x=0;for(var i=0;i<lanes.length;i++)x+=+lanes[i]||0;x/=lanes.length;}
    var z=zone&&isFinite(zone.z)?+zone.z:(faction==='us'?-510:510);
    return{x:x,z:z};
  }

  /* Raw progress is 0 at the attacker's start line and 1 at the defender's. */
  function progressOf(sides,p){
    var a=sides.attackerSpawn,b=sides.defenderSpawn,vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz||1;
    return((p.x-a.x)*vx+(p.z-a.z)*vz)/len2;
  }
  function tacticalFrame(sides,p){
    var a=sides.attackerSpawn,dx=p.x-a.x,dz=p.z-a.z,len=Math.hypot(dx,dz)||1;
    dx/=len;dz/=len;
    return{approach:{x:dx,z:dz},front:{x:-dx,z:-dz},left:{x:-dz,z:dx},
      facingYaw:Math.atan2(-dx,-dz),acrossYaw:Math.atan2(-dz,dx)};
  }
  function offsetPoint(p,frame,rear,lateral){
    lateral=lateral||0;
    return{x:p.x+frame.approach.x*rear+frame.left.x*lateral,z:p.z+frame.approach.z*rear+frame.left.z*lateral};
  }

  function terrainValue(scenario,objective,role){
    var built=0,roadNear=0,r=(+objective.radius||30)*1.7;
    (scenario.buildings||[]).forEach(function(b){if(dist(b.x,b.z,objective.x,objective.z)<=r)built++;});
    (scenario.roads||[]).forEach(function(rd){
      var vx=rd.bx-rd.ax,vz=rd.bz-rd.az,len2=vx*vx+vz*vz||1;
      var t=clamp(((objective.x-rd.ax)*vx+(objective.z-rd.az)*vz)/len2,0,1);
      if(dist(rd.ax+vx*t,rd.az+vz*t,objective.x,objective.z)<r*.8)roadNear=1;
    });
    return clamp(built/6,0,2.2)+roadNear*.7+(+objective.value||1)*.6+
      (role==='main'?2:role==='depth'?1.3:role==='security'?.7:-5);
  }

  function buildSectors(sides,scenario){
    var bands=BANDS[sides.defender]||BANDS.ge,echelon=sides.echelon,objectives=scenario.objectives||[];
    /* Battle Sim objectives occupy one settlement near the map centre, unlike ww2fps objectives
       distributed across most of the attack axis. Preserve honest axis progress for telemetry, but
       classify doctrine by relative depth inside this objective set so we still get a screen, a
       main line and depth instead of labelling every point "main". */
    var raw=objectives.map(function(o){return progressOf(sides,o);}),lo=Infinity,hi=-Infinity;
    raw.forEach(function(v){if(v<lo)lo=v;if(v>hi)hi=v;});
    var spread=hi-lo;
    var sectors=objectives.map(function(o,i){
      var progress=raw[i],depth=spread>.04?clamp((progress-lo)/spread,0,1):.6;
      var role=depth<bands[0]?'contact':depth<bands[1]?'security':depth<bands[2]?'main':'depth';
      return{id:'sector-'+o.id,objectiveId:o.id,x:+o.x,z:+o.z,radius:+o.radius||30,
        progress:+progress.toFixed(3),depth:+depth.toFixed(3),doctrinalRole:role,role:role,active:role!=='contact',
        terrainValue:+terrainValue(scenario,o,role).toFixed(2),
        reason:role==='contact'?'Inside the attacker contact zone; no prepared position is sited this far forward.':''};
    });
    var candidates=sectors.filter(function(s){return s.active;}).sort(function(a,b){
      return b.terrainValue-a.terrainValue||Math.abs(a.depth-.6)-Math.abs(b.depth-.6);});
    var keep={};candidates.slice(0,echelon.span).forEach(function(s){keep[s.objectiveId]=1;});
    sectors.forEach(function(s){
      if(s.active&&!keep[s.objectiveId]){s.active=false;s.role='unoccupied';
        s.reason='Outside the '+echelon.formation+' commander\'s practical span of control.';}
    });
    var inDepth=sectors.filter(function(s){return s.active;}).sort(function(a,b){return a.depth-b.depth;});
    inDepth.forEach(function(s,i){s.fallbackSectorId=inDepth[i+1]?inDepth[i+1].id:null;});
    var reserve=null;
    for(var i=inDepth.length-1;i>=0;i--)if(inDepth[i].doctrinalRole==='depth'){reserve=inDepth[i];break;}
    sides.reserveSectorId=echelon.coordination>=.82?(reserve?reserve.id:(inDepth.length?inDepth[inDepth.length-1].id:null)):null;
    sides.heldSectors=inDepth;
    return sectors;
  }

  function build(scenario,opts){
    opts=opts||{};
    var defender=valid(opts.defender)?opts.defender:null;
    var sides={
      defender:defender,attacker:defender?other(defender):null,meeting:!defender,
      echelonId:ECHELONS[opts.echelon]?opts.echelon:DEFAULT_ECHELON,
      density:clamp(opts.density==null?DEFAULT_DENSITY:+opts.density,0,1),
      scenarioId:scenario&&scenario.id||null,seed:scenario&&scenario.seed||null,
      sectors:[],heldSectors:[],reserveSectorId:null
    };
    sides.echelon=ECHELONS[sides.echelonId];
    sides.commander=sides.echelon.label;sides.coordination=sides.echelon.coordination;
    if(!scenario||!defender)return sides;
    sides.attackerSpawn=spawnPoint(scenario,sides.attacker);
    sides.defenderSpawn=spawnPoint(scenario,defender);
    sides.axisLength=dist(sides.attackerSpawn.x,sides.attackerSpawn.z,sides.defenderSpawn.x,sides.defenderSpawn.z);
    sides.sectors=buildSectors(sides,scenario);
    return sides;
  }

  function sectorFor(sides,objectiveId){
    var list=sides&&sides.sectors||[];
    for(var i=0;i<list.length;i++)if(list[i].objectiveId===objectiveId)return list[i];
    return null;
  }
  function heldSector(sides,objectiveId){var s=sectorFor(sides,objectiveId);return s&&s.active?s:null;}
  function isDefender(sides,faction){return!!(sides&&sides.defender&&sides.defender===faction);}
  function isAttacker(sides,faction){return!!(sides&&sides.attacker&&sides.attacker===faction);}
  function summary(sides){
    if(!sides||sides.meeting)return'Meeting engagement · neither side prepared';
    var held=sides.heldSectors.map(function(s){return s.objectiveId+'('+s.role+')';});
    return sides.defender.toUpperCase()+' defending · '+sides.commander+' · '+(held.length?held.join(' '):'no sector prepared');
  }

  root.BattleSides={
    ECHELONS:ECHELONS,BANDS:BANDS,DEFAULT_ECHELON:DEFAULT_ECHELON,
    build:build,sectorFor:sectorFor,heldSector:heldSector,isDefender:isDefender,isAttacker:isAttacker,summary:summary,
    progressOf:progressOf,tacticalFrame:tacticalFrame,offsetPoint:offsetPoint,spawnPoint:spawnPoint,other:other
  };
  if(typeof console!=='undefined')console.log('[SIDES] attacker/defender model loaded');
})(typeof window!=='undefined'?window:globalThis);
