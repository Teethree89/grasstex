/* Stable per-soldier voice variation.
   Pitch variants are pre-rendered during deployment so playback duration/speech speed stays unchanged.
   Social chatter and tactical speech use separate throttle lanes: a captain/contact call can speak
   over a story instead of being discarded because somebody was joking half a second earlier. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined'||typeof window==='undefined')return;

  var cache={},failed={},lastSocialGlobal=0,socialSquadLast={},lastTacticalGlobal=0,tacticalSquadLast={};
  var SOCIAL={idleQuip:true,idleStory:true,idleLaugh:true,idleGroan:true};

  function hashString(value){
    var s=String(value),h=2166136261>>>0;
    for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function cameraPos(cam){return cam&&(cam.globalPosition||cam.position)||null;}
  function distance(a,b){if(!a||!b)return 0;var dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
  function profiles(manifest){
    var v=manifest&&manifest.rules&&manifest.rules.voice&&manifest.rules.voice.variation;
    return v&&Array.isArray(v.profiles)&&v.profiles.length?v.profiles:[{id:'neutral',semitones:0,suffix:'',weight:1}];
  }
  function profileFor(soldier,manifest){
    if(soldier._voicePitchProfile)return soldier._voicePitchProfile;
    var list=profiles(manifest),total=0,i;
    for(i=0;i<list.length;i++)total+=Math.max(0,+list[i].weight||0);
    if(total<=0){soldier._voicePitchProfile=list[0];return list[0];}
    var key=[soldier.faction,soldier.id,soldier.role,soldier.squad&&soldier.squad.id].join('|');
    var roll=(hashString(key)/4294967296)*total,acc=0,p=list[list.length-1];
    for(i=0;i<list.length;i++){acc+=Math.max(0,+list[i].weight||0);if(roll<acc){p=list[i];break;}}
    soldier._voicePitchProfile=p;
    console.log('[VOICE] '+soldier.id+' profile '+p.id+' ('+(+p.semitones||0)+' st)');
    return p;
  }
  function variantPath(file,profile){
    var suffix=profile&&profile.suffix||'';
    if(!suffix)return file;
    var dot=file.lastIndexOf('.');
    return dot>=0?file.slice(0,dot)+suffix+file.slice(dot):file+suffix;
  }
  function playAt(entry,soldier){
    try{
      var p=soldier.root.position.clone?soldier.root.position.clone():soldier.root.position;
      entry.sound.setPosition(p);
      entry.sound.play();
      console.log('[VOICE] play '+entry.file+' profile='+(entry.profileId||'neutral'));
    }catch(e){console.error('[VOICE] play failed '+entry.file+': '+(e&&e.message||e));}
  }
  function enqueue(soldier,type,cam){
    var m=window.BATTLE_AUDIO_MANIFEST;
    if(!m||!m.callouts||!m.callouts[soldier.faction]){console.warn('[VOICE] manifest/event map unavailable');return;}
    var events=m.callouts[soldier.faction].events||{},files=events[type];
    if(!files||!files.length){console.warn('[VOICE] no event '+soldier.faction+'/'+type);return;}
    var rules=m.rules&&m.rules.voice||{},now=performance.now(),social=!!SOCIAL[type];
    var socialGlobalGap=700,socialSquadGap=(rules.perSquadCooldownSeconds||2.5)*1000;
    /* Tactical calls have their own lane. They can overlap an anecdote, but still get a small
       anti-cacophony gap so twelve soldiers do not shout CONTACT on the exact same frame. */
    var tacticalGlobalGap=220,tacticalSquadGap=480;
    var cp=cameraPos(cam),drop=rules.dropBeyondDistance||120;
    if(cp&&distance(cp,soldier.root.position)>drop)return;
    var squadId=soldier.squad&&soldier.squad.id||soldier.faction;
    if(social){
      if(now-lastSocialGlobal<socialGlobalGap)return;
      if(now-(socialSquadLast[squadId]||0)<socialSquadGap)return;
    }else{
      if(now-lastTacticalGlobal<tacticalGlobalGap)return;
      if(now-(tacticalSquadLast[squadId]||0)<tacticalSquadGap)return;
    }

    var baseFile=files[Math.floor(Math.random()*files.length)],profile=profileFor(soldier,m),file=variantPath(baseFile,profile);
    if(failed[file])return;
    if(social){lastSocialGlobal=now;socialSquadLast[squadId]=now;}
    else{lastTacticalGlobal=now;tacticalSquadLast[squadId]=now;}
    var entry=cache[file];
    if(entry){
      if(entry.ready)playAt(entry,soldier);
      else{entry.pendingSoldier=soldier;console.log('[VOICE] waiting '+file);}
      return;
    }

    var base=window.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
    var url=base+file;
    console.log('[VOICE] request '+url+' profile='+(profile.id||'neutral'));
    entry=cache[file]={file:file,baseFile:baseFile,profileId:profile.id||'neutral',sound:null,ready:false,pendingSoldier:soldier};
    try{
      var scene=soldier.root.getScene();
      entry.sound=new BABYLON.Sound('voice-'+file,url,scene,function(){
        entry.ready=true;
        console.log('[VOICE] ready '+file);
        if(entry.pendingSoldier){var s=entry.pendingSoldier;entry.pendingSoldier=null;playAt(entry,s);}
      },{
        spatialSound:true,
        distanceModel:'linear',
        maxDistance:(m.runtime&&m.runtime.voiceMaxDistance)||95,
        rolloffFactor:1.7,
        volume:.24,
        autoplay:false
      });
    }catch(e){
      failed[file]=true;delete cache[file];
      console.error('[VOICE] create failed '+file+': '+(e&&e.message||e));
    }
  }

  root.BattleVoiceScheduler={enqueue:enqueue,profileFor:profileFor,variantPath:variantPath};
  console.log('[VOICE] v4 stable pitch profiles + tactical-over-social priority active');
})(typeof window!=='undefined'?window:globalThis);
