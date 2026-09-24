/* Keep audible officer commands deliberate even when several squads change state together. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleVoiceScheduler||typeof root.BattleVoiceScheduler.enqueue!=='function')return;

  var baseEnqueue=root.BattleVoiceScheduler.enqueue.bind(root.BattleVoiceScheduler);
  var lastLeaderCommandMs=0;
  var LEADER_GLOBAL_GAP_MS=2600;
  var COMMAND_EVENTS={advance:true,engage:true,retreat:true,hold:true,regroup:true,rallyHere:true,pushNow:true};

  /* opts is intentionally forwarded: contextual stories use the scheduler's real playback-ended
     signal, and wrappers must not accidentally strip that callback. */
  root.BattleVoiceScheduler.enqueue=function(soldier,type,cam,opts){
    if(soldier&&root.SquadAI&&root.SquadAI.isLeader(soldier)&&COMMAND_EVENTS[type]){
      var now=performance.now();
      if(now-lastLeaderCommandMs<LEADER_GLOBAL_GAP_MS)return false;
      lastLeaderCommandMs=now;
    }
    return baseEnqueue(soldier,type,cam,opts);
  };

  root.BattleModules.registerSystem('captain-command-throttle',{
    version:'24-playback-handles',
    beforeBattleRestart:function(){lastLeaderCommandMs=0;}
  });
  console.log('[VOICE] squad leader command throttle active; global gap='+LEADER_GLOBAL_GAP_MS+'ms');
})(typeof window!=='undefined'?window:globalThis);
