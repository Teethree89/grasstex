/* v51 cinematic/bodycam realism layer: inertial handheld motion, footstep impacts with per-step camera kicks,
   breathing, whip motion blur tied to turn speed, auto-exposure with hunting, filmic shadow/highlight grade,
   grain, chromatic aberration, and a light touch of sharpen. v51 keeps the blur shader kernel fixed and changes
   only blur direction magnitude at runtime, avoiding the first-turn shader-recompile flash. */
(function(){
  if(typeof BABYLON==='undefined'||typeof camera==='undefined'||typeof scene==='undefined'||typeof engine==='undefined')return;

  try{
    document.title='Grass Game v51';
    var ui=document.getElementById('ui');
    if(ui){
      var rows=ui.querySelectorAll('.row');
      for(var vr=0;vr<rows.length;vr++)if(rows[vr].textContent.indexOf('Version:')>=0){rows[vr].innerHTML='<strong>Version:</strong> v51';break;}
    }
  }catch(_){ }

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
    try{
      var curves=new BABYLON.ColorCurves();
      curves.globalSaturation=-10;
      curves.shadowsHue=200;curves.shadowsDensity=16;curves.shadowsSaturation=18;
      curves.highlightsHue=35;curves.highlightsDensity=12;curves.highlightsSaturation=16;
      ipc.colorCurvesEnabled=true;ipc.colorCurves=curves;
    }catch(_){ }
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
    sharp.edgeAmount=.05;
    sharp.colorAmount=.45;
  }catch(_){ }

  /* Keep one compiled blur kernel for the entire session. Runtime kernel changes can force a shader
     variant compile on the first whip-pan on mobile Safari, which presents as a one-frame bright flash.
     Direction length is a uniform, so we use it as blur strength instead and never recompile on turns. */
  var blurH=null,blurV=null,blurStrength=0;
  try{
    blurH=new BABYLON.BlurPostProcess('whipBlurH',new BABYLON.Vector2(0,0),12,1,camera);
    blurV=new BABYLON.BlurPostProcess('whipBlurV',new BABYLON.Vector2(0,0),12,1,camera);
  }catch(_){ }

  var lastX=camera.position.x,lastZ=camera.position.z,lastYaw=camera.rotation.y,lastPitch=camera.rotation.x;
  var stepPhase=0,lastStepSin=0,roll=0,moveBlend=0,speedSmooth=0,angVelSmooth=0;
  var prevPitchNoise=0,prevYawNoise=0;
  var baseHeight=1.9;
  var kickPitch=0,kickPitchV=0,kickRoll=0,kickRollV=0,settleY=0,settleYV=0;
  function spring(pos,vel,k,d,dt){var acc=-pos*k-vel*d;vel+=acc*dt;pos+=vel*dt;return[pos,vel]}

  scene.onBeforeRenderObservable.add(function(){
    var dt=Math.min(engine.getDeltaTime()/1000,.05);
    if(!dt)return;

    camera.rotation.x-=prevPitchNoise;
    camera.rotation.y-=prevYawNoise;
    prevPitchNoise=prevYawNoise=0;

    var dx=camera.position.x-lastX,dz=camera.position.z-lastZ;
    var planarSpeed=Math.sqrt(dx*dx+dz*dz)/dt;
    lastX=camera.position.x;lastZ=camera.position.z;
    speedSmooth+=(Math.min(planarSpeed,6)-speedSmooth)*Math.min(1,dt*5.5);

    var movingNow=planarSpeed>.16?1:0;
    var prevMoveBlend=moveBlend;
    moveBlend+=(movingNow-moveBlend)*Math.min(1,dt*6.5);
    if(prevMoveBlend>=.5&&moveBlend<.5)settleYV-=.035;

    var sPhaseRate=dt*(6.2+speedSmooth*.72)*moveBlend;
    stepPhase+=sPhaseRate;
    var s=Math.sin(stepPhase),impact=Math.pow(Math.max(0,s),9),recover=Math.pow(Math.max(0,-s),5);
    var vertical=(-impact*.020+recover*.007+Math.sin(stepPhase*2.0)*.006)*moveBlend;
    var lateral=Math.sin(stepPhase)*.0055*moveBlend;
    var breathe=Math.sin(performance.now()*.00128)*.0038*(1-moveBlend*.55);

    if(lastStepSin<=0&&s>0&&moveBlend>.5){
      var kick=(0.55+0.45*Math.random())*Math.min(1,speedSmooth/4)*.011;
      kickPitchV-=kick;
      kickRollV+=(Math.random()*2-1)*kick*.7;
    }
    lastStepSin=s;
    var kp=spring(kickPitch,kickPitchV,190,17,dt);kickPitch=kp[0];kickPitchV=kp[1];
    var kr=spring(kickRoll,kickRollV,190,17,dt);kickRoll=kr[0];kickRollV=kr[1];
    var sy=spring(settleY,settleYV,140,16,dt);settleY=sy[0];settleYV=sy[1];

    camera.position.y=baseHeight+vertical+breathe+settleY;

    var yaw=camera.rotation.y,pitch=camera.rotation.x;
    var dyaw=yaw-lastYaw;
    while(dyaw>Math.PI)dyaw-=Math.PI*2;
    while(dyaw<-Math.PI)dyaw+=Math.PI*2;
    var dpitch=pitch-lastPitch;
    lastYaw=yaw;lastPitch=pitch;

    var rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
    var lateralVel=(dx*rightX+dz*rightZ)/Math.max(dt,.001);
    var targetRoll=BABYLON.Scalar.Clamp(-dyaw/Math.max(dt,.001)*.010-lateralVel*.0038,-.042,.042);
    roll+=(targetRoll-roll)*Math.min(1,dt*8.5);
    camera.rotation.z=roll+lateral+kickRoll;

    var now=performance.now()*.001;
    prevPitchNoise=(Math.sin(now*.61)+Math.sin(now*.23+1.7)*.55)*.00145*(1-moveBlend*.32)+kickPitch;
    prevYawNoise=(Math.sin(now*.47+2.1)+Math.sin(now*.19)*.45)*.0017*(1-moveBlend*.28);
    camera.rotation.x+=prevPitchNoise;
    camera.rotation.y+=prevYawNoise;

    var targetFov=BABYLON.Tools.ToRadians(89)+(moveBlend*.014)+Math.min(speedSmooth/6,.7)*.006;
    camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*3.8);

    var angVel=Math.sqrt(dyaw*dyaw+dpitch*dpitch)/Math.max(dt,.001);
    angVelSmooth+=(Math.min(angVel,10)-angVelSmooth)*Math.min(1,dt*10);
    if(blurH&&blurV){
      var targetBlur=BABYLON.Scalar.Clamp(angVelSmooth/6.0,0,1.15);
      blurStrength+=(targetBlur-blurStrength)*Math.min(1,dt*18);
      blurH.direction.x=blurStrength;blurH.direction.y=0;
      blurV.direction.x=0;blurV.direction.y=blurStrength*.72;
    }

    if(ca)ca.aberrationAmount=6.0+Math.min(speedSmooth,6)*1.1+angVelSmooth*.35;
    if(grain)grain.intensity=7.0+Math.min(angVelSmooth,6)*.9;

    if(ipc){
      var fy=0;
      try{fy=camera.getForwardRay(1).direction.y}catch(_){ }
      var targetExposure=1.02-Math.max(0,fy)*.09+Math.max(0,-fy)*.03;
      var toGo=targetExposure-ipc.exposure;
      var hunt=Math.sin(now*2.6)*.005*Math.min(1,Math.abs(toGo)*12);
      ipc.exposure+=toGo*Math.min(1,dt*1.8)+hunt*dt*6;
    }
  });
})();