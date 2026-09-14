(function(global){
  'use strict';
  var FLY_SPEED=68,FLY_SPRINT=175,THROTTLE_MIN=.01,THROTTLE_PER_PIXEL=.00288,DELTA_UNIT_PX=[1,16,400];
  var LOOK_X=.0022,LOOK_Y=.0018,PITCH_LIMIT=Math.PI*.46,MAX_HEIGHT=420,GROUND_CLEARANCE=2;
  var PAD_DEADZONE=.16,PAD_LOOK_RATE=2.35,PAD_PRECISION=.28,PAD_THROTTLE_STEP=1.35;
  var KEY_HINT='Camera: click to look · WASD move · wheel speed · Q/E up/down · Shift sprint · Esc releases';
  var PAD_HINT='Xbox: LS move · RS look · LT/RT down/up · RB sprint · LB precision · D-pad speed · Y level';
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
  function shapedAxis(v){
    v=isFinite(+v)?+v:0;var a=Math.abs(v);if(a<=PAD_DEADZONE)return 0;
    return Math.sign(v)*(a-PAD_DEADZONE)/(1-PAD_DEADZONE);
  }
  function buttonValue(pad,index){var b=pad&&pad.buttons&&pad.buttons[index];return b?Math.max(b.pressed?1:0,+b.value||0):0;}
  function activeGamepad(){
    if(!global.navigator||typeof global.navigator.getGamepads!=='function')return null;
    var pads=global.navigator.getGamepads()||[],fallback=null;
    for(var i=0;i<pads.length;i++){var p=pads[i];if(!p||p.connected===false)continue;if(!fallback)fallback=p;if(p.mapping==='standard')return p;}
    return fallback;
  }
  function createDesktopFly(scene,canvas,target,engine,battleSim){
    var radius=720,alpha=-Math.PI/2,beta=1.02;
    var camera=new BABYLON.UniversalCamera('cam',initialPosition(target,radius,alpha,beta),scene);
    camera.inputs.clear();camera.minZ=.25;camera.maxZ=2600;camera.setTarget(target);scene.activeCamera=camera;
    var yaw=camera.rotation.y,pitch=camera.rotation.x,active=false,throttle=1,keys=new Set(),padButtons={},padId=null;
    function guarded(){return active||document.activeElement===canvas;}
    function keyName(event){return event.key===' '?' ':event.key.toLowerCase();}
    function movementKey(key){return key==='w'||key==='a'||key==='s'||key==='d'||key==='q'||key==='e'||key==='shift';}
    function updateHint(pad){
      var el=document.getElementById('cameraHint');if(!el)return;
      el.textContent=KEY_HINT+(pad?' · '+PAD_HINT:'');
    }
    function padPressedOnce(pad,index){
      var down=buttonValue(pad,index)>.5,was=!!padButtons[index];padButtons[index]=down;return down&&!was;
    }
    canvas.addEventListener('click',function(){canvas.focus();if(document.pointerLockElement!==canvas)canvas.requestPointerLock&&canvas.requestPointerLock();});
    document.addEventListener('pointerlockchange',function(){active=document.pointerLockElement===canvas;if(!active)keys.clear();});
    document.addEventListener('mousemove',function(event){
      if(!active)return;
      /* Conventional FPS look: mouse right turns right; mouse down looks down. */
      yaw+=event.movementX*LOOK_X;pitch+=event.movementY*LOOK_Y;pitch=clamp(pitch,-PITCH_LIMIT,PITCH_LIMIT);
      camera.rotation.y=yaw;camera.rotation.x=pitch;
    });
    window.addEventListener('keydown',function(event){
      if(!guarded())return;
      var key=keyName(event);if(!movementKey(key))return;
      keys.add(key);event.preventDefault();
    },{passive:false});
    window.addEventListener('keyup',function(event){keys.delete(keyName(event));});
    window.addEventListener('blur',function(){keys.clear();});
    window.addEventListener('gamepadconnected',function(e){padId=e.gamepad&&e.gamepad.id||'gamepad';padButtons={};updateHint(e.gamepad);console.log('[CAMERA] gamepad connected: '+padId);});
    window.addEventListener('gamepaddisconnected',function(e){if(!e.gamepad||!padId||e.gamepad.id===padId){padId=null;padButtons={};updateHint(null);}console.log('[CAMERA] gamepad disconnected');});
    canvas.addEventListener('wheel',function(event){
      if(!guarded())return;
      event.preventDefault();
      var pixels=event.deltaY*(DELTA_UNIT_PX[event.deltaMode]||1);
      throttle=clamp(throttle*Math.exp(-pixels*THROTTLE_PER_PIXEL),THROTTLE_MIN,1);
    },{passive:false});
    scene.onBeforeRenderObservable.add(function(){
      var dt=Math.min(.05,engine.getDeltaTime()/1000),pad=activeGamepad();
      if(pad&&pad.id!==padId){padId=pad.id;padButtons={};updateHint(pad);console.log('[CAMERA] gamepad active: '+padId);}
      if(!pad&&padId){padId=null;padButtons={};updateHint(null);}

      var f=(keys.has('w')?1:0)-(keys.has('s')?1:0),r=(keys.has('d')?1:0)-(keys.has('a')?1:0),v=(keys.has('e')?1:0)-(keys.has('q')?1:0),padSprint=false,padPrecision=false;
      if(pad){
        var axes=pad.axes||[];
        r+=shapedAxis(axes[0]);f+=-shapedAxis(axes[1]);
        yaw+=shapedAxis(axes[2])*PAD_LOOK_RATE*dt;pitch+=shapedAxis(axes[3])*PAD_LOOK_RATE*dt;pitch=clamp(pitch,-PITCH_LIMIT,PITCH_LIMIT);
        camera.rotation.y=yaw;camera.rotation.x=pitch;
        v+=buttonValue(pad,7)-buttonValue(pad,6);
        padPrecision=buttonValue(pad,4)>.5;padSprint=buttonValue(pad,5)>.5;
        if(padPressedOnce(pad,12))throttle=clamp(throttle*PAD_THROTTLE_STEP,THROTTLE_MIN,1);
        if(padPressedOnce(pad,13))throttle=clamp(throttle/PAD_THROTTLE_STEP,THROTTLE_MIN,1);
        if(padPressedOnce(pad,3)){pitch=0;camera.rotation.x=0;}
        /* Refresh edge state for buttons whose single-press action is not queried above. */
        [0,1,2,4,5,6,7,8,9,10,11,14,15,16].forEach(function(i){padButtons[i]=buttonValue(pad,i)>.5;});
      }
      if(!f&&!r&&!v)return;
      var forward=camera.getForwardRay().direction.clone();forward.y=0;if(forward.lengthSquared()>1e-8)forward.normalize();
      var up=BABYLON.Axis.Y,right=scene.useRightHandedSystem?BABYLON.Vector3.Cross(forward,up):BABYLON.Vector3.Cross(up,forward);
      if(right.lengthSquared()>1e-8)right.normalize();
      var move=BABYLON.Vector3.Zero();if(f)move.addInPlace(forward.scale(f));if(r)move.addInPlace(right.scale(r));
      if(move.lengthSquared()>1)move.normalize();
      var speed=(keys.has('shift')||padSprint?FLY_SPRINT:FLY_SPEED)*throttle;if(padPrecision&&!padSprint)speed*=PAD_PRECISION;
      camera.position.addInPlace(move.scale(speed*dt));camera.position.y+=clamp(v,-1,1)*speed*.7*dt;
      var halfW=battleSim.FIELD_W/2-2,halfD=battleSim.FIELD_D/2-2;
      camera.position.x=clamp(camera.position.x,-halfW,halfW);camera.position.z=clamp(camera.position.z,-halfD,halfD);
      camera.position.y=clamp(camera.position.y,battleSim.heightAt(camera.position.x,camera.position.z)+GROUND_CLEARANCE,MAX_HEIGHT);
    });
    updateHint(activeGamepad());
    return {camera:camera,desktop:true,hint:KEY_HINT+(activeGamepad()?' · '+PAD_HINT:'')};
  }
  global.BattleDesktopCamera={
    create:function(options){
      var target=new BABYLON.Vector3(options.scenario.center.x,4,options.scenario.center.z);
      var result=(desktopPointer()||activeGamepad())?createDesktopFly(options.scene,options.canvas,target,options.engine,options.battleSim):createTouchOrbit(options.scene,options.canvas,target);
      console.log('[CAMERA] '+(result.desktop?'ww2fps Model Lab desktop fly controls':'touch orbit controls')+' active');
      return result;
    }
  };
})(window);
