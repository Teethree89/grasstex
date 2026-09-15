/* M3C hedge runtime coalescer.

   v137 made hedges physically coherent by rendering short terrain-following 3 m prisms and then
   publishing every render chunk as its own navigation + LOS volume. That was correct geometrically
   but disastrous at battlefield scale: a 2000x1200 map turns roughly 12 km of bocage into several
   thousand hot-path obstacle records. Navigation used to see one OBB per hedge run, and LOS used a
   much smaller set of samples.

   Keep the detailed 3 m render mesh, but collapse contiguous collinear chunks back into ONE
   authoritative runtime prism per generated hedge run before the battle starts. The merged prism
   conservatively envelopes the sampled terrain vertically, so it cannot open LOS slits on rolling
   ground. Rendering remains detailed; navigation, LOS, cover and ballistics use the compact volume.
*/
(function(root){
'use strict';
if(!root.BattleTerrainFeatures||!root.BattleTerrainFeatures.scatter||root.BattleHedgeVolumeCoalescer)return;

var oldScatter=root.BattleTerrainFeatures.scatter;
var JOIN_EPS=.12,AXIS_DOT=.9995;
var stats={runs:0,inputHedges:0,outputHedges:0,physicalBefore:0,physicalAfter:0,obstaclesBefore:0,obstaclesAfter:0};

function num(v,d){v=+v;return isFinite(v)?v:d;}
function hedge(fp){return!!(fp&&String(fp.type||'').toLowerCase()==='hedge'&&fp.shape==='obb'&&fp.volume==='terrain-prism');}
function axis(fp){var ux=num(fp.ux,1),uz=num(fp.uz,0),l=Math.hypot(ux,uz)||1;return{x:ux/l,z:uz/l};}
function endPoint(fp,front){var a=axis(fp),s=front?1:-1,h=num(fp.hx,.5);return{x:num(fp.x,0)+a.x*h*s,z:num(fp.z,0)+a.z*h*s,y:front?num(fp.y1,num(fp.y,0)):num(fp.y0,num(fp.y,0))};}
function d2(a,b){var dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
function canJoin(a,b){
  if(!hedge(a)||!hedge(b))return false;
  var aa=axis(a),bb=axis(b),dot=aa.x*bb.x+aa.z*bb.z;
  if(dot<AXIS_DOT)return false;
  if(Math.abs(num(a.hz,1)-num(b.hz,1))>.03)return false;
  return d2(endPoint(a,true),endPoint(b,false))<=JOIN_EPS*JOIN_EPS;
}
function mergeRun(run){
  if(run.length===1)return run[0];
  var first=run[0],last=run[run.length-1],a=endPoint(first,false),b=endPoint(last,true),dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||.001,ux=dx/len,uz=dz/len;
  var samples=[a],baseHeight=0,visibleHeight=0,hz=0,cover=1;
  for(var i=0;i<run.length;i++){
    var fp=run[i];samples.push(endPoint(fp,true));baseHeight=Math.max(baseHeight,num(fp.height,0));visibleHeight=Math.max(visibleHeight,num(fp.visibleHeight,0));hz=Math.max(hz,num(fp.hz,1));cover=Math.min(cover,num(fp.cover,1));
  }
  var startBase=a.y,endBase=b.y,down=0,up=0;
  for(i=0;i<samples.length;i++){
    var p=samples[i],u=((p.x-a.x)*ux+(p.z-a.z)*uz)/len;u=Math.max(0,Math.min(1,u));
    var linear=startBase+(endBase-startBase)*u,delta=p.y-linear;
    if(delta>up)up=delta;if(-delta>down)down=-delta;
  }
  var y0=startBase-down,y1=endBase-down,height=baseHeight+down+up,id=String(first.id||'hedge')+'~'+String(last.id||run.length);
  return{
    id:id,physicalId:id,type:'hedge',shape:'obb',volume:'terrain-prism',
    x:(a.x+b.x)/2,z:(a.z+b.z)/2,hx:len/2,hz:hz,ux:ux,uz:uz,vx:-uz,vz:ux,
    y:(y0+y1)/2,y0:y0,y1:y1,height:height,visibleHeight:visibleHeight||Math.max(0,height-.25),
    radius:hz,cover:cover,sourceSegments:run.length,terrainEnvelope:{down:down,up:up,samples:samples.length}
  };
}
function coalesce(list){
  var out=[],run=[];
  function flush(){if(run.length){out.push(mergeRun(run));run=[];}}
  for(var i=0;i<list.length;i++){
    var fp=list[i];
    if(!hedge(fp)){flush();out.push(fp);continue;}
    if(run.length&&!canJoin(run[run.length-1],fp))flush();
    run.push(fp);
  }
  flush();return out;
}
function compact(base){
  if(!base||!base.obstacles)return base;
  var obs=base.obstacles,physical=obs.__physicalFootprints||base.physicalFootprints;
  if(!Array.isArray(physical)||!physical.length)return base;
  var hedgePhysical=physical.filter(hedge);if(!hedgePhysical.length)return base;
  var compactPhysical=coalesce(physical),mergedHedges=compactPhysical.filter(hedge),nonHedgeObs=[];
  for(var i=0;i<obs.length;i++)if(!hedge(obs[i]))nonHedgeObs.push(obs[i]);
  stats.runs++;stats.inputHedges=hedgePhysical.length;stats.outputHedges=mergedHedges.length;
  stats.physicalBefore=physical.length;stats.physicalAfter=compactPhysical.length;stats.obstaclesBefore=obs.length;
  obs.length=0;for(i=0;i<nonHedgeObs.length;i++)obs.push(nonHedgeObs[i]);for(i=0;i<mergedHedges.length;i++)obs.push(mergedHedges[i]);
  obs.__physicalFootprints=compactPhysical;obs.__physicalVersion=(+obs.__physicalVersion||0)+1;
  try{delete obs.__battleField;}catch(_){obs.__battleField=null;}
  base.physicalFootprints=compactPhysical;stats.obstaclesAfter=obs.length;
  console.log('[M3C-PERF] hedge runtime volumes '+stats.inputHedges+' -> '+stats.outputHedges+'; physical '+stats.physicalBefore+' -> '+stats.physicalAfter+'; tactical '+stats.obstaclesBefore+' -> '+stats.obstaclesAfter);
  return base;
}

root.BattleTerrainFeatures.scatter=function(scene,heightAt,opts){return compact(oldScatter(scene,heightAt,opts));};
root.BattleHedgeVolumeCoalescer={version:'1.0-runtime-run-coalescer',compact:compact,stats:function(){return JSON.parse(JSON.stringify(stats));}};
console.log('[M3C-PERF] terrain-following hedge render detail retained; hot-path volumes coalesced by hedge run');
})(typeof window!=='undefined'?window:globalThis);
