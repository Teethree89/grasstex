/* Terrain-aware prepared-defense planner for the Battle Sim.
   Pure data: no Babylon dependency. Works become cover obstacles and claimable fighting posts. */
(function(root){
  'use strict';
  var S=function(){return root.BattleSides;};
  var WORKS={
    sandbags:{cost:[5,2],height:1.05,cover:.42,posts:3,span:6,shape:'line',siting:'covered'},
    foxholes:{cost:[6,1],height:.55,cover:.34,posts:3,span:6,shape:'line',siting:'covered'},
    trench:{cost:[10,3],height:.72,cover:.28,posts:5,span:12,shape:'line',siting:'covered'},
    mg:{cost:[5,2],height:1.10,cover:.36,posts:1,span:4,shape:'arc',siting:'covered',weapon:'lmg'},
    op:{cost:[2,1],height:.95,cover:.50,posts:1,span:3,shape:'arc',siting:'observation'},
    wire:{cost:[2,2],height:.40,cover:1,posts:0,span:9,shape:'line',siting:'flat'},
    roadblock:{cost:[3,2],height:1.25,cover:.50,posts:0,span:7,shape:'line',siting:'flat'}
  };
  var COMBAT={sandbags:1,foxholes:1,trench:1,mg:1},POST_CLAIM=90,LOS_PROOF=42;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dist(ax,az,bx,bz){return Math.hypot(ax-bx,az-bz);}
  function round(v){return Math.round(v*100)/100;}
  function hash(s){s=String(s||'default');var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){var a=hash(seed);return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function empty(faction){return{defender:faction||null,works:[],posts:[],obstacles:[],bySector:{},log:[],stats:{works:0,posts:0,obstacles:0,sectors:0,omitted:0}};}
  function nearCover(ctx,x,z){
    var best=99,F=root.BattleObstacleField,i,d;
    if(F&&ctx.obstacles&&ctx.obstacles.length){var near=F.nearby(ctx.obstacles,x,z,35);for(i=0;i<near.length;i++){if((near[i].cover==null?1:+near[i].cover)>=.95)continue;d=dist(x,z,near[i].x,near[i].z)-(+near[i].radius||1);if(d<best)best=d;}}
    for(i=0;i<ctx.buildings.length;i++){var b=ctx.buildings[i];d=dist(x,z,b.x,b.z)-Math.hypot(b.w,b.d)/2;if(d<best)best=d;}
    return Math.max(0,best);
  }
  function relativeElevation(ctx,x,z){var e=ctx.heightAt(x,z),sum=0,r=10;for(var i=0;i<8;i++){var a=i*Math.PI/4;sum+=ctx.heightAt(x+Math.cos(a)*r,z+Math.sin(a)*r);}return e-sum/8;}
  function slope(ctx,x,z){var d=4,gx=(ctx.heightAt(x+d,z)-ctx.heightAt(x-d,z))/(2*d),gz=(ctx.heightAt(x,z+d)-ctx.heightAt(x,z-d))/(2*d);return Math.hypot(gx,gz)*100;}
  function insideBuilding(ctx,x,z,pad){pad=pad||1.3;for(var i=0;i<ctx.buildings.length;i++){var b=ctx.buildings[i],c=Math.cos(-(b.rot||0)),s=Math.sin(-(b.rot||0)),dx=x-b.x,dz=z-b.z,lx=dx*c-dz*s,lz=dx*s+dz*c;if(Math.abs(lx)<=b.w/2+pad&&Math.abs(lz)<=b.d/2+pad)return true;}return false;}
  function tooClose(work,pool){for(var i=0;i<pool.length;i++){var other=pool[i],need=((WORKS[work.type]||WORKS.foxholes).span+(WORKS[other.type]||WORKS.foxholes).span)*.38;if(dist(work.x,work.z,other.x,other.z)<need)return true;}return false;}
  function canSeeApproach(ctx,work){
    if(!COMBAT[work.type]&&work.type!=='op')return true;
    var f=ctx.frameFor(work),to={x:work.x+f.front.x*LOS_PROOF,z:work.z+f.front.z*LOS_PROOF},eye=ctx.heightAt(work.x,work.z)+1.05,aim=ctx.heightAt(to.x,to.z)+1.05,F=root.BattleObstacleField;
    if(F&&ctx.obstacles&&F.sightBlocked(ctx.obstacles,{x:work.x,z:work.z,y:eye},{x:to.x,z:to.z,y:aim}))return false;
    for(var i=1;i<6;i++){var t=i/6,x=work.x+(to.x-work.x)*t,z=work.z+(to.z-work.z)*t;if(ctx.heightAt(x,z)>eye+(aim-eye)*t+.35)return false;}
    return true;
  }
  function score(ctx,work){var spec=WORKS[work.type],mode=spec.siting,sc=0,rel=relativeElevation(ctx,work.x,work.z),sl=slope(ctx,work.x,work.z),cover=nearCover(ctx,work.x,work.z);if(mode==='observation')sc+=rel*2-cover*.08;else if(mode==='covered')sc+=(40-cover)*.30-Math.max(0,sl-18)*.15;else sc-=sl*.35;if(COMBAT[work.type]&&rel<-3.5)sc-=18;return sc;}
  function materialise(ctx,work){
    var spec=WORKS[work.type],yaw=work.ang||0,len=work.len||spec.span,dx=Math.sin(yaw),dz=Math.cos(yaw),obs=[],posts=[],i,t,x,z;
    if(spec.shape==='arc'){for(i=-1;i<=1;i++){t=i*len*.32;x=work.x+dx*t;z=work.z+dz*t;obs.push({x:x,z:z,y:ctx.heightAt(x,z),radius:1.4,cover:spec.cover,height:spec.height,type:'work-'+work.type});}}
    else{var steps=Math.max(2,Math.round(len/2.4));for(i=0;i<=steps;i++){t=(i/steps-.5)*len;x=work.x+dx*t;z=work.z+dz*t;obs.push({x:x,z:z,y:ctx.heightAt(x,z),radius:1.35,cover:spec.cover,height:spec.height,type:'work-'+work.type});}}
    var frame=ctx.frameFor(work),back=1.15;for(i=0;i<spec.posts;i++){t=spec.posts===1?0:(i/(spec.posts-1)-.5)*len*.78;x=work.x+dx*t+frame.approach.x*back;z=work.z+dz*t+frame.approach.z*back;posts.push({id:work.id+'-p'+i,workId:work.id,type:work.type,objectiveId:work.objectiveId,sectorId:work.sectorId,x:round(x),z:round(z),yaw:frame.facingYaw,weapon:spec.weapon||null,claim:null});}
    work.obstacles=obs;work.posts=posts;work.render={shape:spec.shape,ang:yaw,len:len,height:spec.height};return work;
  }
  var OFFSETS=[[0,0],[3,0],[-3,0],[0,3],[0,-3],[5,3],[5,-3],[-5,3],[-5,-3],[8,0],[-8,0]];
  function add(ctx,sector,out,spec){
    var work=Object.assign({},spec),kind=WORKS[work.type];if(!kind)return null;work.id='def-'+(++ctx.seq);work.objectiveId=sector.objectiveId;work.sectorId=sector.id;work.sectorRole=sector.role;
    var used=ctx.used,cap=ctx.caps[work.type]||99;if((used.types[work.type]||0)>=cap||used.engineering+kind.cost[1]>ctx.engineering){ctx.omitted++;return null;}
    var base={x:work.x,z:work.z},best=null,bestScore=-Infinity,pool=ctx.works.concat(out);for(var i=0;i<OFFSETS.length;i++){work.x=base.x+OFFSETS[i][0];work.z=base.z+OFFSETS[i][1];if(Math.abs(work.x)>ctx.halfW-20||Math.abs(work.z)>ctx.halfD-20||insideBuilding(ctx,work.x,work.z)||tooClose(work,pool)||!canSeeApproach(ctx,work))continue;var sc=score(ctx,work);if(sc>bestScore){bestScore=sc;best={x:work.x,z:work.z};}}
    if(!best){ctx.omitted++;return null;}work.x=round(best.x);work.z=round(best.z);materialise(ctx,work);out.push(work);used.engineering+=kind.cost[1];used.types[work.type]=(used.types[work.type]||0)+1;return work;
  }
  function nearestRoad(scenario,x,z,maxD){var best=null,bd=maxD||45;(scenario.roads||[]).forEach(function(r){var vx=r.bx-r.ax,vz=r.bz-r.az,l2=vx*vx+vz*vz||1,t=clamp(((x-r.ax)*vx+(z-r.az)*vz)/l2,0,1),px=r.ax+vx*t,pz=r.az+vz*t,d=dist(x,z,px,pz);if(d<bd){bd=d;best={x:px,z:pz,yaw:Math.atan2(vx,vz),id:r.id};}});return best;}
  function crest(ctx,p,frame,r){var best={x:p.x,z:p.z,e:ctx.heightAt(p.x,p.z)};for(var a=-r;a<=r;a+=r/5)for(var b=-r*.5;b<=r*.5;b+=r/4){var x=p.x+frame.approach.x*a+frame.left.x*b,z=p.z+frame.approach.z*a+frame.left.z*b,e=ctx.heightAt(x,z);if(e>best.e)best={x:x,z:z,e:e};}return best;}
  function planSecurity(ctx,s,out){var p={x:s.x,z:s.z},f=ctx.frameFor(p),c=crest(ctx,p,f,s.radius*.85),rear=S().offsetPoint(p,f,s.radius*.55,0);add(ctx,s,out,{type:'op',x:c.x,z:c.z,ang:f.acrossYaw});add(ctx,s,out,{type:'foxholes',x:rear.x,z:rear.z,ang:f.acrossYaw});if(ctx.sides.coordination>=.6){var q=S().offsetPoint(p,f,s.radius*.25,s.radius*.55);add(ctx,s,out,{type:'mg',x:q.x,z:q.z,ang:f.acrossYaw});}}
  function planStrong(ctx,s,out){
    var p={x:s.x,z:s.z},f=ctx.frameFor(p),r=s.radius,front=S().offsetPoint(p,f,-r*.55,0);add(ctx,s,out,{type:'sandbags',x:front.x,z:front.z,ang:f.acrossYaw});
    if(ctx.sides.defender==='ge'){var c=crest(ctx,p,f,r*.9);add(ctx,s,out,{type:'mg',x:c.x,z:c.z,ang:f.acrossYaw});var tr=S().offsetPoint(p,f,-r*.30,0);add(ctx,s,out,{type:'trench',x:tr.x,z:tr.z,ang:f.acrossYaw});[-1,1].forEach(function(side){var q=S().offsetPoint(p,f,-r*.22,side*r*.55);add(ctx,s,out,{type:'mg',x:q.x,z:q.z,ang:f.acrossYaw-side*.28});});}
    else{[-1,1].forEach(function(side){var q=S().offsetPoint(p,f,-r*.34,side*r*.36);add(ctx,s,out,{type:'foxholes',x:q.x,z:q.z,ang:f.acrossYaw});});var mq=S().offsetPoint(p,f,0,r*.55);add(ctx,s,out,{type:'mg',x:mq.x,z:mq.z,ang:f.acrossYaw});}
    var wire=S().offsetPoint(p,f,-r*1.05,(ctx.random()-.5)*r*.6);add(ctx,s,out,{type:'wire',x:wire.x,z:wire.z,ang:f.acrossYaw,len:8+ctx.random()*4});var road=nearestRoad(ctx.scenario,p.x,p.z,r*1.4);if(road)add(ctx,s,out,{type:'roadblock',x:road.x,z:road.z,ang:road.yaw+Math.PI/2});
  }
  function ensureCombat(ctx,s,out){for(var i=0;i<out.length;i++)if(COMBAT[out[i].type])return;var p={x:s.x,z:s.z},f=ctx.frameFor(p);add(ctx,s,out,{type:'foxholes',x:p.x+f.approach.x*3,z:p.z+f.approach.z*3,ang:f.acrossYaw});}
  function build(scenario,sides,opts){
    var plan=empty(sides&&sides.defender);plan.attacker=sides&&sides.attacker||null;plan.commander=sides&&sides.commander||null;plan.echelon=sides&&sides.echelonId||null;if(!scenario||!sides||sides.meeting||!S())return plan;opts=opts||{};var sectors=(sides.heldSectors||[]).slice();if(!sectors.length)return plan;
    var n=sectors.length,scale=.8+sides.density*.8,ctx={scenario:scenario,sides:sides,heightAt:opts.heightAt||function(){return 0;},obstacles:opts.obstacles||[],buildings:scenario.buildings||[],halfW:(scenario.map&&scenario.map.width||2000)/2,halfD:(scenario.map&&scenario.map.depth||1200)/2,seq:0,works:[],omitted:0,engineering:Math.round(n*(18+25*sides.density)),used:{engineering:0,types:{}},caps:{sandbags:Math.ceil(n*2*scale),foxholes:Math.ceil(n*3*scale),trench:Math.ceil(n*1.5*scale),mg:Math.ceil(n*3*scale),op:n,wire:Math.ceil(n*2*scale),roadblock:n},random:rng((scenario.seed||'default')+'|defense|'+sides.defender),frameFor:function(p){return S().tacticalFrame(sides,p);}};
    sectors.forEach(function(s){var out=[];if(s.role==='security')planSecurity(ctx,s,out);else planStrong(ctx,s,out);ensureCombat(ctx,s,out);ctx.works=ctx.works.concat(out);plan.bySector[s.objectiveId]={sector:s,works:out,posts:out.reduce(function(a,w){return a.concat(w.posts);},[])};});plan.works=ctx.works;plan.works.forEach(function(w){plan.posts=plan.posts.concat(w.posts);plan.obstacles=plan.obstacles.concat(w.obstacles);});plan.stats={works:plan.works.length,posts:plan.posts.length,obstacles:plan.obstacles.length,sectors:sectors.length,omitted:ctx.omitted,engineering:ctx.used.engineering+'/'+ctx.engineering};return plan;
  }
  function releasePost(s){var p=s&&s._planPost;if(p&&p.claim&&p.claim.id===s.id)p.claim=null;if(s)s._planPost=null;}
  function postFit(p,s){if(p.weapon==='lmg')return s.role==='gunner'?4:1;return s.role==='gunner'||s.role==='sergeant'?1:2;}
  function claimPost(plan,s,battle,opts){opts=opts||{};if(!plan||!s||s.dead)return null;var pool=opts.objectiveId&&plan.bySector[opts.objectiveId]?plan.bySector[opts.objectiveId].posts:plan.posts,p=s.root.position,best=null,scoreBest=-Infinity,max=opts.maxRange||80;for(var i=0;i<pool.length;i++){var q=pool[i],c=q.claim;if(c&&c.id!==s.id&&c.until>=battle.time&&!(c.soldier&&c.soldier.dead))continue;var d=dist(p.x,p.z,q.x,q.z);if(d>max)continue;var sc=postFit(q,s)*14-d;if(sc>scoreBest){scoreBest=sc;best=q;}}if(!best)return null;releasePost(s);best.claim={id:s.id,soldier:s,until:battle.time+POST_CLAIM};s._planPost=best;return best;}
  function holdPost(post,s,battle){if(!post||!s||post.claim&&post.claim.id!==s.id)return false;post.claim={id:s.id,soldier:s,until:battle.time+POST_CLAIM};s._planPost=post;return true;}
  function resetClaims(plan){if(plan)(plan.posts||[]).forEach(function(p){p.claim=null;});}
  function register(plan,work,sector){if(!plan||!work)return null;plan.works.push(work);plan.posts=plan.posts.concat(work.posts||[]);plan.obstacles=plan.obstacles.concat(work.obstacles||[]);var id=work.objectiveId||(sector&&sector.objectiveId);if(id){var e=plan.bySector[id]||(plan.bySector[id]={sector:sector||null,works:[],posts:[]});e.works.push(work);e.posts=e.posts.concat(work.posts||[]);}plan.stats.works=plan.works.length;plan.stats.posts=plan.posts.length;plan.stats.obstacles=plan.obstacles.length;return work;}
  root.BattleDefensePlan={WORKS:WORKS,build:build,empty:empty,register:register,materialise:materialise,claimPost:claimPost,holdPost:holdPost,releasePost:releasePost,resetClaims:resetClaims};
  if(typeof console!=='undefined')console.log('[DEFENSE] terrain-aware planner loaded');
})(typeof window!=='undefined'?window:globalThis);
