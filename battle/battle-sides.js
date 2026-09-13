/* Attacker and defender.

   Until now both forces ran the same code path: two mirrored columns marched at the same
   objectives from opposite ends and whoever arrived first started shooting. Nobody was ever
   already in position, so no squad had a reason to be anywhere in particular, and "hunt for a
   position inside the objective" was the only behaviour available to either side.

   This file supplies the missing asymmetry, and nothing else. It is pure data derived from the
   scenario plus one operator choice:

     - which faction is DEFENDING (or neither, which is the old meeting engagement);
     - the attack axis, i.e. the line the attacker has to come down;
     - how deep into that axis each objective sits, which turns into a doctrinal role
       (contact / security / main / depth) exactly as ww2fps `js/defenses.js` does it;
     - which of those sectors the defending commander can actually prepare, bounded by the span of
       control of his echelon.

   What gets built on those sectors is defense-plan.js. Who mans them is modules/21-defense-works.js.
   Nothing here touches Babylon, so the sides model runs in the headless harness.

   Frame convention, carried over from ww2fps so the ported siting maths reads the same:
     approach  unit vector attacker-spawn -> point. Walking +approach moves toward the DEFENDER rear.
     front     -approach. The direction the defender faces and the direction the attack arrives from.
     left      approach rotated 90 deg, for lateral dispersion.
   `offsetPoint(p,frame,rear,lateral)` therefore takes a positive rear distance to move behind the
   objective and a negative one to move out in front of it. */
(function(root){
  'use strict';

  /* Span of control. A sergeant prepares one position; a general prepares the whole map. This is
     what stops a defender from fortifying every objective equally, which is both unrealistic and
     the thing that would make the attack unwinnable. */
  var ECHELONS={
    sergeant:  {label:'Sergeant',  formation:'squad',     span:1, budget:.55, coordination:.18},
    lieutenant:{label:'Lieutenant',formation:'platoon',   span:2, budget:.72, coordination:.38},
    captain:   {label:'Captain',   formation:'company',   span:3, budget:1,   coordination:.62},
    major:     {label:'Major',     formation:'battalion', span:4, budget:1.18,coordination:.82},
    general:   {label:'General',   formation:'formation', span:99,budget:1.32,coordination:1}
  };
  /* Where the defence of each doctrine sits along the attack axis: end of the contact zone, end of
     the security zone, end of the main line. Past the last band is depth. */
  var BANDS={ge:[.31,.46,.73],us:[.32,.46,.73]};
  var DEFAULT_ECHELON='captain',DEFAULT_DENSITY=.6;
  var DEPTH_FLOOR=.20,DEPTH_SPAN=.70;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function other(f){return f==='us'?'ge':'us';}
  function valid(f){return f==='us'||f==='ge';}

  function spawnPoint(scenario,faction){
    var zones=scenario&&scenario.spawnZones,zone=zones&&zones[faction],center=scenario&&scenario.center||{x:0,z:0};
    var z=zone&&isFinite(zone.z)?+zone.z:(faction==='us'?-510:510);
    return{x:center.x,z:z};
  }

  /* 0 at the attacker's start line, 1 at the defender's. Projection onto the axis rather than raw
     distance, so an objective out on a flank still reads at its true depth. */
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

  /* How much a piece of ground is worth holding: built-up ground and road junctions are worth more
     than an empty field, and the doctrinal band dominates everything - a position in front of the
     contact line is not a position, it is a place to be overrun. */
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
    var bands=BANDS[sides.defender]||BANDS.ge,echelon=sides.echelon;
    var objectives=scenario.objectives||[];
    /* Raw axis progress is the honest measure of depth, but the bands cannot be applied to it
       directly here: a ww2fps map runs objectives most of the way from one start line to the
       other, whereas this battlefield puts every objective in one settlement in the middle, so
       every sector reads ~0.5 and the whole position is "main line" with no forward screen and no
       depth. The bands are therefore applied to depth WITHIN the objective set - which forward,
       which back - and the axis progress is kept alongside for telemetry.

       The rescale deliberately stops short of the ends (DEPTH_FLOOR..DEPTH_FLOOR+DEPTH_SPAN).
       Stretching to a full 0..1 would put the most forward objective in the contact zone and the
       rearmost in depth on every single map, whatever the ground actually looked like. */
    var raw=objectives.map(function(o){return progressOf(sides,o);}),lo=Infinity,hi=-Infinity;
    raw.forEach(function(v){if(v<lo)lo=v;if(v>hi)hi=v;});
    var spread=hi-lo;
    var sectors=objectives.map(function(o,i){
      var progress=raw[i],depth=spread>.04?DEPTH_FLOOR+clamp((progress-lo)/spread,0,1)*DEPTH_SPAN:.6;
      var role=depth<bands[0]?'contact':depth<bands[1]?'security':depth<bands[2]?'main':'depth';
      return{id:'sector-'+o.id,objectiveId:o.id,x:+o.x,z:+o.z,radius:+o.radius||30,
        progress:+progress.toFixed(3),depth:+depth.toFixed(3),doctrinalRole:role,role:role,active:role!=='contact',
        terrainValue:+terrainValue(scenario,o,role).toFixed(2),
        reason:role==='contact'?'Inside the attacker contact zone; no prepared position is sited this far forward.':''};
    });
    /* Rank what is worth holding, then keep only as many sectors as this commander can actually
       coordinate. Everything else is explicitly marked unoccupied WITH a reason, because a silent
       omission reads as a bug in the operator readout. */
    var candidates=sectors.filter(function(s){return s.active;}).sort(function(a,b){
      return b.terrainValue-a.terrainValue||Math.abs(a.depth-.6)-Math.abs(b.depth-.6);});
    var keep={};candidates.slice(0,echelon.span).forEach(function(s){keep[s.objectiveId]=1;});
    sectors.forEach(function(s){
      if(s.active&&!keep[s.objectiveId]){s.active=false;s.role='unoccupied';
        s.reason='Outside the '+echelon.formation+' commander\'s practical span of control.';}
    });
    /* Depth ordering gives every held sector the sector behind it to fall back on. */
    var inDepth=sectors.filter(function(s){return s.active;}).sort(function(a,b){return a.depth-b.depth;});
    inDepth.forEach(function(s,i){s.fallbackSectorId=inDepth[i+1]?inDepth[i+1].id:null;});
    var reserve=null;
    for(var i=inDepth.length-1;i>=0;i--)if(inDepth[i].role==='depth'){reserve=inDepth[i];break;}
    sides.reserveSectorId=echelon.coordination>=.82?(reserve?reserve.id:(inDepth.length?inDepth[inDepth.length-1].id:null)):null;
    sides.heldSectors=inDepth;
    return sectors;
  }

  /* The whole model for one battle. `defender:null` is a meeting engagement: no sides, no prepared
     defence, exactly the behaviour that existed before this file. */
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
  function summary(sides){
    if(!sides||sides.meeting)return'Meeting engagement · neither side prepared';
    var held=sides.heldSectors.map(function(s){return s.objectiveId+'('+s.role+')';});
    return sides.defender.toUpperCase()+' defending · '+sides.commander+' · '+
      (held.length?held.join(' '):'no sector prepared');
  }

  root.BattleSides={
    ECHELONS:ECHELONS,BANDS:BANDS,DEFAULT_ECHELON:DEFAULT_ECHELON,
    build:build,sectorFor:sectorFor,summary:summary,
    tacticalFrame:tacticalFrame,offsetPoint:offsetPoint,other:other
  };
  if(typeof console!=='undefined')console.log('[SIDES] attacker/defender model loaded');
})(typeof window!=='undefined'?window:globalThis);
