/* Battlefield acoustics runtime.
   One Babylon world unit is treated as approximately one metre.
   We preserve real propagation timing (343 m/s reference), source-class ranges and
   physically motivated geometric spreading, then compress the enormous real-world
   dynamic range into a safe mobile-speaker game mix. */
(function(root){
  'use strict';
  if(typeof window==='undefined'||typeof BABYLON==='undefined')return;

  var SPEED_OF_SOUND=343;
  var cfg={
    voiceShout:{sourceDb:84,cull:150,maxGain:.28,exponent:.45},
    smallArms:{sourceDb:160,cull:1200,maxGain:.20,exponent:.36}
  };
  root.BATTLE_ACOUSTICS=root.BATTLE_ACOUSTICS||{speedOfSoundMps:SPEED_OF_SOUND,profiles:cfg};

  /* Load the machine-readable spec when the mirrored hosted copy is available. Runtime has
     safe defaults above so an asset-sync delay never blocks the battle. */
  try{
    var base=root.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
    fetch(base+'acoustics.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      if(j){root.BATTLE_ACOUSTICS_SPEC=j;if(j.speedOfSoundMps)SPEED_OF_SOUND=+j.speedOfSoundMps||343;console.log('[ACOUSTICS] spec loaded; c='+SPEED_OF_SOUND+'m/s');}
    }).catch(function(){});
  }catch(_){}

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function cameraPos(cam){return cam&&(cam.globalPosition||cam.position)||null;}
  function distance(a,b){if(!a||!b)return 0;var dx=a.x-b.x,dy=(a.y||0)-(b.y||0),dz=a.z-b.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
  function copyPos(p){return p&&p.clone?p.clone():{x:p.x,y:p.y||0,z:p.z};}
  function arrivalDelayMs(d){return Math.max(0,d)/SPEED_OF_SOUND*1000;}

  /* Real free-field pressure falls as 1/r (6 dB per distance doubling). Reproducing that
     literally alongside a 160 dB firearm and an 84 dB shout is impossible on a phone, so
     we apply a documented dynamic-range compression exponent after physical classification.
     The relative ordering/range and travel time remain physically meaningful. */
  function compressedGain(profile,d){
    d=Math.max(1,d);
    return profile.maxGain*Math.pow(d,-profile.exponent);
  }

  /* Gun sounds created by battle-sim.js used a short linear maxDistance from the earlier
     performance pass. Expand only combat SFX before pools are constructed; the scheduler
     below performs the actual level/culling logic. */
  if(!root.__battleAcousticSoundWrapped){
    root.__battleAcousticSoundWrapped=true;
    var OriginalSound=BABYLON.Sound;
    function AcousticSound(name,url,scene,ready,options,error){
      options=options?Object.assign({},options):{};
      if(/Sfx\d+$/.test(String(name||''))){options.maxDistance=1200;options.rolloffFactor=.15;options.distanceModel='linear';}
      if(/^voice-/.test(String(name||''))){options.maxDistance=150;options.rolloffFactor=.7;options.distanceModel='linear';}
      return new OriginalSound(name,url,scene,ready,options,error);
    }
    AcousticSound.prototype=OriginalSound.prototype;
    try{Object.getOwnPropertyNames(OriginalSound).forEach(function(k){if(k==='prototype'||k==='name'||k==='length')return;try{AcousticSound[k]=OriginalSound[k];}catch(_){}});}catch(_){}
    BABYLON.Sound=AcousticSound;
  }

  root.BattleAudioScheduler=(function(){
    var q=[],running=false,recentFar={};
    var MAX_PER_FRAME=2,MAX_QUEUE=18;
    function push(e){
      if(q.length>=MAX_QUEUE){var idx=q.findIndex?q.findIndex(function(x){return x.echo;}):-1;if(idx>=0)q.splice(idx,1);else q.shift();}
      q.push(e);
      if(!running){running=true;requestAnimationFrame(drain);}
    }
    function enqueue(audio,kind,pos,cam){
      var cp=cameraPos(cam),d=distance(cp,pos),p=cfg.smallArms,now=performance.now();
      if(d>p.cull)return;
      /* Far volleys remain audible, but do not instantiate every single coincident rifle. */
      if(d>260&&Math.random()<.55)return;
      if(d>140){var last=recentFar[kind]||0;if(now-last<45)return;recentFar[kind]=now;}
      var gain=compressedGain(p,d);
      var due=now+arrivalDelayMs(d)+Math.random()*8;
      push({audio:audio,kind:kind,pos:copyPos(pos),gain:gain,due:due,echo:false});

      /* Sparse terrain/building reflection proxy. Reflection arrives after the direct wave,
         grows more likely with distance, and is much quieter. No fake pitch shift: air
         absorption should remove highs, not transpose the gunshot. */
      if(d>55&&Math.random()<(d>180?.23:.11)){
        var extra=90+Math.min(420,d*.55)+Math.random()*85;
        push({audio:audio,kind:kind,pos:copyPos(pos),gain:gain*(d>180?.14:.09),due:due+extra,echo:true});
      }
    }
    function drain(){
      var now=performance.now(),started=0,remain=[];
      for(var i=0;i<q.length;i++){
        var e=q[i];
        if(started<MAX_PER_FRAME&&e.due<=now){try{e.audio.play(e.kind,e.pos,e.gain,1);}catch(_){}started++;}
        else remain.push(e);
      }
      q=remain;if(q.length)requestAnimationFrame(drain);else running=false;
    }
    return {enqueue:enqueue,get queued(){return q.length;}};
  })();

  root.BattleVoiceScheduler=(function(){
    var cache={},failed={},q=[],running=false,lastGlobal=0,squadLast={};
    function ensure(file,soldier){
      if(cache[file]||failed[file])return cache[file]||null;
      var entry=cache[file]={file:file,sound:null,ready:false};
      try{
        var scene=soldier.root.getScene(),base=root.BATTLE_AUDIO_BASE||'https://test.ivandpopov.com/grasstex/Assets/audio/';
        console.log('[VOICE] request '+base+file);
        entry.sound=new BABYLON.Sound('voice-'+file,base+file,scene,function(){entry.ready=true;console.log('[VOICE] ready '+file);},{spatialSound:true,distanceModel:'linear',maxDistance:150,rolloffFactor:.7,volume:.28,autoplay:false});
      }catch(e){failed[file]=true;delete cache[file];console.error('[VOICE] create failed '+file+': '+(e&&e.message||e));return null;}
      return entry;
    }
    function enqueue(soldier,type,cam){
      var m=root.BATTLE_AUDIO_MANIFEST;if(!m||!m.callouts||!m.callouts[soldier.faction])return;
      var files=(m.callouts[soldier.faction].events||{})[type];if(!files||!files.length)return;
      var now=performance.now(),rules=m.rules&&m.rules.voice||{},squadGap=(rules.perSquadCooldownSeconds||2.5)*1000;
      if(now-lastGlobal<700)return;
      var sid=soldier.squad&&soldier.squad.id||soldier.faction;if(now-(squadLast[sid]||0)<squadGap)return;
      var pos=copyPos(soldier.root.position),d=distance(cameraPos(cam),pos),p=cfg.voiceShout;
      if(d>p.cull)return;
      var file=files[Math.floor(Math.random()*files.length)],entry=ensure(file,soldier);if(!entry)return;
      lastGlobal=now;squadLast[sid]=now;
      q.push({entry:entry,file:file,pos:pos,gain:compressedGain(p,d),due:now+arrivalDelayMs(d)});
      if(!running){running=true;requestAnimationFrame(drain);}
    }
    function drain(){
      var now=performance.now(),remain=[];
      for(var i=0;i<q.length;i++){
        var e=q[i];
        if(e.due<=now&&e.entry.ready){
          try{e.entry.sound.setPosition(e.pos);if(e.entry.sound.setVolume)e.entry.sound.setVolume(e.gain);e.entry.sound.play();console.log('[VOICE] play '+e.file+' gain='+e.gain.toFixed(3));}catch(err){console.error('[VOICE] play failed '+e.file+': '+(err&&err.message||err));}
        }else remain.push(e);
      }
      q=remain;if(q.length)requestAnimationFrame(drain);else running=false;
    }
    return {enqueue:enqueue};
  })();

  console.log('[ACOUSTICS] physical propagation active: voice 150m cull, small arms 1200m cull, delayed at '+SPEED_OF_SOUND+'m/s');
})(typeof window!=='undefined'?window:globalThis);
