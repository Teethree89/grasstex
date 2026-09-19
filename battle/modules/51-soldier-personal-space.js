/* Physical personal space for infantry.
   Navigation clears soldiers around terrain but soldiers themselves were not collision objects, so
   two moving men could converge onto the same world coordinate and visually become one body.
   Apply a small deterministic post-movement separation impulse without changing anyone's order or
   destination. Firing-station occupants are treated as fixed anchors so separation cannot pull a
   man out of a window hardpoint. */
(function(root){
'use strict';
if(!root.BattleModules||root.BattleSoldierPersonalSpace)return;

var MIN=0.90,CELL=1.0,MAX_PUSH=.18;
/* Endpoints need room for the integrator's 0.35 m arrival tolerance on both sides.
   This is physical allocation of an already selected goal, never a new movement order. */
var DEST_SPACE=MIN+.70,DEST_KINDS={formation:1,retreat:1,rally:1,'assault-rush':1};
function point(s){return s&&s.root&&s.root.position?{x:+s.root.position.x||0,z:+s.root.position.z||0}:null;}
function fixed(s){var t=root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s);return!!(t&&t.occupiedAt!=null);}
function key(x,z){return Math.floor(x/CELL)+','+Math.floor(z/CELL);}
function clear(a,b){try{return !root.BattleNavigation||!root.BattleNavigation.movementClear||root.BattleNavigation.movementClear(a,b);}catch(_){return true;}}
function fresh(){return{pairCorrections:0,exactOverlaps:0,blockedCorrections:0,maxPenetration:0,destinationConflicts:0,destinationResolutions:0,destinationUnresolved:0};}
function stats(sim){return sim._personalSpaceStats||(sim._personalSpaceStats=fresh());}
function version(sim){var n=root.BattleNavigation,o=sim.obstacles;return(n&&n.version||0)+'|'+(o&&o.__physicalVersion||0)+'|'+(o&&o.__physicalFootprints&&o.__physicalFootprints.length||o&&o.length||0);}
function gap(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function destinationGrid(sim){
  var grid=sim._personalSpaceDestinations,ver=version(sim);
  if(grid&&grid.time===sim.time&&grid.version===ver)return grid;
  grid={time:sim.time,version:ver,buckets:Object.create(null),reservations:new Map()};sim._personalSpaceDestinations=grid;
  root.BattleModules.unitsFor(sim).forEach(function(s){
    if(!s||s.dead){if(s)delete s._personalSpaceDestination;return;}
    var cache=s._personalSpaceDestination,st=s._movementResolver,last=st&&st.last,p=point(s),d=s.destination;
    if(cache&&cache.version===ver)addDestination(grid,s,cache.point,'reservation');
    if(last&&!last.tacticalStep&&d)addDestination(grid,s,d,'committed');
    /* A stationary body is occupied ground even when its current order is an ingress pause. */
    if(p&&(fixed(s)||d&&gap(p,d)<=.35))addDestination(grid,s,p,'body');
    var C=root.BattleCoverPositions,cover=C&&C.current(s,sim);
    if(cover&&cover.slot)addDestination(grid,s,cover.slot,'cover');
  });
  return grid;
}
function destinationKey(p){return Math.floor(p.x/DEST_SPACE)+','+Math.floor(p.z/DEST_SPACE);}
function addDestination(grid,s,p,type){
  var record={soldier:s,x:+p.x,z:+p.z,type:type},k=destinationKey(record);
  (grid.buckets[k]||(grid.buckets[k]=[])).push(record);
  if(type==='reservation')grid.reservations.set(s,record);
}
function removeDestination(grid,s){
  var old=grid.reservations.get(s);if(!old)return;old.removed=true;grid.reservations.delete(s);
}
function destinationFree(grid,s,p){
  var x=Math.floor(p.x/DEST_SPACE),z=Math.floor(p.z/DEST_SPACE);
  for(var ix=-1;ix<=1;ix++)for(var iz=-1;iz<=1;iz++){
    var list=grid.buckets[(x+ix)+','+(z+iz)]||[];
    for(var i=0;i<list.length;i++){
      var r=list[i],other=r.soldier;if(r.removed||other.dead||other===s)continue;
      if(r.type==='reservation'&&(!other._personalSpaceDestination||gap(other._personalSpaceDestination.point,r)>.01))continue;
      if(r.type==='committed'&&(!other.destination||gap(other.destination,r)>.01))continue;
      if(gap(p,r)<(r.type==='body'?MIN+.35:DEST_SPACE)-1e-6)return false;
    }
  }
  return true;
}
function resolveDestination(sim,s,goal,kind,routed){
  if(!sim||!s||!goal)return goal;
  var grid=sim._personalSpaceDestinations,old=s._personalSpaceDestination;
  if(!DEST_KINDS[kind]||routed){
    if(old){delete s._personalSpaceDestination;if(grid)removeDestination(grid,s);}
    if(!routed&&grid&&grid.time===sim.time)addDestination(grid,s,goal,'committed');
    return goal;
  }
  grid=destinationGrid(sim);
  if(old&&old.kind===kind&&old.version===grid.version&&gap(old.intent,goal)<.05&&destinationFree(grid,s,old.point))return old.point;
  removeDestination(grid,s);delete s._personalSpaceDestination;
  var P=root.BattleNavigationPhysicality,origin=P&&P.resolveStandGoal?P.resolveStandGoal(sim,s,goal):goal,start=point(s)||origin,chosen=null;
  function legal(p){
    if(!clear(p,p)||!clear(origin,p))return false;
    /* Match the existing planner's stand envelope so it cannot silently move our endpoint. */
    var stand=P&&P.resolveStandGoal?P.resolveStandGoal(sim,s,p):p;
    return stand&&gap(stand,p)<.01;
  }
  if(destinationFree(grid,s,origin)&&legal(origin))chosen=origin;
  else{
    stats(sim).destinationConflicts++;
    var heading=Math.atan2(start.z-origin.z,start.x-origin.x);
    for(var ring=1;ring<=6&&!chosen;ring++){
      var count=ring*8;
      for(var i=0;i<count;i++){
        var angle=heading+i*Math.PI*2/count,p={x:origin.x+Math.cos(angle)*DEST_SPACE*ring,z:origin.z+Math.sin(angle)*DEST_SPACE*ring};
        if(destinationFree(grid,s,p)&&legal(p)){chosen=p;break;}
      }
    }
  }
  if(!chosen){stats(sim).destinationUnresolved++;return goal;}
  chosen={x:chosen.x,z:chosen.z};
  s._personalSpaceDestination={kind:kind,intent:{x:goal.x,z:goal.z},point:chosen,version:grid.version};
  addDestination(grid,s,chosen,'reservation');
  if(gap(chosen,goal)>.05)stats(sim).destinationResolutions++;
  return chosen;
}
function move(sim,s,from,dx,dz){var to={x:from.x+dx,z:from.z+dz};if(!clear(from,to)){stats(sim).blockedCorrections++;return false;}s.root.position.x=to.x;s.root.position.z=to.z;if(sim.heightAt)s.root.position.y=sim.heightAt(to.x,to.z);return true;}
function separate(sim,a,b){
  var pa=point(a),pb=point(b);if(!pa||!pb)return;var dx=pb.x-pa.x,dz=pb.z-pa.z,d=Math.hypot(dx,dz);if(d>=MIN)return;
  var st=stats(sim),penetration=MIN-d;st.maxPenetration=Math.max(st.maxPenetration,penetration);if(d<1e-5){var seed=((+a.id||0)*73856093^(+b.id||0)*19349663)>>>0,ang=(seed%6283)/1000;dx=Math.cos(ang);dz=Math.sin(ang);d=1;st.exactOverlaps++;}else{dx/=d;dz/=d;}
  var fa=fixed(a),fb=fixed(b);if(fa&&fb)return;var push=Math.min(MAX_PUSH,penetration*(fa||fb?1:.5)),moved=false;
  if(!fa)moved=move(sim,a,pa,-dx*push,-dz*push)||moved;
  if(!fb)moved=move(sim,b,pb, dx*push, dz*push)||moved;
  if(moved)st.pairCorrections++;
}
function tick(sim){
  var all=root.BattleModules.unitsFor(sim).filter(function(s){return s&&!s.dead&&s.root&&s.root.position;}),buckets=Object.create(null),i,j,ix,iz;
  for(i=0;i<all.length;i++){var p=point(all[i]),k=key(p.x,p.z);(buckets[k]||(buckets[k]=[])).push(i);}
  for(i=0;i<all.length;i++){
    var p=point(all[i]),cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL);
    for(ix=-1;ix<=1;ix++)for(iz=-1;iz<=1;iz++){var list=buckets[(cx+ix)+','+(cz+iz)];if(!list)continue;for(var q=0;q<list.length;q++){j=list[q];if(j<=i)continue;separate(sim,all[i],all[j]);}}
  }
}
function publish(sim){var out=JSON.parse(JSON.stringify(stats(sim)));out.minSeparation=MIN;sim._personalSpaceSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.personalSpace=JSON.parse(JSON.stringify(out));}
/* Cover slots are built once per map; do it at load so the first firefight does not pay for it. */
function reset(sim){if(root.BattleCoverPositions&&root.BattleCoverPositions.warm)try{root.BattleCoverPositions.warm(sim);}catch(_){}sim._personalSpaceStats=fresh();delete sim._personalSpaceDestinations;root.BattleModules.unitsFor(sim).forEach(function(s){delete s._personalSpaceDestination;});publish(sim);}
root.BattleModules.registerSystem('soldier-personal-space',{version:'1.0',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:tick,onCommanderTick:publish});
root.BattleSoldierPersonalSpace={version:'1.1',minSeparation:MIN,destinationSeparation:DEST_SPACE,resolveDestination:resolveDestination,summary:function(sim){return sim&&sim._personalSpaceSummary?JSON.parse(JSON.stringify(sim._personalSpaceSummary)):null;}};
console.log('[MOVE] soldier personal space active: 0.90m minimum center spacing');
})(typeof window!=='undefined'?window:globalThis);
