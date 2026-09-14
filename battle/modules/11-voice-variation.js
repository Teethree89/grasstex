/* Stable per-soldier voice variation.
   Pitch variants are pre-rendered during deployment so playback duration/speech speed stays unchanged.
   Social chatter and tactical speech use separate throttle lanes: a captain/contact call can speak
   over a story instead of being discarded because somebody was joking half a second earlier.

   enqueue() returns a playback handle. Callers may pass {onEnded:function(){...}}; the callback is
   driven by Babylon Sound's actual end observable, not simulation time. That keeps story/reaction
   timing correct at 1x, 4x, 8x, or while the simulation is paused. */
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
  function handleFor(soldier,type,file,opts){return{accepted:true,started:false,ended:false,soldierId:soldier&&soldier.id,type:type,file:file,priority:opts&&opts.priority||null};}
  function finish(req){
    if(!req||!req.handle||req.handle.ended)return;
    req.handle.ended=true;
    if(req.opts&&typeof req.opts.onEnded==='function'){
      try{req.opts.onEnded(req.handle);}catch(e){console.error('[VOICE] onEnded failed '+req.handle.file+': '+(e&&e.message||e));}
    }
  }
  function armEnded(entry,req){
    var o=entry&&entry.sound&&entry.sound.onEndedObservable;
    if(o&&typeof o.addOnce==='function'){o.addOnce(function(){finish(req);});return;}
    if(o&&typeof o.add==='function'){
      var token=o.add(function(){try{o.remove(token);}catch(_){}finish(req);});return;
    }
    /* Current Babylon Sound exposes onEndedObservable. Keep a property fallback for older builds. */
    try{var prior=entry.sound.onended;entry.sound.onended=function(){try{if(typeof prior==='function')prior.apply(this,arguments);}finally{finish(req);}};}catch(_){}
  }
  function playAt(entry,req){
    try{
      var soldier=req.soldier,p=soldier.root.position.clone?soldier.root.position.clone():soldier.root.position;
      entry.sound.setPosition(p);armEnded(entry,req);entry.sound.play();req.handle.started=true;
      console.log('[VOICE] play '+entry.file+' profile='+(entry.profileId||'neutral')+' lane='+req.lane);
    }catch(e){console.error('[VOICE] play failed '+entry.file+': '+(e&&e.message||e));finish(req);}
    return req.handle;
  }
  function enqueue(soldier,type,cam,opts){
    opts=opts||{};
    var m=window.BATTLE_AUDIO_MANIFEST;
    if(!m||!m.callouts||!m.callouts[soldier.faction]){console.warn('[VOICE] manifest/event map unavailable');return false;}
    var events=m.callouts[soldier.faction].events||{},files=events[type];
    if(!files||!files.length){console.warn('[VOICE] no event '+soldier.faction+'/'+type);return false;}
    var rules=m.rules&&m.rules.voice||{},now=performance.now(),lane=opts.priority||(SOCIAL[type]?'social':'tactical'),social=lane==='social';
    var socialGlobalGap=700,socialSquadGap=(rules.perSquadCooldownSeconds||2.5)*1000;
    /* Tactical calls have their own lane. They may overlap social chatter, while still getting a
       small anti-cacophony gap among themselves. */
    var tacticalGlobalGap=220,tacticalSquadGap=480;
    var cp=cameraPos(cam),drop=rules.dropBeyondDistance||120;
    if(cp&&distance(cp,soldier.root.position)>drop)return false;
    var squadId=soldier.squad&&soldier.squad.id||soldier.faction;
    if(social){
      if(now-lastSocialGlobal<socialGlobalGap)return false;
      if(now-(socialSquadLast[squadId]||0)<socialSquadGap)return false;
    }else{
      if(now-lastTacticalGlobal<tacticalGlobalGap)return false;
      if(now-(tacticalSquadLast[squadId]||0)<tacticalSquadGap)return false;
    }

    var baseFile=files[Math.floor(Math.random()*files.length)],profile=profileFor(soldier,m),file=variantPath(baseFile,profile);
    if(failed[file])return false;
    if(social){lastSocialGlobal=now;socialSquadLast[squadId]=now;}
    else{lastTacticalGlobal=now;tacticalSquadLast[squadId]=now;}
    var handle=handleFor(soldier,type,file,opts),req={soldier:soldier,type:type,opts:opts,handle:handle,lane:lane};
    var entry=cache[file];
    if(entry){
      if(entry.ready)return playAt(entry,req);
      entry.pending.push(req);console.log('[VOICE] waiting '+file);return handle;
    }

    var base=window.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
    var url=base+file;
    console.log('[VOICE] request '+url+' profile='+(profile.id||'neutral'));
    entry=cache[file]={file:file,baseFile:baseFile,profileId:profile.id||'neutral',sound:null,ready:false,pending:[req]};
    try{
      var scene=soldier.root.getScene();
      entry.sound=new BABYLON.Sound('voice-'+file,url,scene,function(){
        entry.ready=true;
        console.log('[VOICE] ready '+file);
        var pending=entry.pending.splice(0);for(var i=0;i<pending.length;i++)playAt(entry,pending[i]);
      },{
        spatialSound:true,
        distanceModel:'linear',
        maxDistance:(m.runtime&&m.runtime.voiceMaxDistance)||95,
        rolloffFactor:1.7,
        volume:.24,
        autoplay:false
      });
    }catch(e){
      failed[file]=true;delete cache[file];finish(req);
      console.error('[VOICE] create failed '+file+': '+(e&&e.message||e));return false;
    }
    return handle;
  }

  root.BattleVoiceScheduler={enqueue:enqueue,profileFor:profileFor,variantPath:variantPath};
  console.log('[VOICE] v5 pitch profiles + tactical/social lanes + playback completion active');
})(typeof window!=='undefined'?window:globalThis);
