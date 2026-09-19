/* Imported FBX soldier backend.
   Soldiers render as the rigged FBX character (Assets/soldiers) driven by the shared Mixamo rifle
   clips (Assets/animations). Both are read with Babylon's FBX loader, the same import path as the
   FBX Motion Lab. Model and clips share one rig, so clip channels bind to bones by name; nothing
   is retargeted.

   Conversion happens once per page load (convertClip): each clip keeps only channels for bones
   the model has (the loader's `__fbx_inheritScale` helper nodes duplicate their parent and are
   dropped), is resampled at 30 fps, and looping clips have their horizontal hips travel removed so
   navigation stays the sole owner of world position. The removed travel becomes the clip's natural
   ground speed, which sets playback rate so feet do not skate.

   Gameplay still owns *why* (stance, movement, target, reload, fire, death arrive as the usual
   soldier fields and animation tags). This backend owns *how*: a lower layer plays the stance and
   locomotion clip for the whole body, and an upper overlay (spine, arms, head) plays aim, fire or
   reload on top. Both cross-fade. Clip clocks advance on simulation time in update(); poses are
   written once per rendered frame, so a paused or headless sim pays nothing for them.

   The procedural rig in soldier.js remains the fallback: while assets load, if they fail, and
   whenever imported animation is disabled (trainer and benchmark matches). */
(function(root){
'use strict';
if(typeof BABYLON==='undefined'||!root.BattleSoldierModel||root.BattleFbxSoldier)return;

var M=root.BattleSoldierModel,TAGS=M.TAGS,Q=BABYLON.Quaternion,V3=BABYLON.Vector3,MX=BABYLON.Matrix;
var BACKEND='fbx-skeletal-v1',FPS=30;
/* Paratroopers are the default; `?soldiers=rifleman` shows the earlier riflemen for comparison. */
var MODEL_SETS={
  paratrooper:{us:'us-paratrooper.fbx',ge:'ge-paratrooper.fbx'},
  rifleman:{us:'us-rifleman-rigged.fbx',ge:'ge-rifleman-rigged.fbx'}
};
var MODEL_SET=(typeof location!=='undefined'&&/[?&]soldiers=rifleman\b/.test(location.search||''))?'rifleman':'paratrooper';
var MODELS=MODEL_SETS[MODEL_SET];
/* Faction rifles (Assets/weapons, prepared by tools/prepare-weapon-model.py) replace the box rifle
   for rifle and carbine carriers; LMG and pistol stay procedural. The prepared layout puts the butt
   plate WEAPON_BUTT metres behind the grip origin, barrel along +Z, so the hand calibration holds. */
var WEAPON_MODELS={us:'m1-garand.fbx',ge:'kar98k.fbx'},WEAPON_BUTT=.40,WEAPON_KINDS={rifle:1,carbine:1};

/* key -> [clip file (Assets/animations/<name>.fbx), loops]. Directional locomotion is generated
   below as <family><sector>, sector 0..7 clockwise from forward. */
var DIRS=['forward','forward right','right','backward right','backward','backward left','left','forward left'];
var FAMILIES={walk:'walk ',run:'run ',sprint:'sprint ',crouch:'walk crouching '};
var CLIPS={
  idle:['idle',1],aim:['idle aiming',1],crouchIdle:['idle crouching',1],crouchAim:['idle crouching aiming',1],
  proneIdle:['Rifle Prone Idle',1],proneForward:['Prone Forward',1],proneBackward:['Moving Backward In Prone Position',1],
  fire:['Fire Rifle Single Shot',0],fireCrouch:['Fire Rifle Single Shot Crouched Kneel',0],fireProne:['Fire Rifle Single Shot Prone',0],
  fireAuto:['Fire Rifle Automatic Standing',1],fireAutoProne:['Fire Rifle Automatic Prone',1],
  reload:['Rifle Reload Standing',0],reloadCrouch:['Rifle Reload Crouched',0],reloadProne:['Rifle Reload Prone',0],
  toProne:['Rifle Kneel To Prone',0],fromProne:['Rifle Prone To Kneel',0],
  /* death.front is a forward collapse, i.e. the pack's "shot from the back". */
  deathFront:['death from the back',0],deathBack:['death from the front',0],deathSide:['death from right',0],
  deathCrouch:['death crouching headshot front',0],deathProne:['Prone Death',0]
};
Object.keys(FAMILIES).forEach(function(f){DIRS.forEach(function(d,i){CLIPS[f+i]=[FAMILIES[f]+d,1];});});

/* Bones the aim/fire/reload overlay owns. Everything else follows the lower layer. */
var UPPER={Spine02:1,Spine01:1,Spine:1,neck:1,Head:1,LeftShoulder:1,LeftArm:1,LeftForeArm:1,LeftHand:1,RightShoulder:1,RightArm:1,RightForeArm:1,RightHand:1};
/* Right-hand grip point in each weapon mesh's local space (metres), as in soldier.js GRIPS. */
var GRIP={rifle:[0,-.055,-.12],carbine:[0,-.055,-.09],lmg:[0,-.07,-.02],pistol:[.02,-.07,0]};
/* Where each hand holds each weapon, in weapon-local metres (barrel +Z, grip origin at 0). The
   right palm takes `grip` (wrist of the stock / pistol grip); the left palm may take any point on
   the fore-end line `fore` = [x, y, zFrom, zTo], wherever the clip puts it. Measured on the
   prepared rifles. */
var WEAPON_POINTS={
  'm1-garand.fbx':{grip:[0,-.065,-.12],fore:[0,-.025,.06,.42]},
  'kar98k.fbx':{grip:[0,-.05,-.12],fore:[0,-.01,.06,.45]},
  rifle:{grip:GRIP.rifle,fore:[0,-.05,.05,.35]},carbine:{grip:GRIP.carbine,fore:[0,-.05,.04,.28]},
  lmg:{grip:GRIP.lmg,fore:[0,-.075,.15,.45]},pistol:{grip:GRIP.pistol,fore:null}
};
var SMOOTH_NORMALS=!(typeof location!=='undefined'&&/[?&]smooth=0\b/.test(location.search||''));

var scenes=typeof WeakMap!=='undefined'?new WeakMap():null;
function sceneState(scene){
  var st=scenes?scenes.get(scene):scene._battleFbxSoldier;
  if(!st){st={enabled:true,libs:{},clips:null,bones:null,loading:null,ready:false,active:[],error:null};if(scenes)scenes.set(scene,st);else scene._battleFbxSoldier=st;}
  return st;
}
/* Soldier assets can live beside a branch preview's runtime; everything else is shared. */
function assetBase(){return String(root.BATTLE_SOLDIER_ASSET_BASE||root.BATTLE_ASSET_BASE||'../Assets/').replace(/\/?$/,'/');}

var loaderPromise=null;
function ensureLoader(){
  if(BABYLON.FBXFileLoader)return Promise.resolve();
  if(loaderPromise)return loaderPromise;
  if(typeof document==='undefined')return Promise.reject(new Error('FBX loader needs a document'));
  /* The loader bundle must match the engine build exactly. */
  loaderPromise=new Promise(function(ok,fail){
    var tag=document.createElement('script');tag.async=true;
    tag.src='https://cdn.jsdelivr.net/npm/babylonjs-loaders@'+BABYLON.Engine.Version+'/babylonjs.loaders.min.js';
    tag.onload=function(){if(BABYLON.FBXFileLoader)ok();else fail(new Error('loader bundle has no FBX loader'));};
    tag.onerror=function(){fail(new Error('FBX loader script failed to load'));};
    document.head.appendChild(tag);
  });
  return loaderPromise;
}
function loadContainer(scene,url){return BABYLON.LoadAssetContainerAsync(url,scene,{pluginExtension:'.fbx'});}

/* ---- import + conversion ------------------------------------------------------------------ */

/* The centre of each hand as a fixed point in that hand bone's space: the centroid of the vertices
   skinned mostly to the hand (palm and fingers), taken at bind pose. It acts like a socket bone
   added to the rig without editing the asset, and it is where the weapon is held. */
function palmAnchors(meshes,nodes){
  var out={};
  ['RightHand','LeftHand'].forEach(function(name){
    var sum=new V3(),count=0,node=nodes[name];
    meshes.forEach(function(mesh){
      var sk=mesh.skeleton;if(!sk||!node)return;
      var bone=-1;for(var b=0;b<sk.bones.length;b++)if(sk.bones[b].name===name)bone=b;if(bone<0)return;
      var VB=BABYLON.VertexBuffer,pos=mesh.getVerticesData(VB.PositionKind),ix=[mesh.getVerticesData(VB.MatricesIndicesKind),mesh.getVerticesData(VB.MatricesIndicesExtraKind)],
          wt=[mesh.getVerticesData(VB.MatricesWeightsKind),mesh.getVerticesData(VB.MatricesWeightsExtraKind)],world=mesh.getWorldMatrix(),p=new V3();
      for(var v=0;v<pos.length/3;v++){
        var w=0;for(var set=0;set<2;set++){if(!ix[set]||!wt[set])continue;for(var j=0;j<4;j++)if(ix[set][v*4+j]===bone)w+=wt[set][v*4+j];}
        if(w<.5)continue;V3.TransformCoordinatesFromFloatsToRef(pos[v*3],pos[v*3+1],pos[v*3+2],world,p);sum.addInPlace(p);count++;
      }
    });
    out[name]=count&&node?V3.TransformCoordinates(sum.scale(1/count),node.getWorldMatrix().clone().invert()):V3.Zero();
    out[name+'Vertices']=count;
  });
  return out;
}
function prepareModel(container){
  var top=container.transformNodes.filter(function(n){return!n.parent;})[0];
  var skeleton=container.skeletons[0];
  if(!top||!skeleton)throw new Error('model FBX has no skinned skeleton');
  var meshes=container.meshes.filter(function(m){return m.getTotalVertices()>0;}),lo=Infinity,hi=-Infinity;
  top.computeWorldMatrix(true);
  top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  meshes.forEach(function(m){var b=m.getBoundingInfo().boundingBox;lo=Math.min(lo,b.minimumWorld.y);hi=Math.max(hi,b.maximumWorld.y);});
  if(!(hi>lo))throw new Error('model FBX has no measurable height');
  var nodes={};top.getDescendants(false).forEach(function(n){nodes[n.name]=n;});
  container.materials.forEach(function(m){
    if(m.specularColor)m.specularColor.set(.06,.06,.06);
    /* The atlas is hundreds of small islands; keep it crisp at glancing angles. */
    if(m.diffuseTexture)m.diffuseTexture.anisotropicFilteringLevel=8;
    /* The auto-rig's weights fold the thin smock over itself at the shoulders and back once the
       soldier is posed, turning those triangles away from the camera. Culled, they read as holes;
       draw both sides, lit from whichever side faces the viewer. */
    m.backFaceCulling=false;if('twoSidedLighting' in m)m.twoSidedLighting=true;
  });
  if(SMOOTH_NORMALS)meshes.forEach(smoothNormals);
  var palms=palmAnchors(meshes,nodes);
  var scale=(M.BODY&&M.BODY.heightM||1.7)/(hi-lo);
  if(!nodes.Hips)throw new Error('model FBX has no Hips bone');
  return{container:container,top:top,nodes:nodes,height:hi-lo,scale:scale,
    hipsHeight:(nodes.Hips.getAbsolutePosition().y-lo)*scale,palms:palms,grips:null,clips:null};
}

/* Optional look (on by default, `?smooth=0` turns it off): the models ship flat-shaded, so the
   low-poly body reads as facets. Each corner instead averages the normals of the faces that meet at
   its position (welded across UV seams) and point within 60 degrees of its own face. The limit
   matters: the smock hem, straps and cuffs are thin shells whose two sides share positions, and
   averaging across them flips the normal and shades those faces black. */
function smoothNormals(mesh){
  var pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),idx=mesh.getIndices();if(!pos||!idx)return;
  var n=pos.length/3,key={},group=new Int32Array(n),count=0,i,j;
  for(i=0;i<n;i++){var k=pos[i*3].toFixed(4)+','+pos[i*3+1].toFixed(4)+','+pos[i*3+2].toFixed(4);if(key[k]==null)key[k]=count++;group[i]=key[k];}
  var tris=idx.length/3,face=new Float64Array(tris*3),own=new Float64Array(n*3),members=[];
  for(i=0;i<count;i++)members.push([]);
  for(var t=0;t<tris;t++){
    var a=idx[t*3]*3,b=idx[t*3+1]*3,c=idx[t*3+2]*3,ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
    /* Area-weighted face normal (cross product length is twice the area). */
    face[t*3]=uy*vz-uz*vy;face[t*3+1]=uz*vx-ux*vz;face[t*3+2]=ux*vy-uy*vx;
    for(j=0;j<3;j++){var v=idx[t*3+j];own[v*3]+=face[t*3];own[v*3+1]+=face[t*3+1];own[v*3+2]+=face[t*3+2];members[group[v]].push(t);}
  }
  var old=mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind),out=new Float32Array(n*3),agree=0,cos=Math.cos(Math.PI/3);
  for(i=0;i<n;i++){
    var ox=own[i*3],oy=own[i*3+1],oz=own[i*3+2],ol=Math.sqrt(ox*ox+oy*oy+oz*oz)||1,x=0,y=0,z=0,list=members[group[i]];
    for(j=0;j<list.length;j++){
      var f=list[j]*3,fx=face[f],fy=face[f+1],fz=face[f+2],fl=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
      if((fx*ox+fy*oy+fz*oz)/(fl*ol)>=cos){x+=fx;y+=fy;z+=fz;}
    }
    var l=Math.sqrt(x*x+y*y+z*z);if(!l){x=ox;y=oy;z=oz;l=ol;}
    out[i*3]=x/l;out[i*3+1]=y/l;out[i*3+2]=z/l;
    if(old)agree+=(out[i*3]*old[i*3]+out[i*3+1]*old[i*3+1]+out[i*3+2]*old[i*3+2])>0?1:-1;
  }
  /* Keep the outward sense the file's own normals have overall (the loader mirrors handedness). */
  if(agree<0)for(i=0;i<out.length;i++)out[i]=-out[i];
  mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind,out,false);
}
/* The clips' own skeleton: bone names (helper nodes excluded) and their rest local transforms.
   Every clip file carries the same one, so it is read once from the first clip loaded. */
function sourceRig(container){
  var bones=[],rest={};
  container.transformNodes.forEach(function(n){
    if(n.name==='__fbx_root__'||n.name.indexOf('__fbx')>=0)return;
    bones.push(n.name);
    rest[n.name]={q:(n.rotationQuaternion||Q.FromEulerVector(n.rotation)).clone(),p:n.position.clone()};
  });
  return{bones:bones,rest:rest};
}
function convertClip(container,key,spec,bones){
  var group=container.animationGroups[0];if(!group)throw new Error('no animation in '+spec[0]);
  var index={};bones.forEach(function(name,i){index[name]=i;});
  var channels=new Array(bones.length),frames=0,duration=0,loop=!!spec[1];
  group.targetedAnimations.forEach(function(ta){
    var i=ta.target?index[ta.target.name]:null,a=ta.animation;if(i==null||!a)return;
    var prop=a.targetProperty;if(prop!=='rotationQuaternion'&&prop!=='position')return;
    var afps=a.framePerSecond||FPS,span=(group.to-group.from)/afps;
    if(!frames){frames=Math.max(2,Math.round(span*FPS)+1);duration=(frames-1)/FPS;}
    var size=prop==='position'?3:4,data=new Float32Array(frames*size);
    for(var k=0;k<frames;k++){
      var v=a.evaluate(group.from+Math.min(span,k/FPS)*afps),o=k*size;
      data[o]=v.x;data[o+1]=v.y;data[o+2]=v.z;
      if(size===4){
        data[o+3]=v.w;
        /* Keep neighbouring samples in one hemisphere so per-frame nlerp never takes the long way. */
        if(k&&data[o]*data[o-4]+data[o+1]*data[o-3]+data[o+2]*data[o-2]+data[o+3]*data[o-1]<0)for(var j=0;j<4;j++)data[o+j]=-data[o+j];
      }
    }
    var ch=channels[i]||(channels[i]={rot:null,pos:null});
    if(prop==='position')ch.pos=data;else ch.rot=data;
  });
  if(!frames)throw new Error('no usable channels in '+spec[0]);
  /* Hips travel is horizontal in the armature's Z-up space (forward is -Y). Its net displacement
     is the clip's natural ground speed (kept in the clip's own units until a model scales it).
     Looping clips are made in place by removing the linear drift, which keeps sway and bob but
     ends each cycle where it began. */
  var hips=channels[index.Hips],travel=0;
  if(hips&&hips.pos){
    var p=hips.pos,last=(frames-1)*3,dx=p[last]-p[0],dy=p[last+1]-p[1];
    travel=Math.sqrt(dx*dx+dy*dy)/Math.max(1e-3,duration);
    if(loop)for(var f=0;f<frames;f++){var u=f/(frames-1);p[f*3]-=dx*u;p[f*3+1]-=dy*u;}
  }
  return{key:key,file:spec[0],loop:loop,frames:frames,duration:duration,travel:travel,speed:0,channels:channels};
}

/* Clips are authored on one skeleton; a model may share its bone names and hierarchy but not its
   rest orientations or units (the paratroopers differ by up to ~180 degrees per bone and use
   metres, not centimetres). Retarget each clip onto the model once: for every bone, the clip's
   rotation away from its own rest pose is taken in world (armature) space, reapplied to the model's
   rest pose, and turned back into a local rotation under the model's already-retargeted parent.
   The hips position is rescaled by the ratio of the two rest hip heights. Models whose rest pose
   already matches keep the clips as they are. */
var rtA=new MX(),rtB=new MX(),rtC=new MX(),rtQ=new Q();
function quatMatrix(x,y,z,w,out){rtQ.set(x,y,z,w);rtQ.toRotationMatrix(out);return out;}
function retargetClips(lib,src,clips,bones){
  var n=bones.length,parent=new Int32Array(n),restS=[],restT=[],i;
  var nodes=bones.map(function(name){return lib.nodes[name]||null;});
  for(i=0;i<n;i++){
    var node=nodes[i],pn=node&&node.parent?bones.indexOf(node.parent.name):-1;parent[i]=pn;
    restS[i]=src.rest[bones[i]].q;restT[i]=node?(node.rotationQuaternion||Q.FromEulerVector(node.rotation)):restS[i];
  }
  /* Parents before children. */
  var order=[],depth=function(k){var d=0;while(parent[k]>=0){k=parent[k];d++;}return d;};
  for(i=0;i<n;i++)order.push(i);order.sort(function(a,b){return depth(a)-depth(b);});
  var worst=0;for(i=0;i<n;i++)if(nodes[i])worst=Math.max(worst,1-Math.abs(Q.Dot(restS[i],restT[i])));
  var hipsS=src.rest.Hips.p,hipsT=lib.nodes.Hips.position,k=hipsT.length()/Math.max(1e-6,hipsS.length());
  lib.speedScale=lib.hipsHeight/Math.max(1e-6,hipsS.z);
  var out={};
  Object.keys(clips).forEach(function(key){
    var clip=clips[key],copy={};for(var f in clip)copy[f]=clip[f];copy.speed=clip.travel*lib.speedScale;
    out[key]=copy;
    if(worst<1e-4&&Math.abs(k-1)<1e-3)return;
    var frames=clip.frames,chans=new Array(n),S0=[],T0=[],Ws=[],Wt=[];
    for(i=0;i<n;i++){S0[i]=new MX();T0[i]=new MX();Ws[i]=new MX();Wt[i]=new MX();}
    for(var o=0;o<n;o++){
      i=order[o];var ps=parent[i];
      quatMatrix(restS[i].x,restS[i].y,restS[i].z,restS[i].w,rtA);if(ps>=0)rtA.multiplyToRef(S0[ps],S0[i]);else S0[i].copyFrom(rtA);
      quatMatrix(restT[i].x,restT[i].y,restT[i].z,restT[i].w,rtA);if(ps>=0)rtA.multiplyToRef(T0[ps],T0[i]);else T0[i].copyFrom(rtA);
      var ch=clip.channels[i];
      if(ch&&nodes[i])chans[i]={rot:ch.rot?new Float32Array(frames*4):null,pos:null};
      if(ch&&ch.pos&&nodes[i]){
        var pos=new Float32Array(ch.pos.length),rs=src.rest[bones[i]].p,rt=nodes[i].position;
        for(var j=0;j<frames;j++){var b=j*3;pos[b]=rt.x+(ch.pos[b]-rs.x)*k;pos[b+1]=rt.y+(ch.pos[b+1]-rs.y)*k;pos[b+2]=rt.z+(ch.pos[b+2]-rs.z)*k;}
        chans[i].pos=pos;
      }
    }
    for(var fr=0;fr<frames;fr++){
      for(o=0;o<n;o++){
        i=order[o];var p=parent[i],c=clip.channels[i],q=c&&c.rot?c.rot:null,a=fr*4;
        if(q)quatMatrix(q[a],q[a+1],q[a+2],q[a+3],rtA);else quatMatrix(restS[i].x,restS[i].y,restS[i].z,restS[i].w,rtA);
        if(p>=0)rtA.multiplyToRef(Ws[p],Ws[i]);else Ws[i].copyFrom(rtA);
        if(!chans[i]||!chans[i].rot){
          quatMatrix(restT[i].x,restT[i].y,restT[i].z,restT[i].w,rtA);if(p>=0)rtA.multiplyToRef(Wt[p],Wt[i]);else Wt[i].copyFrom(rtA);continue;
        }
        /* delta = S0^-1 * Ws (world-space change), Wt = T0 * delta, local = Wt * parentWt^-1 */
        S0[i].transposeToRef(rtB);rtB.multiplyToRef(Ws[i],rtC);T0[i].multiplyToRef(rtC,Wt[i]);
        if(p>=0){Wt[p].transposeToRef(rtB);Wt[i].multiplyToRef(rtB,rtC);}else rtC.copyFrom(Wt[i]);
        Q.FromRotationMatrixToRef(rtC,rtQ);
        var r=chans[i].rot;
        if(fr&&rtQ.x*r[a-4]+rtQ.y*r[a-3]+rtQ.z*r[a-2]+rtQ.w*r[a-1]<0)rtQ.scaleInPlace(-1);
        r[a]=rtQ.x;r[a+1]=rtQ.y;r[a+2]=rtQ.z;r[a+3]=rtQ.w;
      }
    }
    copy.channels=chans;
  });
  lib.clips=out;lib.retargeted=!(worst<1e-4&&Math.abs(k-1)<1e-3);
  return out;
}

/* The rifle rides the right hand rigidly. Its offset is solved once from the aiming clip: in that
   pose the barrel points straight at the target (model +Z, level), with the weapon's grip in the
   right palm. The result is stored in the hand's local space, so every clip then carries it. */
function solveGrips(lib,aim,bones){
  var nodes=lib.nodes,saved=[];
  bones.forEach(function(name,i){
    var n=nodes[name],ch=aim.channels[i];if(!n||!ch)return;
    saved.push([n,n.position.clone(),n.rotationQuaternion?n.rotationQuaternion.clone():null]);
    if(ch.rot){if(!n.rotationQuaternion)n.rotationQuaternion=new Q();n.rotationQuaternion.set(ch.rot[0],ch.rot[1],ch.rot[2],ch.rot[3]);}
    if(ch.pos)n.position.set(ch.pos[0],ch.pos[1],ch.pos[2]);
  });
  lib.top.computeWorldMatrix(true);
  lib.top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  var hand=nodes.RightHand.getWorldMatrix().clone(),left=nodes.LeftHand.getWorldMatrix();
  var rightPalm=V3.TransformCoordinates(lib.palms.RightHand,hand),leftPalm=V3.TransformCoordinates(lib.palms.LeftHand,left);
  var z=new V3(0,0,1),x=V3.Cross(V3.Up(),z).normalize(),y=V3.Cross(z,x).normalize(),hands=leftPalm.subtract(rightPalm);
  var rotation=Q.RotationQuaternionFromAxis(x,y,z),basis=new MX(),inv=hand.clone().invert(),grips={};rotation.toRotationMatrix(basis);
  Object.keys(WEAPON_POINTS).forEach(function(kind){
    var g=WEAPON_POINTS[kind].grip,offset=V3.TransformNormal(new V3(g[0],g[1],g[2]).scale(1/lib.scale),basis);
    var origin=rightPalm.subtract(offset),s=1/lib.scale;
    grips[kind]=MX.Compose(new V3(s,s,s),rotation,origin).multiply(inv);
  });
  saved.forEach(function(e){e[0].position.copyFrom(e[1]);if(e[2])e[0].rotationQuaternion.copyFrom(e[2]);});
  lib.top.getDescendants(false).forEach(function(n){if(n.computeWorldMatrix)n.computeWorldMatrix(true);});
  lib.grips=grips;
  /* Diagnostic: how far the support hand sits from the barrel line in the calibration pose. */
  lib.supportHand={along:+(V3.Dot(hands,z)*lib.scale).toFixed(3),off:+(hands.subtract(z.scale(V3.Dot(hands,z))).length()*lib.scale).toFixed(3)};
}

function prepareWeapon(container,name){
  var mesh=container.meshes.filter(function(m){return m.getTotalVertices()>0;})[0];if(!mesh)throw new Error('weapon FBX has no mesh');
  /* Bake the loader's root (handedness + units) into the vertices, then normalise units from the
     known butt position; Babylon flips the winding when the baked transform mirrors. */
  mesh.bakeCurrentTransformIntoVertices();mesh.parent=null;
  var pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),zmin=Infinity,zmax=-Infinity,i;
  for(i=2;i<pos.length;i+=3){zmin=Math.min(zmin,pos[i]);zmax=Math.max(zmax,pos[i]);}
  var k=-WEAPON_BUTT/zmin;if(isFinite(k)&&Math.abs(k-1)>1e-3){mesh.bakeTransformIntoVertices(MX.Scaling(k,k,k));zmax*=k;}
  pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);var ys=0,n=0;
  for(i=0;i<pos.length;i+=3)if(pos[i+2]>zmax-.03){ys+=pos[i+1];n++;}
  var mat=mesh.material;if(mat){if(mat.specularColor)mat.specularColor.set(.08,.08,.08);if(mat.diffuseTexture)mat.diffuseTexture.anisotropicFilteringLevel=4;}
  mesh.isPickable=false;mesh.refreshBoundingInfo();
  return{name:name,mesh:mesh,muzzle:[0,n?ys/n:0,zmax]};
}
function loadWeapons(scene,st,base){
  st.weapons={};
  return Promise.all(Object.keys(WEAPON_MODELS).map(function(faction){
    return loadContainer(scene,base+'weapons/'+WEAPON_MODELS[faction]).then(function(c){st.weapons[faction]=prepareWeapon(c,WEAPON_MODELS[faction]);})
      .catch(function(e){console.warn('[ANIM] weapon model unavailable for '+faction+'; box rifle stays',e);});
  }));
}
function loadLibrary(scene){
  var st=sceneState(scene);if(st.loading)return st.loading;
  var base=assetBase(),started=Date.now();
  st.loading=ensureLoader().then(function(){
    return Promise.all(Object.keys(MODELS).map(function(faction){
      return loadContainer(scene,base+'soldiers/'+MODELS[faction]).then(function(c){st.libs[faction]=prepareModel(c);st.libs[faction].faction=faction;});
    }).concat([loadWeapons(scene,st,base)]));
  }).then(function(){
    return Promise.all(Object.keys(CLIPS).map(function(key){
      return loadContainer(scene,base+'animations/'+encodeURIComponent(CLIPS[key][0])+'.fbx').then(function(c){
        try{if(!st.src){st.src=sourceRig(c);st.bones=st.src.bones;}return convertClip(c,key,CLIPS[key],st.bones);}finally{c.dispose();}
      });
    }));
  }).then(function(list){
    st.clips={};list.forEach(function(clip){st.clips[clip.key]=clip;});
    Object.keys(st.libs).forEach(function(f){retargetClips(st.libs[f],st.src,st.clips,st.bones);});
    st.animated=[];st.upper=[];st.hips=st.bones.indexOf('Hips');st.spineRoot=st.bones.indexOf('Spine02');
    st.bones.forEach(function(name,i){
      if(list.some(function(c){return!!c.channels[i];}))st.animated.push(i);
      st.upper[i]=!!UPPER[name];
    });
    Object.keys(st.libs).forEach(function(f){solveGrips(st.libs[f],st.libs[f].clips.aim,st.bones);});
    hookRender(scene,st);st.ready=true;
    console.log('[ANIM] FBX soldiers ready: '+MODEL_SET+' '+Object.keys(st.libs).map(function(f){return f+(st.libs[f].retargeted?' (retargeted)':'');}).join('/')+', rifles '+Object.keys(st.weapons||{}).map(function(f){return f+'='+st.weapons[f].name;}).join(' ')+', '+list.length+' clips, '+st.animated.length+' animated bones, '+(Date.now()-started)+' ms'+(SMOOTH_NORMALS?', smoothed normals':''));
    return true;
  }).catch(function(error){
    st.error=error;console.warn('[ANIM] FBX soldiers unavailable; procedural rig stays active',error);return false;
  });
  return st.loading;
}

/* ---- binding a soldier -------------------------------------------------------------------- */

function bind(soldier,scene,st,lib){
  var inst=lib.container.instantiateModelsToScene(function(name){return name;},false,{doNotInstantiate:true});
  var holder=new BABYLON.TransformNode('fbxSoldier',scene);holder.parent=soldier.poseRoot;holder.scaling.setAll(lib.scale);
  inst.rootNodes.forEach(function(n){n.parent=holder;});
  inst.animationGroups.forEach(function(g){g.stop();g.dispose();});
  var byName={},meshes=[];
  holder.getDescendants(false).forEach(function(n){
    byName[n.name]=n;
    if(n.getTotalVertices&&n.getTotalVertices()>0){n.isPickable=false;n.alwaysSelectAsActiveMesh=true;meshes.push(n);}
  });
  holder.onDisposeObservable.add(function(){inst.skeletons.forEach(function(k){k.dispose();});});

  /* Retire the primitive body. The weapon socket leaves the chest first: it now follows the hand
     but stays parented to the soldier root, so it inherits neither model scale nor handedness. */
  var socket=soldier.weaponSocket;socket.parent=soldier.root;if(!socket.rotationQuaternion)socket.rotationQuaternion=new Q();
  socket._fbxFaction=lib.faction;
  var hips=soldier.rig&&soldier.rig.hips;if(hips&&!hips.isDisposed())hips.dispose();
  soldier.rig=null;

  /* Soldier root -> right hand. The render pass composes this chain itself (see handChain). */
  var hand=byName.RightHand,path=[],pathL=[];for(var n=hand;n;n=n.parent)path.unshift(n);for(n=byName.LeftHand;n;n=n.parent)pathL.unshift(n);
  var nodes=st.bones.map(function(name){var node=byName[name]||null;if(node&&!node.rotationQuaternion)node.rotationQuaternion=new Q();return node;});
  var fx={lib:lib,st:st,nodes:nodes,holder:holder,meshes:meshes,root:soldier.root,socket:socket,hand:hand,path:path,chain:path.map(function(){return new MX();}),spineAt:path.indexOf(byName.Spine),
    pathL:pathL,chainL:pathL.map(function(){return new MX();}),spineAtL:pathL.indexOf(byName.Spine),weaponModel:null,twoHand:0,weaponKind:'rifle',
    lower:{entries:[]},upper:{entries:[]},overlay:0,overlayTarget:0,stance:null,transition:null,sector:0,family:null,moving:false,
    vx:0,vz:0,speed:0,lastX:null,lastZ:null,aim:0,aimWanted:false,aimAt:null,spine:byName.Spine||null,fireHold:0,fireShot:0,fireSeen:0,reloadShot:0,reloadSeen:0,reloadDuration:2.5,death:null};
  soldier._fbx=fx;
  soldier.animationBinding={backend:BACKEND,tags:TAGS,play:play,update:update};
  st.active.push(fx);
  return fx;
}

/* ---- clip layers -------------------------------------------------------------------------- */

function setClip(layer,clip,rate,fade,restart,keepPhase){
  var entries=layer.entries,top=entries[entries.length-1];
  if(top&&top.clip===clip&&!restart){top.rate=rate;return top;}
  var t=0;if(keepPhase&&top&&top.clip.loop&&clip.loop)t=(top.t/top.clip.duration)*clip.duration;
  var entry={clip:clip,t:t,rate:rate,w:entries.length?0:1};
  entries.push(entry);layer.fade=Math.max(.01,fade);
  if(entries.length>4)entries.splice(0,entries.length-4);
  return entry;
}
function advanceLayer(layer,dt){
  var entries=layer.entries,n=entries.length;if(!n)return;
  for(var i=0;i<n;i++){var e=entries[i],d=e.clip.duration;e.t+=dt*e.rate;e.t=e.clip.loop?((e.t%d)+d)%d:Math.min(d,e.t);}
  var top=entries[n-1],rest=0;top.w=Math.min(1,top.w+dt/(layer.fade||.25));
  for(i=0;i<n-1;i++)rest+=entries[i].w;
  var scale=rest>0?(1-top.w)/rest:0;
  for(i=n-2;i>=0;i--){entries[i].w*=scale;if(entries[i].w<.002)entries.splice(i,1);}
  if(entries.length===1)top.w=1;
}
function topEntry(layer){return layer.entries[layer.entries.length-1]||null;}

/* ---- simulation-side state machine -------------------------------------------------------- */

function play(tag,data,soldier){
  var fx=soldier&&soldier._fbx;if(!fx)return;
  if(tag===TAGS.fire)fx.fireShot++;
  else if(tag===TAGS.reload){fx.reloadShot++;fx.reloadDuration=+(data&&data.duration)||(soldier.weapon&&soldier.weapon.stats&&soldier.weapon.stats.reloadTime)||2.5;}
}
function clamp(v,a,b){return v<a?a:(v>b?b:v);}
function sectorOf(fx,angle){
  /* Eight-way sector with a little stickiness so a diagonal path does not flicker between clips. */
  var step=Math.PI/4,current=fx.sector,diff=Math.atan2(Math.sin(angle-current*step),Math.cos(angle-current*step));
  if(Math.abs(diff)<step*.5+.14)return current;
  return((Math.round(angle/step)%8)+8)%8;
}
function familyOf(fx,clips,speed){
  var best=null,bestCost=Infinity;
  ['walk','run','sprint'].forEach(function(f){
    var natural=clips[f+'0'].speed||1,cost=Math.abs(Math.log(Math.max(.05,speed)/natural));
    if(f===fx.family)cost-=.18;
    if(cost<bestCost){bestCost=cost;best=f;}
  });
  return best;
}
function update(soldier,state,dt){
  var fx=soldier._fbx;if(!fx)return false;
  var clips=fx.lib.clips;dt=Math.max(0,+dt||0);
  if(soldier.weapon&&soldier.weapon.kind){fx.weaponKind=soldier.weapon.kind;fx.weaponModel=soldier.weapon.model||null;}

  /* Ground velocity from what navigation actually did this step, in the soldier's own frame. */
  var p=soldier.root.position;
  if(fx.lastX==null||dt<=0){fx.lastX=p.x;fx.lastZ=p.z;}
  var vx=dt>0?(p.x-fx.lastX)/dt:0,vz=dt>0?(p.z-fx.lastZ)/dt:0;fx.lastX=p.x;fx.lastZ=p.z;
  if(vx*vx+vz*vz>225){vx=fx.vx;vz=fx.vz;} /* respawn/teleport: not motion, keep the last estimate */
  var k=1-Math.exp(-dt*9);fx.vx+=(vx-fx.vx)*k;fx.vz+=(vz-fx.vz)*k;fx.speed=Math.sqrt(fx.vx*fx.vx+fx.vz*fx.vz);

  if(soldier.dead){
    if(!fx.death){
      var v=soldier.deathVariant==='front'?'deathFront':(soldier.deathVariant==='back'?'deathBack':'deathSide');
      if(fx.stance==='prone')v='deathProne';else if(fx.stance==='crouch'&&v==='deathFront')v='deathCrouch';
      fx.death=v;setClip(fx.lower,clips[v],1,.18,true,false);
    }
    fx.overlayTarget=0;fx.aimWanted=false;advance(fx,dt);return true;
  }
  fx.death=null;

  var stance=soldier.prone?'prone':(soldier.crouching?'crouch':'stand');
  if(fx.stance==null)fx.stance=stance;
  if(stance!==fx.stance){
    /* Kneel<->prone clips carry the body through the ground change; stand<->crouch is a blend. */
    fx.transition=stance==='prone'?'toProne':(fx.stance==='prone'?'fromProne':null);
    if(fx.transition)setClip(fx.lower,clips[fx.transition],1.5,.22,true,false);
    fx.stance=stance;
  }
  if(fx.transition){
    var tr=topEntry(fx.lower);
    if(tr&&tr.clip.key===fx.transition&&tr.t<tr.clip.duration-.3*tr.rate){fx.overlayTarget=0;fx.aimWanted=false;advance(fx,dt);return true;}
    fx.transition=null;
  }

  var speed=fx.speed,moving=stance==='prone'?(fx.moving?speed>.1:speed>.22):(fx.moving?speed>.18:speed>.35);fx.moving=moving;
  var yaw=soldier.root.rotation.y||0,sin=Math.sin(yaw),cos=Math.cos(yaw);
  var forward=fx.vx*sin+fx.vz*cos,right=fx.vx*cos-fx.vz*sin,angle=Math.atan2(right,forward);
  var clip,rate=1;
  if(!moving){clip=clips[stance==='prone'?'proneIdle':(stance==='crouch'?'crouchIdle':'idle')];fx.family=null;}
  else if(stance==='prone'){clip=clips[Math.abs(angle)<1.9?'proneForward':'proneBackward'];rate=clamp(speed/(clip.speed||.3),.6,2.2);}
  else{
    var family=stance==='crouch'?'crouch':familyOf(fx,clips,speed);fx.family=family;
    fx.sector=sectorOf(fx,angle);clip=clips[family+fx.sector];rate=clamp(speed/(clip.speed||1.5),.55,1.8);
  }
  setClip(fx.lower,clip,rate,.25,false,true);

  var over=null,orate=1,restart=false;
  fx.fireHold=Math.max(0,fx.fireHold-dt);
  if(fx.fireShot!==fx.fireSeen){fx.fireSeen=fx.fireShot;fx.fireHold=.9;restart=fx.weaponKind!=='lmg';}
  if(fx.reloadShot!==fx.reloadSeen){fx.reloadSeen=fx.reloadShot;restart=true;}
  if(soldier.reloading){
    over=stance==='prone'?'reloadProne':(stance==='crouch'?'reloadCrouch':'reload');
    orate=clips[over].duration/Math.max(.5,fx.reloadDuration);
  }else if(fx.fireHold>0){
    var auto=fx.weaponKind==='lmg';
    over=stance==='prone'?(auto?'fireAutoProne':'fireProne'):(auto?'fireAuto':(stance==='crouch'?'fireCrouch':'fire'));orate=auto?1:1.3;
  }else if(soldier.target&&stance!=='prone'){over=stance==='crouch'?'crouchAim':'aim';restart=false;}
  else restart=false;
  if(over){setClip(fx.upper,clips[over],orate,.16,restart,false);fx.overlayTarget=1;}else fx.overlayTarget=0;
  var t=soldier.target&&soldier.target.root&&soldier.target.root.position;
  fx.aimWanted=!soldier.reloading&&(!!t||fx.fireHold>0);fx.aimAt=t||null;
  advance(fx,dt);
  return true;
}
function advance(fx,dt){
  advanceLayer(fx.lower,dt);advanceLayer(fx.upper,dt);
  var step=dt/.22;fx.overlay=fx.overlay<fx.overlayTarget?Math.min(fx.overlayTarget,fx.overlay+step):Math.max(fx.overlayTarget,fx.overlay-step);
  fx.aim=fx.aimWanted?Math.min(1,fx.aim+dt/.3):Math.max(0,fx.aim-dt/.3);
}

/* ---- render-side pose writing ------------------------------------------------------------- */

var qa=new Q(),qb=new Q(),qc=new Q(),qd=new Q(),hipsLower=new Q(),pa=new V3(),pb=new V3(),socketWorld=new MX(),rootInv=new MX(),sScale=new V3(),sRot=new Q(),sPos=new V3(),ONE=new V3(1,1,1);
function sampleLayer(layer,bone,q,pos){
  var entries=layer.entries,total=0,hasPos=false;q.set(0,0,0,0);pos.set(0,0,0);
  for(var i=0;i<entries.length;i++){
    var e=entries[i],ch=e.clip.channels[bone];if(!ch||e.w<=0)continue;
    var f=e.t*FPS,last=e.clip.frames-1,i0=Math.min(last,Math.floor(f)),i1=Math.min(last,i0+1),u=Math.min(1,Math.max(0,f-i0)),w=e.w;
    if(ch.rot){
      var r=ch.rot,a=i0*4,b=i1*4,x=r[a]+(r[b]-r[a])*u,y=r[a+1]+(r[b+1]-r[a+1])*u,z=r[a+2]+(r[b+2]-r[a+2])*u,ww=r[a+3]+(r[b+3]-r[a+3])*u;
      if(total>0&&x*q.x+y*q.y+z*q.z+ww*q.w<0)w=-w;
      q.x+=x*w;q.y+=y*w;q.z+=z*w;q.w+=ww*w;
    }
    if(ch.pos){var s=ch.pos,c=i0*3,d=i1*3,wp=Math.abs(w);pos.x+=(s[c]+(s[d]-s[c])*u)*wp;pos.y+=(s[c+1]+(s[d+1]-s[c+1])*u)*wp;pos.z+=(s[c+2]+(s[d+2]-s[c+2])*u)*wp;hasPos=true;}
    total+=Math.abs(e.w);
  }
  if(total<=0)return 0;
  q.normalize();if(hasPos)pos.scaleInPlace(1/total);
  return hasPos?2:1;
}
function applyPose(fx){
  var st=fx.st,nodes=fx.nodes,animated=st.animated,overlay=fx.overlay>.001&&fx.upper.entries.length;
  for(var n=0;n<animated.length;n++){
    var i=animated[n],node=nodes[i];if(!node)continue;
    var got=sampleLayer(fx.lower,i,qa,pa);
    if(i===st.hips&&got)hipsLower.copyFrom(qa);
    if(overlay&&st.upper[i]){
      var up=sampleLayer(fx.upper,i,qb,pb);
      /* The overlay's torso keeps the orientation it has in its own clip, re-expressed under the
         hips the legs are playing. Copying the spine's hips-local rotation instead would inherit
         the locomotion hips' twist and lean, and the rifle would stop pointing at the target. */
      if(up&&i===st.spineRoot&&sampleLayer(fx.upper,st.hips,qc,pb)){qc.multiplyToRef(qb,qd);Q.InverseToRef(hipsLower,qc);qc.multiplyToRef(qd,qb);}
      if(up){if(!got){qa.copyFrom(qb);got=1;}else{if(Q.Dot(qa,qb)<0)qb.scaleInPlace(-1);Q.SlerpToRef(qa,qb,fx.overlay,qa);}}
    }
    if(!got)continue;
    node.rotationQuaternion.copyFrom(qa);
    if(got===2)node.position.copyFrom(pa);
  }
  /* Weapon follows the right hand: socket world = grip offset x hand world, expressed under root. */
  var key=fx.weaponModel&&fx.lib.grips&&fx.lib.grips[fx.weaponModel]?fx.weaponModel:fx.weaponKind;
  var grip=fx.lib.grips&&(fx.lib.grips[key]||fx.lib.grips.rifle),points=WEAPON_POINTS[key]||WEAPON_POINTS.rifle;if(!grip||!fx.hand)return;
  handChain(fx.path,fx.chain,0);handChain(fx.pathL,fx.chainL,0);holdWeapon(fx,grip,points);
  if(fx.aim>.01&&fx.spineAt>0&&aimSpine(fx)){handChain(fx.path,fx.chain,fx.spineAt);handChain(fx.pathL,fx.chainL,fx.spineAtL);holdWeapon(fx,grip,points);}
  /* Body-shape and role scaling must not stretch the rifle: keep it at world scale 1. */
  socketWorld.decompose(sScale,sRot,sPos);MX.ComposeToRef(ONE,sRot,sPos,socketWorld);
  fx.chain[0].invertToRef(rootInv);socketWorld.multiplyToRef(rootInv,socketWorld);
  socketWorld.decompose(sScale,fx.socket.rotationQuaternion,fx.socket.position);fx.socket.scaling.copyFrom(sScale);
}
/* Two-hand hold. The rigid grip (weapon fixed to the right hand, solved from the aiming clip) is
   the base; then the weapon's grip point is put on the right palm anchor and the barrel swung so
   its fore-end point lines up with the left palm anchor, keeping the rigid hold's roll (sights
   up). Where the left hand is off the weapon (reload, deaths, stance changes) the hands are too far
   apart or at the wrong angle, and the hold fades back to the rigid one. */
var hR=new V3(),hL=new V3(),hV=new V3(),hA=new V3(),hUp=new V3(),hX=new V3(),hY=new V3(),hDir=new V3(),hG=new V3(),hS=new V3(),hP=new V3(),hQ=new Q(),hQw=new Q(),hQl=new Q(),hLa=new V3(),hLy=new V3(),hLx=new V3();
function smooth01(t){t=t<0?0:(t>1?1:t);return t*t*(3-2*t);}
function holdWeapon(fx,grip,points){
  grip.multiplyToRef(fx.chain[fx.chain.length-1],socketWorld);
  var palms=fx.lib.palms,f=points&&points.fore,g=points&&points.grip;fx.twoHand=0;
  if(!f||!g||!palms)return;
  V3.TransformCoordinatesToRef(palms.RightHand,fx.chain[fx.chain.length-1],hR);
  V3.TransformCoordinatesToRef(palms.LeftHand,fx.chainL[fx.chainL.length-1],hL);
  hL.subtractToRef(hR,hV);var dist=hV.length();if(dist<1e-4)return;hV.scaleInPlace(1/dist);
  socketWorld.decompose(hS,hQ,hP);dist/=hS.x;
  /* The point on the fore-end line at the clip's hand spacing (clamped to the fore-end). */
  var dy=f[1]-g[1],dx=f[0]-g[0],reach=Math.sqrt(Math.max(0,dist*dist-dy*dy-dx*dx)),z=Math.max(f[2],Math.min(f[3],g[2]+reach));
  hLa.set(dx,dy,z-g[2]);var span=hLa.length();hLa.scaleInPlace(1/span);
  hLa.rotateByQuaternionToRef(hQ,hDir);
  var near=Math.sqrt(dx*dx+dy*dy+(f[2]-g[2])*(f[2]-g[2])),far=Math.sqrt(dx*dx+dy*dy+(f[3]-g[2])*(f[3]-g[2]));
  var cos=V3.Dot(hDir,hV),w=smooth01((cos-Math.cos(1.05))/(Math.cos(.6)-Math.cos(1.05)))*smooth01((dist-near*.6)/(near*.3))*smooth01((far*1.35-dist)/(far*.25));
  if(w<=.001)return;
  /* World frame: forward along the hands, up from the rigid hold. Local frame: the same built on
     the weapon's grip->fore line. Rotation = world frame * local frame^-1. */
  V3.Up().rotateByQuaternionToRef(hQ,hUp);
  hUp.subtractToRef(hV.scale(V3.Dot(hUp,hV)),hY);hY.normalize();V3.CrossToRef(hY,hV,hX);
  hLy.set(0,1,0).subtractInPlace(hLa.scale(hLa.y));hLy.normalize();V3.CrossToRef(hLy,hLa,hLx);
  Q.RotationQuaternionFromAxisToRef(hX,hY,hV,hQw);Q.RotationQuaternionFromAxisToRef(hLx,hLy,hLa,hQl);
  hQl.conjugateInPlace();hQw.multiplyToRef(hQl,hQw);
  /* Grip point onto the right palm. */
  hG.set(g[0]*hS.x,g[1]*hS.y,g[2]*hS.z).rotateByQuaternionToRef(hQw,hA);hR.subtractToRef(hA,hA);
  Q.SlerpToRef(hQ,hQw,w,hQ);V3.LerpToRef(hP,hA,w,hP);
  MX.ComposeToRef(hS,hQ,hP,socketWorld);fx.twoHand=w;
}
/* Clips hold the rifle a little differently (crouched and prone aim sit low or wide), so while a
   soldier aims, the upper spine turns the barrel onto the target, by at most ~40 degrees. The
   rotation is applied about the spine's own origin and re-expressed in its parent's local space,
   which also absorbs the model's scale and handedness conversion. */
var aimDir=new V3(),aimWant=new V3(),aimAxis=new V3(),aimOrigin=new V3(),aimRot=new MX(),aimA=new MX(),aimB=new MX(),aimLocal=new MX(),aimPos=new V3(),aimScale=new V3(),aimQ=new Q();
function aimSpine(fx){
  var weapon=socketWorld;V3.TransformNormalToRef(V3.Forward(),weapon,aimDir);aimDir.normalize();
  var muzzle=weapon.getTranslation();
  if(fx.aimAt){aimWant.set(fx.aimAt.x-muzzle.x,(fx.aimAt.y||0)+1.2-muzzle.y,fx.aimAt.z-muzzle.z);}
  else{V3.TransformNormalToRef(V3.Forward(),fx.chain[0],aimWant);aimWant.y=0;}
  if(aimWant.lengthSquared()<1e-6)return false;aimWant.normalize();
  var dot=Math.max(-1,Math.min(1,V3.Dot(aimDir,aimWant))),angle=Math.min(.7,Math.acos(dot))*fx.aim;if(angle<.004)return false;
  V3.CrossToRef(aimDir,aimWant,aimAxis);if(aimAxis.lengthSquared()<1e-8)return false;aimAxis.normalize();
  MX.RotationAxisToRef(aimAxis,angle,aimRot);
  var spine=fx.spine,parent=fx.chain[fx.spineAt-1];fx.chain[fx.spineAt].getTranslationToRef(aimOrigin);
  /* C = parentWorld * T(-o) * R * T(o) * parentWorld^-1 ; local' = local * C */
  MX.TranslationToRef(-aimOrigin.x,-aimOrigin.y,-aimOrigin.z,aimA);parent.multiplyToRef(aimA,aimB);aimB.multiplyToRef(aimRot,aimA);
  MX.TranslationToRef(aimOrigin.x,aimOrigin.y,aimOrigin.z,aimB);aimA.multiplyToRef(aimB,aimA);parent.invertToRef(aimB);aimA.multiplyToRef(aimB,aimA);
  MX.ComposeToRef(spine.scaling,spine.rotationQuaternion,spine.position,aimLocal);aimLocal.multiplyToRef(aimA,aimLocal);
  aimLocal.decompose(aimScale,aimQ,aimPos);spine.rotationQuaternion.copyFrom(aimQ);
  return true;
}
/* World matrices from the soldier root down to a hand, composed straight from each node's TRS.
   Babylon's computeWorldMatrix(true) per node cost ~10x more; the chain has no pivots, billboards
   or parent-less jumps, so plain composition is exact. */
var chainLocal=new MX(),chainQ=new Q();
function handChain(path,chain,from){
  for(var i=from;i<path.length;i++){
    var n=path[i],q=n.rotationQuaternion;
    if(!q){Q.RotationYawPitchRollToRef(n.rotation.y,n.rotation.x,n.rotation.z,chainQ);q=chainQ;}
    MX.ComposeToRef(n.scaling,q,n.position,chainLocal);
    if(i)chainLocal.multiplyToRef(chain[i-1],chain[i]);else chain[i].copyFrom(chainLocal);
  }
}
function hookRender(scene,st){
  if(st.hooked)return;st.hooked=true;
  scene.onBeforeRenderObservable.add(function(){
    var list=st.active;
    for(var i=list.length-1;i>=0;i--){
      var fx=list[i];
      if(fx.holder.isDisposed()){list.splice(i,1);continue;}
      if(fx.root.isEnabled())applyPose(fx);
    }
  });
}

/* ---- BattleSoldierModel integration ------------------------------------------------------- */

var Weapons=root.BattleWeapons,oldAttach=Weapons&&Weapons.attachWeapon;
if(oldAttach)Weapons.attachWeapon=function(scene,socket,kind){
  var weapon=oldAttach.apply(this,arguments),faction=socket&&socket._fbxFaction,st=faction&&sceneState(scene),model=st&&st.weapons&&st.weapons[faction];
  if(model&&WEAPON_KINDS[kind]){
    var mesh=model.mesh.clone('weapon.'+faction,socket);mesh.position.set(0,0,0);mesh.isPickable=false;
    weapon.mesh.dispose();weapon.mesh=mesh;weapon.muzzleLocal=model.muzzle.slice();weapon.model=model.name;
  }
  return weapon;
};
var oldCreate=M.createSoldier,oldPreload=M.preload,oldSetEnabled=M.setImportedEnabled;
M.createSoldier=function(scene,faction){
  var soldier=oldCreate.apply(this,arguments),st=sceneState(scene),lib=st.ready&&st.enabled&&st.libs[faction==='ge'?'ge':'us'];
  if(lib){try{bind(soldier,scene,st,lib);}catch(e){console.warn('[ANIM] FBX soldier bind failed; keeping procedural rig',e);}}
  return soldier;
};
M.preload=function(scene){
  var before=oldPreload?Promise.resolve(oldPreload.apply(this,arguments)):Promise.resolve(true);
  /* Never hold the battle hostage to an asset host: fall back to the procedural rig after 25 s. */
  var timeout=new Promise(function(ok){setTimeout(function(){ok(false);},25000);});
  return before.then(function(){return Promise.race([loadLibrary(scene),timeout]);});
};
M.setImportedEnabled=function(scene,enabled){
  if(oldSetEnabled)oldSetEnabled.apply(this,arguments);
  if(scene)sceneState(scene).enabled=!!enabled;
};

root.BattleFbxSoldier={
  version:'1.1',backend:BACKEND,clips:CLIPS,models:MODELS,modelSet:MODEL_SET,
  load:loadLibrary,
  status:function(scene){var st=sceneState(scene);return{ready:st.ready,enabled:st.enabled,error:st.error?String(st.error.message||st.error):null,active:st.active.length,clips:st.clips?Object.keys(st.clips).length:0,bones:st.bones?st.bones.length:0};},
  clip:function(scene,key){var st=sceneState(scene);return st.clips&&st.clips[key]||null;}
};
console.log('[ANIM] FBX soldier backend installed (models + clips load with the battle)');
})(typeof window!=='undefined'?window:globalThis);
