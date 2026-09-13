/* Baseline spatial voice runtime.

   This used to be bolted onto the end of squad-ai.js, where it had nothing to do with AI and was
   invisible to anyone reading the combat code. It is a module now so the load order is explicit:
   this file provides BattleVoiceScheduler, 11-voice-variation.js replaces it with the pitch-variant
   version when the manifest carries profiles, and 13-captain-command-throttle.js wraps whichever
   one ended up installed.

   It waits for Babylon's ready callback before the first play because newly created sounds are not
   decoded yet, and it uses the public global asset base rather than a loader-local binding. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||typeof window==='undefined')return;
  var cache={},lastGlobal=0,squadLast={},failed={};
  function cameraPos(cam){return cam&&(cam.globalPosition||cam.position)||null;}
  function distance(a,b){if(!a||!b)return 0;var dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
  function playAt(entry,soldier){
    try{
      var p=soldier.root.position.clone?soldier.root.position.clone():soldier.root.position;
      entry.sound.setPosition(p);
      entry.sound.play();
      console.log('[VOICE] play '+entry.file);
    }catch(e){console.error('[VOICE] play failed '+entry.file+': '+(e&&e.message||e));}
  }
  function enqueue(soldier,type,cam){
    var m=window.BATTLE_AUDIO_MANIFEST;
    if(!m||!m.callouts||!m.callouts[soldier.faction]){console.warn('[VOICE] manifest/event map unavailable');return;}
    var events=m.callouts[soldier.faction].events||{},files=events[type];
    if(!files||!files.length){console.warn('[VOICE] no event '+soldier.faction+'/'+type);return;}
    var rules=m.rules&&m.rules.voice||{},now=performance.now(),globalGap=700,squadGap=(rules.perSquadCooldownSeconds||2.5)*1000;
    var cp=cameraPos(cam),drop=rules.dropBeyondDistance||120;
    if(cp&&distance(cp,soldier.root.position)>drop)return;
    if(now-lastGlobal<globalGap)return;
    var squadId=soldier.squad&&soldier.squad.id||soldier.faction;
    if(now-(squadLast[squadId]||0)<squadGap)return;
    var file=files[Math.floor(Math.random()*files.length)];
    if(failed[file])return;
    lastGlobal=now;squadLast[squadId]=now;
    var entry=cache[file];
    if(entry){
      if(entry.ready)playAt(entry,soldier);
      else{entry.pendingSoldier=soldier;console.log('[VOICE] waiting '+file);}
      return;
    }
    var base=window.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
    var url=base+file;
    console.log('[VOICE] request '+url);
    entry=cache[file]={file:file,sound:null,ready:false,pendingSoldier:soldier};
    try{
      var scene=soldier.root.getScene();
      entry.sound=new BABYLON.Sound('voice-'+file,url,scene,function(){
        entry.ready=true;
        console.log('[VOICE] ready '+file);
        if(entry.pendingSoldier){var s=entry.pendingSoldier;entry.pendingSoldier=null;playAt(entry,s);}
      },{
        spatialSound:true,distanceModel:'linear',maxDistance:(m.runtime&&m.runtime.voiceMaxDistance)||95,rolloffFactor:1.7,volume:.24,autoplay:false
      });
    }catch(e){
      failed[file]=true;delete cache[file];
      console.error('[VOICE] create failed '+file+': '+(e&&e.message||e));
    }
  }
  root.BattleVoiceScheduler={enqueue:enqueue};
  console.log('[VOICE] corrected runtime active');
})(typeof window!=='undefined'?window:globalThis);
