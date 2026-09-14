/* Small material-specific impact bursts and ground-conforming blood splatters.
   Cosmetic only: consume the ballistic result, never cast another damage ray or draw from the
   battle RNG. Both live bursts and lingering decals have hard budgets and restart cleanup. */
(function(root){
  'use strict';
  if(!root.BattleSim||!root.BattleModules||typeof BABYLON==='undefined'||root.BattleImpactFx)return;
  var B=BABYLON,oldStart=root.BattleSim.start,MAX_BURSTS=28,MAX_DECALS=128,DECAL_LIFE=90;
  var STYLES={
    blood:{color:[.48,.025,.035],count:9,size:.075,power:1.6,life:.42},
    dirt:{color:[.42,.29,.16],count:9,size:.16,power:1.5,life:.55},
    cement:{color:[.65,.63,.58],count:8,size:.12,power:1.7,life:.42},
    metal:{color:[1,.69,.24],count:7,size:.055,power:3.5,life:.25},
    vegetation:{color:[.30,.43,.13],count:8,size:.095,power:1.5,life:.48}
  };
  function material(shot){
    if(shot.stoppedBy==='soldier')return'blood';
    var s=String(shot.surface||'').toLowerCase();
    if(/metal|steel|iron|armou?r|vehicle/.test(s))return'metal';
    if(/hedge|tree|log|wood|bush|grass|leaf|vegetation/.test(s))return'vegetation';
    if(/dirt|earth|soil|ground|sand|mud/.test(s))return'dirt';
    return'cement';
  }
  function randomFor(seed){var n=seed||1;return function(){n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};}
  function groundHeight(sim,x,z){
    var y=sim.heightAt(x,z),scenario=sim.scene.metadata&&sim.scene.metadata.battleScenario,buildings=scenario&&scenario.buildings||[];
    for(var i=0;i<buildings.length;i++){
      var b=buildings[i],dx=x-b.x,dz=z-b.z,c=Math.cos(b.rot||0),s=Math.sin(b.rot||0);
      if(Math.abs(dx*c-dz*s)<b.w/2&&Math.abs(dx*s+dz*c)<b.d/2)y=Math.max(y,sim.heightAt(b.x,b.z)+.08);
    }
    return y;
  }
  function state(sim){return sim._impactFx||(sim._impactFx={bursts:[],decals:[],texture:null,bloodMat:null,serial:0});}
  function texture(sim,st){
    if(st.texture)return st.texture;
    var size=32,data=new Uint8Array(size*size*4);
    for(var y=0;y<size;y++)for(var x=0;x<size;x++){
      var d=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2)),i=(x+y*size)*4;
      data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*Math.pow(Math.max(0,1-d),1.4));
    }
    st.texture=B.RawTexture.CreateRGBATexture(data,size,size,sim.scene,false,false,B.Texture.BILINEAR_SAMPLINGMODE);st.texture.hasAlpha=true;return st.texture;
  }
  function burst(sim,shot,kind,st){
    while(st.bursts.length>=MAX_BURSTS)st.bursts.shift().system.dispose(false);
    var style=STYLES[kind],c=style.color,p=shot.impact,n=shot.normal||{x:0,y:1,z:0};
    var ps=new B.ParticleSystem('impact-'+kind,style.count,sim.scene);
    ps.particleTexture=texture(sim,st);ps.emitter=new B.Vector3(p.x+n.x*.025,p.y+n.y*.025,p.z+n.z*.025);
    ps.minEmitBox=new B.Vector3(-.035,-.025,-.035);ps.maxEmitBox=new B.Vector3(.035,.025,.035);
    ps.direction1=new B.Vector3(n.x-.65,n.y*.65+.15,n.z-.65);ps.direction2=new B.Vector3(n.x+.65,n.y*.65+.9,n.z+.65);
    ps.color1=new B.Color4(c[0],c[1],c[2],.9);ps.color2=new B.Color4(c[0]*.65,c[1]*.65,c[2]*.65,.7);ps.colorDead=new B.Color4(c[0]*.5,c[1]*.5,c[2]*.5,0);
    ps.minSize=style.size*.45;ps.maxSize=style.size;ps.minLifeTime=style.life*.55;ps.maxLifeTime=style.life;
    ps.minEmitPower=style.power*.4;ps.maxEmitPower=style.power;ps.gravity=new B.Vector3(0,kind==='metal'?-8:-4,0);
    ps.blendMode=kind==='metal'?B.ParticleSystem.BLENDMODE_ADD:B.ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate=0;ps.manualEmitCount=style.count;ps.updateSpeed=1/60;ps.start();
    st.bursts.push({system:ps,until:sim.time+style.life+.3});
  }
  function bloodDecal(sim,shot,st){
    while(st.decals.length>=MAX_DECALS)st.decals.shift().mesh.dispose();
    if(!st.bloodMat){
      var mat=st.bloodMat=new B.StandardMaterial('blood-splatter-material',sim.scene);
      mat.diffuseColor=new B.Color3(.38,.012,.019);mat.emissiveColor=new B.Color3(.12,.002,.004);mat.specularColor=B.Color3.Black();mat.alpha=.76;
      mat.backFaceCulling=false;mat.zOffset=-2;
    }
    var rng=randomFor((++st.serial*73856093)^Math.floor(sim.time*1000)),p=shot.impact;
    var positions=[],indices=[],normals=[],cx=p.x+(rng()-.5)*.18,cz=p.z+(rng()-.5)*.18;
    function vertex(x,z){positions.push(x,groundHeight(sim,x,z)+.018,z);}
    // One irregular central mark and a few small droplets, all in a single mesh/draw call.
    for(var blob=0;blob<5;blob++){
      var angle=rng()*Math.PI*2,r=blob?(.12+rng()*.22):0,x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r;
      var radius=blob?(.018+rng()*.025):(.12+rng()*.07),base=positions.length/3,steps=blob?6:14;
      vertex(x,z);
      for(var i=0;i<=steps;i++){
        var a=i/steps*Math.PI*2,rad=radius*(.65+rng()*.5);
        if(i===steps){positions.push(positions[(base+1)*3],positions[(base+1)*3+1],positions[(base+1)*3+2]);}
        else vertex(x+Math.cos(a)*rad,z+Math.sin(a)*rad*.8);
        if(i)indices.push(base,base+i+1,base+i);
      }
    }
    var mesh=new B.Mesh('blood-splatter',sim.scene),data=new B.VertexData();
    B.VertexData.ComputeNormals(positions,indices,normals);data.positions=positions;data.indices=indices;data.normals=normals;data.applyToMesh(mesh);
    mesh.material=st.bloodMat;mesh.isPickable=false;mesh.receiveShadows=true;
    st.decals.push({mesh:mesh,at:sim.time});
  }
  function impact(sim,shot){
    if(!sim||!sim.scene||!shot||!shot.impact||shot.stoppedBy==='range')return;
    if(shot.stoppedBy!=='soldier'&&shot.stoppedBy!=='environment')return;
    var p=shot.impact;if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.z))return;
    var st=state(sim),kind=material(shot);burst(sim,shot,kind,st);
    if(kind==='blood')bloodDecal(sim,shot,st);
  }
  function tick(sim){
    var st=sim&&sim._impactFx;if(!st)return;
    for(var i=st.bursts.length-1;i>=0;i--)if(sim.time>=st.bursts[i].until){st.bursts[i].system.dispose(false);st.bursts.splice(i,1);}
    for(i=st.decals.length-1;i>=0;i--){var d=st.decals[i],age=sim.time-d.at;if(age>=DECAL_LIFE){d.mesh.dispose();st.decals.splice(i,1);}else d.mesh.visibility=Math.min(1,(DECAL_LIFE-age)/12);}
  }
  function clear(sim){
    var st=sim&&sim._impactFx;if(!st)return;
    st.bursts.forEach(function(b){b.system.dispose(false);});st.decals.forEach(function(d){d.mesh.dispose();});
    st.bursts=[];st.decals=[];st.serial=0;
  }
  function install(sim){
    if(!sim||sim._impactFxInstalled)return sim;sim._impactFxInstalled=true;
    var oldShot=sim.onShot;
    sim.onShot=function(shooter,target,hit,d,shot){if(oldShot)oldShot.apply(sim,arguments);impact(sim,shot);};
    // Match visual particle time to the simulation, including pause and fast-forward.
    var observer=sim.scene.onBeforeRenderObservable.add(function(){
      var st=sim._impactFx;if(!st)return;
      var dt=sim.paused||sim.winner?0:Math.min(.25,sim.scene.getEngine().getDeltaTime()/1000*(sim.timeScale||1));
      var speed=dt/Math.max(.001,sim.scene.getAnimationRatio());
      st.bursts.forEach(function(b){b.system.updateSpeed=speed;});
    });
    sim.scene.onDisposeObservable.addOnce(function(){
      clear(sim);sim.scene.onBeforeRenderObservable.remove(observer);var st=sim._impactFx;
      if(st&&st.texture)st.texture.dispose();if(st&&st.bloodMat)st.bloodMat.dispose();delete sim._impactFx;
    });
    return sim;
  }
  root.BattleSim.start=function(scene,opts){return install(oldStart(scene,opts));};
  root.BattleModules.registerSystem('bullet-impact-fx',{version:'1.0',onSimulationStep:tick,beforeBattleRestart:clear});
  root.BattleImpactFx={version:'1.0',install:install,impact:impact,material:material,clear:clear,tick:tick,maxBursts:MAX_BURSTS,maxDecals:MAX_DECALS,decalLife:DECAL_LIFE};
})(typeof window!=='undefined'?window:globalThis);
