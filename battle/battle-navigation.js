/* Battle Sim / ww2fps AI lab v20 navigation.
   Hybrid visibility graph: open ground stays cheap/direct; building corners and door portals are
   graph nodes. Wall openings distinguish movement (doors only) from fire/vision (doors+windows). */
(function(root){
  'use strict';
  var scenario=null,walls=[],nodes=[],edges=[],version=0,windowSlots=[],occupants=Object.create(null);
  var EPS=.0001,DOOR_PAD=.72,CORNER_PAD=2.2,MAX_EDGE=260;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function transform(b,lx,lz){var c=Math.cos(b.rot||0),s=Math.sin(b.rot||0);return{x:b.x+lx*c+lz*s,z:b.z-lx*s+lz*c};}
  function localNormal(b,side){var n=side==='north'?{x:0,z:1}:side==='south'?{x:0,z:-1}:side==='east'?{x:1,z:0}:{x:-1,z:0};var c=Math.cos(b.rot||0),s=Math.sin(b.rot||0);return{x:n.x*c+n.z*s,z:-n.x*s+n.z*c};}
  function wallDef(b,side){
    if(side==='north'||side==='south'){var z=side==='north'?b.d/2:-b.d/2;return{a:transform(b,-b.w/2,z),b:transform(b,b.w/2,z),length:b.w};}
    var x=side==='east'?b.w/2:-b.w/2;return{a:transform(b,x,-b.d/2),b:transform(b,x,b.d/2),length:b.d};
  }
  function cross(ax,az,bx,bz){return ax*bz-az*bx;}
  function intersection(a,b,c,d){
    var rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,den=cross(rx,rz,sx,sz);if(Math.abs(den)<1e-7)return null;
    var qx=c.x-a.x,qz=c.z-a.z,t=cross(qx,qz,sx,sz)/den,u=cross(qx,qz,rx,rz)/den;
    if(t<-EPS||t>1+EPS||u<-EPS||u>1+EPS)return null;return{t:clamp(t,0,1),u:clamp(u,0,1)};
  }
  function openingAt(w,u,mode,y){
    var along=-w.length/2+u*w.length;
    for(var i=0;i<w.openings.length;i++){
      var o=w.openings[i];if(Math.abs(along-o.offset)>o.width/2+.08)continue;
      if(mode==='move'&&o.type!=='door')continue;
      if(mode==='los'&&y!=null&&(y<o.bottom-.05||y>o.top+.05))continue;
      return o;
    }
    return null;
  }
  function blocked(a,b,mode,ay,by){
    for(var i=0;i<walls.length;i++){
      var w=walls[i],hit=intersection(a,b,w.a,w.b);if(!hit)continue;
      /* Ignore contact at the segment's exact starting point; this allows a soldier already on a
         doorway/window slot to leave it without the wall immediately re-blocking the path. */
      if(hit.t<.002)continue;
      var y=ay==null?null:ay+(by-ay)*hit.t;if(openingAt(w,hit.u,mode,y))continue;return w;
    }
    return null;
  }
  function movementClear(a,b){return !blocked(a,b,'move');}
  function losBlocked(a,b,ay,by){return blocked(a,b,'los',ay,by);}
  function addNode(p,kind,meta){var n={id:nodes.length,x:p.x,z:p.z,kind:kind||'nav',meta:meta||null};nodes.push(n);edges.push([]);return n;}
  function link(a,b){var d=Math.hypot(a.x-b.x,a.z-b.z);edges[a.id].push({to:b.id,cost:d});edges[b.id].push({to:a.id,cost:d});}

  function buildScenarioGeometry(s){
    scenario=s;walls=[];nodes=[];edges=[];windowSlots=[];occupants=Object.create(null);version++;
    if(!s)return;
    (s.buildings||[]).forEach(function(b){
      ['north','south','east','west'].forEach(function(side){var wd=wallDef(b,side);wd.building=b;wd.side=side;wd.openings=(b.openings||[]).filter(function(o){return o.side===side;});walls.push(wd);});
      var corners=[[-b.w/2,-b.d/2],[b.w/2,-b.d/2],[-b.w/2,b.d/2],[b.w/2,b.d/2]];
      corners.forEach(function(c){var p=transform(b,c[0]+(c[0]<0?-CORNER_PAD:CORNER_PAD),c[1]+(c[1]<0?-CORNER_PAD:CORNER_PAD));addNode(p,'corner',{building:b.id});});
      addNode(transform(b,0,0),'interior',{building:b.id});
      (b.openings||[]).forEach(function(o){
        var side=o.side,lx=0,lz=0;if(side==='north'||side==='south'){lx=o.offset;lz=(side==='north'?b.d/2:-b.d/2);}else{lx=(side==='east'?b.w/2:-b.w/2);lz=o.offset;}
        var p=transform(b,lx,lz),n=localNormal(b,side);
        if(o.type==='door'){
          var outside={x:p.x+n.x*DOOR_PAD,z:p.z+n.z*DOOR_PAD},inside={x:p.x-n.x*DOOR_PAD,z:p.z-n.z*DOOR_PAD};
          addNode(outside,'door-out',{building:b.id,opening:o.id});addNode(inside,'door-in',{building:b.id,opening:o.id});
        }else if(o.type==='window'){
          var slot={id:o.id,building:b.id,x:p.x-n.x*.78,z:p.z-n.z*.78,normalX:n.x,normalZ:n.z,yBottom:o.bottom,yTop:o.top};windowSlots.push(slot);
          addNode({x:slot.x,z:slot.z},'window',{building:b.id,opening:o.id});
        }
      });
    });
    /* Visibility graph edges are intentionally local. Long-range movement is direct unless a wall
       blocks it; blocked paths only need enough graph to get around/through the nearby structure. */
    for(var i=0;i<nodes.length;i++)for(var j=i+1;j<nodes.length;j++){
      var a=nodes[i],b=nodes[j],d=Math.hypot(a.x-b.x,a.z-b.z);if(d>MAX_EDGE)continue;if(movementClear(a,b))link(a,b);
    }
    console.log('[NAV] v20 graph built; walls='+walls.length+' nodes='+nodes.length+' windows='+windowSlots.length);
  }

  function heapPush(h,x){h.push(x);var i=h.length-1;while(i>0){var p=(i-1)>>1;if(h[p].f<=h[i].f)break;var t=h[p];h[p]=h[i];h[i]=t;i=p;}}
  function heapPop(h){var top=h[0],last=h.pop();if(h.length){h[0]=last;var i=0;for(;;){var l=i*2+1,r=l+1,s=i;if(l<h.length&&h[l].f<h[s].f)s=l;if(r<h.length&&h[r].f<h[s].f)s=r;if(s===i)break;var t=h[i];h[i]=h[s];h[s]=t;i=s;}}return top;}
  function visibleCandidates(p,maxD){var out=[];for(var i=0;i<nodes.length;i++){var n=nodes[i],d=Math.hypot(n.x-p.x,n.z-p.z);if(d<=maxD&&movementClear(p,n))out.push({node:n,cost:d});}out.sort(function(a,b){return a.cost-b.cost;});return out.slice(0,18);}
  function findPath(start,end){
    if(!scenario||movementClear(start,end))return[{x:end.x,z:end.z}];
    var starts=visibleCandidates(start,340),ends=visibleCandidates(end,340);if(!starts.length||!ends.length)return[{x:end.x,z:end.z}];
    var endCost=Object.create(null);ends.forEach(function(e){endCost[e.node.id]=e.cost;});
    var open=[],g=Object.create(null),prev=Object.create(null),closed=Object.create(null),goal=-1;
    starts.forEach(function(s){g[s.node.id]=s.cost;heapPush(open,{id:s.node.id,f:s.cost+Math.hypot(s.node.x-end.x,s.node.z-end.z)});});
    while(open.length){var cur=heapPop(open);if(closed[cur.id])continue;closed[cur.id]=1;if(endCost[cur.id]!=null){goal=cur.id;break;}
      var list=edges[cur.id]||[];for(var i=0;i<list.length;i++){var e=list[i],ng=g[cur.id]+e.cost;if(g[e.to]==null||ng<g[e.to]){g[e.to]=ng;prev[e.to]=cur.id;var n=nodes[e.to];heapPush(open,{id:e.to,f:ng+Math.hypot(n.x-end.x,n.z-end.z)});}}
    }
    if(goal<0)return[{x:end.x,z:end.z}];
    var ids=[goal],k=goal;while(prev[k]!=null){k=prev[k];ids.push(k);}ids.reverse();var path=ids.map(function(id){return{x:nodes[id].x,z:nodes[id].z,kind:nodes[id].kind};});path.push({x:end.x,z:end.z});return path;
  }

  function nextWaypoint(sim,soldier,dest){
    if(!scenario||!dest)return dest;var c=soldier._navCache,dx=!c?Infinity:dest.x-c.destX,dz=!c?Infinity:dest.z-c.destZ;
    if(!c||c.version!==version||dx*dx+dz*dz>9){var start={x:soldier.root.position.x,z:soldier.root.position.z},path=findPath(start,dest);c=soldier._navCache={version:version,destX:dest.x,destZ:dest.z,path:path,index:0};}
    while(c.index<c.path.length-1&&Math.hypot(soldier.root.position.x-c.path[c.index].x,soldier.root.position.z-c.path[c.index].z)<1.1)c.index++;
    return c.path[Math.min(c.index,c.path.length-1)]||dest;
  }

  function claimWindow(soldier,target,maxRange){
    if(!scenario||!soldier||!target)return null;maxRange=maxRange||48;var sx=soldier.root.position.x,sz=soldier.root.position.z,tx=target.root?target.root.position.x:target.x,tz=target.root?target.root.position.z:target.z,best=null,bd=Infinity;
    for(var i=0;i<windowSlots.length;i++){var w=windowSlots[i];if(occupants[w.id]&&occupants[w.id]!==soldier.id)continue;var d=Math.hypot(w.x-sx,w.z-sz);if(d>maxRange||d>=bd)continue;var vx=tx-w.x,vz=tz-w.z;if(vx*w.normalX+vz*w.normalZ<4)continue;
      if(losBlocked({x:w.x,z:w.z},{x:tx,z:tz},1.55,target.root?target.root.position.y+1.2:1.55))continue;
      var p=findPath({x:sx,z:sz},{x:w.x,z:w.z});if(!p.length)continue;best=w;bd=d;
    }
    if(best){if(soldier._windowSlot&&soldier._windowSlot.id!==best.id)releaseWindow(soldier);occupants[best.id]=soldier.id;soldier._windowSlot=best;}return best;
  }
  function releaseWindow(soldier){if(!soldier||!soldier._windowSlot)return;var id=soldier._windowSlot.id;if(occupants[id]===soldier.id)delete occupants[id];soldier._windowSlot=null;}
  function windowDirective(soldier,target){var w=soldier&&soldier._windowSlot;if(!w||!target||target.dead)return null;var tx=target.root.position.x,tz=target.root.position.z;if((tx-w.x)*w.normalX+(tz-w.z)*w.normalZ<2){releaseWindow(soldier);return null;}return{x:w.x,z:w.z,slot:w};}

  root.BattleNavigation={installScenario:buildScenarioGeometry,movementClear:movementClear,lineOfSightBlocked:losBlocked,findPath:findPath,nextWaypoint:nextWaypoint,claimWindow:claimWindow,releaseWindow:releaseWindow,windowDirective:windowDirective,get scenario(){return scenario;},get version(){return version;},get walls(){return walls.slice();},get windowSlots(){return windowSlots.slice();}};
  console.log('[NAV] building-aware navigation v20 loaded');
})(typeof window!=='undefined'?window:globalThis);
