/* Battlefield obstacle field: spatial index + stance-aware 3D line of sight and cover math.

   Obstacles may be cylinders (legacy/scattered clutter) or oriented terrain-following prisms. The
   hedgerow generator publishes the exact same prism object to this field and to physical navigation,
   so vision, bullets and movement no longer disagree about where a hedge is.

   Sight is genuinely volumetric: a ray is tested against the obstacle's X/Z footprint and vertical
   extent. There is no "near cover means ignore this obstacle" exemption; if a shooter can see over
   or around cover, the ray misses the volume naturally. */
(function(root){
  'use strict';

  var CELL=26;
  var SILHOUETTE={stand:1.75,crouch:1.20,prone:.55};
  var EYE={stand:1.55,crouch:1.05,prone:.42};
  var DEFAULT_HEIGHT=1.6;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function finite(v,d){v=+v;return isFinite(v)?v:d;}
  function isObb(ob){return!!(ob&&ob.shape==='obb');}
  function obstacleHeight(ob){var h=+ob.height;return isFinite(h)&&h>0?h:DEFAULT_HEIGHT;}
  function axes(ob){
    var ux=finite(ob&&ob.ux,1),uz=finite(ob&&ob.uz,0),l=Math.hypot(ux,uz)||1;ux/=l;uz/=l;
    var vx=finite(ob&&ob.vx,-uz),vz=finite(ob&&ob.vz,ux),vl=Math.hypot(vx,vz)||1;vx/=vl;vz/=vl;
    return{ux:ux,uz:uz,vx:vx,vz:vz};
  }
  function toLocal(ob,x,z){var a=axes(ob),dx=x-finite(ob.x,0),dz=z-finite(ob.z,0);return{x:dx*a.ux+dz*a.uz,z:dx*a.vx+dz*a.vz};}
  function bounds(ob){
    if(isObb(ob)){var a=axes(ob),hx=Math.max(.01,finite(ob.hx,.5)),hz=Math.max(.01,finite(ob.hz,.5));return{x:Math.abs(a.ux)*hx+Math.abs(a.vx)*hz,z:Math.abs(a.uz)*hx+Math.abs(a.vz)*hz};}
    var r=Math.max(.01,finite(ob&&ob.radius,1));return{x:r,z:r};
  }
  function baseAt(ob,x,z){
    if(isFinite(+ob.y0)&&isFinite(+ob.y1)&&isObb(ob)){
      var q=toLocal(ob,x,z),hx=Math.max(.001,finite(ob.hx,.5)),u=clamp((q.x/hx+1)*.5,0,1);return +ob.y0+(+ob.y1-+ob.y0)*u;
    }
    return finite(ob&&ob.y,0);
  }
  function obstacleTop(ob,x,z){return baseAt(ob,x==null?finite(ob.x,0):x,z==null?finite(ob.z,0):z)+obstacleHeight(ob);}
  function horizontalDistance(ob,x,z){
    if(isObb(ob)){var q=toLocal(ob,x,z),dx=Math.max(Math.abs(q.x)-Math.max(.01,finite(ob.hx,.5)),0),dz=Math.max(Math.abs(q.z)-Math.max(.01,finite(ob.hz,.5)),0);return Math.hypot(dx,dz);}
    return Math.max(0,Math.hypot(x-finite(ob.x,0),z-finite(ob.z,0))-Math.max(.01,finite(ob.radius,1)));
  }

  function fieldFor(obstacles){
    if(!obstacles||!obstacles.length)return null;
    var cached=obstacles.__battleField;
    if(cached&&cached.count===obstacles.length&&cached.version===(obstacles.__physicalVersion||0))return cached;
    return(obstacles.__battleField=buildIndex(obstacles));
  }
  function buildIndex(obstacles){
    var minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,i;
    for(i=0;i<obstacles.length;i++){
      var ob=obstacles[i],e=bounds(ob),x=finite(ob.x,0),z=finite(ob.z,0);
      if(x-e.x<minX)minX=x-e.x;if(x+e.x>maxX)maxX=x+e.x;
      if(z-e.z<minZ)minZ=z-e.z;if(z+e.z>maxZ)maxZ=z+e.z;
    }
    var cols=Math.max(1,Math.ceil((maxX-minX)/CELL)+1),rows=Math.max(1,Math.ceil((maxZ-minZ)/CELL)+1),buckets=new Array(cols*rows);
    var field={count:obstacles.length,version:obstacles.__physicalVersion||0,obstacles:obstacles,cell:CELL,minX:minX,minZ:minZ,cols:cols,rows:rows,buckets:buckets,stamp:new Int32Array(obstacles.length),epoch:0,scratch:[]};
    for(i=0;i<obstacles.length;i++){
      var o=obstacles[i],ex=bounds(o),ox=finite(o.x,0),oz=finite(o.z,0),c0=colOf(field,ox-ex.x),c1=colOf(field,ox+ex.x),r0=rowOf(field,oz-ex.z),r1=rowOf(field,oz+ex.z);
      for(var c=c0;c<=c1;c++)for(var rw=r0;rw<=r1;rw++){var k=c+rw*cols;(buckets[k]||(buckets[k]=[])).push(i);}
    }
    return field;
  }
  function colOf(field,x){return clamp(Math.floor((x-field.minX)/field.cell),0,field.cols-1);}
  function rowOf(field,z){return clamp(Math.floor((z-field.minZ)/field.cell),0,field.rows-1);}
  function beginGather(field){field.epoch++;if(field.epoch>=2147483000){field.stamp.fill(0);field.epoch=1;}field.scratch.length=0;return field.scratch;}
  function pushBucket(field,k,out){var bucket=field.buckets[k];if(!bucket)return;for(var i=0;i<bucket.length;i++){var idx=bucket[i];if(field.stamp[idx]===field.epoch)continue;field.stamp[idx]=field.epoch;out.push(field.obstacles[idx]);}}
  function gatherNear(field,x,z,radius){var out=beginGather(field),c0=colOf(field,x-radius),c1=colOf(field,x+radius),r0=rowOf(field,z-radius),r1=rowOf(field,z+radius);for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++)pushBucket(field,c+r*field.cols,out);return out;}
  function gatherSegment(field,ax,az,bx,bz){
    var out=beginGather(field),len=Math.hypot(bx-ax,bz-az),steps=Math.max(1,Math.ceil(len/(field.cell*.5)));
    for(var i=0;i<=steps;i++){var t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,c0=colOf(field,x-field.cell),c1=colOf(field,x+field.cell),r0=rowOf(field,z-field.cell),r1=rowOf(field,z+field.cell);for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++)pushBucket(field,c+r*field.cols,out);}
    return out;
  }

  function closestParam(ax,az,bx,bz,px,pz){var dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz;if(l2<1e-8)return 0;return clamp(((px-ax)*dx+(pz-az)*dz)/l2,0,1);}
  function obbInterval(ob,a,b){
    var A=toLocal(ob,a.x,a.z),B=toLocal(ob,b.x,b.z),dx=B.x-A.x,dz=B.z-A.z,hx=Math.max(.01,finite(ob.hx,.5)),hz=Math.max(.01,finite(ob.hz,.5)),t0=0,t1=1;
    function slab(p,d,min,max){if(Math.abs(d)<1e-10)return p>=min&&p<=max;var q0=(min-p)/d,q1=(max-p)/d;if(q0>q1){var q=q0;q0=q1;q1=q;}if(q0>t0)t0=q0;if(q1<t1)t1=q1;return t0<=t1;}
    if(!slab(A.x,dx,-hx,hx)||!slab(A.z,dz,-hz,hz)||t1<0||t0>1)return null;return{t0:clamp(t0,0,1),t1:clamp(t1,0,1)};
  }
  function prismHitT(ob,a,b){
    var h=obbInterval(ob,a,b);if(!h)return null;
    function rel(t){var x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;return y-baseAt(ob,x,z);}
    var r0=rel(h.t0),r1=rel(h.t1),height=obstacleHeight(ob),mn=Math.min(r0,r1),mx=Math.max(r0,r1);
    if(mx<0||mn>height)return null;
    if(r0>=0&&r0<=height)return h.t0;
    var d=r1-r0;if(Math.abs(d)<1e-10)return null;
    var boundary=r0<0?0:height,t=h.t0+(boundary-r0)/d*(h.t1-h.t0);return t>=h.t0-1e-8&&t<=h.t1+1e-8?clamp(t,0,1):null;
  }
  function cylinderHitT(ob,a,b){
    var t=closestParam(a.x,a.z,b.x,b.z,finite(ob.x,0),finite(ob.z,0)),px=a.x+(b.x-a.x)*t,pz=a.z+(b.z-a.z)*t,dx=px-finite(ob.x,0),dz=pz-finite(ob.z,0),r=Math.max(.01,finite(ob.radius,1));
    if(dx*dx+dz*dz>r*r)return null;var y=a.y+(b.y-a.y)*t,base=baseAt(ob,px,pz);return y>=base-1e-6&&y<=base+obstacleHeight(ob)+1e-6?t:null;
  }
  function sightHitT(ob,a,b){return isObb(ob)?prismHitT(ob,a,b):cylinderHitT(ob,a,b);}

  function sightBlocker(obstacles,a,b){
    var field=fieldFor(obstacles);if(!field)return false;
    var candidates=gatherSegment(field,a.x,a.z,b.x,b.z),best=null,bestT=Infinity;
    for(var i=0;i<candidates.length;i++){var ob=candidates[i],t=sightHitT(ob,a,b);if(t!=null&&t<bestT){best=ob;bestT=t;}}
    return best||false;
  }
  function sightBlocked(obstacles,a,b){return !!sightBlocker(obstacles,a,b);}

  /* Lower is better protection. 1 means fully exposed. Exact footprint distance replaces the old
     hedge circles, so a long prism provides cover beside its face without pretending its centre is
     a giant circular bush. */
  function coverAt(obstacles,x,z,stance){
    var field=fieldFor(obstacles);if(!field)return 1;
    var need=SILHOUETTE[stance]||SILHOUETTE.stand,candidates=gatherNear(field,x,z,6.5),best=1;
    for(var i=0;i<candidates.length;i++){
      var ob=candidates[i];if(horizontalDistance(ob,x,z)>1.5)continue;
      var conceal=clamp(obstacleHeight(ob)/need,0,1),value=1-(1-(ob.cover==null?1:+ob.cover))*conceal;if(value<best)best=value;
    }
    return best;
  }
  function coverPotentialAt(obstacles,x,z){return coverAt(obstacles,x,z,'prone');}
  function nearby(obstacles,x,z,radius){var field=fieldFor(obstacles);if(!field)return[];var candidates=gatherNear(field,x,z,radius+4),out=[];for(var i=0;i<candidates.length;i++)if(horizontalDistance(candidates[i],x,z)<=radius)out.push(candidates[i]);return out;}

  root.BattleObstacleField={
    CELL:CELL,SILHOUETTE:SILHOUETTE,EYE:EYE,
    index:fieldFor,rebuild:buildIndex,sightBlocked:sightBlocked,sightBlocker:sightBlocker,coverAt:coverAt,
    coverPotentialAt:coverPotentialAt,nearby:nearby,obstacleHeight:obstacleHeight,obstacleTop:obstacleTop,
    horizontalDistance:horizontalDistance,sightHitT:sightHitT
  };
  if(typeof console!=='undefined')console.log('[FIELD] shared 3D obstacle volumes + stance-aware LOS loaded');
})(typeof window!=='undefined'?window:globalThis);