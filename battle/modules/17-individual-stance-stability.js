/* Final individual stance stabilizer.
   The base AI, cover drill and squad stability layer may all propose a stance in the same update.
   This module runs after them and turns that proposal into a short commitment instead of visible
   stand/crouch/prone oscillation. Building firing stations load later and remain authoritative. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.SquadAI)return;

  var oldUpdate=root.SquadAI.updateSoldier;
  var STANCE_HOLD=5.0;
  var PRONE_HOLD=6.0;
  var AIM_SETTLE=.35;

  function logicalStance(s){return s.prone?'prone':(s.tacticalCrouch?'crouch':'stand');}
  function applyStance(s,stance){
    if(stance==='prone'){
      s.prone=true;s.tacticalCrouch=false;
      if(s._tacticMode!=='crawl')s.crawling=false;
    }else if(stance==='crouch'){
      s.prone=false;s.crawling=false;s.tacticalCrouch=true;
    }else{
      s.prone=false;s.crawling=false;s.tacticalCrouch=false;
    }
  }
  function commit(s,battle,stance,seconds,reason){
    var previous=s._stanceCommit&&s._stanceCommit.stance;
    s._stanceCommit={stance:stance,until:battle.time+seconds,reason:reason||'combat'};
    if(previous!==stance)s._aimReadyAt=Math.max(s._aimReadyAt||0,battle.time+AIM_SETTLE);
    applyStance(s,stance);
  }
  function emergency(s){return s&&s.squad&&(s.squad.state==='retreat'||s.squad.commandPhase==='regroup');}

  root.SquadAI.updateSoldier=function(s,battle){
    oldUpdate(s,battle);
    if(!s||s.dead||!battle)return;
    if(s._firingStation||emergency(s)){s._stanceCommit=null;return;}

    /* Relocation has a single coherent stance for its entire movement. */
    if(s._tacticMode==='crawl'){
      commit(s,battle,'prone',Math.max(1,(s._tacticUntil||battle.time)-battle.time),'crawl-to-cover');
      s.crawling=true;return;
    }
    if(s._tacticMode==='crouch-run'){
      commit(s,battle,'crouch',Math.max(1,(s._tacticUntil||battle.time)-battle.time),'crouch-run-to-cover');
      return;
    }

    var desired=logicalStance(s),current=s._stanceCommit,suppressed=s.suppressedUntil>battle.time;
    /* Being newly pinned is the one normal event allowed to break a stance commitment early. */
    if(suppressed&&desired==='prone'&&(!current||current.stance!=='prone')){
      commit(s,battle,'prone',PRONE_HOLD,'suppressed');return;
    }

    if(current&&battle.time<current.until){
      if(current.stance!==desired)applyStance(s,current.stance);
      return;
    }

    var hold=desired==='prone'?PRONE_HOLD:STANCE_HOLD;
    commit(s,battle,desired,hold,s._stableCover?'cover-hold':'engagement');
  };

  function reset(sim){
    ['us','ge'].forEach(function(f){(sim&&sim._roster&&sim._roster[f]||[]).forEach(function(s){s._stanceCommit=null;s._aimReadyAt=0;});});
  }
  root.BattleModules.registerSystem('individual-stance-stability',{
    version:'24-followup',
    onBattleStart:reset,
    beforeBattleRestart:reset
  });
  console.log('[TACTICS] stance commitment active; stand/crouch/prone churn suppressed');
})(typeof window!=='undefined'?window:globalThis);