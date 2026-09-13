(function(global){
  'use strict';
  var FLY_SPEED=68,FLY_SPRINT=175,THROTTLE_MIN=.01,THROTTLE_PER_PIXEL=.00288,DELTA_UNIT_PX=[1,16,400];
  var LOOK_X=.0022,LOOK_Y=.0018,PITCH_LIMIT=Math.PI*.46,MAX_HEIGHT=420,GROUND_CLEARANCE=2;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function desktopPointer(){return !!(global.matchMedia&&global.matchMedia('(pointer:fine)').matches);}
  function initialPosition(target,radius,alpha,beta){
    return new BABYLON.Vector3(
      target.x+radius*Math.cos(alpha)*Math.sin(beta),
      target.y+radius*Math.cos(beta),
      target.z+radius*Math.sin(alpha)*Math.sin(beta)
    );
  }
  function createTouchOrbit(scene,canvas,target){
    var camera=new BABYLON.ArcRotateCamera('cam',-Math.PI/2,1.02,720,target,scene);
    camera.lowerRadiusLimit=90;camera.upperRadiusLimit=1850;camera.lowerBetaLimit=.28;camera.upperBetaLimit=1.5;
    camera.wheelPrecision=3;camera.panningSensibility=120;camera.attachControl(canvas,true);
    return {camera:camera,desktop:false,hint:'Camera: drag to orbit · pinch/wheel to zoom'};
  }
  function createDesktopFly(scene,canvas,target,engine,battleSim){
    var radius=720,alpha=-Math.PI/2,beta=1.02;
    var camera=new BABYLON.UniversalCamera('cam',initialPosition(target,radius,alpha,beta),scene);
    camera.inputs.clear();camera.minZ=.25;camera.maxZ=2600;camera.setTarget(target);scene.activeCamera=camera;
    var yaw=camera.rotation.y,pitch=camera.rotation.x,active=false,throttle=1,keys=new Set();
    function guarded(){return active||document.activeElement===canvas;}
    function keyName(event){return event.key===' '?' ':event.key.toLowerCase();}
    function movementKey(key){return key==='w'||key==='a'||key==='s'||key==='d'||key==='q'||key==='e'||key==='shift';}
    canvas.addEventListener('click',function(){canvas.focus();if(document.pointerLockElement!==canvas)canvas.requestPointerLock&&canvas.requestPointerLock();});
    document.addEventListener('pointerlockchange',function(){active=document.pointerLockElement===canvas;if(!active)keys.clear();});
    document.addEventListener('mousemove',function(event){
      if(!active)return;
      yaw-=event.movementX*LOOK_X;pitch-=event.movementY*LOOK_Y;pitch=clamp(pitch,-PITCH_LIMIT,PITCH_LIMIT);
      camera.rotation.y=yaw;camera.rotation.x=pitch;
    });
    window.addEventListener('keydown',function(event){
      if(!guarded())return;
      var key=keyName(event);if(!movementKey(key))return;
      keys.add(key);event.preventDefault();
    },{passive:false});
    window.addEventListener('keyup',function(event){keys.delete(keyName(event));});
    window.addEventListener('blur',function(){keys.clear();});
    canvas.addEventListener('wheel',function(event){
      if(!guarded())return;
      event.preventDefault();
      var pixels=event.deltaY*(DELTA_UNIT_PX[event.deltaMode]||1);
      throttle=clamp(throttle*Math.exp(-pixels*THROTTLE_PER_PIXEL),THROTTLE_MIN,1);
    },{passive:false});
    scene.onBeforeRenderObservable.add(function(){
      var f=(keys.has('w')?1:0)-(keys.has('s')?1:0),r=(keys.has('d')?1:0)-(keys.has('a')?1:0),v=(keys.has('e')?1:0)-(keys.has('q')?1:0);
      if(!f&&!r&&!v)return;
      var forward=camera.getForwardRay().direction.clone();forward.y=0;if(forward.lengthSquared()>1e-8)forward.normalize();
      var up=BABYLON.Axis.Y,right=scene.useRightHandedSystem?BABYLON.Vector3.Cross(forward,up):BABYLON.Vector3.Cross(up,forward);
      if(right.lengthSquared()>1e-8)right.normalize();
      var move=BABYLON.Vector3.Zero();if(f)move.addInPlace(forward.scale(f));if(r)move.addInPlace(right.scale(r));
      if(move.lengthSquared()>1)move.normalize();
      var dt=Math.min(.05,engine.getDeltaTime()/1000),speed=(keys.has('shift')?FLY_SPRINT:FLY_SPEED)*throttle;
      camera.position.addInPlace(move.scale(speed*dt));camera.position.y+=v*speed*.7*dt;
      var halfW=battleSim.FIELD_W/2-2,halfD=battleSim.FIELD_D/2-2;
      camera.position.x=clamp(camera.position.x,-halfW,halfW);camera.position.z=clamp(camera.position.z,-halfD,halfD);
      camera.position.y=clamp(camera.position.y,battleSim.heightAt(camera.position.x,camera.position.z)+GROUND_CLEARANCE,MAX_HEIGHT);
    });
    return {camera:camera,desktop:true,hint:'Camera: click to look · WASD move · wheel speed · Q/E up/down · Shift sprint · Esc releases'};
  }
  global.BattleDesktopCamera={
    create:function(options){
      var target=new BABYLON.Vector3(options.scenario.center.x,4,options.scenario.center.z);
      var result=desktopPointer()?createDesktopFly(options.scene,options.canvas,target,options.engine,options.battleSim):createTouchOrbit(options.scene,options.canvas,target);
      console.log('[CAMERA] '+(result.desktop?'ww2fps Model Lab desktop fly controls':'touch orbit controls')+' active');
      return result;
    }
  };
})(window);
