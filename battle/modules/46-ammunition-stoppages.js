/* Finite ammunition, reloads and small-arms stoppages.
   The ballistic model remains authoritative for where a round goes and what it hits. This layer
   owns only whether the weapon can discharge: loaded rounds, carried reserve, reload cycle,
   heat/fouling pressure and a short stoppage-clearing action.

   Combat loads are deliberately conservative abstractions rather than claims about one exact
   historical unit's issue: rifle 80 rds, carbine 75, generic LMG 180, sidearm 32. The current
   shared weapon set is not faction-specific, so reliability values describe weapon classes rather
   than pretending the same generic mesh is a particular US or German model. */
(function(root){
'use strict';
if(!root.BattleModules||!root.SquadAI||root.BattleAmmunition)return;

var LOADOUT={
  rifle:  {total:80, low:16, baseStop:.0006, heatStop:.0010, heatPerShot:.045, cool:.16, clear:1.45},
  carbine:{total:75, low:30, baseStop:.0010, heatStop:.0015, heatPerShot:.050, cool:.16, clear:1.65},
  lmg:    {total:180,low:60, baseStop:.0015, heatStop:.0035, heatPerShot:.070, cool:.13, clear:2.35},
  pistol: {total:32, low:8,  baseStop:.0010, heatStop:.0012, heatPerShot:.045, cool:.18, clear:1.50}
};
var oldTryFire=root.SquadAI.tryFire,oldAreaFire=root.SquadAI.areaFire;

function cfg(s){return LOADOUT[s&&s.weapon&&s.weapon.kind]||LOADOUT.rifle;}
function rand(b){return b&&typeof b.random==='function'?b.random():Math.random();}
function units(sim){return root.BattleModules.unitsFor(sim).filter(function(s){return s&&s.weapon&&!s.dead;});}
function freshBucket(){return{shots:0,reloads:0,stoppages:0,clears:0,ranDry:0,lowAmmoCalls:0,roundsLoaded:0};}
function fresh(){return{shots:0,reloads:0,stoppages:0,clears:0,ranDry:0,lowAmmoCalls:0,roundsLoaded:0,byWeapon:{rifle:freshBucket(),carbine:freshBucket(),lmg:freshBucket(),pistol:freshBucket()}};}
function stats(sim){return sim._ammunitionStats||(sim._ammunitionStats=fresh());}
function bump(sim,s,field,n){n=n==null?1:n;var st=stats(sim),kind=s&&s.weapon&&s.weapon.kind||'rifle',b=st.byWeapon[kind]||(st.byWeapon[kind]=freshBucket());st[field]=(st[field]||0)+n;b[field]=(b[field]||0)+n;}
function deterministicCall(s,count,mod){return ((+s.id||0)+(+count||0)*3)%mod===0;}
function say(s,battle,type){try{if(battle&&battle.onCallout)battle.onCallout(s,type);}catch(_){} }
function animateReload(s,seconds){try{var M=root.BattleSoldierModel;if(M&&M.triggerAnimation&&M.TAGS&&M.TAGS.reload)M.triggerAnimation(s,M.TAGS.reload,{duration:seconds});}catch(_){} }
function markFireReady(s,battle,delay){try{if(s.eng)s.eng.fireReadyAt=Math.max(+s.eng.fireReadyAt||0,(+battle.time||0)+(delay||.15));}catch(_){} }

function initialize(s,sim){
  if(!s||!s.weapon)return;
  var c=cfg(s),mag=Math.max(1,+s.weapon.magSize||+s.weapon.stats&&+s.weapon.stats.magazine||8),total=Math.max(mag,c.total||mag);
  s.weapon.magSize=mag;s.weapon.ammo=mag;s.weapon.reserveAmmo=total-mag;s.weapon.heat=0;s.weapon.jammed=false;
  s.reloading=false;s.reloadUntil=0;s.clearingStoppage=false;s.stoppageUntil=0;s.outOfAmmo=false;
  s._ammoState={reloads:0,stoppages:0,shots:0,lowCalled:false,dryCounted:false};
}
function carried(s){return s&&s.weapon?Math.max(0,+s.weapon.ammo||0)+Math.max(0,+s.weapon.reserveAmmo||0):0;}
function maybeLow(s,battle){
  var a=s&&s._ammoState,c=cfg(s);if(!a||a.lowCalled||carried(s)>c.low)return;
  a.lowCalled=true;bump(battle,s,'lowAmmoCalls');say(s,battle,'ammoLow');
}
function finishReload(s,battle){
  var w=s.weapon,need=Math.max(0,(+w.magSize||1)-(+w.ammo||0)),load=Math.min(need,Math.max(0,+w.reserveAmmo||0));
  w.ammo=(+w.ammo||0)+load;w.reserveAmmo=Math.max(0,(+w.reserveAmmo||0)-load);s.reloading=false;s.reloadUntil=0;s.outOfAmmo=w.ammo<=0&&w.reserveAmmo<=0;
  if(load>0)bump(battle,s,'roundsLoaded',load);markFireReady(s,battle,.18);maybeLow(s,battle);
}
function startReload(s,battle){
  if(!s||!s.weapon||s.reloading||s.clearingStoppage)return false;
  var w=s.weapon;if((+w.ammo||0)>0||(+w.reserveAmmo||0)<=0)return false;
  var seconds=Math.max(.8,+w.stats.reloadTime||2.5);s.reloading=true;s.reloadUntil=(+battle.time||0)+seconds;s.setUp=false;
  var a=s._ammoState||(s._ammoState={reloads:0,stoppages:0,shots:0,lowCalled:false,dryCounted:false});a.reloads++;bump(battle,s,'reloads');animateReload(s,seconds);
  /* Reload chatter is deterministic and sparse so voice does not consume combat RNG. */
  if(deterministicCall(s,a.reloads,4))say(s,battle,'reload');
  return true;
}
function startStoppage(s,battle){
  if(!s||!s.weapon||s.clearingStoppage||s.reloading)return false;
  var c=cfg(s),a=s._ammoState;s.weapon.jammed=true;s.clearingStoppage=true;s.stoppageUntil=(+battle.time||0)+c.clear;s.setUp=false;a.stoppages++;bump(battle,s,'stoppages');animateReload(s,c.clear);return true;
}
function finishStoppage(s,battle){s.weapon.jammed=false;s.clearingStoppage=false;s.stoppageUntil=0;bump(battle,s,'clears');markFireReady(s,battle,.20);}
function unavailable(s,battle){
  if(!s||!s.weapon)return true;var w=s.weapon;
  if(s.reloading||s.clearingStoppage||w.jammed)return true;
  if((+w.ammo||0)>0)return false;
  if((+w.reserveAmmo||0)>0){startReload(s,battle);return true;}
  s.outOfAmmo=true;var a=s._ammoState;if(a&&!a.dryCounted){a.dryCounted=true;bump(battle,s,'ranDry');maybeLow(s,battle);}return true;
}
function afterShot(s,battle){
  var w=s.weapon,c=cfg(s),a=s._ammoState||(s._ammoState={reloads:0,stoppages:0,shots:0,lowCalled:false,dryCounted:false});
  w.ammo=Math.max(0,(+w.ammo||0)-1);w.heat=Math.min(1,(+w.heat||0)+c.heatPerShot);a.shots++;bump(battle,s,'shots');maybeLow(s,battle);
  if(w.ammo<=0){if((+w.reserveAmmo||0)>0)startReload(s,battle);else unavailable(s,battle);return;}
  var stopChance=c.baseStop+c.heatStop*(+w.heat||0);
  if(rand(battle)<stopChance)startStoppage(s,battle);
}

root.SquadAI.tryFire=function(s,battle){
  if(unavailable(s,battle))return false;
  var fired=oldTryFire.apply(this,arguments);if(fired)afterShot(s,battle);return fired;
};
root.SquadAI.areaFire=function(s,point,battle){
  if(unavailable(s,battle))return 0;
  var before=+s.fireCooldown||0,result=oldAreaFire.apply(this,arguments),after=+s.fireCooldown||0;
  if(after>before+1e-6)afterShot(s,battle);return result;
};

function tick(sim,payload){
  var dt=Math.max(0,payload&&isFinite(+payload.dt)?+payload.dt:0),t=+sim.time||0,a=units(sim);
  for(var i=0;i<a.length;i++){
    var s=a[i],w=s.weapon,c=cfg(s);if(!s._ammoState)initialize(s,sim);
    w.heat=Math.max(0,(+w.heat||0)-c.cool*dt);
    if(s.clearingStoppage&&t>=(+s.stoppageUntil||0))finishStoppage(s,sim);
    if(s.reloading&&t>=(+s.reloadUntil||0))finishReload(s,sim);
    if(!s.reloading&&!s.clearingStoppage&&(+w.ammo||0)<=0&&(+w.reserveAmmo||0)>0)startReload(s,sim);
    maybeLow(s,sim);
  }
}
function reset(sim){sim._ammunitionStats=fresh();var a=units(sim);for(var i=0;i<a.length;i++)initialize(a[i],sim);publish(sim);}
function snapshot(sim){
  var st=stats(sim),remaining=0,loaded=0,reserve=0,empty=0,reloading=0,clearing=0,a=units(sim);
  for(var i=0;i<a.length;i++){var w=a[i].weapon,l=Math.max(0,+w.ammo||0),r=Math.max(0,+w.reserveAmmo||0);loaded+=l;reserve+=r;remaining+=l+r;if(l+r<=0)empty++;if(a[i].reloading)reloading++;if(a[i].clearingStoppage)clearing++;}
  return{shots:st.shots,reloads:st.reloads,stoppages:st.stoppages,clears:st.clears,ranDry:st.ranDry,lowAmmoCalls:st.lowAmmoCalls,roundsLoaded:st.roundsLoaded,roundsRemaining:remaining,loadedRounds:loaded,reserveRounds:reserve,emptyWeapons:empty,reloading:reloading,clearing:clearing,byWeapon:JSON.parse(JSON.stringify(st.byWeapon))};
}
function publish(sim){var out=snapshot(sim);sim._ammunitionSummary=out;if(sim._coordinationHealth)sim._coordinationHealth.ammunition=JSON.parse(JSON.stringify(out));}

root.BattleModules.registerSystem('ammunition-stoppages',{version:'1.1',onBattleStart:reset,onBattleRestart:reset,onSimulationStep:tick,onCommanderTick:publish});
root.BattleAmmunition={version:'1.1',loadouts:LOADOUT,initialize:initialize,startReload:startReload,startStoppage:startStoppage,available:function(s){return!!(s&&s.weapon&&!s.reloading&&!s.clearingStoppage&&!s.weapon.jammed&&(+s.weapon.ammo||0)>0);},summary:function(sim){return sim?snapshot(sim):null;}};
console.log('[FIRE] finite combat loads + reloads + heat-sensitive stoppages active');
})(typeof window!=='undefined'?window:globalThis);
