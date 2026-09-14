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
function point(s){return s&&s.root&&s.root.position?{x:+s.root.position.x||0,z:+s.root.position.z||0}:null;}
function fixed(s){var t=root.BattleTacticalPositions&&root.BattleTacticalPositions.current(s);return!!(t&&t.occupiedAt!=null);}
function key(x,z){return Math.floor(x/CELL)+','+Math.floor(z/CELL);}
function clear(a,b){try{return !root.BattleNavigation||!root.BattleNavigation.movementClear||root.BattleNavigation.movementClear(a,b);}catch(_){return true;}}
function fresh(){return{pairCorrections:0,exactOverlaps:0,blockedCorrections:0,maxPenetration:0};}
function stats(sim){return sim._personalSpaceStats||(sim._personalSpaceStats=fresh());}
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
function reset(sim){sim._personalSpaceStats=fresh();publish(sim);}
root.BattleModules.registerSystem('soldier-personal-space',{version:'1.0',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:tick,onCommanderTick:publish});
root.BattleSoldierPersonalSpace={version:'1.0',minSeparation:MIN,summary:function(sim){return sim&&sim._personalSpaceSummary?JSON.parse(JSON.stringify(sim._personalSpaceSummary)):null;}};
console.log('[MOVE] soldier personal space active: 0.90m minimum center spacing');
})(typeof window!=='undefined'?window:globalThis);
