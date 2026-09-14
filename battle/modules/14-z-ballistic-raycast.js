/* Direct-fire ballistics: every trigger pull launches a dispersed ray.
   Hits are no longer Bernoulli accuracy rolls.  Weapon combat grouping, stance, movement,
   suppression and range control the angular shot group; the first opposing soldier intersected
   by the ray takes damage. Terrain/buildings/cover can stop a stray round before it reaches a body. */
(function(root){
  'use strict';
  if(!root.SquadAI||root.BattleBallistics)return;

  var S=root.SquadAI;
  var EPS=.08,GROUND_STEPS=24,REFINE_STEPS=9,GROUP90=4.291932052578694;

  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function rand(b){return b&&b.random?b.random():Math.random();}
  function gaussian(b){
    var u=Math.max(1e-7,rand(b)),v=rand(b);
    return clamp(Math.sqrt(-2*Math.log(u))*Math.cos(Math.PI*2*v),-2.8,2.8);
  }
  function norm(v){var l=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/l,y:v.y/l,z:v.z/l};}
  function pointAt(o,d,t){return{x:o.x+d.x*t,y:o.y+d.y*t,z:o.z+d.z*t};}
  function stance(s){return S.stanceOf?S.stanceOf(s):(s.prone?'prone':(s.crouching?'crouch':'stand'));}
  function eyeHeight(s){return S.eyeHeight?S.eyeHeight(s):(s.prone?.42:(s.crouching?1.05:1.55));}
  function bodyShape(s,battle){
    var p=s.root.position,st=stance(s),ground=battle.heightAt(p.x,p.z),yaw=s.root.rotation&&+s.root.rotation.y||0;
    if(st==='prone')return{cx:p.x,cy:ground+.27,cz:p.z,rx:.31,ry:.23,rz:.76,yaw:yaw};
    if(st==='crouch')return{cx:p.x,cy:ground+.57,cz:p.z,rx:.34,ry:.54,rz:.34,yaw:0};
    return{cx:p.x,cy:ground+.88,cz:p.z,rx:.31,ry:.84,rz:.31,yaw:0};
  }
  function rayEllipsoid(o,d,e){
    var dx=o.x-e.cx,dy=o.y-e.cy,dz=o.z-e.cz,c=Math.cos(e.yaw||0),s=Math.sin(e.yaw||0);
    var ox=dx*c-dz*s,oz=dx*s+dz*c,rx=d.x*c-d.z*s,rz=d.x*s+d.z*c;
    var ax=rx/e.rx,ay=d.y/e.ry,az=rz/e.rz,bx=ox/e.rx,by=dy/e.ry,bz=oz/e.rz;
    var A=ax*ax+ay*ay+az*az,B=2*(ax*bx+ay*by+az*bz),C=bx*bx+by*by+bz*bz-1,disc=B*B-4*A*C;
    if(disc<0||A<1e-9)return null;
    var q=Math.sqrt(disc),t1=(-B-q)/(2*A),t2=(-B+q)/(2*A),t=t1>EPS?t1:(t2>EPS?t2:null);
    return t;
  }
  function targetCenter(target,battle){var e=bodyShape(target,battle);return{x:e.cx,y:e.cy,z:e.cz};}

  /* combatSigmaAt100 is one-axis Gaussian sigma in metres at 100 m.  This is deliberately a
     SHOOTER+WEAPON combat grouping, not mechanical test-bench MOA.  With two independent Gaussian
     axes, a 90% circular group diameter is ~4.292 * sigma * distance.  Weapons without the newer
     metadata retain the old accuracy-derived fallback so extension modules remain compatible. */
  function dispersionSigma(shooter,stats,d,battle){
    var legacy=.28+(1-clamp(+stats.accuracy||.5,.05,.98))*1.70;
    var sigmaAt100=isFinite(+stats.combatSigmaAt100)?Math.max(.01,+stats.combatSigmaAt100):legacy;
    var sigma=sigmaAt100/100;
    var mult=shooter.squad&&+shooter.squad.accuracyMultiplier||1;
    sigma/=clamp(mult,.45,1.35);
    if(shooter.prone)sigma*=.74;else if(shooter.crouching)sigma*=.88;
    if(shooter.moving)sigma*=1.55;
    if(shooter.suppressedUntil>battle.time)sigma*=1.65;
    if(shooter.role==='gunner'&&shooter.setUp)sigma*=.72;
    if(d>stats.falloffStart){
      var f=(d-stats.falloffStart)/Math.max(1,stats.range-stats.falloffStart);
      var extra=isFinite(+stats.rangeDispersion)?Math.max(0,+stats.rangeDispersion):.90;
      sigma*=1+clamp(f,0,1)*extra;
    }
    return sigma;
  }
  function groupDiameter90(shooter,stats,d,battle){return GROUP90*dispersionSigma(shooter,stats,d,battle)*d;}
  function shotDirection(shooter,target,stats,battle){
    var sp=shooter.root.position,origin={x:sp.x,y:battle.heightAt(sp.x,sp.z)+eyeHeight(shooter),z:sp.z},aim=targetCenter(target,battle);
    var base=norm({x:aim.x-origin.x,y:aim.y-origin.y,z:aim.z-origin.z}),flat=Math.hypot(base.x,base.z)||1;
    var right={x:base.z/flat,y:0,z:-base.x/flat};
    var up=norm({x:-right.z*base.y,y:right.z*base.x-right.x*base.z,z:right.x*base.y});
    var distance=Math.hypot(aim.x-origin.x,aim.y-origin.y,aim.z-origin.z),sigma=dispersionSigma(shooter,stats,distance,battle);
    var gx=gaussian(battle)*sigma,gy=gaussian(battle)*sigma;
    return{origin:origin,dir:norm({x:base.x+right.x*gx+up.x*gy,y:base.y+up.y*gy,z:base.z+right.z*gx+up.z*gy}),aim:aim,sigma:sigma,distance:distance};
  }
  function segmentBlocked(o,d,t,battle){
    var p=pointAt(o,d,t),F=root.BattleObstacleField;
    try{if(F){var ob=(F.sightBlocker||F.sightBlocked).call(F,battle.obstacles,o,p);if(ob)return{obstacle:ob};}}catch(_){}
    try{if(root.BattleNavigation&&root.BattleNavigation.lineOfSightBlocked){var wall=root.BattleNavigation.lineOfSightBlocked({x:o.x,z:o.z},{x:p.x,z:p.z},o.y,p.y);if(wall)return{wall:wall};}}catch(_){}
    return false;
  }
  function obstacleStop(o,d,maxT,battle){
    if(!segmentBlocked(o,d,maxT,battle))return{travel:maxT};
    var lo=EPS,hi=maxT;
    for(var i=0;i<REFINE_STEPS;i++){var mid=(lo+hi)*.5;if(segmentBlocked(o,d,mid,battle))hi=mid;else lo=mid;}
    var block=segmentBlocked(o,d,hi,battle)||{};block.travel=hi;return block;
  }
  function groundStop(o,d,maxT,battle){
    var prev=EPS;
    for(var i=1;i<=GROUND_STEPS;i++){
      var t=maxT*i/GROUND_STEPS,p=pointAt(o,d,t),gy=battle.heightAt(p.x,p.z)+EPS;
      if(p.y<=gy){
        var lo=prev,hi=t;
        for(var j=0;j<REFINE_STEPS;j++){var mid=(lo+hi)*.5,q=pointAt(o,d,mid);if(q.y<=battle.heightAt(q.x,q.z)+EPS)hi=mid;else lo=mid;}
        return hi;
      }
      prev=t;
    }
    return maxT;
  }
  function environmentStop(o,d,maxT,battle){
    var ob=obstacleStop(o,d,maxT,battle),ground=groundStop(o,d,maxT,battle);
    return ground<ob.travel?{travel:ground,ground:true}:ob;
  }
  function impactSurface(stop,p,d,battle){
    var ob=stop.obstacle,w=stop.wall,n={x:-d.x,y:-d.y,z:-d.z},surface='cement';
    if(stop.ground){
      surface='dirt';n=norm({x:battle.heightAt(p.x-.2,p.z)-battle.heightAt(p.x+.2,p.z),y:.4,z:battle.heightAt(p.x,p.z-.2)-battle.heightAt(p.x,p.z+.2)});
    }else if(w&&w.a&&w.b){n=norm({x:w.b.z-w.a.z,y:0,z:w.a.x-w.b.x});}
    else if(ob){surface=ob.impactMaterial||ob.materialType||ob.type||'cement';if(isFinite(ob.x)&&isFinite(ob.z))n=norm({x:p.x-ob.x,y:.15,z:p.z-ob.z});}
    if(n.x*d.x+n.y*d.y+n.z*d.z>0)n={x:-n.x,y:-n.y,z:-n.z};
    return{surface:surface,normal:n};
  }
  function firstEnemyHit(shooter,o,d,maxT,battle){
    var enemies=battle.rosterOf?battle.rosterOf(shooter.faction==='us'?'ge':'us'):[],best=null,bestT=maxT+1;
    for(var i=0;i<enemies.length;i++){
      var e=enemies[i];if(!e||e.dead||!e.root)continue;
      var t=rayEllipsoid(o,d,bodyShape(e,battle));
      if(t!=null&&t<bestT&&t<=maxT){best=e;bestT=t;}
    }
    return best?{soldier:best,t:bestT}:null;
  }
  function resolveRay(shooter,target,battle){
    if(!shooter||!target||target.dead||!shooter.weapon)return null;
    var stats=shooter.weapon.stats,sp=shooter.root.position,tp=target.root.position,d2=S.dist2?S.dist2(sp.x,sp.z,tp.x,tp.z):Math.hypot(sp.x-tp.x,sp.z-tp.z);
    if(d2>stats.range)return null;
    var shot=shotDirection(shooter,target,stats,battle),maxT=stats.range,environment=environmentStop(shot.origin,shot.dir,maxT,battle),stop=environment.travel,body=firstEnemyHit(shooter,shot.origin,shot.dir,Math.min(stop,maxT),battle);
    var hit=!!body,t=hit?body.t:stop,victim=hit?body.soldier:null,impact=pointAt(shot.origin,shot.dir,t),surface=impactSurface(environment,impact,shot.dir,battle);
    if(stats.suppressive)target.suppressedUntil=Math.max(target.suppressedUntil||0,battle.time+1.3);
    if(victim){victim.hp-=stats.damage*(.85+rand(battle)*.3);if(victim.hp<=0)battle.killSoldier(victim,shooter);}
    var meta={mode:'raycast',origin:shot.origin,aim:shot.aim,impact:impact,victim:victim,intendedTarget:target,dispersionRad:shot.sigma,travel:t,stoppedBy:hit?'soldier':(stop<maxT-.1?'environment':'range'),surface:hit?'blood':surface.surface,normal:hit?{x:-shot.dir.x,y:-shot.dir.y,z:-shot.dir.z}:surface.normal,direction:shot.dir};
    battle.onShot&&battle.onShot(shooter,target,hit,d2,meta);
    shooter._lastBallisticShot=meta;
    return hit;
  }
  function blocked(shooter,battle){
    try{return !S.hasLineOfSight(shooter,shooter.target,battle.heightAt,battle.obstacles);}catch(_){return false;}
  }
  function tryFire(shooter,battle){
    if(!shooter||!battle||!shooter.target||shooter.target.dead||shooter.fireCooldown>0)return false;
    var stats=shooter.weapon&&shooter.weapon.stats;if(!stats)return false;
    var p=shooter.root.position,t=shooter.target.root.position,d=S.dist2?S.dist2(p.x,p.z,t.x,t.z):Math.hypot(p.x-t.x,p.z-t.z);
    if(d>stats.range)return false;
    if(blocked(shooter,battle)){
      shooter._losBlockedFire=(shooter._losBlockedFire||0)+1;shooter._losBlockedFireAt=+battle.time||0;return false;
    }
    resolveRay(shooter,shooter.target,battle);
    shooter.fireCooldown=1/stats.rof*(.85+rand(battle)*.3);
    battle.onFire&&battle.onFire(shooter);
    return true;
  }

  S.resolveFire=resolveRay;
  S.tryFire=tryFire;
  root.BattleBallistics={version:'71-combat-group-calibration',resolve:resolveRay,dispersionSigma:dispersionSigma,groupDiameter90:groupDiameter90,bodyShape:bodyShape,rayEllipsoid:rayEllipsoid};
  if(typeof console!=='undefined')console.log('[BALLISTICS] direct fire uses combat-calibrated dispersed raycasts');
})(typeof window!=='undefined'?window:globalThis);
