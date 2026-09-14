/* Keep audible officer commands deliberate even when several squads change state together. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleVoiceScheduler||typeof root.BattleVoiceScheduler.enqueue!=='function')return;

  var baseEnqueue=root.BattleVoiceScheduler.enqueue.bind(root.BattleVoiceScheduler);
  var lastCaptainCommandMs=0;
  var CAPTAIN_GLOBAL_GAP_MS=2600;
  var COMMAND_EVENTS={advance:true,engage:true,retreat:true,hold:true,regroup:true,rallyHere:true,pushNow:true};

  /* opts is intentionally forwarded: contextual stories use the scheduler's real playback-ended
     signal, and wrappers must not accidentally strip that callback. */
  root.BattleVoiceScheduler.enqueue=function(soldier,type,cam,opts){
    if(soldier&&soldier.role==='captain'&&COMMAND_EVENTS[type]){
      var now=performance.now();
      if(now-lastCaptainCommandMs<CAPTAIN_GLOBAL_GAP_MS)return false;
      lastCaptainCommandMs=now;
    }
    return baseEnqueue(soldier,type,cam,opts);
  };

  root.BattleModules.registerSystem('captain-command-throttle',{
    version:'24-playback-handles',
    beforeBattleRestart:function(){lastCaptainCommandMs=0;}
  });
  console.log('[VOICE] captain command throttle active; global gap='+CAPTAIN_GLOBAL_GAP_MS+'ms');
})(typeof window!=='undefined'?window:globalThis);
