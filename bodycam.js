/* v16 bodycam-style camera layer */
(function(){
  if(typeof BABYLON==='undefined'||typeof camera==='undefined'||typeof scene==='undefined'||typeof engine==='undefined')return;

  camera.fov=BABYLON.Tools.ToRadians(90);
  camera.inertia=.82;
  camera.angularSensibility=5200;
  camera.speed=.34;

  var ipc=scene.imageProcessingConfiguration;
  if(ipc){
    ipc.vignetteEnabled=true;
    ipc.vignetteWeight=1.15;
    ipc.vignetteStretch=.22;
  }

  var lastX=camera.position.x,lastZ=camera.position.z,lastYaw=camera.rotation.y;
  var stepPhase=0,roll=0,moveBlend=0;

  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);
    if(!dt)return;

    var dx=camera.position.x-lastX,dz=camera.position.z-lastZ;
    var planarSpeed=Math.sqrt(dx*dx+dz*dz)/dt;
    lastX=camera.position.x;lastZ=camera.position.z;

    var moving=planarSpeed>.18?1:0;
    moveBlend+=((moving?1:0)-moveBlend)*Math.min(1,dt*7);

    stepPhase+=dt*(6.8+Math.min(planarSpeed,5)*.55)*moveBlend;
    var impact=Math.pow(Math.max(0,Math.sin(stepPhase)),7);
    var bob=Math.sin(stepPhase*2)*.012*moveBlend-impact*.020*moveBlend;
    var breathe=Math.sin(performance.now()*.00135)*.004*(1-moveBlend*.65);
    camera.position.y=1.9+bob+breathe;

    var yaw=camera.rotation.y;
    var dyaw=yaw-lastYaw;
    while(dyaw>Math.PI)dyaw-=Math.PI*2;
    while(dyaw<-Math.PI)dyaw+=Math.PI*2;
    lastYaw=yaw;
    var targetRoll=BABYLON.Scalar.Clamp(-dyaw/Math.max(dt,.001)*.010,-.035,.035);
    roll+=(targetRoll-roll)*Math.min(1,dt*9);
    camera.rotation.z=roll+Math.sin(stepPhase)*.006*moveBlend;

    var targetFov=BABYLON.Tools.ToRadians(90)+(moveBlend*.020);
    camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*4);
  });
})();
