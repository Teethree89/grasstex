/* Baseline spatial voice runtime.
   11-voice-variation.js normally replaces this with the pitch-profile implementation. Keep the
   baseline API compatible: separate social/tactical throttle lanes and return a playback handle
   whose onEnded callback is driven by Babylon's real Sound completion event. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||typeof window==='undefined')return;
  var cache={},failed={},socialLast=0,tacticalLast=0,socialSquad={},tacticalSquad={},SOCIAL={idleQuip:1,idleStory:1,idleLaugh:1,idleGroan:1};
  function cameraPos(cam){return cam&&(cam.globalPosition||cam.position)||null;}
  function distance(a,b){if(!a||!b)return 0;var dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
  function finish(req){if(!req||req.handle.ended)return;req.handle.ended=true;if(req.opts&&typeof req.opts.onEnded==='function')try{req.opts.onEnded(req.handle);}catch(e){console.error('[VOICE] onEnded failed: '+(e&&e.message||e));}}
  function playAt(entry,req){try{var p=req.soldier.root.position.clone?req.soldier.root.position.clone():req.soldier.root.position,o=entry.sound.onEndedObservable;entry.sound.setPosition(p);if(o&&o.addOnce)o.addOnce(function(){finish(req);});entry.sound.play();req.handle.started=true;console.log('[VOICE] play '+entry.file+' lane='+req.lane);}catch(e){console.error('[VOICE] play failed '+entry.file+': '+(e&&e.message||e));finish(req);}return req.handle;}
  function enqueue(soldier,type,cam,opts){
    opts=opts||{};var m=window.BATTLE_AUDIO_MANIFEST;if(!m||!m.callouts||!m.callouts[soldier.faction])return false;var files=(m.callouts[soldier.faction].events||{})[type];if(!files||!files.length)return false;
    var rules=m.rules&&m.rules.voice||{},now=performance.now(),lane=opts.priority||(SOCIAL[type]?'social':'tactical'),social=lane==='social',sid=soldier.squad&&soldier.squad.id||soldier.faction,cp=cameraPos(cam),drop=rules.dropBeyondDistance||120;if(cp&&distance(cp,soldier.root.position)>drop)return false;
    if(social){if(now-socialLast<700||now-(socialSquad[sid]||0)<(rules.perSquadCooldownSeconds||2.5)*1000)return false;}else if(now-tacticalLast<220||now-(tacticalSquad[sid]||0)<480)return false;
    var file=files[Math.floor(Math.random()*files.length)];if(failed[file])return false;if(social){socialLast=now;socialSquad[sid]=now;}else{tacticalLast=now;tacticalSquad[sid]=now;}
    var handle={accepted:true,started:false,ended:false,soldierId:soldier.id,type:type,file:file,priority:lane},req={soldier:soldier,opts:opts,handle:handle,lane:lane},entry=cache[file];if(entry){if(entry.ready)return playAt(entry,req);entry.pending.push(req);return handle;}
    var base=window.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/',url=base+file;entry=cache[file]={file:file,sound:null,ready:false,pending:[req]};
    try{var scene=soldier.root.getScene();entry.sound=new BABYLON.Sound('voice-'+file,url,scene,function(){entry.ready=true;var q=entry.pending.splice(0);for(var i=0;i<q.length;i++)playAt(entry,q[i]);},{spatialSound:true,distanceModel:'linear',maxDistance:(m.runtime&&m.runtime.voiceMaxDistance)||95,rolloffFactor:1.7,volume:.24,autoplay:false});}
    catch(e){failed[file]=true;delete cache[file];finish(req);return false;}return handle;
  }
  root.BattleVoiceScheduler={enqueue:enqueue};
  console.log('[VOICE] baseline playback-aware runtime active');
})(typeof window!=='undefined'?window:globalThis);
