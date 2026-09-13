/* The defender's stratagem: prepared positions, sited against the real ground.

   This is the ww2fps `js/defenses.js` planner brought over to the battle sim. The parts that
   transferred are the parts that were doing the tactical work:

     - a per-sector plan whose content depends on the sector's role in the depth of the position
       (security screen vs main line vs depth), not on a fixed template;
     - a siting score, so a work is placed on the best ground within reach rather than at a
       computed offset - high ground for anything that observes, cover for anything that fights,
       flat ground for anything that needs a stable base;
     - a budget in men and engineer effort, with per-type and per-objective caps, so a defender
       cannot fortify everything and the attack stays winnable;
     - validation: nothing inside a building, nothing on top of another work, and every firing
       position must actually be able to see down the approach it claims to cover.

   What did NOT transfer, on purpose: anti-tank guns, tank destroyers, hull-down armour positions,
   minefields, dragon's teeth and mortar pits. The battle sim has no vehicles and no indirect fire,
   so those works would be scenery that costs budget a rifle position could have spent. They come
   back the day armour does.

   The output is plain data and this file has no Babylon dependency, so the whole plan can be built
   and asserted in the headless harness:

     work.obstacles   circular cover entries for obstacle-field.js - this is how a sandbag parapet
                      becomes something a soldier can genuinely get behind, using the same
                      stance-aware sight and cover maths as a hedge;
     work.posts       manned fighting positions. modules/16-squad-plan-stability.js hands these out
                      as defensive posts, which is what stops a squad hunting for somewhere to
                      stand once it is on an objective;
     work.render      enough geometry (type, centre, angle, length) for a renderer to draw it.

   Wire is the one work that registers cover:1 obstacles - it gives no protection at all. It is
   registered anyway because obstacles steer movement, so a wire belt makes an attacker walk around
   it, which is the entire point of wire. */
(function(root){
  'use strict';

  var S=function(){return root.BattleSides;};

  /* ---- works catalogue ---------------------------------------------------------------------- */

  /* cost:[men,engineering]  siting: what good ground means for this work  cover: 1 = no protection
     height: physical height in metres, which is what decides whose silhouette it hides */
  var WORKS={
    sandbags:   {cost:[5,2], siting:'covered',        height:1.05,cover:.42,posts:3,span:5.2, shape:'line'},
    foxholes:   {cost:[8,1], siting:'covered',        height:.55, cover:.34,posts:3,span:5.6, shape:'line'},
    trench:     {cost:[10,2],siting:'covered',        height:.72, cover:.28,posts:5,span:11.5,shape:'line'},
    mg:         {cost:[6,2], siting:'covered',        height:1.10,cover:.36,posts:1,span:3.4, shape:'arc',  weapon:'lmg'},
    op:         {cost:[3,1], siting:'observation',    height:.95, cover:.50,posts:1,span:2.6, shape:'arc'},
    dugout:     {cost:[5,2], siting:'concealed-rear', height:1.55,cover:.32,posts:1,span:4.0, shape:'block'},
    commandpost:{cost:[8,2], siting:'concealed-rear', height:1.55,cover:.32,posts:1,span:4.4, shape:'block',role:'captain'},
    ammo:       {cost:[2,1], siting:'concealed-rear', height:.80, cover:.60,posts:0,span:2.2, shape:'block'},
    wire:       {cost:[2,2], siting:'neutral',        height:.40, cover:1,  posts:0,span:9.0, shape:'line'},
    roadblock:  {cost:[3,2], siting:'flat',           height:1.25,cover:.50,posts:0,span:6.5, shape:'line'}
  };
  var COMBAT={sandbags:1,foxholes:1,trench:1,mg:1};
  /* Anything that shoots has to prove it can see this far down its own approach before it is kept. */
  var LOS_PROOF=45,POST_CLAIM_SECONDS=90;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function round(v,n){var p=Math.pow(10,n||0);return Math.round(v*p)/p;}

  /* Own deterministic RNG: the planner must produce the same defence for the same seed whether it
     runs in the browser or in the harness, and the harness does not load the scenario generator. */
  function hashSeed(s){s=String(s==null?'default':s);var h=1779033703^s.length;for(var i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^h>>>16)>>>0;}
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

  /* ---- ground assessment -------------------------------------------------------------------- */

  function elevation(ctx,x,z){return ctx.heightAt(x,z);}
  /* How much this spot stands above the ground immediately around it. Positive means it overlooks;
     negative means it is overlooked, which is disqualifying for anything meant to observe. */
  function relativeElevation(ctx,x,z,r){
    r=r||10;var sum=0;
    for(var i=0;i<12;i++){var a=i*Math.PI/6;sum+=elevation(ctx,x+Math.cos(a)*r,z+Math.sin(a)*r);}
    return elevation(ctx,x,z)-sum/12;
  }
  function slopePct(ctx,x,z){
    var d=4,gx=(elevation(ctx,x+d,z)-elevation(ctx,x-d,z))/(2*d),gz=(elevation(ctx,x,z+d)-elevation(ctx,x,z-d))/(2*d);
    return Math.hypot(gx,gz)*100;
  }
  /* Distance to the nearest thing already on the battlefield that a man could fight from behind -
     a hedge, a wall stub, a building. Cover a work is dug beside is cover the defender gets for
     free, and it is also concealment for the work itself. */
  function nearestCover(ctx,x,z){
    var best=99,F=root.BattleObstacleField,i,d;
    if(F&&ctx.obstacles&&ctx.obstacles.length){
      var near=F.nearby(ctx.obstacles,x,z,40);
      for(i=0;i<near.length;i++){
        if((near[i].cover==null?1:+near[i].cover)>=.95)continue;
        d=dist(x,z,near[i].x,near[i].z)-(+near[i].radius||1);
        if(d<best)best=d;
      }
    }
    for(i=0;i<ctx.buildings.length;i++){
      var b=ctx.buildings[i];
      d=dist(x,z,b.x,b.z)-Math.hypot(b.w,b.d)/2;
      if(d<best)best=d;
    }
    return Math.max(0,best);
  }
  function assess(ctx,work){
    return{elevationM:round(elevation(ctx,work.x,work.z),1),
      relativeElevationM:round(relativeElevation(ctx,work.x,work.z),1),
      slopePct:round(slopePct(ctx,work.x,work.z),1),
      coverDistanceM:Math.round(nearestCover(ctx,work.x,work.z))};
  }
  /* Higher is better. Deliberately the same shape as the ww2fps score: each siting mode weights a
     different property of the ground, and facing the wrong way is fatal rather than expensive. */
  function siteScore(ctx,work){
    var a=assess(ctx,work),mode=work.siting||(WORKS[work.type]&&WORKS[work.type].siting)||'neutral',score=0;
    if(mode.indexOf('high')>=0||mode.indexOf('observation')>=0)score+=a.relativeElevationM*1.8;
    if(mode.indexOf('covered')>=0||mode.indexOf('concealed')>=0)score+=Math.max(0,40-a.coverDistanceM)*.30;
    if(mode.indexOf('flat')>=0)score-=a.slopePct*.45;else score-=Math.max(0,a.slopePct-18)*.12;
    if(COMBAT[work.type]&&a.relativeElevationM<-3.5)score-=18;
    work._assessment=a;
    return score;
  }
  function findCrest(ctx,p,frame,reach){
    var best={x:p.x,z:p.z,e:elevation(ctx,p.x,p.z)};
    for(var t=-reach;t<=reach;t+=reach/7)for(var s=-reach*.5;s<=reach*.5;s+=reach/6){
      var x=p.x+frame.approach.x*t-frame.approach.z*s,z=p.z+frame.approach.z*t+frame.approach.x*s;
      var e=elevation(ctx,x,z);if(e>best.e)best={x:x,z:z,e:e};
    }
    return best;
  }

  /* ---- validation --------------------------------------------------------------------------- */

  function insideBuilding(ctx,x,z,pad){
    pad=pad==null?1.4:pad;
    for(var i=0;i<ctx.buildings.length;i++){
      var b=ctx.buildings[i],c=Math.cos(-(b.rot||0)),s=Math.sin(-(b.rot||0)),dx=x-b.x,dz=z-b.z;
      if(Math.abs(dx*c-dz*s)<=b.w/2+pad&&Math.abs(dx*s+dz*c)<=b.d/2+pad)return true;
    }
    return false;
  }
  function tooClose(work,pool){
    var spec=WORKS[work.type];
    for(var i=0;i<pool.length;i++){
      var o=pool[i],need=(spec.span+WORKS[o.type].span)*.42;
      if(dist(work.x,work.z,o.x,o.z)<need)return true;
    }
    return false;
  }
  /* A firing position that cannot see down its own approach is a hole in the ground. This is the
     check that kept pushing works off reverse slopes and out from behind walls in ww2fps, and it
     does the same job here against the live obstacle field. */
  function canSeeApproach(ctx,work){
    if(!COMBAT[work.type]&&work.type!=='op')return true;
    var f=ctx.frameFor(work),to={x:work.x+f.front.x*LOS_PROOF,z:work.z+f.front.z*LOS_PROOF};
    var eye=elevation(ctx,work.x,work.z)+1.05,aim=elevation(ctx,to.x,to.z)+1.05,F=root.BattleObstacleField;
    if(F&&ctx.obstacles&&F.sightBlocked(ctx.obstacles,{x:work.x,z:work.z,y:eye},{x:to.x,z:to.z,y:aim}))return false;
    if(root.BattleNavigation&&root.BattleNavigation.lineOfSightBlocked({x:work.x,z:work.z},to,eye,aim))return false;
    /* Dead ground: the line must clear the terrain in between, not just the clutter. */
    for(var i=1;i<6;i++){
      var t=i/6,gx=work.x+(to.x-work.x)*t,gz=work.z+(to.z-work.z)*t;
      if(elevation(ctx,gx,gz)>eye+(aim-eye)*t+.35)return false;
    }
    return true;
  }
  function inBounds(ctx,x,z){
    return Math.abs(x)<ctx.halfW-20&&Math.abs(z)<ctx.halfD-20;
  }
  function placeable(ctx,work,pool){
    return inBounds(ctx,work.x,work.z)&&!insideBuilding(ctx,work.x,work.z)&&!tooClose(work,pool)&&canSeeApproach(ctx,work);
  }

  /* ---- budget ------------------------------------------------------------------------------- */

  function createBudget(ctx){
    var n=Math.max(1,ctx.sectors.length),scale=(.75+ctx.density*.75)*ctx.sides.echelon.budget;
    /* Doctrine bias, kept from ww2fps: the German position leans on machine guns and prepared
       works, the American one on dispersed rifle pits. */
    var bias=ctx.sides.defender==='ge'?{mg:1.3,trench:1.25,wire:1.2,sandbags:1.15}:{foxholes:1.35,op:1.2,mg:1.1};
    var base={sandbags:n*2,foxholes:n*3,trench:n*2,mg:n*2,op:n,dugout:n,commandpost:n,ammo:n,wire:n*3,roadblock:n};
    var caps={};Object.keys(base).forEach(function(t){caps[t]=Math.max(1,Math.ceil(base[t]*scale*(bias[t]||1)));});
    return{authorized:{personnel:Math.round(n*(46+52*ctx.density)),engineering:Math.round(n*(18+26*ctx.density)),
        maxPerSector:Math.round(9+ctx.density*5),typeCaps:caps},
      used:{personnel:0,engineering:0,byType:{},bySector:{}},omitted:[]};
  }
  function budgetAllows(ctx,work){
    var b=ctx.budget,cost=WORKS[work.type].cost,u=b.used,a=b.authorized;
    return u.personnel+cost[0]<=a.personnel&&u.engineering+cost[1]<=a.engineering&&
      (u.byType[work.type]||0)<(a.typeCaps[work.type]||Infinity)&&
      (u.bySector[work.objectiveId]||0)<a.maxPerSector;
  }
  function consumeBudget(ctx,work){
    var b=ctx.budget,cost=WORKS[work.type].cost;
    b.used.personnel+=cost[0];b.used.engineering+=cost[1];
    b.used.byType[work.type]=(b.used.byType[work.type]||0)+1;
    b.used.bySector[work.objectiveId]=(b.used.bySector[work.objectiveId]||0)+1;
  }

  /* ---- materialising a work ----------------------------------------------------------------- */

  /* A work becomes cover by registering point obstacles along its footprint, the same way
     terrain-features.js turns a hedgerow segment into a row of circles. Everything downstream -
     sight lines, cover value per stance, movement steering - then treats a sandbag parapet exactly
     as it treats a hedge, with no new code anywhere. */
  function materialise(ctx,work){
    var spec=WORKS[work.type],ang=work.ang==null?0:work.ang,len=work.len||spec.span;
    /* `ang` is a yaw in the battle sim's convention, so the along-work direction is (sin,cos). */
    var dx=Math.sin(ang),dz=Math.cos(ang),obstacles=[],posts=[],i,t,x,z;
    if(spec.shape==='block'){
      obstacles.push({x:work.x,z:work.z,y:ctx.heightAt(work.x,work.z),radius:Math.max(1.4,len*.34),
        cover:spec.cover,height:spec.height,type:'work-'+work.type});
    }else if(spec.shape==='arc'){
      for(i=-1;i<=1;i++){
        t=i*(len*.34);x=work.x+dx*t;z=work.z+dz*t;
        obstacles.push({x:x,z:z,y:ctx.heightAt(x,z),radius:1.5,cover:spec.cover,height:spec.height,type:'work-'+work.type});
      }
    }else{
      var steps=Math.max(2,Math.round(len/2.4));
      for(i=0;i<=steps;i++){
        t=(i/steps-.5)*len;x=work.x+dx*t;z=work.z+dz*t;
        obstacles.push({x:x,z:z,y:ctx.heightAt(x,z),radius:1.45,cover:spec.cover,height:spec.height,type:'work-'+work.type});
      }
    }
    /* Posts sit just behind the work, spread along it, facing the way the attack is coming from.
       "Just behind" is what makes the obstacle protective rather than something to stand on. */
    var f=ctx.frameFor(work),back=spec.shape==='block'?0:1.15;
    for(i=0;i<spec.posts;i++){
      t=spec.posts===1?0:((i/(spec.posts-1))-.5)*len*.8;
      x=work.x+dx*t+f.approach.x*back;z=work.z+dz*t+f.approach.z*back;
      posts.push({id:work.id+'-p'+i,workId:work.id,type:work.type,objectiveId:work.objectiveId,sectorId:work.sectorId,
        x:round(x,2),z:round(z,2),facing:{x:f.front.x,z:f.front.z},yaw:f.facingYaw,
        weapon:spec.weapon||null,role:spec.role||null,claim:null});
    }
    work.obstacles=obstacles;work.posts=posts;
    work.render={type:work.type,x:work.x,z:work.z,ang:ang,len:len,height:spec.height,shape:spec.shape};
    return work;
  }

  /* Try the requested spot, then a ring of nearby ones, and keep the best legal site. This is the
     mechanism that makes the plan terrain-aware rather than template-aware: the offsets are what
     let a position slide onto the crest or in behind the wall that is actually there. */
  var OFFSETS=[[0,0],[2.4,0],[-2.4,0],[0,2.4],[0,-2.4],[4.2,2.4],[4.2,-2.4],[-4.2,2.4],[-4.2,-2.4],[7.5,0],[-7.5,0],[0,7.5],[0,-7.5]];
  function addWork(ctx,sector,out,spec){
    var work=Object.assign({},spec);
    work.type=spec.type;work.objectiveId=sector.objectiveId;work.sectorId=sector.id;work.sectorRole=sector.role;
    work.siting=work.siting||WORKS[work.type].siting;
    work.id='def-'+(++ctx.seq);
    if(!budgetAllows(ctx,work)){ctx.budget.omitted.push({type:work.type,objectiveId:sector.objectiveId,reason:'budget'});return null;}
    var pool=ctx.works.concat(out),base={x:work.x,z:work.z},best=null,bestScore=-Infinity;
    for(var i=0;i<OFFSETS.length;i++){
      work.x=base.x+OFFSETS[i][0];work.z=base.z+OFFSETS[i][1];
      if(!placeable(ctx,work,pool))continue;
      var score=siteScore(ctx,work);
      if(score>bestScore){bestScore=score;best={x:work.x,z:work.z,assessment:work._assessment};}
    }
    if(!best){work.x=base.x;work.z=base.z;ctx.budget.omitted.push({type:work.type,objectiveId:sector.objectiveId,reason:'no legal site'});return null;}
    work.x=round(best.x,2);work.z=round(best.z,2);work.corrected=best.x!==base.x||best.z!==base.z;
    work.siteAssessment=best.assessment;delete work._assessment;
    materialise(ctx,work);
    out.push(work);consumeBudget(ctx,work);
    return work;
  }
  function note(ctx,sector,text,why){ctx.log.push({sector:sector.id,objectiveId:sector.objectiveId,text:text,why:why||''});}

  /* ---- the plans themselves ----------------------------------------------------------------- */

  function frontOf(ctx,p,d){return S().offsetPoint(p,ctx.frameFor(p),-d);}
  function rearOf(ctx,p,d,lat){return S().offsetPoint(p,ctx.frameFor(p),d,lat||0);}

  /* A security sector is a warning and delay task, not a position to hold: an observation post on
     the best ground it can find plus a rifle group covering its withdrawal. Fortifying it would
     spend the budget the main line needs. */
  function planSecurity(ctx,sector,out){
    var p={x:sector.x,z:sector.z},frame=ctx.frameFor(p),crest=findCrest(ctx,p,frame,sector.radius*.9);
    addWork(ctx,sector,out,{type:'op',x:crest.x,z:crest.z,ang:frame.acrossYaw,siting:'observation',
      why:'Observation post screens the main position; it is not meant to hold against a deliberate attack.'});
    var rear=rearOf(ctx,p,sector.radius*.6);
    addWork(ctx,sector,out,{type:'foxholes',x:rear.x,z:rear.z,ang:frame.acrossYaw,
      why:'Rifle group covers the outpost\'s withdrawal. A delaying screen, not a strongpoint.'});
    if(ctx.sides.coordination>=.6){
      var q=rearOf(ctx,p,sector.radius*.2,sector.radius*.55);
      addWork(ctx,sector,out,{type:'mg',x:q.x,z:q.z,ang:frame.acrossYaw,
        why:'Covering weapon delays the approach and withdraws before the main line is compromised.'});
    }
    note(ctx,sector,out.length+' screening positions','Warning and delay task; falls back on '+(sector.fallbackSectorId||'the defended rear')+'.');
  }

  /* The main line, and depth behind it. Built-up sectors get their fighting positions tied to the
     buildings that are there; open ones get the doctrine's own answer. */
  function planStrongpoint(ctx,sector,out){
    var p={x:sector.x,z:sector.z},frame=ctx.frameFor(p),r=sector.radius,doct=ctx.sides.defender;
    var built=ctx.buildings.filter(function(b){return dist(b.x,b.z,p.x,p.z)<=r*1.15;});

    /* Front lip of the objective: the parapet the attacker has to come through. */
    var front=frontOf(ctx,p,r*.62);
    addWork(ctx,sector,out,{type:'sandbags',x:front.x,z:front.z,ang:frame.acrossYaw,
      why:'Prepared parapet covers the objective frontage on the derived attack axis.'});

    /* Built-up ground earns machine guns tied to the structures that are there, but it does not
       replace the doctrine's own fighting positions - two guns and a parapet is a picket, not a
       defended objective. */
    if(built.length>=2){
      /* Deliberately sited beside real structures, on the attacker-facing corner, so the building
         is the cover and the gun covers the approach to it rather than sitting in the open. */
      var facing=built.slice().sort(function(a,b){
        return dist(a.x,a.z,ctx.sides.attackerSpawn.x,ctx.sides.attackerSpawn.z)-dist(b.x,b.z,ctx.sides.attackerSpawn.x,ctx.sides.attackerSpawn.z);}).slice(0,2);
      facing.forEach(function(b,i){
        var side=i?1:-1,corner={x:b.x+frame.front.x*(b.d/2+2.6)+frame.left.x*side*(b.w/2+2.2),
                                z:b.z+frame.front.z*(b.d/2+2.6)+frame.left.z*side*(b.w/2+2.2)};
        addWork(ctx,sector,out,{type:'mg',x:corner.x,z:corner.z,ang:frame.acrossYaw,buildingId:b.id,
          why:'Machine gun uses '+b.id+' as cover and covers the street approach past it.'});
      });
      note(ctx,sector,facing.length+' masonry-flanked machine gun positions','Each is tied to a generated building on the attacker-facing side.');
    }
    if(doct==='ge'){
      /* Anchor on the crest, mutually supporting guns with arcs crossed on the approach. */
      var crest=findCrest(ctx,p,frame,r*1.05);
      addWork(ctx,sector,out,{type:'mg',x:crest.x,z:crest.z,ang:frame.acrossYaw,siting:'observation',
        why:'Anchors the position on the actual crest, facing the derived attack axis.'});
      [-1,1].forEach(function(side){
        var q=S().offsetPoint(frontOf(ctx,p,r*.3),frame,0,side*r*.7);
        addWork(ctx,sector,out,{type:'mg',x:q.x,z:q.z,ang:frame.acrossYaw-side*.35,
          why:'Mutually supporting gun; arcs cross on the attacker-to-objective axis.'});
      });
      var trench=frontOf(ctx,p,r*.34);
      addWork(ctx,sector,out,{type:'trench',x:trench.x,z:trench.z,ang:frame.acrossYaw,
        why:'Connected fighting trench across the approach.'});
    }else{
      /* Dispersed pits, tied to the hedgerow bank if there is one within reach. */
      var fq=frontOf(ctx,p,r*.45),hedge=nearestHedge(ctx,fq.x,fq.z);
      var count=Math.max(2,Math.round(ctx.density*3));
      for(var i=0;i<count;i++){
        var lat=(i-(count-1)/2)*6.5,site=hedge?{x:hedge.x+frame.left.x*lat,z:hedge.z+frame.left.z*lat}:S().offsetPoint(fq,frame,0,lat);
        addWork(ctx,sector,out,{type:'foxholes',x:site.x,z:site.z,ang:frame.acrossYaw,hedge:!!hedge,
          why:hedge?'Rifle pits dug on the near bank of real cover at the objective edge.':'Rifle pits on the objective edge; no usable bank nearby.'});
      }
      var q2=S().offsetPoint(p,frame,0,r*.6);
      addWork(ctx,sector,out,{type:'mg',x:q2.x,z:q2.z,ang:frame.acrossYaw,
        why:'Flanking gun enfilades the front of the pits.'});
    }

    /* Shelter, command and ammunition go on the reverse side, where the attacker cannot see them. */
    var rear=rearOf(ctx,p,r*.55),cp=rearOf(ctx,p,r*.78,r*.28),ammo=rearOf(ctx,p,r*.72,-r*.3);
    addWork(ctx,sector,out,{type:'dugout',x:rear.x,z:rear.z,ang:frame.acrossYaw,why:'Covered shelter on the reverse side of the objective.'});
    addWork(ctx,sector,out,{type:'commandpost',x:cp.x,z:cp.z,ang:frame.acrossYaw,why:'Local command post behind the fighting positions.'});
    addWork(ctx,sector,out,{type:'ammo',x:ammo.x,z:ammo.z,ang:frame.acrossYaw,why:'Dispersed ammunition point behind hard cover, clear of the weapon positions.'});

    /* Obstacle belts out in front. They protect nobody; they make the attacker go where the guns
       are already pointing. */
    var belts=Math.max(1,Math.round(ctx.density*3));
    for(var b=0;b<belts;b++){
      var q3=S().offsetPoint(frontOf(ctx,p,r*(1.05+b*.4)),frame,0,(ctx.rng()-.5)*r*.9);
      addWork(ctx,sector,out,{type:'wire',x:q3.x,z:q3.z,ang:frame.acrossYaw,len:6+ctx.rng()*5,
        why:'Wire belt crosses the computed open approach and was checked against buildings.'});
    }
    var road=nearestRoad(ctx,p.x,p.z,r*1.3);
    if(road)addWork(ctx,sector,out,{type:'roadblock',x:road.x,z:road.z,ang:road.yaw+Math.PI/2,roadId:road.id,
      why:'Barricade lies across '+road.id+' where it enters the objective.'});

    /* A battalion commander and above also prepares the position behind the position. */
    if(ctx.sides.coordination>=.82){
      var alt=rearOf(ctx,p,r*(sector.role==='depth'?1.0:1.35));
      addWork(ctx,sector,out,{type:'foxholes',x:alt.x,z:alt.z,ang:frame.acrossYaw,reserve:true,
        why:sector.role==='depth'?'Reserve position covering the rear area and the counterattack route.':
          'Alternate position supporting a controlled withdrawal toward '+(sector.fallbackSectorId||'the rear reserve')+'.'});
    }
    note(ctx,sector,out.length+' works prepared on the '+sector.role+' sector,'+
      ' '+out.reduce(function(n,w){return n+w.posts.length;},0)+' manned positions',
      'Sited against real ground: crest, cover distance, slope and a proven line down the approach.');
  }

  /* Last resort. A sector that produced no fighting position at all is a sector the attacker walks
     onto, so a bounded radial search finds somewhere - anywhere - legal to put rifles. */
  function ensureFightingPosition(ctx,sector,out){
    for(var i=0;i<out.length;i++)if(COMBAT[out[i].type])return;
    var p={x:sector.x,z:sector.z},frame=ctx.frameFor(p);
    for(var r=4;r<=sector.radius*1.3;r+=4)for(var a=0;a<12;a++){
      var ang=frame.facingYaw+(a-6)*Math.PI/12,site={x:p.x+Math.sin(ang)*r,z:p.z+Math.cos(ang)*r};
      if(addWork(ctx,sector,out,{type:'foxholes',x:site.x,z:site.z,ang:frame.acrossYaw,fallback:true,
        why:'Fallback rifle pits found by a radial search after the sited works were all rejected.'})){
        note(ctx,sector,'Fallback rifle pits established','Buildings, other works and dead ground rejected every primary site.');
        return;
      }
    }
  }

  function nearestHedge(ctx,x,z){
    var F=root.BattleObstacleField;if(!F||!ctx.obstacles||!ctx.obstacles.length)return null;
    var near=F.nearby(ctx.obstacles,x,z,26),best=null,bd=Infinity;
    for(var i=0;i<near.length;i++){
      if(near[i].type!=='hedge'&&near[i].type!=='wall')continue;
      var d=dist(x,z,near[i].x,near[i].z);if(d<bd){bd=d;best=near[i];}
    }
    return best;
  }
  function nearestRoad(ctx,x,z,maxD){
    var best=null,bd=maxD==null?40:maxD;
    (ctx.scenario.roads||[]).forEach(function(r){
      var vx=r.bx-r.ax,vz=r.bz-r.az,len2=vx*vx+vz*vz||1;
      var t=clamp(((x-r.ax)*vx+(z-r.az)*vz)/len2,0,1),px=r.ax+vx*t,pz=r.az+vz*t,d=dist(x,z,px,pz);
      if(d<bd){bd=d;best={x:px,z:pz,yaw:Math.atan2(vx,vz),id:r.id};}
    });
    return best;
  }

  /* ---- entry point -------------------------------------------------------------------------- */

  /* Everything the siting maths needs about one battlefield seen from one side. It is built once
     for the prepared plan and again, per faction, for whatever the engineers put up later, so both
     go through identical validation instead of the second one being a looser copy of the first. */
  function createContext(scenario,sides,opts){
    opts=opts||{};
    var sectors=opts.sectors||(sides.sectors||[]).filter(function(s){return s.active;});
    var ctx={
      scenario:scenario,sides:sides,sectors:sectors,seq:0,works:[],log:opts.log||[],
      heightAt:opts.heightAt||function(){return 0;},obstacles:opts.obstacles||[],
      buildings:scenario.buildings||[],density:opts.density==null?sides.density:opts.density,
      halfW:(scenario.map&&scenario.map.width||2000)/2,halfD:(scenario.map&&scenario.map.depth||1200)/2,
      rng:mulberry32(hashSeed((scenario.seed||'default')+'|'+(opts.salt||'defense')+'|'+sides.defender)),
      frameFor:function(p){return S().tacticalFrame(sides,p);}
    };
    ctx.budget=createBudget(ctx);
    return ctx;
  }
  /* An empty plan a faction's engineers can fill in during the battle. The prepared defender gets
     a full one from build(); the other side starts here and digs. */
  function empty(faction){
    return{defender:faction||null,attacker:faction?(S()?S().other(faction):null):null,
      works:[],posts:[],obstacles:[],log:[],budget:null,bySector:{},commander:null,echelon:null,
      stats:{works:0,posts:0,obstacles:0,sectors:0,omitted:0}};
  }
  /* Index one finished work into a plan so its posts can be claimed and its stats read. */
  function register(plan,work,sector){
    if(!plan||!work)return work;
    plan.works.push(work);
    plan.posts=plan.posts.concat(work.posts);
    plan.obstacles=plan.obstacles.concat(work.obstacles);
    var bucket=plan.bySector[work.objectiveId]||(plan.bySector[work.objectiveId]={sector:sector||null,works:[],posts:[]});
    bucket.works.push(work);bucket.posts=bucket.posts.concat(work.posts);
    plan.stats=plan.stats||{};
    plan.stats.works=plan.works.length;plan.stats.posts=plan.posts.length;plan.stats.obstacles=plan.obstacles.length;
    plan.stats.sectors=Object.keys(plan.bySector).length;
    return work;
  }

  function build(scenario,sides,opts){
    opts=opts||{};
    var plan={defender:sides&&sides.defender||null,attacker:sides&&sides.attacker||null,
      works:[],posts:[],obstacles:[],log:[],budget:null,bySector:{},
      commander:sides&&sides.commander||null,echelon:sides&&sides.echelonId||null};
    if(!scenario||!sides||sides.meeting||!S())return plan;

    var sectors=sides.sectors.filter(function(s){return s.active;});
    if(!sectors.length)return plan;

    var ctx=createContext(scenario,sides,{sectors:sectors,log:plan.log,heightAt:opts.heightAt,obstacles:opts.obstacles});
    plan.budget=ctx.budget;

    sectors.forEach(function(sector){
      var out=[];
      if(sector.role==='security'||sides.echelon.span===1)planSecurity(ctx,sector,out);
      else planStrongpoint(ctx,sector,out);
      ensureFightingPosition(ctx,sector,out);
      ctx.works=ctx.works.concat(out);
      plan.bySector[sector.objectiveId]={sector:sector,works:out,
        posts:out.reduce(function(a,w){return a.concat(w.posts);},[])};
    });

    plan.works=ctx.works;
    ctx.works.forEach(function(w){plan.posts=plan.posts.concat(w.posts);plan.obstacles=plan.obstacles.concat(w.obstacles);});
    plan.stats={works:plan.works.length,posts:plan.posts.length,obstacles:plan.obstacles.length,
      sectors:sectors.length,omitted:plan.budget.omitted.length,
      personnel:plan.budget.used.personnel+'/'+plan.budget.authorized.personnel,
      engineering:plan.budget.used.engineering+'/'+plan.budget.authorized.engineering};
    return plan;
  }

  /* ---- manning the plan --------------------------------------------------------------------- */

  /* A post is claimed by exactly one man. Claims lapse so a post whose occupant was killed is
     reoccupied rather than left empty for the rest of the battle. */
  function postFree(post,soldier,time){
    var c=post.claim;
    return!c||c.id===soldier.id||c.until<time||(c.soldier&&c.soldier.dead);
  }
  function postFit(post,soldier){
    /* The gun wants the gun position, and the captain wants the command post; everyone else takes
       what is left rather than leaving a fighting position empty. */
    if(post.weapon==='lmg')return soldier.role==='gunner'?3:(soldier.role==='captain'?0:1);
    if(post.role==='captain')return soldier.role==='captain'?3:1;
    if(soldier.role==='gunner'||soldier.role==='captain')return 1;
    return 2;
  }
  function claimPost(plan,soldier,battle,opts){
    opts=opts||{};
    if(!plan||!plan.posts.length||!soldier||soldier.dead)return null;
    var pool=opts.objectiveId&&plan.bySector[opts.objectiveId]?plan.bySector[opts.objectiveId].posts:plan.posts;
    var p=soldier.root.position,maxD=opts.maxRange||70,best=null,bestScore=-Infinity;
    for(var i=0;i<pool.length;i++){
      var post=pool[i];
      if(!postFree(post,soldier,battle.time))continue;
      var d=dist(p.x,p.z,post.x,post.z);
      if(d>maxD)continue;
      var score=postFit(post,soldier)*14-d;
      if(score>bestScore){bestScore=score;best=post;}
    }
    if(!best)return null;
    releasePost(soldier);
    best.claim={id:soldier.id,soldier:soldier,until:battle.time+POST_CLAIM_SECONDS};
    soldier._planPost=best;
    return best;
  }
  function holdPost(post,soldier,battle){
    if(!post||!soldier||post.claim&&post.claim.id!==soldier.id)return false;
    post.claim={id:soldier.id,soldier:soldier,until:battle.time+POST_CLAIM_SECONDS};
    return true;
  }
  function releasePost(soldier){
    var post=soldier&&soldier._planPost;
    if(post&&post.claim&&post.claim.id===soldier.id)post.claim=null;
    if(soldier)soldier._planPost=null;
  }
  function resetClaims(plan){if(plan)plan.posts.forEach(function(p){p.claim=null;});}

  root.BattleDefensePlan={
    WORKS:WORKS,COMBAT:COMBAT,
    build:build,createContext:createContext,empty:empty,register:register,siteWork:addWork,
    claimPost:claimPost,holdPost:holdPost,releasePost:releasePost,resetClaims:resetClaims
  };
  if(typeof console!=='undefined')console.log('[DEFENSE] prepared-position planner loaded');
})(typeof window!=='undefined'?window:globalThis);
