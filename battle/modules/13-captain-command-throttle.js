/* Keep audible officer commands deliberate even when several squads change state together. */
(function(root){
  'use strict';
  if(!root.BattleModules||!root.BattleVoiceScheduler||typeof root.BattleVoiceScheduler.enqueue!=='function')return;

  var baseEnqueue=root.BattleVoiceScheduler.enqueue.bind(root.BattleVoiceScheduler);
  var lastCaptainCommandMs=0;
  var CAPTAIN_GLOBAL_GAP_MS=2600;
  var COMMAND_EVENTS={advance:true,engage:true,retreat:true,hold:true};

  root.BattleVoiceScheduler.enqueue=function(soldier,type,cam){
    if(soldier&&soldier.role==='captain'&&COMMAND_EVENTS[type]){
      var now=performance.now();
      if(now-lastCaptainCommandMs<CAPTAIN_GLOBAL_GAP_MS)return;
      lastCaptainCommandMs=now;
    }
    return baseEnqueue(soldier,type,cam);
  };

  root.BattleModules.registerSystem('captain-command-throttle',{
    version:'23-stability',
    beforeBattleRestart:function(){lastCaptainCommandMs=0;}
  });
  console.log('[VOICE] captain command throttle active; global gap='+CAPTAIN_GLOBAL_GAP_MS+'ms');
})(typeof window!=='undefined'?window:globalThis);