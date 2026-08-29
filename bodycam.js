/* v43 cinematic/bodycam realism layer: inertial handheld motion, footsteps, breathing, exposure response, grain, chromatic aberration, and light sharpening */
(function(){
  if(typeof BABYLON==='undefined'||typeof camera==='undefined'||typeof scene==='undefined'||typeof engine==='undefined')return;

  camera.fov=BABYLON.Tools.ToRadians(89);
  camera.inertia=.86;
  camera.angularSensibility=2100;
  camera.speed=.34;

  var ipc=scene.imageProcessingConfiguration;
  if(ipc){
    ipc.vignetteEnabled=true;
    ipc.vignetteWeight=1.08;
    ipc.vignetteStretch=.18;
    ipc.contrast=1.08;
    ipc.exposure=1.02;
  }

  try{
    var grain=new BABYLON.GrainPostProcess('sensorGrain',1.0,camera);
    grain.intensity=7.5;
    grain.animated=true;
  }catch(_){ }
  try{
    var ca=new BABYLON.ChromaticAberrationPostProcess('lensCA',engine.getRenderWidth(),engine.getRenderHeight(),1.0,camera);
    ca.aberrationAmount=6.0;
    ca.radialIntensity=.18;
    ca.direction=new BABYLON.Vector2(.707,.707);
  }catch(_){ }
  try{
    var sharp=new BABYLON.SharpenPostProcess('lensSharpen',1.0,camera);
    sharp.edgeAmount=.12;
    sharp.colorAmount=.98;
  }catch(_){ }

  var lastX=camera.position.x,lastZ=camera.position.z,lastYaw=camera.rotation.y;
  var stepPhase=0,roll=0,moveBlend=0,speedSmooth=0;
  var prevPitchNoise=0,prevYawNoise=0;
  var baseHeight=1.9;

  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);
    if(!dt)return;

    /* Remove last frame's procedural rotation before reading player input. */
    camera.rotation.x-=prevPitchNoise;
    camera.rotation.y-=prevYawNoise;
    prevPitchNoise=prevYawNoise=0;

    var dx=camera.position.x-lastX,dz=camera.position.z-lastZ;
    var planarSpeed=Math.sqrt(dx*dx+dz*dz)/dt;
    lastX=camera.position.x;lastZ=camera.position.z;
    speedSmooth+=(Math.min(planarSpeed,6)-speedSmooth)*Math.min(1,dt*5.5);

    var moving=planarSpeed>.16?1:0;
    moveBlend+=(moving-moveBlend)*Math.min(1,dt*6.5);

    /* Footfalls: asymmetric impact + recovery instead of a perfect sine bob. */
    stepPhase+=dt*(6.2+speedSmooth*.72)*moveBlend;
    var s=Math.sin(stepPhase),impact=Math.pow(Math.max(0,s),9),recover=Math.pow(Math.max(0,-s),5);
    var vertical=(-impact*.020+recover*.007+Math.sin(stepPhase*2.0)*.006)*moveBlend;
    var lateral=Math.sin(stepPhase)*.0055*moveBlend;
    var breathe=Math.sin(performance.now()*.00128)*.0038*(1-moveBlend*.55);
    camera.position.y=baseHeight+vertical+breathe;

    var yaw=camera.rotation.y;
    var dyaw=yaw-lastYaw;
    while(dyaw>Math.PI)dyaw-=Math.PI*2;
    while(dyaw<-Math.PI)dyaw+=Math.PI*2;
    lastYaw=yaw;

    /* Turn inertia plus strafe lean. */
    var rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
    var lateralVel=(dx*rightX+dz*rightZ)/Math.max(dt,.001);
    var targetRoll=BABYLON.Scalar.Clamp(-dyaw/Math.max(dt,.001)*.010-lateralVel*.0038,-.042,.042);
    roll+=(targetRoll-roll)*Math.min(1,dt*8.5);
    camera.rotation.z=roll+lateral;

    /* Very small low-frequency operator/head drift. */
    var now=performance.now()*.001;
    prevPitchNoise=(Math.sin(now*.61)+Math.sin(now*.23+1.7)*.55)*.00145*(1-moveBlend*.32);
    prevYawNoise=(Math.sin(now*.47+2.1)+Math.sin(now*.19)*.45)*.0017*(1-moveBlend*.28);
    camera.rotation.x+=prevPitchNoise;
    camera.rotation.y+=prevYawNoise;

    var targetFov=BABYLON.Tools.ToRadians(89)+(moveBlend*.014)+Math.min(speedSmooth/6,.7)*.006;
    camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*3.8);

    /* Camera auto-exposure: looking into bright sky gently stops the image down. */
    if(ipc){
      var fy=0;
      try{fy=camera.getForwardRay(1).direction.y}catch(_){ }
      var targetExposure=1.035-Math.max(0,fy)*.11+Math.max(0,-fy)*.025;
      ipc.exposure+=(targetExposure-ipc.exposure)*Math.min(1,dt*1.8);
    }
  });
})();
