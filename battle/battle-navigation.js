/* Building-aware navigation + occupiable firing stations.
   Doors are movement portals; doors/windows are LOS portals. Door portals have a real corridor
   width/depth so infantry can cross the threshold without grazing the wall line. Window firing
   positions sit safely inside rooms. Persistent reservations belong to BattleTacticalPositions. */
(function(root){
  'use strict';
  var scenario=null,walls=[],nodes=[],edges=[],version=0,firingStations=[],doorPortals=[];
  var EPS=.0001,DOOR_PAD=1.55,DOOR_CLEARANCE=.48,CORNER_PAD=2.4,MAX_EDGE=300,STATION_INSET=.775;
  /* How much wall a man is allowed to be standing on before it counts as being in his way.
     This has to be an absolute distance. It used to be a fraction of the query segment, so the
     planner asking "is the 250 m line to the objective clear?" ignored the wall he was leaning
     against while the integrator asking "is this 0.1 m step clear?" did not: planning returned a
     straight line through the wall, physics refused every step of it, and the two disagreed
     forever. */
  var START_SKIN=.06;
  /* Headings to try, either side of the desired one, when the direct step is into a wall. */
  var SLIDE_FAN=[.52,1.05,1.57,2.09];

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function transform(b,lx,lz){var c=Math.cos(b.rot||0),s=Math.sin(b.rot||0);return{x:b.x+lx*c+lz*s,z:b.z-lx*s+lz*c};}
  function localNormal(b,side){var n=side==='north'?{x:0,z:1}:side==='south'?{x:0,z:-1}:side==='east'?{x:1,z:0}:{x:-1,z:0};var c=Math.cos(b.rot||0),s=Math.sin(b.rot||0);return{x:n.x*c+n.z*s,z:-n.x*s+n.z*c};}
  function wallDef(b,side){if(side==='north'||side==='south'){var z=side==='north'?b.d/2:-b.d/2;return{a:transform(b,-b.w/2,z),b:transform(b,b.w/2,z),length:b.w};}var x=side==='east'?b.w/2:-b.w/2;return{a:transform(b,x,-b.d/2),b:transform(b,x,b.d/2),length:b.d};}
  function cross(ax,az,bx,bz){return ax*bz-az*bx;}
  function intersection(a,b,c,d){var rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=cross(rx,rz,sx,sz);if(Math.abs(den)<1e-7)return null;var qx=c.x-a.x,qz=c.z-a.z,t=cross(qx,qz,sx,sz)/den,u=cross(qx,qz,rx,rz)/den;if(t<-EPS||t>1+EPS||u<-EPS||u>1+EPS)return null;return{t:clamp(t,0,1),u:clamp(u,0,1)};}
  function openingAt(w,u,mode){
    var along=-w.length/2+u*w.length;
    for(var i=0;i<w.openings.length;i++){
      var o=w.openings[i];
      if(mode==='move'&&o.type!=='door')continue;
      var pad=(mode==='move'&&o.type==='door')?DOOR_CLEARANCE:.08;
      if(Math.abs(along-o.offset)>o.width/2+pad)continue;
      return o;
    }
    return null;
  }
  function blocked(a,b,mode,ay,by){
    var segLen=Math.hypot(b.x-a.x,b.z-a.z)||EPS;
    for(var i=0;i<walls.length;i++){
      var w=walls[i],hit=intersection(a,b,w.a,w.b);
      if(!hit)continue;
      if(hit.t*segLen<START_SKIN)continue;
      if(openingAt(w,hit.u,mode))continue;
      return w;
    }
    return null;
  }
  function movementClear(a,b){return !blocked(a,b,'move');}
  /* Physical navigation owns how a man gets past something in his way. The Movement Resolver still
     owns where he is going: this only ever rewrites one integration step, never a destination.
     Returns a movement-legal step of the same length, or null when he is genuinely boxed in. */
  function resolveStep(from,to){
    if(!scenario)return to;
    var wall=blocked(from,to,'move');
    if(!wall)return to;
    var dx=to.x-from.x,dz=to.z-from.z,len=Math.hypot(dx,dz);
    if(!(len>EPS))return null;
    /* First choice is a true slide: keep the component of the step that runs along the wall.
       A step almost square-on to the wall leaves nothing worth keeping, so it falls through to the
       fan rather than returning a step of near-zero length with no usable heading. */
    var wx=wall.b.x-wall.a.x,wz=wall.b.z-wall.a.z,wl=Math.hypot(wx,wz)||1,along=(dx*wx+dz*wz)/wl;
    if(Math.abs(along)>len*.25){
      var sx=from.x+wx/wl*along,sz=from.z+wz/wl*along;
      if(!blocked(from,{x:sx,z:sz},'move'))return{x:sx,z:sz};
    }
    /* Pinched into a corner, where no single wall tangent is free. Fan out around the desired
       heading - never backwards - so he works his way out instead of standing there. */
    var base=Math.atan2(dz,dx);
    for(var i=0;i<SLIDE_FAN.length;i++)for(var sign=-1;sign<=1;sign+=2){
      var a=base+sign*SLIDE_FAN[i],cx=from.x+Math.cos(a)*len,cz=from.z+Math.sin(a)*len;
      if(!blocked(from,{x:cx,z:cz},'move'))return{x:cx,z:cz};
    }
    return null;
  }
  function losBlocked(a,b,ay,by){return blocked(a,b,'los',ay,by);}
  function addNode(p,kind,meta){var n={id:nodes.length,x:p.x,z:p.z,kind:kind||'nav',meta:meta||null};nodes.push(n);edges.push([]);return n;}
  function link(a,b){var d=Math.hypot(a.x-b.x,a.z-b.z);edges[a.id].push({to:b.id,cost:d});edges[b.id].push({to:a.id,cost:d});}

  function buildScenarioGeometry(s){
    scenario=s;walls=[];nodes=[];edges=[];firingStations=[];doorPortals=[];version++;
    if(!s)return;
    (s.buildings||[]).forEach(function(b){
      ['north','south','east','west'].forEach(function(side){
        var wd=wallDef(b,side);wd.building=b;wd.side=side;wd.openings=(b.openings||[]).filter(function(o){return o.side===side;});walls.push(wd);
      });
      var corners=[[-b.w/2,-b.d/2],[b.w/2,-b.d/2],[-b.w/2,b.d/2],[b.w/2,b.d/2]];
      corners.forEach(function(c){addNode(transform(b,c[0]+(c[0]<0?-CORNER_PAD:CORNER_PAD),c[1]+(c[1]<0?-CORNER_PAD:CORNER_PAD)),'corner',{building:b.id});});
      addNode(transform(b,0,0),'interior',{building:b.id});
      (b.openings||[]).forEach(function(o){
        var side=o.side,lx=0,lz=0;
        if(side==='north'||side==='south'){lx=o.offset;lz=side==='north'?b.d/2:-b.d/2;}
        else{lx=side==='east'?b.w/2:-b.w/2;lz=o.offset;}
        var p=transform(b,lx,lz),n=localNormal(b,side);
        if(o.type==='door'){
          var outside={x:p.x+n.x*DOOR_PAD,z:p.z+n.z*DOOR_PAD},inside={x:p.x-n.x*DOOR_PAD,z:p.z-n.z*DOOR_PAD};
          addNode(outside,'door-out',{building:b.id,opening:o.id});
          addNode(inside,'door-in',{building:b.id,opening:o.id});
          doorPortals.push({id:o.id,building:b.id,x:p.x,z:p.z,normalX:n.x,normalZ:n.z,width:(+o.width||1.35)+DOOR_CLEARANCE*2,depth:DOOR_PAD*2,outside:outside,inside:inside});
        }else if(o.type==='window'){
          firingStations.push({id:'station-'+o.id,windowId:o.id,building:b.id,x:p.x-n.x*STATION_INSET,z:p.z-n.z*STATION_INSET,windowX:p.x,windowZ:p.z,normalX:n.x,normalZ:n.z,yBottom:o.bottom,yTop:o.top,stance:'crouch'});
        }
      });
    });
    for(var i=0;i<nodes.length;i++)for(var j=i+1;j<nodes.length;j++){
      var a=nodes[i],b=nodes[j],d=Math.hypot(a.x-b.x,a.z-b.z);
      if(d>MAX_EDGE)continue;
      if(movementClear(a,b))link(a,b);
    }
    console.log('[NAV] graph built; walls='+walls.length+' nodes='+nodes.length+' doors='+doorPortals.length+' firingStations='+firingStations.length);
  }

  function heapPush(h,x){h.push(x);var i=h.length-1;while(i>0){var p=(i-1)>>1;if(h[p].f<=h[i].f)break;var t=h[p];h[p]=h[i];h[i]=t;i=p;}}
  function heapPop(h){var top=h[0],last=h.pop();if(h.length){h[0]=last;var i=0;for(;;){var l=i*2+1,r=l+1,s=i;if(l<h.length&&h[l].f<h[s].f)s=l;if(r<h.length&&h[r].f<h[s].f)s=r;if(s===i)break;var t=h[i];h[i]=h[s];h[s]=t;i=s;}}return top;}
  function visibleCandidates(p,maxD){var out=[];for(var i=0;i<nodes.length;i++){var n=nodes[i],d=Math.hypot(n.x-p.x,n.z-p.z);if(d<=maxD&&movementClear(p,n))out.push({node:n,cost:d});}out.sort(function(a,b){return a.cost-b.cost;});return out.slice(0,18);}
  function findPath(start,end){
    if(!scenario||movementClear(start,end))return[{x:end.x,z:end.z}];
    var starts=visibleCandidates(start,360),ends=visibleCandidates(end,360);
    if(!starts.length||!ends.length)return[{x:end.x,z:end.z}];
    var endCost=Object.create(null);ends.forEach(function(e){endCost[e.node.id]=e.cost;});
    var open=[],g=Object.create(null),prev=Object.create(null),closed=Object.create(null),goal=-1;
    starts.forEach(function(s){g[s.node.id]=s.cost;heapPush(open,{id:s.node.id,f:s.cost+Math.hypot(s.node.x-end.x,s.node.z-end.z)});});
    while(open.length){
      var cur=heapPop(open);if(closed[cur.id])continue;closed[cur.id]=1;
      if(endCost[cur.id]!=null){goal=cur.id;break;}
      var list=edges[cur.id]||[];
      for(var i=0;i<list.length;i++){
        var e=list[i],ng=g[cur.id]+e.cost;
        if(g[e.to]==null||ng<g[e.to]){g[e.to]=ng;prev[e.to]=cur.id;var n=nodes[e.to];heapPush(open,{id:e.to,f:ng+Math.hypot(n.x-end.x,n.z-end.z)});}
      }
    }
    if(goal<0)return[{x:end.x,z:end.z}];
    var ids=[goal],k=goal;while(prev[k]!=null){k=prev[k];ids.push(k);}ids.reverse();
    var path=ids.map(function(id){return{x:nodes[id].x,z:nodes[id].z,kind:nodes[id].kind,meta:nodes[id].meta};});
    path.push({x:end.x,z:end.z,kind:'goal'});return path;
  }
  function nextWaypoint(sim,soldier,dest){
    if(!scenario||!dest)return dest;
    var c=soldier._navCache,dx=!c?Infinity:dest.x-c.destX,dz=!c?Infinity:dest.z-c.destZ;
    if(!c||c.version!==version||dx*dx+dz*dz>4){
      var start={x:soldier.root.position.x,z:soldier.root.position.z},path=findPath(start,dest);
      c=soldier._navCache={version:version,destX:dest.x,destZ:dest.z,path:path,index:0};
    }
    while(c.index<c.path.length-1&&Math.hypot(soldier.root.position.x-c.path[c.index].x,soldier.root.position.z-c.path[c.index].z)<.85)c.index++;
    return c.path[Math.min(c.index,c.path.length-1)]||dest;
  }

  root.BattleNavigation={
    installScenario:buildScenarioGeometry,movementClear:movementClear,resolveStep:resolveStep,lineOfSightBlocked:losBlocked,findPath:findPath,nextWaypoint:nextWaypoint,
    get scenario(){return scenario;},get version(){return version;},get walls(){return walls.slice();},get doorPortals(){return doorPortals.slice();},
    get firingStations(){return firingStations.slice();},get windowSlots(){return firingStations.slice();},get doorPad(){return DOOR_PAD;},get doorClearance(){return DOOR_CLEARANCE;},get startSkin(){return START_SKIN;}
  };
  console.log('[NAV] firing-station navigation loaded');
})(typeof window!=='undefined'?window:globalThis);
