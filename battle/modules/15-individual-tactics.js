/* Individual infantry battle drills: react to contact, use nearby cover, crouch-run, go prone and crawl. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;
  var oldUpdate=root.SquadAI.updateSoldier;
  function coverQuality(s,battle){return root.SquadAI.coverMultiplierAt?root.SquadAI.coverMultiplierAt(s.root.position.x,s.root.position.z,battle.obstacles):1;}
  function validObstacle(ob){return ob&&ob.cover!=null&&ob.cover<.94&&ob.radius>.35;}
  function coverPointBehind(ob,target){var dx=ob.x-target.root.position.x,dz=ob.z-target.root.position.z,len=Math.hypot(dx,dz)||1,pad=(ob.radius||1)+.85;return{x:ob.x+dx/len*pad,z:ob.z+dz/len*pad,cover:ob.cover,type:ob.type||'cover'};}
  function findCover(s,target,battle,maxRange){
    var best=null,bestScore=Infinity,sx=s.root.position.x,sz=s.root.position.z,obs=battle.obstacles||[];
    for(var i=0;i<obs.length;i++){
      var ob=obs[i];if(!validObstacle(ob))continue;var od=Math.hypot(ob.x-sx,ob.z-sz);if(od>maxRange)continue;var p=coverPointBehind(ob,target),pd=Math.hypot(p.x-sx,p.z-sz);
      if(root.BattleNavigation&&!root.BattleNavigation.movementClear({x:sx,z:sz},p)){var path=root.BattleNavigation.findPath({x:sx,z:sz},p);if(!path||!path.length)continue;pd*=1.22;}
      var enemyDist=Math.hypot(p.x-target.root.position.x,p.z-target.root.position.z),score=pd+(ob.cover||1)*8-enemyDist*.01;if(score<bestScore){bestScore=score;best={x:p.x,z:p.z,quality:ob.cover||1,type:p.type,distance:pd};}
    }
    return best;
  }
  function beginCoverMove(s,battle,target){var suppressed=s.suppressedUntil>battle.time,cover=findCover(s,target,battle,suppressed?30:22);if(!cover)return false;s._tacticCover=cover;s._tacticUntil=battle.time+Math.max(4,cover.distance/Math.max(.5,s.speed)+3);s._tacticMode=suppressed&&cover.distance>7?'crawl':'crouch-run';s.tacticalCrouch=s._tacticMode==='crouch-run';s.crawling=s._tacticMode==='crawl';if(root.BattleTelemetry)root.BattleTelemetry.record('decision-cover',{soldier:s.id,faction:s.faction,role:s.role,mode:s._tacticMode,coverType:cover.type,distance:+cover.distance.toFixed(1),quality:cover.quality},battle);return true;}
  function applyTactic(s,battle){
    if(!s.target||s.dead||s.reloading||s._firingStation)return;
    var open=coverQuality(s,battle)>.90,suppressed=s.suppressedUntil>battle.time,targetChanged=s._tacticTarget!==s.target.id;
    if(targetChanged){s._tacticTarget=s.target.id;s._contactAt=battle.time;s._tacticMode=null;s._tacticCover=null;if(open)beginCoverMove(s,battle,s.target);}
    if((suppressed||open)&&(!s._tacticMode||battle.time>(s._tacticUntil||0))&&battle.time>(s._nextCoverSearch||0)){s._nextCoverSearch=battle.time+1.8;beginCoverMove(s,battle,s.target);}
    var c=s._tacticCover;if(c&&(s._tacticMode==='crawl'||s._tacticMode==='crouch-run')){var d=Math.hypot(s.root.position.x-c.x,s.root.position.z-c.z);if(d<1.05){s._tacticMode='cover-hold';s.crawling=false;s.tacticalCrouch=true;s.prone=!!(suppressed&&s.role!=='scout'&&s.role!=='captain');s.destination={x:s.root.position.x,z:s.root.position.z};}else{s.destination={x:c.x,z:c.z};if(s._tacticMode==='crawl'){s.prone=true;s.crawling=true;s.tacticalCrouch=false;}else{s.prone=false;s.crawling=false;s.tacticalCrouch=true;}}return;}
    if(s._tacticMode==='cover-hold'){s.crawling=false;s.tacticalCrouch=!s.prone;s.destination={x:s.root.position.x,z:s.root.position.z};if(!suppressed&&battle.time>(s._tacticUntil||0)){s._tacticMode=null;s._tacticCover=null;s.prone=false;s.tacticalCrouch=false;}return;}
    if(suppressed&&open&&s.role!=='scout'&&s.role!=='captain'){s.prone=true;s.crawling=false;s.tacticalCrouch=false;}else if(open){s.prone=false;s.tacticalCrouch=true;}
  }
  root.SquadAI.updateSoldier=function(s,battle){oldUpdate(s,battle);if(!s||s.dead)return;if(!s.target){s._tacticMode=null;s._tacticCover=null;s.crawling=false;s.tacticalCrouch=false;return;}applyTactic(s,battle);};
  root.BattleModules.registerSystem('individual-battle-tactics',{version:'22-pr',beforeBattleRestart:function(sim){['us','ge'].forEach(function(f){(sim._roster[f]||[]).forEach(function(s){s._tacticMode=null;s._tacticCover=null;s.crawling=false;s.tacticalCrouch=false;});});}});
  root.BattleIndividualTactics={findCover:findCover};console.log('[TACTICS] individual contact/cover drills loaded');
})(typeof window!=='undefined'?window:globalThis);
