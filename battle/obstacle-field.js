/* Battlefield obstacle field: spatial index + stance-aware line of sight and cover math.

   Every obstacle is plain circular data ({x,z,y,radius,cover,height,type}) produced by
   terrain-features.js and the settlement renderer, so this file has no Babylon dependency and is
   safe to run headless in the AI harness.

   Two things here change how the AI behaves rather than just how fast it runs:

   1. Sight lines are height-aware. A 0.7 m rock no longer hides a standing rifleman, and going
      prone behind it genuinely breaks contact. Stance therefore has a real tactical value, which
      is what makes "get down" a decision the AI can profit from instead of a cosmetic pose.
   2. Cover value scales with stance for the same reason: hugging a low wall only pays off if the
      soldier's silhouette is actually behind it.

   The uniform grid exists because (1) and the denser clutter field would otherwise cost
   O(soldiers * enemies * obstacles) per AI tick. */
(function(root){
  'use strict';

  var CELL=26;
  /* Silhouette height the obstacle has to cover to fully protect/conceal a body in each stance. */
  var SILHOUETTE={stand:1.75,crouch:1.20,prone:.55};
  var EYE={stand:1.55,crouch:1.05,prone:.42};
  var DEFAULT_HEIGHT=1.6;

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function obstacleHeight(ob){var h=+ob.height;return isFinite(h)&&h>0?h:DEFAULT_HEIGHT;}
  function obstacleTop(ob){return(+ob.y||0)+obstacleHeight(ob);}

  /* The index is cached on the obstacle array itself so the many existing call sites that just
     assign sim.obstacles keep working without being rewritten. */
  function fieldFor(obstacles){
    if(!obstacles||!obstacles.length)return null;
    var cached=obstacles.__battleField;
    if(cached&&cached.count===obstacles.length)return cached;
    return(obstacles.__battleField=buildIndex(obstacles));
  }
  function buildIndex(obstacles){
    var minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity,i;
    for(i=0;i<obstacles.length;i++){
      var ob=obstacles[i],r=+ob.radius||1;
      if(ob.x-r<minX)minX=ob.x-r;if(ob.x+r>maxX)maxX=ob.x+r;
      if(ob.z-r<minZ)minZ=ob.z-r;if(ob.z+r>maxZ)maxZ=ob.z+r;
    }
    var cols=Math.max(1,Math.ceil((maxX-minX)/CELL)+1),rows=Math.max(1,Math.ceil((maxZ-minZ)/CELL)+1);
    var buckets=new Array(cols*rows);
    var field={count:obstacles.length,obstacles:obstacles,cell:CELL,minX:minX,minZ:minZ,cols:cols,rows:rows,buckets:buckets,stamp:new Int32Array(obstacles.length),epoch:0,scratch:[]};
    for(i=0;i<obstacles.length;i++){
      var o=obstacles[i],rad=+o.radius||1;
      var c0=colOf(field,o.x-rad),c1=colOf(field,o.x+rad),r0=rowOf(field,o.z-rad),r1=rowOf(field,o.z+rad);
      for(var c=c0;c<=c1;c++)for(var rw=r0;rw<=r1;rw++){
        var k=c+rw*cols;(buckets[k]||(buckets[k]=[])).push(i);
      }
    }
    return field;
  }
  function colOf(field,x){return clamp(Math.floor((x-field.minX)/field.cell),0,field.cols-1);}
  function rowOf(field,z){return clamp(Math.floor((z-field.minZ)/field.cell),0,field.rows-1);}

  /* Candidate gathering reuses one scratch array plus a stamp table, so a per-tick sight test
     allocates nothing. */
  function beginGather(field){field.epoch++;field.scratch.length=0;return field.scratch;}
  function pushBucket(field,k,out){
    var bucket=field.buckets[k];if(!bucket)return;
    for(var i=0;i<bucket.length;i++){var idx=bucket[i];if(field.stamp[idx]===field.epoch)continue;field.stamp[idx]=field.epoch;out.push(field.obstacles[idx]);}
  }
  function gatherNear(field,x,z,radius){
    var out=beginGather(field),c0=colOf(field,x-radius),c1=colOf(field,x+radius),r0=rowOf(field,z-radius),r1=rowOf(field,z+radius);
    for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++)pushBucket(field,c+r*field.cols,out);
    return out;
  }
  function gatherSegment(field,ax,az,bx,bz){
    var out=beginGather(field),len=Math.hypot(bx-ax,bz-az),steps=Math.max(1,Math.ceil(len/(field.cell*.5)));
    for(var i=0;i<=steps;i++){
      var t=i/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t,c0=colOf(field,x-field.cell),c1=colOf(field,x+field.cell),r0=rowOf(field,z-field.cell),r1=rowOf(field,z+field.cell);
      for(var c=c0;c<=c1;c++)for(var r=r0;r<=r1;r++)pushBucket(field,c+r*field.cols,out);
    }
    return out;
  }

  function closestParam(ax,az,bx,bz,px,pz){
    var dx=bx-ax,dz=bz-az,len2=dx*dx+dz*dz;
    if(len2<1e-6)return 0;
    return clamp(((px-ax)*dx+(pz-az)*dz)/len2,0,1);
  }

  /* A soldier fighting from behind a piece of cover shoots around it, so the obstacle he is
     actually using never blocks his own sight line. Without this exception every soldier who
     successfully reached cover would immediately lose the target that sent him there. */
  function usedAsCover(ob,x,z){var dx=x-ob.x,dz=z-ob.z,r=(+ob.radius||1)+1.5;return dx*dx+dz*dz<=r*r;}

  function sightBlocker(obstacles,a,b){
    var field=fieldFor(obstacles);if(!field)return false;
    var ax=a.x,az=a.z,ay=a.y,bx=b.x,bz=b.z,by=b.y;
    var candidates=gatherSegment(field,ax,az,bx,bz);
    for(var i=0;i<candidates.length;i++){
      var ob=candidates[i],t=closestParam(ax,az,bx,bz,ob.x,ob.z),px=ax+(bx-ax)*t,pz=az+(bz-az)*t,ddx=px-ob.x,ddz=pz-ob.z,rad=+ob.radius||1;
      if(ddx*ddx+ddz*ddz>rad*rad)continue;
      if(usedAsCover(ob,ax,az)||usedAsCover(ob,bx,bz))continue;
      if(ay+(by-ay)*t<=obstacleTop(ob))return ob;
    }
    return false;
  }
  function sightBlocked(obstacles,a,b){return !!sightBlocker(obstacles,a,b);}

  /* Lower is better protection. 1 means fully exposed. */
  function coverAt(obstacles,x,z,stance){
    var field=fieldFor(obstacles);if(!field)return 1;
    var need=SILHOUETTE[stance]||SILHOUETTE.stand,candidates=gatherNear(field,x,z,5),best=1;
    for(var i=0;i<candidates.length;i++){
      var ob=candidates[i],dx=x-ob.x,dz=z-ob.z,r=(+ob.radius||1)+1.5;
      if(dx*dx+dz*dz>r*r)continue;
      var conceal=clamp(obstacleHeight(ob)/need,0,1),value=1-(1-(ob.cover==null?1:+ob.cover))*conceal;
      if(value<best)best=value;
    }
    return best;
  }
  /* The best protection a position could give if the soldier committed to the lowest useful
     stance there. Used to judge whether a candidate cover point is worth moving to. */
  function coverPotentialAt(obstacles,x,z){return coverAt(obstacles,x,z,'prone');}

  function nearby(obstacles,x,z,radius){
    var field=fieldFor(obstacles);if(!field)return[];
    var candidates=gatherNear(field,x,z,radius),out=[];
    for(var i=0;i<candidates.length;i++){var ob=candidates[i],dx=ob.x-x,dz=ob.z-z;if(dx*dx+dz*dz<=radius*radius)out.push(ob);}
    return out;
  }

  root.BattleObstacleField={
    CELL:CELL,SILHOUETTE:SILHOUETTE,EYE:EYE,
    index:fieldFor,rebuild:buildIndex,sightBlocked:sightBlocked,sightBlocker:sightBlocker,coverAt:coverAt,
    coverPotentialAt:coverPotentialAt,nearby:nearby,obstacleHeight:obstacleHeight,obstacleTop:obstacleTop
  };
  if(typeof console!=='undefined')console.log('[FIELD] stance-aware obstacle field loaded');
})(typeof window!=='undefined'?window:globalThis);
