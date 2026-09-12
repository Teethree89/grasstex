/* Battle sim orchestrator: builds a small rolling-terrain field (the same landscape formula
   terrain-demo.js uses, at a scale that suits a battle instead of a grass-density demo),
   spawns five 10-soldier squads per side (see squad-ai.js COMPOSITION) on opposite edges,
   and runs the render/AI loop that drives them into each other. battle_sim.html owns the
   engine/scene/camera/lights and the HUD markup; this file owns everything that happens
   once those exist.

   Load order: soldier.js, weapons.js, squad-ai.js, then this file. */
(function(root){
  'use strict';
  if(typeof BABYLON==='undefined')return;

  var FIELD_W=360,FIELD_D=280,SPAWN_Z=110;
  var LANES=[-140,-70,0,70,140]; // one squad per lane, mirrored on both spawn edges
  var AI_TICK=0.15,DEFAULT_TIME_LIMIT=420; // seconds of sim time before the timer decides it

  /* Same shape of formula as terrain-demo.js's landscapeHeight, retuned for a field a third
     the size: gentle enough that a rifleman never disappears entirely, pronounced enough
     that hasLineOfSight in squad-ai.js has hills worth blocking. This is the ANALYTIC
     surface - see the sampleAt/gridH note below for why nothing should call this directly
     once the mesh exists. */
  function landscapeHeight(x,z){
    return Math.sin(x*.018)*2.4+Math.cos(z*.021)*1.8+Math.sin((x+z)*.015)*1.1+Math.sin(x*.05-z*.04)*.5;
  }

  /* terrain-demo.js's README already documents this exact bug class: the analytic surface
     and the flat-triangle mesh the GPU actually draws are not the same surface, so placing
     soldiers/obstacles at landscapeHeight(x,z) puts them on ground that isn't the ground
     being rendered - which is what read as soldiers sinking into (or floating above) the
     field. Once the mesh is built, gridH holds its vertex heights and sampleAt interpolates
     the SAME triangle the GPU rasterizes, exactly like terrain-demo.js's sampleAt; before
     that (there's a chicken-and-egg problem building the first mesh) it falls back to the
     analytic surface, same as terrain-demo.js's sampleAnalytic fallback. */
  var SUB_X=100,SUB_Z=78,GRIDX=SUB_X+1,GRIDZ=SUB_Z+1,gridH=null;
  function sampleAt(x,z){
    if(!gridH)return landscapeHeight(x,z);
    var cellW=FIELD_W/SUB_X,cellD=FIELD_D/SUB_Z;
    // CreateGround: x rises with col (0..SUB_X), z FALLS with row (0..SUB_Z) - row 0 sits at
    // +FIELD_D/2, the last row at -FIELD_D/2. Vertex index = col + row*GRIDX.
    var fcol=(x+FIELD_W/2)/cellW,i=Math.floor(fcol),u=fcol-i;
    var frow=(FIELD_D/2-z)/cellD,j=Math.floor(frow),v=frow-j;
    if(i<0||j<0||i>=SUB_X||j>=SUB_Z)return landscapeHeight(x,z); // off the mesh entirely
    var k=i+j*GRIDX,hC=gridH[k],hB=gridH[k+1],hD=gridH[k+GRIDX],hA=gridH[k+GRIDX+1];
    // Same (A,B,C)/(D,A,C) triangle split CreateGround itself uses, so this indexes exactly
    // the triangle the GPU rasterizes rather than merely something close to it.
    if(u>=v)return hC+u*(hB-hC)+v*(hA-hB);
    return hC+v*(hD-hC)+u*(hA-hD);
  }

  function buildTerrain(scene){
    // subdivisionsX/subdivisionsY, NOT a {w,h} subdivisions object - that shape belongs to
    // CreateTiledGround. CreateGround silently took it as a bad numeric subdivisions value
    // and built a 1-vertex, 0-index mesh: no ground at all, just the scene's clear color
    // showing through everywhere - which is what "no terrain" actually was.
    var ground=BABYLON.MeshBuilder.CreateGround('battleField',{width:FIELD_W,height:FIELD_D,subdivisionsX:SUB_X,subdivisionsY:SUB_Z},scene);
    var pos=ground.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    gridH=new Float32Array(GRIDX*GRIDZ);
    for(var i=0;i<pos.length;i+=3){
      var h=landscapeHeight(pos[i],pos[i+2]);
      pos[i+1]=h;gridH[i/3]=h;
    }
    ground.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos);
    var normals=[];BABYLON.VertexData.ComputeNormals(pos,ground.getIndices(),normals);
    ground.updateVerticesData(BABYLON.VertexBuffer.NormalKind,normals);
    var mat=new BABYLON.StandardMaterial('battleFieldMat',scene);
    mat.specularColor=BABYLON.Color3.Black();
    /* Reuses the grass demo's own ground texture (test.ivandpopov.com/grasstex/Assets/) -
       it's dirt rather than grass, but that's exactly what terrain-demo.js tiles under its
       own grass blades too; a muted olive tint over it reads as a churned battlefield rather
       than a bare dirt lot, and it's the one ground texture already proven to work here. */
    var dirt=new BABYLON.Texture('https://test.ivandpopov.com/grasstex/Assets/dirttex.png',scene,false,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    dirt.wrapU=dirt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
    dirt.uScale=FIELD_W/9;dirt.vScale=FIELD_D/9;
    dirt.anisotropicFilteringLevel=4;
    mat.diffuseTexture=dirt;mat.diffuseColor=new BABYLON.Color3(.62,.72,.48);
    ground.material=mat;ground.receiveShadows=true;ground.isPickable=false;
    return ground;
  }

  /* Equirectangular sky dome, lifted from grass-realism.js as-is (same shader, same asset) -
     the battle sim doesn't load that file (it doesn't want the grass shaders that come with
     it), so this just takes the one piece of it that's purely "what does the horizon look
     like" and has nothing to do with grass. */
  function buildSky(scene){
    var SKY_RADIUS=500,SKY_OFFSET_UV=.110;
    BABYLON.Effect.ShadersStore.battleSkyDomeVertexShader='precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDir;void main(){vDir=position;gl_Position=worldViewProjection*vec4(position,1.0);}';
    BABYLON.Effect.ShadersStore.battleSkyDomeFragmentShader='precision highp float;varying vec3 vDir;uniform sampler2D skyTexture;void main(){vec3 d=normalize(vDir);float lon=atan(d.z,d.x);float lat=acos(clamp(d.y,-1.0,1.0));float s=lon/(2.0*3.14159265359)+0.5;float t=lat/3.14159265359;gl_FragColor=vec4(texture2D(skyTexture,vec2(s,t)).rgb,1.0);}';
    var sky=BABYLON.MeshBuilder.CreateSphere('battleSkyDome',{diameter:SKY_RADIUS*2,segments:24},scene);
    sky.infiniteDistance=true;sky.isPickable=false;sky.applyFog=false;
    var skyMat=new BABYLON.ShaderMaterial('battleSkyDomeMat',scene,{vertex:'battleSkyDome',fragment:'battleSkyDome'},{attributes:['position'],uniforms:['worldViewProjection'],samplers:['skyTexture']});
    skyMat.backFaceCulling=false;skyMat.disableDepthWrite=true;
    skyMat.setTexture('skyTexture',new BABYLON.Texture('https://test.ivandpopov.com/grasstex/Assets/skytex.png',scene,false,false,BABYLON.Texture.BILINEAR_SAMPLINGMODE));
    sky.material=skyMat;
    // Same physical vertical offset trick as grass-realism.js's setSkyPhysicalOffset, just
    // applied once rather than kept adjustable - this field doesn't have a quality panel.
    sky.position.y=SKY_RADIUS*Math.sin(Math.PI*SKY_OFFSET_UV);
    return sky;
  }

  // ---------- transient combat FX: cheap, disposed almost immediately ----------
  var flashMat=null,tracerMat=null;
  function fx(scene){
    if(!flashMat){flashMat=new BABYLON.StandardMaterial('muzzleFlashMat',scene);flashMat.emissiveColor=new BABYLON.Color3(1,.85,.4);flashMat.disableLighting=true;}
    if(!tracerMat){tracerMat=new BABYLON.StandardMaterial('tracerMat',scene);tracerMat.emissiveColor=new BABYLON.Color3(1,.95,.7);tracerMat.disableLighting=true;}
  }
  function spawnMuzzleFlash(scene,pos){
    fx(scene);
    var m=BABYLON.MeshBuilder.CreateSphere('flash',{diameter:.22,segments:4},scene);
    m.position.copyFrom(pos);m.material=flashMat;m.isPickable=false;
    setTimeout(function(){m.dispose();},60);
  }
  function spawnTracer(scene,from,to){
    fx(scene);
    var l=BABYLON.MeshBuilder.CreateLines('tracer',{points:[from,to]},scene);
    l.color=new BABYLON.Color3(1,.95,.7);l.isPickable=false;
    setTimeout(function(){l.dispose();},90);
  }
  function muzzleWorld(soldier){
    var w=soldier.weapon,local=BABYLON.Vector3.FromArray(w.muzzleLocal);
    return BABYLON.Vector3.TransformCoordinates(local,w.mesh.getWorldMatrix());
  }

  /* Gunfire audio: a handful of soldiers can fire in the same AI tick, and a fresh
     BABYLON.Sound per shot would mean constant node churn for a fight that never really
     stops. Instead each weapon kind gets a small round-robin pool of pre-created, positional
     Sounds (see ROLES/weapons.js for which kind each role carries) - a shot just repositions
     and replays the next idle-ish voice rather than allocating one. That caps how many
     overlapping shots of one weapon kind you'll ever hear at once (POOL_SIZE) instead of
     however many soldiers happen to fire in the same instant, which reads as "a battle" more
     than "every rifle in the field clipping together" would anyway. */
  var POOL_SIZE=6,SFX_FILES={rifle:'rifle.mp3',carbine:'carbine.mp3',lmg:'lmg.mp3',pistol:'pistol.mp3'};
  function buildWeaponAudio(scene,audioBase){
    var pools={},cursors={};
    Object.keys(SFX_FILES).forEach(function(kind){
      var voices=[];
      for(var i=0;i<POOL_SIZE;i++){
        voices.push(new BABYLON.Sound(kind+'Sfx'+i,audioBase+SFX_FILES[kind],scene,null,{
          spatialSound:true,distanceModel:'linear',maxDistance:260,rolloffFactor:1,volume:.5,autoplay:false
        }));
      }
      pools[kind]=voices;cursors[kind]=0;
    });
    return {
      play:function(kind,position){
        var voices=pools[kind];if(!voices)return;
        var voice=voices[cursors[kind]];cursors[kind]=(cursors[kind]+1)%voices.length;
        try{voice.setPosition(position);voice.play();}catch(_){/* audio context not unlocked yet */}
      }
    };
  }

  function makeFaction(){return {alive:0,kills:0,squads:[]};}

  function BattleSim(scene,opts){
    opts=opts||{};
    this.scene=scene;
    this.heightAt=sampleAt;
    // Plain {x,z,radius,cover} circles from terrain-features.js - squad-ai.js reads this
    // directly (battle.obstacles) for LOS blocking and cover, so an empty array here just
    // means an open field rather than a special case anywhere else.
    this.obstacles=opts.obstacles||[];
    this.time=0;this.timeScale=opts.timeScale||1.5;this.timeLimit=opts.timeLimit||DEFAULT_TIME_LIMIT;
    this.paused=false;this.winner=null;
    this.factions={us:makeFaction(),ge:makeFaction()};
    this._roster={us:[],ge:[]};
    this._aiAccum=0;
    this._disposables=[];
    this.onFire=null;this.onShot=null;this.onWinner=opts.onWinner||null;this.onUpdate=opts.onUpdate||null;
    var self=this;
    this._renderObserver=scene.onBeforeRenderObservable.add(function(){self._frame();});
    this.spawnAll();
  }

  BattleSim.prototype.rosterOf=function(faction){return this._roster[faction];};

  BattleSim.prototype.killSoldier=function(soldier,killer){
    if(soldier.dead)return;
    BattleSoldierModel.kill(soldier);
    soldier.hp=0;soldier.target=null;
    this.factions[soldier.faction].alive--;
    if(killer)this.factions[killer.faction].kills++;
    if(soldier.role==='captain'){soldier.squad.captainAlive=false;soldier.squad.accuracyMultiplier=0.8;}
  };

  BattleSim.prototype.spawnAll=function(){
    var scene=this.scene;
    this.factions={us:makeFaction(),ge:makeFaction()};
    this._roster={us:[],ge:[]};
    this.time=0;this.winner=null;
    var nextId=0;
    var self=this;
    function spawnSide(faction,z,facingObjectiveZ){
      for(var li=0;li<LANES.length;li++){
        var laneX=LANES[li];
        var home={x:laneX,z:z},objective={x:laneX,z:facingObjectiveZ};
        var squad=SquadAI.createSquad(faction+'-'+li,faction,home,objective);
        for(var si=0;si<SquadAI.COMPOSITION.length;si++){
          var role=SquadAI.COMPOSITION[si];
          var jitterX=laneX+(Math.random()-.5)*8,jitterZ=z+(Math.random()-.5)*6;
          var parent=null; // world space; soldier.js's TransformNode is enough on its own
          var model=BattleSoldierModel.createSoldier(scene,faction,role,parent);
          model.root.position.set(jitterX,sampleAt(jitterX,jitterZ),jitterZ);
          model.root.rotation.y=facingObjectiveZ>z?0:Math.PI;
          var weapon=BattleWeapons.attachWeapon(scene,model.weaponSocket,SquadAI.ROLES[role].weapon);
          var soldier=SquadAI.createSoldier({id:nextId++,faction:faction,role:role,squad:squad,slotIndex:si,model:model,weapon:weapon});
          squad.members.push(soldier);
          self._roster[faction].push(soldier);
          self.factions[faction].alive++;
        }
        self.factions[faction].squads.push(squad);
      }
    }
    spawnSide('us',-SPAWN_Z,SPAWN_Z);
    spawnSide('ge',SPAWN_Z,-SPAWN_Z);
  };

  BattleSim.prototype.restart=function(){
    var all=this._roster.us.concat(this._roster.ge);
    for(var i=0;i<all.length;i++)all[i].root.dispose();
    this.spawnAll();
  };

  BattleSim.prototype.setTimeScale=function(v){this.timeScale=Math.max(0,+v||0);};
  BattleSim.prototype.pause=function(){this.paused=true;};
  BattleSim.prototype.resume=function(){this.paused=false;};

  /* Not pathfinding - just enough local steering that a soldier heading straight at a tree
     trunk or a hedge segment nudges sideways around it instead of clipping through. Looks a
     short distance ahead along the current travel direction; any obstacle whose footprint
     that lookahead point would land inside adds a push directly away from that obstacle's
     center, and all such pushes get blended into the desired direction before it's applied.
     Sparse, roughly-circular obstacles is exactly what this handles well; it will still walk
     a soldier into a corner between two obstacles that fully box a destination in. */
  var AVOID_LOOKAHEAD=1.8,AVOID_MARGIN=.5;
  function steerAroundObstacles(obstacles,x,z,dirx,dirz){
    if(!obstacles||!obstacles.length)return null;
    var lookX=x+dirx*AVOID_LOOKAHEAD,lookZ=z+dirz*AVOID_LOOKAHEAD,pushX=0,pushZ=0,any=false;
    for(var i=0;i<obstacles.length;i++){
      var ob=obstacles[i],dxo=lookX-ob.x,dzo=lookZ-ob.z,r=ob.radius+AVOID_MARGIN,dSq=dxo*dxo+dzo*dzo;
      if(dSq>=r*r)continue;
      any=true;
      var dist=Math.sqrt(dSq)||.001;
      pushX+=dxo/dist;pushZ+=dzo/dist;
    }
    if(!any)return null;
    var nx=dirx+pushX*.9,nz=dirz+pushZ*.9,len=Math.hypot(nx,nz);
    return len>1e-4?{x:nx/len,z:nz/len}:null;
  }

  function stepMovement(self,soldier,dt){
    if(soldier.dead)return;
    soldier.fireCooldown=Math.max(0,soldier.fireCooldown-dt);
    var dx=soldier.destination.x-soldier.root.position.x,dz=soldier.destination.z-soldier.root.position.z,d=Math.hypot(dx,dz);
    var wantCrouch=(soldier.suppressedUntil>self.time)||(!!soldier.target&&d<=.6);
    if(d>.6){
      var spd=soldier.speed*(wantCrouch?.55:1),step=Math.min(d,spd*dt);
      var dirx=dx/d,dirz=dz/d;
      var steered=steerAroundObstacles(self.obstacles,soldier.root.position.x,soldier.root.position.z,dirx,dirz);
      if(steered){dirx=steered.x;dirz=steered.z;}
      var nx=soldier.root.position.x+dirx*step,nz=soldier.root.position.z+dirz*step;
      soldier.root.position.x=nx;soldier.root.position.z=nz;soldier.root.position.y=self.heightAt(nx,nz);
      soldier.root.rotation.y=Math.atan2(dx,dz); // face the destination, not the swerve
      soldier.moving=true;
    }else{
      soldier.moving=false;
      if(soldier.target){
        var tx=soldier.target.root.position.x-soldier.root.position.x,tz=soldier.target.root.position.z-soldier.root.position.z;
        if(Math.abs(tx)+Math.abs(tz)>1e-4)soldier.root.rotation.y=Math.atan2(tx,tz);
      }
    }
    if(wantCrouch!==soldier.crouching){soldier.crouching=wantCrouch;BattleSoldierModel.setCrouch(soldier,wantCrouch);}
    BattleSoldierModel.animateWalk(soldier,dt,soldier.moving?(soldier.crouching?.5:1):0);
  }

  BattleSim.prototype._frame=function(){
    if(this.paused||this.winner)return;
    var dt=this.scene.getEngine().getDeltaTime()/1000*this.timeScale;
    if(!(dt>0)||dt>0.25)dt=Math.min(dt||0,0.25); // clamp huge dt after a tab-away stall
    this.time+=dt;
    var all=this._roster.us,ge=this._roster.ge,i;
    for(i=0;i<all.length;i++)stepMovement(this,all[i],dt);
    for(i=0;i<ge.length;i++)stepMovement(this,ge[i],dt);

    this._aiAccum+=dt;
    if(this._aiAccum>=AI_TICK){
      this._aiAccum-=AI_TICK;
      var f=this.factions,squadsUs=f.us.squads,squadsGe=f.ge.squads,s;
      for(i=0;i<squadsUs.length;i++)SquadAI.updateSquad(squadsUs[i]);
      for(i=0;i<squadsGe.length;i++)SquadAI.updateSquad(squadsGe[i]);
      for(i=0;i<all.length;i++)SquadAI.updateSoldier(all[i],this);
      for(i=0;i<ge.length;i++)SquadAI.updateSoldier(ge[i],this);
      this._checkWinner();
      if(this.onUpdate)this.onUpdate(this);
    }
  };

  BattleSim.prototype._checkWinner=function(){
    if(this.winner)return;
    var us=this.factions.us.alive,ge=this.factions.ge.alive;
    var timeUp=this.time>=this.timeLimit;
    if(us<=0||ge<=0||timeUp){
      this.winner=us===ge?'draw':(us>ge?'us':'ge');
      if(this.onWinner)this.onWinner(this.winner,this);
    }
  };

  // Fire/shot hooks used by squad-ai.js's resolveFire/tryFire, wired here so squad-ai.js
  // stays Babylon-free: it calls battle.onFire/onShot, this is where those become meshes
  // and sounds.
  BattleSim.prototype._wireFx=function(audioBase){
    var self=this,audio=buildWeaponAudio(this.scene,audioBase||'audio/');
    this.onFire=function(soldier){
      var pos=muzzleWorld(soldier);
      spawnMuzzleFlash(self.scene,pos);
      audio.play(soldier.weapon.kind,pos);
    };
    this.onShot=function(shooter,target,hit){
      if(!hit)return;
      spawnTracer(self.scene,muzzleWorld(shooter),target.root.position.add(new BABYLON.Vector3(0,1.2,0)));
    };
  };

  function start(scene,opts){
    opts=opts||{};
    var sim=new BattleSim(scene,opts);
    sim._wireFx(opts.audioBase);
    return sim;
  }

  root.BattleSim={FIELD_W:FIELD_W,FIELD_D:FIELD_D,heightAt:sampleAt,buildTerrain:buildTerrain,buildSky:buildSky,start:start};
})(typeof window!=='undefined'?window:globalThis);
