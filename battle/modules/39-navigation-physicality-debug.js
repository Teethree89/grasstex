/* Mesh-footprint physical navigation + firing-station debug overlay.

   Tactical cover circles are deliberately NOT movement collision. Terrain features publish
   mesh-aligned ground footprints; this layer separates:
     - COLLISION_MARGIN: the hard "body may not enter" envelope shown by World Debug;
     - ROUTE_MARGIN: a larger planning envelope, so paths do not ride the collision edge.

   Wayfinding is a rolling queue. Soldiers keep several committed waypoints ahead, consume them as
   they are reached, then refill the queue from the remaining building/door route. This prevents
   one-corner-at-a-time dithering while preserving BattleNavigation as the building/door authority
   and Movement Resolver as the sole owner of soldier.destination. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleNavigationPhysicality)return;

var N=root.BattleNavigation;
var baseMovementClear=N.movementClear,baseNextWaypoint=N.nextWaypoint,baseFindPath=N.findPath;
var HARD_TYPES={hedge:1,tree:1,log:1,wall:1,rock:1};
/* The widest procedural infantry rig (gunner torso + upper arms) fits within 0.9 m.
   Inflate each footprint by the body radius for collision; path centres keep a full body
   width plus 0.25 m from its edge. These are world metres, independent of segment length. */
var BODY_RADIUS=.45,COLLISION_MARGIN=BODY_RADIUS,ROUTE_MARGIN=BODY_RADIUS*2+.25,NODE_PAD=.34,ROUTE_HORIZON=96,ROUTE_CORRIDOR=12,MAX_ROUTE_SHAPES=32;
var LOOKAHEAD_DISTANCE=105,MIN_QUEUE=3,TARGET_QUEUE=5,MAX_QUEUE=8,WAYPOINT_SPACING=10,MIN_WAYPOINT_SPACING=1.35,PATH_ARRIVAL=.88,GOAL_ARRIVAL=.35,REPLAN_SECONDS=5.0;
var STATION_RADIUS=.92,STATION_ROUTE_MARGIN=.28;
var simRef=null,occupied=[],occupiedAt=-999,occupiedRevision=-1,legacyCache=null,physicalIndexCache=null;
var debug={visible:false,version:-1,markers:[],freeMat:null,usedMat:null,button:null,nextUpdate:0};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z,kind:v.kind||null,meta:v.meta||null}:null;}
function dist(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function currentSim(){var b=simRef||root.__battle__;if(!b||!b.obstacles)return null;var navScenario=N.scenario,battleScenario=b.scene&&b.scene.metadata&&b.scene.metadata.battleScenario;if(navScenario&&battleScenario&&navScenario!==battleScenario)return null;return b;}
function hardObstacle(ob){return!!(ob&&HARD_TYPES[String(ob.type||'').toLowerCase()]);}
function shapeMargin(fp,margin){return fp&&fp.type==='occupied-window'?Math.min(margin,STATION_ROUTE_MARGIN):margin;}

function legacyFootprints(sim){
  if(!sim||!sim.obstacles)return[];var obs=sim.obstacles;
  if(legacyCache&&legacyCache.source===obs&&legacyCache.count===obs.length)return legacyCache.list;
  var out=[];for(var i=0;i<obs.length;i++){var ob=obs[i];if(!hardObstacle(ob))continue;out.push({id:'legacy-'+i,type:ob.type||'obstacle',shape:'circle',x:+ob.x||0,z:+ob.z||0,radius:Math.max(.12,+ob.radius||1)});}
  legacyCache={source:obs,count:obs.length,list:out};return out;
}
function staticFootprints(sim){
  if(!sim||!sim.obstacles)return[];var p=sim.obstacles.__physicalFootprints;
  return Array.isArray(p)&&p.length?p:legacyFootprints(sim);
}
function physicalVersion(sim){var o=sim&&sim.obstacles;return N.version+'|'+(o&&o.__physicalVersion||0)+'|'+staticFootprints(sim).length;}
var PHYS_CELL=28;
function axes(fp){
  var ux=isFinite(+fp.ux)?+fp.ux:1,uz=isFinite(+fp.uz)?+fp.uz:0,len=Math.hypot(ux,uz)||1;ux/=len;uz/=len;
  var vx=isFinite(+fp.vx)?+fp.vx:-uz,vz=isFinite(+fp.vz)?+fp.vz:ux,vlen=Math.hypot(vx,vz)||1;vx/=vlen;vz/=vlen;
  return{ux:ux,uz:uz,vx:vx,vz:vz};
}
function footprintExtents(fp){
  if(fp.shape!=='obb'){var r=+fp.radius||1;return{x:r,z:r};}
  var a=axes(fp),hx=+fp.hx||.5,hz=+fp.hz||.5;return{x:Math.abs(a.ux)*hx+Math.abs(a.vx)*hz,z:Math.abs(a.uz)*hx+Math.abs(a.vz)*hz};
}
function physicalIndex(sim){
  var list=staticFootprints(sim),ver=physicalVersion(sim);
  if(physicalIndexCache&&physicalIndexCache.source===list&&physicalIndexCache.version===ver)return physicalIndexCache;
  if(!list.length)return(physicalIndexCache={source:list,version:ver,list:list,empty:true,scratch:[]});
  var minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,i;
  for(i=0;i<list.length;i++){var fp=list[i],e=footprintExtents(fp),x=+fp.x||0,z=+fp.z||0;minX=Math.min(minX,x-e.x);maxX=Math.max(maxX,x+e.x);minZ=Math.min(minZ,z-e.z);maxZ=Math.max(maxZ,z+e.z);}
  var cols=Math.max(1,Math.ceil((maxX-minX)/PHYS_CELL)+1),rows=Math.max(1,Math.ceil((maxZ-minZ)/PHYS_CELL)+1),buckets=new Array(cols*rows);
  var idx={source:list,version:ver,list:list,minX:minX,minZ:minZ,cols:cols,rows:rows,buckets:buckets,stamp:new Int32Array(list.length),epoch:0,scratch:[]};
  function col(x){return clamp(Math.floor((x-minX)/PHYS_CELL),0,cols-1);}function row(z){return clamp(Math.floor((z-minZ)/PHYS_CELL),0,rows-1);}
  for(i=0;i<list.length;i++){var f=list[i],ex=footprintExtents(f),c0=col(f.x-ex.x),c1=col(f.x+ex.x),r0=row(f.z-ex.z),r1=row(f.z+ex.z);for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++){var k=c+r*cols;(buckets[k]||(buckets[k]=[])).push(i);}}
  physicalIndexCache=idx;return idx;
}
function gatherStatic(sim,a,b,pad){
  var idx=physicalIndex(sim);if(!idx||idx.empty)return[];
  idx.epoch++;if(idx.epoch>=2147483000){idx.stamp.fill(0);idx.epoch=1;}
  var out=idx.scratch;out.length=0,pad=pad||0;
  var minX=Math.min(a.x,b.x)-pad,maxX=Math.max(a.x,b.x)+pad,minZ=Math.min(a.z,b.z)-pad,maxZ=Math.max(a.z,b.z)+pad;
  function col(x){return clamp(Math.floor((x-idx.minX)/PHYS_CELL),0,idx.cols-1);}function row(z){return clamp(Math.floor((z-idx.minZ)/PHYS_CELL),0,idx.rows-1);}
  var c0=col(minX),c1=col(maxX),r0=row(minZ),r1=row(maxZ);
  for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++){var bucket=idx.buckets[c+r*idx.cols];if(!bucket)continue;for(var j=0;j<bucket.length;j++){var id=bucket[j];if(idx.stamp[id]===idx.epoch)continue;idx.stamp[id]=idx.epoch;out.push(idx.list[id]);}}
  return out;
}
function refreshOccupied(sim,force){
  if(!sim)return occupied=[];var revision=root.BattleTacticalPositions?root.BattleTacticalPositions.revision(sim):0;if(!force&&revision===occupiedRevision&&sim.time<occupiedAt+.22)return occupied;occupiedRevision=revision;occupiedAt=sim.time;occupied=[];
  ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){var st=s&&!s.dead&&(root.BattleTacticalPositions&&root.BattleTacticalPositions.station(s));if(st)occupied.push({id:'station:'+st.id,type:'occupied-window',shape:'circle',x:+st.x,z:+st.z,radius:STATION_RADIUS,soldier:s});});});return occupied;
}

function toLocal(fp,p){var a=axes(fp),dx=p.x-(+fp.x||0),dz=p.z-(+fp.z||0);return{x:dx*a.ux+dz*a.uz,z:dx*a.vx+dz*a.vz};}
function fromLocal(fp,x,z){var a=axes(fp);return{x:(+fp.x||0)+a.ux*x+a.vx*z,z:(+fp.z||0)+a.uz*x+a.vz*z};}
function boundRadius(fp,margin){margin=shapeMargin(fp,margin||0);if(fp.shape==='obb')return Math.hypot((+fp.hx||.5)+margin,(+fp.hz||.5)+margin);return(+fp.radius||1)+margin;}
function pointSegmentDistance(p,a,b){var dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(l2<1e-8)return dist(p,a);var t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,0,1),x=a.x+dx*t,z=a.z+dz*t;return Math.hypot(p.x-x,p.z-z);}
function shapeContains(p,fp,margin){
  margin=shapeMargin(fp,margin||0);
  if(fp.shape==='obb'){var q=toLocal(fp,p);return Math.abs(q.x)<=(+fp.hx||.5)+margin&&Math.abs(q.z)<=(+fp.hz||.5)+margin;}
  var r=(+fp.radius||1)+margin,dx=p.x-(+fp.x||0),dz=p.z-(+fp.z||0);return dx*dx+dz*dz<=r*r;
}
function segmentCircle(a,b,fp,margin){
  margin=shapeMargin(fp,margin||0);
  var dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz,r=(+fp.radius||1)+margin,sx=a.x-fp.x,sz=a.z-fp.z,ex=b.x-fp.x,ez=b.z-fp.z,r2=r*r;
  var start2=sx*sx+sz*sz,end2=ex*ex+ez*ez;if(start2<r2&&sx*dx+sz*dz>=0&&end2>start2+1e-8)return null;
  if(len2<1e-8)return end2<r2?{t:1,obstacle:fp}:null;
  var t=clamp((-(sx*dx+sz*dz))/len2,0,1),px=a.x+dx*t-fp.x,pz=a.z+dz*t-fp.z;return px*px+pz*pz<r2?{t:t,obstacle:fp}:null;
}
function segmentObb(a,b,fp,margin){
  margin=shapeMargin(fp,margin||0);
  var A=toLocal(fp,a),B=toLocal(fp,b),hx=(+fp.hx||.5)+margin,hz=(+fp.hz||.5)+margin,dx=B.x-A.x,dz=B.z-A.z;
  var sm=Math.max(Math.abs(A.x)/hx,Math.abs(A.z)/hz);
  var exitX=hx-Math.abs(A.x)<=hz-Math.abs(A.z)&&A.x*dx>=0&&Math.abs(B.x)>Math.abs(A.x)+1e-8;
  var exitZ=hz-Math.abs(A.z)<=hx-Math.abs(A.x)&&A.z*dz>=0&&Math.abs(B.z)>Math.abs(A.z)+1e-8;
  if(sm<1&&(exitX||exitZ))return null;
  var t0=0,t1=1;
  function slab(p,d,min,max){if(Math.abs(d)<1e-9)return p>=min&&p<=max;var aa=(min-p)/d,bb=(max-p)/d;if(aa>bb){var q=aa;aa=bb;bb=q;}if(aa>t0)t0=aa;if(bb<t1)t1=bb;return t0<=t1;}
  if(!slab(A.x,dx,-hx,hx)||!slab(A.z,dz,-hz,hz)||t1<0||t0>1)return null;return{t:clamp(t0,0,1),obstacle:fp};
}
function shapeHit(a,b,fp,margin){return fp&&fp.shape==='obb'?segmentObb(a,b,fp,margin):segmentCircle(a,b,fp,margin);}
function routeNodes(fp,margin){
  var out=[],m=shapeMargin(fp,margin||0)+NODE_PAD,i;
  if(fp.shape==='obb'){
    var hx=(+fp.hx||.5)+m,hz=(+fp.hz||.5)+m;
    out.push(fromLocal(fp,-hx,-hz),fromLocal(fp,-hx,hz),fromLocal(fp,hx,-hz),fromLocal(fp,hx,hz));
  }else{
    var r=(+fp.radius||1)+m,n=8;for(i=0;i<n;i++){var a=Math.PI*2*i/n;out.push({x:fp.x+Math.cos(a)*r,z:fp.z+Math.sin(a)*r});}
  }
  return out;
}
function edgeClear(sim,a,b,shapes,margin){
  if(!baseMovementClear(a,b))return false;
  /* Candidate nodes are capped, collision geometry is not. A detour may leave the original
     corridor or meet a footprint excluded from the candidate budget. */
  var nearby=gatherStatic(sim,a,b,margin*1.5+.01);
  for(var i=0;i<nearby.length;i++)if(shapeHit(a,b,nearby[i],margin))return false;
  for(i=0;i<shapes.length;i++)if(shapeHit(a,b,shapes[i],margin))return false;
  return true;
}

function routeFootprints(sim,start,goal,soldier,limit){
  var list=gatherStatic(sim,start,goal,ROUTE_CORRIDOR+ROUTE_MARGIN+1),scored=[],i;
  for(i=0;i<list.length;i++){
    var fp=list[i],br=boundRadius(fp,ROUTE_MARGIN),clearance=pointSegmentDistance({x:+fp.x,z:+fp.z},start,goal)-br,direct=shapeHit(start,goal,fp,ROUTE_MARGIN)?0:1;
    if(direct===0||clearance<=ROUTE_CORRIDOR)scored.push({fp:fp,direct:direct,clearance:clearance});
  }
  var occ=refreshOccupied(sim,false);
  for(i=0;i<occ.length;i++){
    var st=occ[i];if(st.soldier===soldier)continue;
    var c=pointSegmentDistance(st,start,goal)-boundRadius(st,ROUTE_MARGIN);
    if(c<=ROUTE_CORRIDOR)scored.push({fp:st,direct:shapeHit(start,goal,st,ROUTE_MARGIN)?0:1,clearance:c});
  }
  scored.sort(function(a,b){return a.direct-b.direct||a.clearance-b.clearance;});
  return scored.slice(0,limit||MAX_ROUTE_SHAPES).map(function(x){return x.fp;});
}

function heapPush(h,x){h.push(x);var i=h.length-1;while(i>0){var p=(i-1)>>1;if(h[p].f<=h[i].f)break;var t=h[p];h[p]=h[i];h[i]=t;i=p;}}
function heapPop(h){var top=h[0],last=h.pop();if(h.length){h[0]=last;for(var i=0;;){var l=i*2+1,r=l+1,s=i;if(l<h.length&&h[l].f<h[s].f)s=l;if(r<h.length&&h[r].f<h[s].f)s=r;if(s===i)break;var t=h[i];h[i]=h[s];h[s]=t;i=s;}}return top;}
function localGoal(start,goal){var d=dist(start,goal);if(d<=ROUTE_HORIZON)return{x:goal.x,z:goal.z,kind:goal.kind||null,meta:goal.meta||null};var u=ROUTE_HORIZON/d;return{x:start.x+(goal.x-start.x)*u,z:start.z+(goal.z-start.z)*u,kind:'lookahead'};}
function planLocal(sim,soldier,start,goal,expanded){
  var end=localGoal(start,goal),shapes=routeFootprints(sim,start,end,soldier,expanded?MAX_ROUTE_SHAPES*3:MAX_ROUTE_SHAPES);
  if(edgeClear(sim,start,end,shapes,ROUTE_MARGIN))return{points:[end],segmentGoal:end,finalGoal:goal,shapes:shapes};
  var nodes=[start,end],i,j;
  for(i=0;i<shapes.length;i++){
    var candidates=routeNodes(shapes[i],ROUTE_MARGIN);
    for(j=0;j<candidates.length;j++){var p=candidates[j];if(edgeClear(sim,p,p,shapes,ROUTE_MARGIN)){p.kind='avoid';nodes.push(p);}}
  }
  var adj=new Array(nodes.length);for(i=0;i<nodes.length;i++)adj[i]=[];
  for(i=0;i<nodes.length;i++)for(j=i+1;j<nodes.length;j++){
    /* Clearance permits outward escape when a start is already inside a buffer. That makes
       visibility directed: a legal escape edge must never imply a legal reverse entry edge. */
    var d=dist(nodes[i],nodes[j]);
    if(edgeClear(sim,nodes[i],nodes[j],shapes,ROUTE_MARGIN))adj[i].push({to:j,cost:d});
    if(edgeClear(sim,nodes[j],nodes[i],shapes,ROUTE_MARGIN))adj[j].push({to:i,cost:d});
  }
  var open=[],g=new Array(nodes.length),prev=new Array(nodes.length),closed=new Array(nodes.length);
  for(i=0;i<g.length;i++)g[i]=Infinity;g[0]=0;heapPush(open,{id:0,f:dist(start,end)});
  while(open.length){
    var cur=heapPop(open),id=cur.id;if(closed[id])continue;closed[id]=1;if(id===1)break;
    var list=adj[id];for(i=0;i<list.length;i++){var e=list[i],ng=g[id]+e.cost;if(ng+1e-6<g[e.to]){g[e.to]=ng;prev[e.to]=id;heapPush(open,{id:e.to,f:ng+dist(nodes[e.to],end)});}}
  }
  var path=[];
  if(isFinite(g[1])){
    var k=1,ids=[1];while(k!==0&&prev[k]!=null){k=prev[k];ids.push(k);}ids.reverse();
    for(i=1;i<ids.length;i++)path.push({x:nodes[ids[i]].x,z:nodes[ids[i]].z,kind:nodes[ids[i]].kind||'physical',meta:nodes[ids[i]].meta||null});
  }
  if(!path.length&&!expanded&&shapes.length>=MAX_ROUTE_SHAPES)return planLocal(sim,soldier,start,goal,true);
  if(!path.length){
    var direct=null;
    for(i=0;i<shapes.length;i++){var hit=shapeHit(start,end,shapes[i],ROUTE_MARGIN);if(hit&&(!direct||hit.t<direct.t))direct={fp:shapes[i],t:hit.t};}
    if(direct){
      var around=routeNodes(direct.fp,ROUTE_MARGIN),best=null;
      for(i=0;i<around.length;i++){
        var c=around[i];if(!edgeClear(sim,start,c,shapes,ROUTE_MARGIN))continue;
        var score=dist(start,c)+dist(c,end);if(!best||score<best.score)best={x:c.x,z:c.z,score:score,kind:'avoid'};
      }
      if(best)path.push(best);
    }
  }
  /* No route is a real result. Never turn failure into an unchecked straight segment. */
  return{points:path,segmentGoal:end,finalGoal:goal,shapes:shapes,blocked:!path.length};
}

function baseTargets(start,dest){
  var route=baseFindPath(start,dest)||[{x:dest.x,z:dest.z}],out=[];
  for(var i=0;i<route.length;i++){var p=point(route[i]);if(p)out.push(p);}
  var d=point(dest);if(d&&(!out.length||dist(out[out.length-1],d)>.25))out.push(d);
  return out;
}
/* Formation/cover orders can land inside a mesh or its clearance buffer. Settle at a nearby
   legal stand point instead of repeatedly circling an unreachable point. Keep the resolved
   destination intact; only navigation owns this bounded endpoint adjustment. Building walls
   still gate the adjustment so a room/window order cannot jump to the other side of a wall. */
function standGoal(sim,soldier,start,dest){
  var shapes=routeFootprints(sim,dest,dest,soldier);
  if(edgeClear(sim,dest,dest,shapes,ROUTE_MARGIN))return dest;
  var radii=[.5,1,1.5,2,2.5,3,4,6],best=null;
  for(var ri=0;ri<radii.length;ri++){
    for(var i=0;i<16;i++){
      var a=i*Math.PI/8,p={x:dest.x+Math.cos(a)*radii[ri],z:dest.z+Math.sin(a)*radii[ri],kind:'stand-goal'};
      if(!baseMovementClear(dest,p)||!edgeClear(sim,p,p,shapes,ROUTE_MARGIN))continue;
      var score=dist(start,p);if(!best||score<best.score)best={point:p,score:score};
    }
    if(best)return best.point;
  }
  return dest;
}
function rawLookahead(sim,soldier,start,dest){
  var targets=baseTargets(start,dest);if(!targets.length)return[];
  var cursor={x:start.x,z:start.z},raw=[],travel=0,guard=0;
  outer:for(var ti=0;ti<targets.length&&guard<48;ti++){
    var target=targets[ti];
    while(dist(cursor,target)>GOAL_ARRIVAL&&guard++<48){
      var before={x:cursor.x,z:cursor.z},planned=planLocal(sim,soldier,cursor,target),pts=planned.points||[];
      if(!pts.length)break outer;
      for(var pi=0;pi<pts.length;pi++){
        var n=pts[pi],seg=dist(cursor,n);if(seg<.04)continue;
        if(travel+seg>LOOKAHEAD_DISTANCE){
          var remain=LOOKAHEAD_DISTANCE-travel,u=remain/seg;
          if(remain>.4)raw.push({x:cursor.x+(n.x-cursor.x)*u,z:cursor.z+(n.z-cursor.z)*u,kind:'lookahead'});
          travel=LOOKAHEAD_DISTANCE;break outer;
        }
        raw.push({x:n.x,z:n.z,kind:n.kind||target.kind||'route',meta:n.meta||target.meta||null});
        travel+=seg;cursor={x:n.x,z:n.z};
      }
      if(dist(cursor,target)<=GOAL_ARRIVAL)break;
      if(dist(before,cursor)<.08)break;
      if(travel>=LOOKAHEAD_DISTANCE)break outer;
      if(dist(cursor,planned.segmentGoal)<=PATH_ARRIVAL&&dist(planned.segmentGoal,target)>PATH_ARRIVAL)continue;
      continue;
    }
  }
  return raw;
}
function rawLength(start,raw){var total=0,c=start;for(var i=0;i<raw.length;i++){total+=dist(c,raw[i]);c=raw[i];}return total;}
function densify(start,raw){
  if(!raw.length)return[];
  var total=rawLength(start,raw),spacing=Math.min(WAYPOINT_SPACING,Math.max(MIN_WAYPOINT_SPACING,total/Math.max(1,TARGET_QUEUE))),out=[],cursor={x:start.x,z:start.z};
  for(var i=0;i<raw.length&&out.length<MAX_QUEUE;i++){
    var n=raw[i],d=dist(cursor,n);if(d<.05){cursor={x:n.x,z:n.z};continue;}
    var steps=Math.max(1,Math.ceil(d/spacing));
    for(var s=1;s<=steps&&out.length<MAX_QUEUE;s++){
      var u=s/steps;
      out.push({x:cursor.x+(n.x-cursor.x)*u,z:cursor.z+(n.z-cursor.z)*u,kind:s===steps?(n.kind||'route'):'corridor',meta:s===steps?(n.meta||null):null});
    }
    cursor={x:n.x,z:n.z};
  }
  return out;
}
function topUpQueue(sim,soldier,start,dest,points){
  var guard=0,tail=points.length?points[points.length-1]:start;
  while(points.length<TARGET_QUEUE&&dist(tail,dest)>PATH_ARRIVAL&&guard++<4){
    var raw=rawLookahead(sim,soldier,tail,dest),extra=densify(tail,raw),before=points.length;
    for(var i=0;i<extra.length&&points.length<MAX_QUEUE;i++){
      var n=extra[i];if(dist(tail,n)<.05)continue;points.push(n);tail=n;
    }
    if(points.length===before)break;
  }
  return points;
}
function buildRollingPlan(soldier,sim,start,dest){
  var goal=standGoal(sim,soldier,start,dest),raw=rawLookahead(sim,soldier,start,goal),points=densify(start,raw);
  points=topUpQueue(sim,soldier,start,goal,points);
  soldier._physicalPath={
    version:physicalVersion(sim),
    finalGoalX:+dest.x,finalGoalZ:+dest.z,standGoal:goal,points:points,blocked:!points.length&&dist(start,goal)>GOAL_ARRIVAL,index:0,createdAt:sim.time,replanAt:sim.time+REPLAN_SECONDS,
    minQueue:MIN_QUEUE,routeMargin:ROUTE_MARGIN,collisionMargin:COLLISION_MARGIN
  };
  var first=points[0];
  if(first&&dist(first,dest)>1.0)soldier._fieldDetour={x:first.x,z:first.z,goalX:+dest.x,goalZ:+dest.z,until:sim.time+REPLAN_SECONDS,key:'rolling-path',kind:'mesh-route'};
  else soldier._fieldDetour=null;
  return soldier._physicalPath;
}
function firstSegmentClear(sim,soldier,start,c){
  var p=c&&c.points&&c.points[0];if(!p)return false;
  var shapes=routeFootprints(sim,start,p,soldier);return edgeClear(sim,start,p,shapes,ROUTE_MARGIN);
}
function needsReplan(soldier,sim,dest,start){
  var c=soldier._physicalPath;if(!c)return true;
  if(c.version!==physicalVersion(sim))return true;
  if(Math.hypot(dest.x-c.finalGoalX,dest.z-c.finalGoalZ)>1.4)return true;
  if(!c.points||!c.points.length)return sim.time>=c.replanAt||(!c.blocked&&dist(start,c.standGoal)>GOAL_ARRIVAL);
  if(!firstSegmentClear(sim,soldier,start,c))return true;
  if(sim.time>=c.replanAt)return true;
  return false;
}
function consumeReached(c,start,sim,soldier){
  if(!c||!c.points)return;
  while(c.points.length){
    var next=c.points[1],arrival=next?PATH_ARRIVAL:GOAL_ARRIVAL;
    if(dist(start,c.points[0])>arrival)break;
    // Reaching the corner's radius is not permission to cut through the corner itself.
    if(next&&!edgeClear(sim,start,next,routeFootprints(sim,start,next,soldier),ROUTE_MARGIN))break;
    c.points.shift();
  }
  c.index=0;
}

function planComplete(sim,start,end,soldier,exact){
  if(!sim)return baseFindPath(start,end);
  if(!exact)end=standGoal(sim,null,start,end);
  if(dist(start,end)<=GOAL_ARRIVAL&&N.movementClear(start,end))return[point(end)];
  var building=baseFindPath(start,end)||[{x:end.x,z:end.z}],cursor={x:start.x,z:start.z},raw=[],guard=0;
  for(var bi=0;bi<building.length&&guard<96;bi++){
    var target=point(building[bi]);if(!target)continue;
    while(dist(cursor,target)>GOAL_ARRIVAL&&guard++<96){
      var p=planLocal(sim,soldier||null,cursor,target),pts=p.points||[];if(!pts.length)return exact?[]:densify(start,raw);
      var progressed=false;
      for(var q=0;q<pts.length;q++){var n=pts[q];if(dist(cursor,n)>.05){raw.push({x:n.x,z:n.z,kind:n.kind||target.kind||'physical',meta:n.meta||target.meta||null});cursor={x:n.x,z:n.z};progressed=true;}}
      if(dist(cursor,target)<=GOAL_ARRIVAL)break;
      if(!progressed)break;
      if(dist(cursor,p.segmentGoal)<=PATH_ARRIVAL&&dist(p.segmentGoal,target)>PATH_ARRIVAL)continue;
    }
  }
  return exact?(dist(cursor,end)<=GOAL_ARRIVAL?raw:[]):densify(start,raw);
}

N.movementClear=function(a,b){
  if(!baseMovementClear(a,b))return false;var sim=currentSim();if(!sim)return true;
  var shapes=gatherStatic(sim,a,b,COLLISION_MARGIN+.8);
  for(var i=0;i<shapes.length;i++)if(shapeHit(a,b,shapes[i],COLLISION_MARGIN))return false;
  return true;
};
/* The base wall slider only knows building walls. Validate its answer against the complete
   body envelope, then seek a legal physical tangent/fan step at this same navigation layer. */
var baseResolveStep=N.resolveStep;
N.resolveStep=function(from,to){
  var candidate=baseResolveStep?baseResolveStep(from,to):to;
  if(candidate&&N.movementClear(from,candidate))return candidate;
  var dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);if(len<1e-8)return null;
  var heading=Math.atan2(dz,dx),fan=[.26,.52,.79,1.05,1.31,1.57,2.09];
  for(var i=0;i<fan.length;i++)for(var sign=-1;sign<=1;sign+=2){
    var a=heading+sign*fan[i],p={x:from.x+Math.cos(a)*len,z:from.z+Math.sin(a)*len};
    if(N.movementClear(from,p))return p;
  }
  return null;
};
N.findPath=function(start,end){var sim=currentSim();return sim?planComplete(sim,start,end):baseFindPath(start,end);};
N.nextWaypoint=function(sim,soldier,dest){
  simRef=sim||simRef;
  // Positional ingress already contains a complete, committed physical route.
  var task=root.BattleTacticalPositions&&root.BattleTacticalPositions.current(soldier),last=soldier&&soldier._movementResolver&&soldier._movementResolver.last;
  if(task&&last&&last.kind==='firing-station'&&dest&&N.movementClear(soldier.root.position,dest))return dest;
  var base=baseNextWaypoint(sim,soldier,dest)||dest;
  if(!soldier||!soldier.root||!dest)return base;
  var start={x:+soldier.root.position.x,z:+soldier.root.position.z},finalGoal=point(dest);if(!finalGoal)return base;
  var c=soldier._physicalPath;
  if(needsReplan(soldier,sim,finalGoal,start))c=buildRollingPlan(soldier,sim,start,finalGoal);
  consumeReached(c,start,sim,soldier);
  if(!c.blocked&&c.points.length<=MIN_QUEUE&&dist(start,c.standGoal)>PATH_ARRIVAL*2)c=buildRollingPlan(soldier,sim,start,finalGoal);
  consumeReached(c,start,sim,soldier);
  var wp=c.points[0];
  if(!wp)return start; // Hold a blocked route until its bounded retry; no destination write.
  if(dist(wp,finalGoal)>1.0)soldier._fieldDetour={x:wp.x,z:wp.z,goalX:finalGoal.x,goalZ:finalGoal.z,until:sim.time+REPLAN_SECONDS,key:'rolling-path',kind:'mesh-route'};
  else soldier._fieldDetour=null;
  return wp;
};

function makeMaterial(scene,name,r,g,b,alpha){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=new BABYLON.Color3(r,g,b);m.emissiveColor=new BABYLON.Color3(r*.72,g*.72,b*.72);m.specularColor=BABYLON.Color3.Black();m.alpha=alpha;m.disableDepthWrite=true;return m;}
function disposeMarkers(){for(var i=0;i<debug.markers.length;i++){var m=debug.markers[i];try{m.station.dispose();}catch(_){}try{m.window.dispose();}catch(_){}try{m.line.dispose();}catch(_){}}debug.markers=[];debug.version=-1;}
function ensureMaterials(scene){if(debug.freeMat&&debug.freeMat.getScene()===scene)return;debug.freeMat=makeMaterial(scene,'windowSlotFreeMat',.2,.85,1,.42);debug.usedMat=makeMaterial(scene,'windowSlotUsedMat',1,.46,.12,.58);}
function rebuildMarkers(sim){
  disposeMarkers();if(!debug.visible||typeof BABYLON==='undefined'||!sim||!sim.scene)return;ensureMaterials(sim.scene);var slots=N.firingStations||[];
  for(var i=0;i<slots.length;i++){
    var st=slots[i],sy=sim.heightAt(st.x,st.z)+.58,wx=st.windowX+st.normalX*.28,wz=st.windowZ+st.normalZ*.28,wy=sim.heightAt(st.windowX,st.windowZ)+((+st.yBottom||.9)+(+st.yTop||2.0))*.5;
    var sphere=BABYLON.MeshBuilder.CreateSphere('windowStationDebug',{diameter:.62,segments:8},sim.scene);sphere.position.set(st.x,sy,st.z);sphere.material=debug.freeMat;sphere.isPickable=false;sphere.renderingGroupId=3;
    var win=BABYLON.MeshBuilder.CreateSphere('windowOpeningDebug',{diameter:.34,segments:7},sim.scene);win.position.set(wx,wy,wz);win.material=debug.freeMat;win.isPickable=false;win.renderingGroupId=3;
    var line=BABYLON.MeshBuilder.CreateLines('windowSlotLink',{points:[new BABYLON.Vector3(st.x,sy,st.z),new BABYLON.Vector3(wx,wy,wz)]},sim.scene);line.color=new BABYLON.Color3(.45,.9,1);line.alpha=.55;line.isPickable=false;line.renderingGroupId=3;
    debug.markers.push({id:st.id,station:sphere,window:win,line:line});
  }
  debug.version=N.version;updateDebug(sim,true);
}
function updateDebug(sim,force){
  if(!debug.visible||!sim)return;if(debug.version!==N.version){rebuildMarkers(sim);return;}if(!force&&sim.time<debug.nextUpdate)return;debug.nextUpdate=sim.time+.22;
  var occ=refreshOccupied(sim,true),used={};for(var i=0;i<occ.length;i++)used[String(occ[i].id).replace(/^station:/,'')]=1;
  for(i=0;i<debug.markers.length;i++){var m=debug.markers[i],mat=used[m.id]?debug.usedMat:debug.freeMat;m.station.material=mat;m.window.material=mat;}
  if(debug.button)debug.button.textContent='Window Slots '+occ.length+'/'+debug.markers.length;
}
function setVisible(v){debug.visible=!!v;try{localStorage.setItem('battleWindowSlotsVisible',debug.visible?'1':'0');}catch(_){}var sim=currentSim();if(debug.visible)rebuildMarkers(sim);else{disposeMarkers();if(debug.button)debug.button.textContent='Window Slots';}if(debug.button)debug.button.classList.toggle('on',debug.visible);}
function installButton(){
  if(typeof document==='undefined'||debug.button)return;
  var s=document.createElement('style');s.textContent='#windowSlotDebugToggle{position:fixed;right:12px;bottom:92px;z-index:16;padding:7px 10px;border:1px solid #4d6f79;border-radius:5px;background:#17262c;color:#dcecef;font:700 10px Arial;cursor:pointer;box-shadow:0 4px 14px #0005}#windowSlotDebugToggle.on{border-color:#65c9dc;background:#1d4650;color:#dfffff}';document.head.appendChild(s);
  var b=document.createElement('button');b.id='windowSlotDebugToggle';b.type='button';b.textContent='Window Slots';b.title='Show reservable window firing positions and their interior stand points';document.body.appendChild(b);debug.button=b;b.onclick=function(){setVisible(!debug.visible);};
  try{if(localStorage.getItem('battleWindowSlotsVisible')==='1'){debug.visible=true;b.classList.add('on');}}catch(_){}
}

root.BattleModules.registerSystem('navigation-physicality-debug',{
  version:'49-enforced-body-clearance',
  onBattleStart:function(sim){simRef=sim;occupiedAt=-999;legacyCache=null;physicalIndexCache=null;installButton();if(debug.visible)rebuildMarkers(sim);},
  onBattleRestart:function(sim){simRef=sim;occupiedAt=-999;legacyCache=null;physicalIndexCache=null;['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){delete s._fieldDetour;delete s._physicalPath;});});if(debug.visible)rebuildMarkers(sim);},
  onSimulationStep:function(sim){simRef=sim;if(debug.visible)updateDebug(sim,false);}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();}

root.BattleNavigationPhysicality={
  version:'49-enforced-body-clearance',setWindowDebug:setVisible,windowDebug:function(){return debug.visible;},
  occupiedStations:function(sim){return refreshOccupied(sim||currentSim(),true).slice();},hardTypes:Object.keys(HARD_TYPES),
  bodyRadius:BODY_RADIUS,bodyWidth:BODY_RADIUS*2,navMargin:COLLISION_MARGIN,routeMargin:ROUTE_MARGIN,routeHorizon:ROUTE_HORIZON,minLookahead:MIN_QUEUE,maxLookahead:MAX_QUEUE,
  footprints:function(sim){return staticFootprints(sim||currentSim()).slice();},shapeHit:shapeHit,shapeContains:shapeContains,routeNodes:routeNodes,
  planIngressPath:function(sim,soldier,start,end){return planComplete(sim,start,end,soldier,true);},
  planPath:function(sim,start,end){return planComplete(sim||currentSim(),start,end);},planLocal:function(sim,start,end){return planLocal(sim||currentSim(),null,start,end);}
};
console.log('[NAV-PHYS] rolling 3+ waypoint routing + buffered mesh-footprint avoidance loaded');
})(typeof window!=='undefined'?window:globalThis);
