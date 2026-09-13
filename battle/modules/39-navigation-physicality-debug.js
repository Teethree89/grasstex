/* Mesh-footprint physical navigation + firing-station debug overlay.

   Tactical cover circles are deliberately NOT used as movement collision. Terrain features publish
   mesh-aligned ground footprints (OBBs/circles); this layer adds a soldier clearance margin and
   plans a short visibility-graph route around those footprints before the movement step happens.

   BattleNavigation remains the building/door authority and Movement Resolver remains the sole
   writer of soldier.destination. This module only refines BattleNavigation's waypoint/path layer. */
(function(root){
'use strict';
if(!root.BattleModules||!root.BattleNavigation||root.BattleNavigationPhysicality)return;

var N=root.BattleNavigation,F=root.BattleObstacleField;
var baseMovementClear=N.movementClear,baseNextWaypoint=N.nextWaypoint,baseFindPath=N.findPath,baseFiringDirective=N.firingDirective;
var HARD_TYPES={hedge:1,tree:1,log:1,wall:1,rock:1};
var NAV_MARGIN=.48,NODE_PAD=.22,ROUTE_HORIZON=72,ROUTE_CORRIDOR=9,MAX_ROUTE_SHAPES=26,REPLAN_SECONDS=2.4,PATH_ARRIVAL=.78;
var STATION_RADIUS=.92,CONTACT_GRACE=4.5;
var simRef=null,occupied=[],occupiedAt=-999,legacyCache=null,physicalIndexCache=null;
var debug={visible:false,version:-1,markers:[],freeMat:null,usedMat:null,button:null,nextUpdate:0};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function point(v){return v&&isFinite(+v.x)&&isFinite(+v.z)?{x:+v.x,z:+v.z}:null;}
function dist(a,b){return!a||!b?Infinity:Math.hypot(a.x-b.x,a.z-b.z);}
function dist2(a,b){if(!a||!b)return Infinity;var dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
function currentSim(){var b=simRef||root.__battle__;if(!b||!b.obstacles)return null;var navScenario=N.scenario,battleScenario=b.scene&&b.scene.metadata&&b.scene.metadata.battleScenario;if(navScenario&&battleScenario&&navScenario!==battleScenario)return null;return b;}
function obstacleKey(ob){return ob&&ob.id||((ob&&ob.type)||'ob')+':'+(+ob.x||0).toFixed(2)+':'+(+ob.z||0).toFixed(2);}
function hardObstacle(ob){return!!(ob&&HARD_TYPES[String(ob.type||'').toLowerCase()]);}

/* ---------- physical shape source ----------------------------------------------------------- */
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
function physicalVersion(sim){var o=sim&&sim.obstacles;return(o&&o.__physicalVersion||0)+'|'+staticFootprints(sim).length;}
var PHYS_CELL=28;
function footprintExtents(fp){
  if(fp.shape!=='obb'){var r=+fp.radius||1;return{x:r,z:r};}
  var a=axes(fp),hx=+fp.hx||.5,hz=+fp.hz||.5;return{x:Math.abs(a.ux)*hx+Math.abs(a.vx)*hz,z:Math.abs(a.uz)*hx+Math.abs(a.vz)*hz};
}
function physicalIndex(sim){
  var list=staticFootprints(sim),ver=physicalVersion(sim);if(physicalIndexCache&&physicalIndexCache.source===list&&physicalIndexCache.version===ver)return physicalIndexCache;
  if(!list.length)return(physicalIndexCache={source:list,version:ver,list:list,empty:true,scratch:[]});
  var minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,i;for(i=0;i<list.length;i++){var fp=list[i],e=footprintExtents(fp),x=+fp.x||0,z=+fp.z||0;minX=Math.min(minX,x-e.x);maxX=Math.max(maxX,x+e.x);minZ=Math.min(minZ,z-e.z);maxZ=Math.max(maxZ,z+e.z);}
  var cols=Math.max(1,Math.ceil((maxX-minX)/PHYS_CELL)+1),rows=Math.max(1,Math.ceil((maxZ-minZ)/PHYS_CELL)+1),buckets=new Array(cols*rows),idx={source:list,version:ver,list:list,minX:minX,minZ:minZ,cols:cols,rows:rows,buckets:buckets,stamp:new Int32Array(list.length),epoch:0,scratch:[]};
  function col(x){return clamp(Math.floor((x-minX)/PHYS_CELL),0,cols-1);}function row(z){return clamp(Math.floor((z-minZ)/PHYS_CELL),0,rows-1);}
  for(i=0;i<list.length;i++){var f=list[i],ex=footprintExtents(f),c0=col(f.x-ex.x),c1=col(f.x+ex.x),r0=row(f.z-ex.z),r1=row(f.z+ex.z);for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++){var k=c+r*cols;(buckets[k]||(buckets[k]=[])).push(i);}}
  physicalIndexCache=idx;return idx;
}
function gatherStatic(sim,a,b,pad){
  var idx=physicalIndex(sim);if(!idx||idx.empty)return[];idx.epoch++;if(idx.epoch>=2147483000){idx.stamp.fill(0);idx.epoch=1;}var out=idx.scratch;out.length=0,pad=pad||0;
  var minX=Math.min(a.x,b.x)-pad,maxX=Math.max(a.x,b.x)+pad,minZ=Math.min(a.z,b.z)-pad,maxZ=Math.max(a.z,b.z)+pad;
  function col(x){return clamp(Math.floor((x-idx.minX)/PHYS_CELL),0,idx.cols-1);}function row(z){return clamp(Math.floor((z-idx.minZ)/PHYS_CELL),0,idx.rows-1);}
  var c0=col(minX),c1=col(maxX),r0=row(minZ),r1=row(maxZ);for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++){var bucket=idx.buckets[c+r*idx.cols];if(!bucket)continue;for(var j=0;j<bucket.length;j++){var id=bucket[j];if(idx.stamp[id]===idx.epoch)continue;idx.stamp[id]=idx.epoch;out.push(idx.list[id]);}}
  return out;
}
function refreshOccupied(sim,force){
  if(!sim)return occupied=[];if(!force&&sim.time<occupiedAt+.22)return occupied;occupiedAt=sim.time;occupied=[];
  ['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){var st=s&&!s.dead&&(s._firingStation||s._windowSlot);if(st)occupied.push({id:'station:'+st.id,type:'occupied-window',shape:'circle',x:+st.x,z:+st.z,radius:STATION_RADIUS,soldier:s});});});return occupied;
}
function routeFootprints(sim,start,goal,soldier){
  var list=gatherStatic(sim,start,goal,ROUTE_CORRIDOR+NAV_MARGIN+1),scored=[],i;
  for(i=0;i<list.length;i++){
    var fp=list[i],br=boundRadius(fp,NAV_MARGIN),clearance=pointSegmentDistance({x:+fp.x,z:+fp.z},start,goal)-br,direct=shapeHit(start,goal,fp,NAV_MARGIN)?0:1;
    if(direct===0||clearance<=ROUTE_CORRIDOR)scored.push({fp:fp,direct:direct,clearance:clearance});
  }
  var occ=refreshOccupied(sim,false);for(i=0;i<occ.length;i++){var st=occ[i];if(st.soldier===soldier)continue;var c=pointSegmentDistance(st,start,goal)-boundRadius(st,.18);if(c<=ROUTE_CORRIDOR)scored.push({fp:st,direct:shapeHit(start,goal,st,.18)?0:1,clearance:c});}
  scored.sort(function(a,b){return a.direct-b.direct||a.clearance-b.clearance;});
  return scored.slice(0,MAX_ROUTE_SHAPES).map(function(x){return x.fp;});
}

/* ---------- geometry ------------------------------------------------------------------------ */
function axes(fp){
  var ux=isFinite(+fp.ux)?+fp.ux:1,uz=isFinite(+fp.uz)?+fp.uz:0,len=Math.hypot(ux,uz)||1;ux/=len;uz/=len;
  var vx=isFinite(+fp.vx)?+fp.vx:-uz,vz=isFinite(+fp.vz)?+fp.vz:ux,vlen=Math.hypot(vx,vz)||1;vx/=vlen;vz/=vlen;
  return{ux:ux,uz:uz,vx:vx,vz:vz};
}
function toLocal(fp,p){var a=axes(fp),dx=p.x-(+fp.x||0),dz=p.z-(+fp.z||0);return{x:dx*a.ux+dz*a.uz,z:dx*a.vx+dz*a.vz};}
function fromLocal(fp,x,z){var a=axes(fp);return{x:(+fp.x||0)+a.ux*x+a.vx*z,z:(+fp.z||0)+a.uz*x+a.vz*z};}
function boundRadius(fp,margin){margin=margin||0;if(fp.shape==='obb')return Math.hypot((+fp.hx||.5)+margin,(+fp.hz||.5)+margin);return(+fp.radius||1)+margin;}
function pointSegmentDistance(p,a,b){var dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(l2<1e-8)return dist(p,a);var t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,0,1),x=a.x+dx*t,z=a.z+dz*t;return Math.hypot(p.x-x,p.z-z);}
function shapeContains(p,fp,margin){
  margin=margin||0;if(fp.shape==='obb'){var q=toLocal(fp,p);return Math.abs(q.x)<=(+fp.hx||.5)+margin&&Math.abs(q.z)<=(+fp.hz||.5)+margin;}
  var r=(+fp.radius||1)+margin,dx=p.x-(+fp.x||0),dz=p.z-(+fp.z||0);return dx*dx+dz*dz<=r*r;
}
function segmentCircle(a,b,fp,margin){
  var dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz,r=(+fp.radius||1)+(margin||0),sx=a.x-fp.x,sz=a.z-fp.z,ex=b.x-fp.x,ez=b.z-fp.z,r2=r*r;
  var start2=sx*sx+sz*sz,end2=ex*ex+ez*ez;if(start2<r2&&end2>start2+.02)return null;
  if(len2<1e-8)return end2<r2?{t:1,obstacle:fp}:null;
  var t=clamp((-(sx*dx+sz*dz))/len2,0,1),px=a.x+dx*t-fp.x,pz=a.z+dz*t-fp.z;return px*px+pz*pz<r2?{t:t,obstacle:fp}:null;
}
function segmentObb(a,b,fp,margin){
  var A=toLocal(fp,a),B=toLocal(fp,b),hx=(+fp.hx||.5)+(margin||0),hz=(+fp.hz||.5)+(margin||0),dx=B.x-A.x,dz=B.z-A.z;
  var sm=Math.max(Math.abs(A.x)/hx,Math.abs(A.z)/hz),em=Math.max(Math.abs(B.x)/hx,Math.abs(B.z)/hz);if(sm<1&&em>sm+.02)return null;
  var t0=0,t1=1;
  function slab(p,d,min,max){if(Math.abs(d)<1e-9)return p>=min&&p<=max;var a=(min-p)/d,b=(max-p)/d;if(a>b){var q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;return t0<=t1;}
  if(!slab(A.x,dx,-hx,hx)||!slab(A.z,dz,-hz,hz)||t1<0||t0>1)return null;return{t:clamp(t0,0,1),obstacle:fp};
}
function shapeHit(a,b,fp,margin){return fp&&fp.shape==='obb'?segmentObb(a,b,fp,margin):segmentCircle(a,b,fp,margin);}
function routeNodes(fp,margin){
  var out=[],m=(margin||0)+NODE_PAD,i;if(fp.shape==='obb'){
    var hx=(+fp.hx||.5)+m,hz=(+fp.hz||.5)+m;out.push(fromLocal(fp,-hx,-hz),fromLocal(fp,-hx,hz),fromLocal(fp,hx,-hz),fromLocal(fp,hx,hz));
  }else{
    var r=(+fp.radius||1)+m,n=8;for(i=0;i<n;i++){var a=Math.PI*2*i/n;out.push({x:fp.x+Math.cos(a)*r,z:fp.z+Math.sin(a)*r});}
  }return out;
}
function edgeClear(sim,a,b,shapes,margin){
  if(!baseMovementClear(a,b))return false;for(var i=0;i<shapes.length;i++)if(shapeHit(a,b,shapes[i],margin))return false;return true;
}
function pointFree(p,shapes,margin){for(var i=0;i<shapes.length;i++)if(shapeContains(p,shapes[i],margin))return false;return true;}

/* ---------- visibility path ---------------------------------------------------------------- */
function heapPush(h,x){h.push(x);var i=h.length-1;while(i>0){var p=(i-1)>>1;if(h[p].f<=h[i].f)break;var t=h[p];h[p]=h[i];h[i]=t;i=p;}}
function heapPop(h){var top=h[0],last=h.pop();if(h.length){h[0]=last;for(var i=0;;){var l=i*2+1,r=l+1,s=i;if(l<h.length&&h[l].f<h[s].f)s=l;if(r<h.length&&h[r].f<h[s].f)s=r;if(s===i)break;var t=h[i];h[i]=h[s];h[s]=t;i=s;}}return top;}
function localGoal(start,goal){var d=dist(start,goal);if(d<=ROUTE_HORIZON)return{x:goal.x,z:goal.z};var u=ROUTE_HORIZON/d;return{x:start.x+(goal.x-start.x)*u,z:start.z+(goal.z-start.z)*u};}
function planLocal(sim,soldier,start,goal){
  var end=localGoal(start,goal),shapes=routeFootprints(sim,start,end,soldier);if(!shapes.length||edgeClear(sim,start,end,shapes,NAV_MARGIN))return{points:[end],segmentGoal:end,finalGoal:goal,shapes:shapes};
  var nodes=[start,end],owners=[null,null],i,j;
  for(i=0;i<shapes.length;i++){var candidates=routeNodes(shapes[i],NAV_MARGIN);for(j=0;j<candidates.length;j++){var p=candidates[j];if(pointFree(p,shapes,NAV_MARGIN*.98)){nodes.push(p);owners.push(shapes[i]);}}}
  var adj=new Array(nodes.length);for(i=0;i<nodes.length;i++)adj[i]=[];
  for(i=0;i<nodes.length;i++)for(j=i+1;j<nodes.length;j++){
    if(!edgeClear(sim,nodes[i],nodes[j],shapes,NAV_MARGIN))continue;var d=dist(nodes[i],nodes[j]);adj[i].push({to:j,cost:d});adj[j].push({to:i,cost:d});
  }
  var open=[],g=new Array(nodes.length),prev=new Array(nodes.length),closed=new Array(nodes.length);for(i=0;i<g.length;i++)g[i]=Infinity;g[0]=0;heapPush(open,{id:0,f:dist(start,end)});
  while(open.length){var cur=heapPop(open),id=cur.id;if(closed[id])continue;closed[id]=1;if(id===1)break;var list=adj[id];for(i=0;i<list.length;i++){var e=list[i],ng=g[id]+e.cost;if(ng+1e-6<g[e.to]){g[e.to]=ng;prev[e.to]=id;heapPush(open,{id:e.to,f:ng+dist(nodes[e.to],end)});}}}
  var path=[];if(isFinite(g[1])){var k=1,ids=[1];while(k!==0&&prev[k]!=null){k=prev[k];ids.push(k);}ids.reverse();for(i=1;i<ids.length;i++)path.push({x:nodes[ids[i]].x,z:nodes[ids[i]].z});}
  if(!path.length){
    /* Fail soft: route to the best reachable perimeter node around the first direct blocker. The
       next rolling plan continues from there instead of walking into the obstacle and stopping. */
    var direct=null;for(i=0;i<shapes.length;i++){var hit=shapeHit(start,end,shapes[i],NAV_MARGIN);if(hit&&(!direct||hit.t<direct.t))direct={fp:shapes[i],t:hit.t};}
    if(direct){var around=routeNodes(direct.fp,NAV_MARGIN),best=null;for(i=0;i<around.length;i++){var c=around[i];if(!edgeClear(sim,start,c,shapes,NAV_MARGIN))continue;var score=dist(start,c)+dist(c,end);if(!best||score<best.score)best={x:c.x,z:c.z,score:score};}if(best)path.push({x:best.x,z:best.z});}
  }
  if(!path.length)path.push(end);return{points:path,segmentGoal:end,finalGoal:goal,shapes:shapes};
}
function planComplete(sim,start,end){
  if(!sim)return baseFindPath(start,end);var building=baseFindPath(start,end)||[{x:end.x,z:end.z}],cursor={x:start.x,z:start.z},out=[],guard=0;
  for(var bi=0;bi<building.length&&guard<64;bi++){
    var target=point(building[bi]);if(!target)continue;
    while(dist(cursor,target)>PATH_ARRIVAL&&guard++<64){var p=planLocal(sim,null,cursor,target),pts=p.points;if(!pts||!pts.length)break;for(var q=0;q<pts.length;q++){var n=pts[q];if(dist(cursor,n)>.05){out.push({x:n.x,z:n.z,kind:'physical'});cursor={x:n.x,z:n.z};}}if(dist(cursor,p.segmentGoal)<PATH_ARRIVAL&&dist(p.segmentGoal,target)>PATH_ARRIVAL)continue;if(dist(cursor,target)<=PATH_ARRIVAL)break;if(pts.length===1&&dist(cursor,p.segmentGoal)>.05)break;}
  }
  if(!out.length||dist(out[out.length-1],end)>.1)out.push({x:end.x,z:end.z,kind:'goal'});return out;
}

/* Public movementClear now uses the same mesh footprints shown by World Debug. */
N.movementClear=function(a,b){
  if(!baseMovementClear(a,b))return false;var sim=currentSim();if(!sim)return true;var shapes=gatherStatic(sim,a,b,NAV_MARGIN+.8);for(var i=0;i<shapes.length;i++)if(shapeHit(a,b,shapes[i],NAV_MARGIN))return false;return true;
};
N.findPath=function(start,end){var sim=currentSim();return sim?planComplete(sim,start,end):baseFindPath(start,end);};

function needsReplan(soldier,sim,goal,start){
  var c=soldier._physicalPath;if(!c)return true;if(c.version!==physicalVersion(sim))return true;if(Math.hypot(goal.x-c.baseGoalX,goal.z-c.baseGoalZ)>2.3)return true;if(sim.time>=c.replanAt)return true;
  var p=c.points&&c.points[c.index];if(!p)return true;var shapes=routeFootprints(sim,start,p,soldier);return!edgeClear(sim,start,p,shapes,NAV_MARGIN);
}
function installPlan(soldier,sim,start,goal){
  var p=planLocal(sim,soldier,start,goal),points=p.points||[goal];soldier._physicalPath={version:physicalVersion(sim),baseGoalX:goal.x,baseGoalZ:goal.z,segmentGoalX:p.segmentGoal.x,segmentGoalZ:p.segmentGoal.z,finalGoalX:goal.x,finalGoalZ:goal.z,points:points,index:0,createdAt:sim.time,replanAt:sim.time+REPLAN_SECONDS};
  /* Compatibility with the old debug layer: expose the first non-goal physical waypoint as a
     detour marker, but route execution is now the full _physicalPath, not this one point. */
  if(points.length>1||dist(points[0],goal)>1.0){var d=points[0];soldier._fieldDetour={x:d.x,z:d.z,goalX:goal.x,goalZ:goal.z,until:sim.time+REPLAN_SECONDS,key:'physical-path',kind:'mesh-route'};}else soldier._fieldDetour=null;
  return soldier._physicalPath;
}
N.nextWaypoint=function(sim,soldier,dest){
  simRef=sim||simRef;var base=baseNextWaypoint(sim,soldier,dest)||dest;if(!soldier||!soldier.root||!base)return base;
  var start={x:+soldier.root.position.x,z:+soldier.root.position.z},goal=point(base);if(!goal)return base;
  var c=soldier._physicalPath;if(needsReplan(soldier,sim,goal,start))c=installPlan(soldier,sim,start,goal);
  while(c.index<c.points.length-1&&dist(start,c.points[c.index])<PATH_ARRIVAL)c.index++;
  var wp=c.points[c.index];if(wp&&dist(start,wp)<PATH_ARRIVAL&&c.index===c.points.length-1&&dist({x:c.segmentGoalX,z:c.segmentGoalZ},goal)>PATH_ARRIVAL)c=installPlan(soldier,sim,start,goal),wp=c.points[c.index];
  return wp||base;
};

/* ---------- firing station stability -------------------------------------------------------- */
function recentAim(s,sim){if(!s||!sim)return null;var c=s.squad&&s.squad.contact,e=s.eng;if(c&&isFinite(+c.at)&&sim.time-(+c.at)<=CONTACT_GRACE)return{x:+c.x,z:+c.z};if(e&&e.lastSeen&&isFinite(+e.lastSeenAt)&&sim.time-(+e.lastSeenAt)<=CONTACT_GRACE)return{x:+e.lastSeen.x,z:+e.lastSeen.z};return null;}
N.firingDirective=function(soldier,target){
  if(target&&!target.dead)return baseFiringDirective(soldier,target);var st=soldier&&(soldier._firingStation||soldier._windowSlot),sim=currentSim(),aim=recentAim(soldier,sim);if(!st||!aim)return baseFiringDirective(soldier,target);
  var vx=aim.x-st.windowX,vz=aim.z-st.windowZ,vlen=Math.hypot(vx,vz)||1,face=(vx/vlen)*st.normalX+(vz/vlen)*st.normalZ;if(face<.18)return baseFiringDirective(soldier,target);return{x:st.x,z:st.z,slot:st,stance:st.stance,aimPoint:{x:st.windowX,z:st.windowZ}};
};
N.windowDirective=N.firingDirective;

/* ---------- in-world firing-station markers ------------------------------------------------ */
function makeMaterial(scene,name,r,g,b,alpha){var m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=new BABYLON.Color3(r,g,b);m.emissiveColor=new BABYLON.Color3(r*.72,g*.72,b*.72);m.specularColor=BABYLON.Color3.Black();m.alpha=alpha;m.disableDepthWrite=true;return m;}
function disposeMarkers(){for(var i=0;i<debug.markers.length;i++){var m=debug.markers[i];try{m.station.dispose();}catch(_){}try{m.window.dispose();}catch(_){}try{m.line.dispose();}catch(_){}}debug.markers=[];debug.version=-1;}
function ensureMaterials(scene){if(debug.freeMat&&debug.freeMat.getScene()===scene)return;debug.freeMat=makeMaterial(scene,'windowSlotFreeMat',.2,.85,1,.42);debug.usedMat=makeMaterial(scene,'windowSlotUsedMat',1,.46,.12,.58);}
function rebuildMarkers(sim){
  disposeMarkers();if(!debug.visible||typeof BABYLON==='undefined'||!sim||!sim.scene)return;ensureMaterials(sim.scene);var slots=N.firingStations||[];
  for(var i=0;i<slots.length;i++){var st=slots[i],sy=sim.heightAt(st.x,st.z)+.58,wx=st.windowX+st.normalX*.28,wz=st.windowZ+st.normalZ*.28,wy=sim.heightAt(st.windowX,st.windowZ)+((+st.yBottom||.9)+(+st.yTop||2.0))*.5;var sphere=BABYLON.MeshBuilder.CreateSphere('windowStationDebug',{diameter:.62,segments:8},sim.scene);sphere.position.set(st.x,sy,st.z);sphere.material=debug.freeMat;sphere.isPickable=false;sphere.renderingGroupId=3;var win=BABYLON.MeshBuilder.CreateSphere('windowOpeningDebug',{diameter:.34,segments:7},sim.scene);win.position.set(wx,wy,wz);win.material=debug.freeMat;win.isPickable=false;win.renderingGroupId=3;var line=BABYLON.MeshBuilder.CreateLines('windowSlotLink',{points:[new BABYLON.Vector3(st.x,sy,st.z),new BABYLON.Vector3(wx,wy,wz)]},sim.scene);line.color=new BABYLON.Color3(.45,.9,1);line.alpha=.55;line.isPickable=false;line.renderingGroupId=3;debug.markers.push({id:st.id,station:sphere,window:win,line:line});}
  debug.version=N.version;updateDebug(sim,true);
}
function updateDebug(sim,force){if(!debug.visible||!sim)return;if(debug.version!==N.version){rebuildMarkers(sim);return;}if(!force&&sim.time<debug.nextUpdate)return;debug.nextUpdate=sim.time+.22;var occ=refreshOccupied(sim,true),used={};for(var i=0;i<occ.length;i++)used[String(occ[i].id).replace(/^station:/,'')]=1;for(i=0;i<debug.markers.length;i++){var m=debug.markers[i],mat=used[m.id]?debug.usedMat:debug.freeMat;m.station.material=mat;m.window.material=mat;}if(debug.button)debug.button.textContent='Window Slots '+occ.length+'/'+debug.markers.length;}
function setVisible(v){debug.visible=!!v;try{localStorage.setItem('battleWindowSlotsVisible',debug.visible?'1':'0');}catch(_){}var sim=currentSim();if(debug.visible)rebuildMarkers(sim);else{disposeMarkers();if(debug.button)debug.button.textContent='Window Slots';}if(debug.button)debug.button.classList.toggle('on',debug.visible);}
function installButton(){if(typeof document==='undefined'||debug.button)return;var s=document.createElement('style');s.textContent='#windowSlotDebugToggle{position:fixed;right:12px;bottom:92px;z-index:16;padding:7px 10px;border:1px solid #4d6f79;border-radius:5px;background:#17262c;color:#dcecef;font:700 10px Arial;cursor:pointer;box-shadow:0 4px 14px #0005}#windowSlotDebugToggle.on{border-color:#65c9dc;background:#1d4650;color:#dfffff}';document.head.appendChild(s);var b=document.createElement('button');b.id='windowSlotDebugToggle';b.type='button';b.textContent='Window Slots';b.title='Show reservable window firing positions and their interior stand points';document.body.appendChild(b);debug.button=b;b.onclick=function(){setVisible(!debug.visible);};try{if(localStorage.getItem('battleWindowSlotsVisible')==='1'){debug.visible=true;b.classList.add('on');}}catch(_){} }

root.BattleModules.registerSystem('navigation-physicality-debug',{
  version:'47-mesh-footprint-routing',
  onBattleStart:function(sim){simRef=sim;occupiedAt=-999;legacyCache=null;physicalIndexCache=null;installButton();if(debug.visible)rebuildMarkers(sim);},
  onBattleRestart:function(sim){simRef=sim;occupiedAt=-999;legacyCache=null;physicalIndexCache=null;['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){delete s._fieldDetour;delete s._physicalPath;});});if(debug.visible)rebuildMarkers(sim);},
  onSimulationStep:function(sim){simRef=sim;if(debug.visible)updateDebug(sim,false);}
});
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();}

root.BattleNavigationPhysicality={
  version:'47-mesh-footprint-routing',setWindowDebug:setVisible,windowDebug:function(){return debug.visible;},
  occupiedStations:function(sim){return refreshOccupied(sim||currentSim(),true).slice();},hardTypes:Object.keys(HARD_TYPES),navMargin:NAV_MARGIN,routeHorizon:ROUTE_HORIZON,
  footprints:function(sim){return staticFootprints(sim||currentSim()).slice();},shapeHit:shapeHit,shapeContains:shapeContains,routeNodes:routeNodes,
  planPath:function(sim,start,end){return planComplete(sim||currentSim(),start,end);},planLocal:function(sim,start,end){return planLocal(sim||currentSim(),null,start,end);}
};
console.log('[NAV-PHYS] mesh-footprint collision + visibility routing + occupied-window keepouts loaded');
})(typeof window!=='undefined'?window:globalThis);
