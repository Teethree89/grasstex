/* Rigged stance transitions + a grounded prone crawl.
   Visual only: AI/gameplay stance flags remain authoritative. The articulated primitive soldier
   already exposes a conventional humanoid rig; this layer gives those joints staged motion when
   stand/crouch/prone changes, and replaces the old alternating prone leg kick with a low-crawl
   knee-draw cycle.

   Reference note: Quaternius' CC0 Universal Animation Library [Standard] uses the same broad
   humanoid semantics (pelvis/spines, upper/lower arms, thighs/calves/feet), so it is a useful
   retargeting reference. That Standard pack has crouch/kneeling motion but no prone-crawl clip,
   so the crawl below is authored on our own rig rather than pretending another clip is a crawl. */
(function(root){
'use strict';
if(typeof BABYLON==='undefined'||!root.BattleSoldierModel||root.BattleStanceTransitionCrawl)return;

var M=root.BattleSoldierModel,Q=BABYLON.Quaternion;
var oldAnimate=M.animateWalk,oldCrouch=M.setCrouch,oldProne=M.setProne;
var DUR={
  'stand>crouch':.34,'crouch>stand':.32,
  'crouch>prone':.68,'prone>crouch':.76,
  'stand>prone':.92,'prone>stand':1.02
};
var BODY=['hips','spine','chest','neck','thighR','shinR','footR','thighL','shinL','footL'];
var KNEEL={
  rootY:-.34,rootX:0,rootZ:.015,
  hips:[.42,0,0],spine:[.10,0,0],chest:[.05,0,0],neck:[-.05,0,0],
  thighR:[-.82,0,.08],shinR:[1.35,0,0],footR:[-.55,0,0],
  thighL:[-.56,0,-.06],shinL:[1.08,0,0],footL:[-.48,0,0]
};
var qBraceUpper=new Q(),qBraceFore=new Q();
Q.FromEulerAnglesToRef(-1.04,.05,-.28,qBraceUpper);
Q.FromEulerAnglesToRef(-.72,0,.08,qBraceFore);

function stance(s){return s&&s.prone?'prone':(s&&s.crouching?'crouch':'stand');}
function ease(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function euler(n){
  if(!n)return[0,0,0];
  if(n.rotationQuaternion){var e=n.rotationQuaternion.toEulerAngles();return[e.x,e.y,e.z];}
  return[+n.rotation.x||0,+n.rotation.y||0,+n.rotation.z||0];
}
function snapshot(s){
  var r=s&&s.rig,out={rootY:+s.poseRoot.position.y||0,rootX:+s.poseRoot.position.x||0,rootZ:+s.poseRoot.position.z||0};
  for(var i=0;i<BODY.length;i++)out[BODY[i]]=euler(r&&r[BODY[i]]);
  return out;
}
function setEuler(n,a){
  if(!n||!a)return;
  n.rotationQuaternion=null;n.rotation.set(a[0],a[1],a[2]);
}
function mixPose(a,b,t){
  var out={rootY:lerp(a.rootY,b.rootY,t),rootX:lerp(a.rootX,b.rootX,t),rootZ:lerp(a.rootZ,b.rootZ,t)};
  for(var i=0;i<BODY.length;i++){
    var k=BODY[i],aa=a[k]||[0,0,0],bb=b[k]||[0,0,0];
    out[k]=[lerp(aa[0],bb[0],t),lerp(aa[1],bb[1],t),lerp(aa[2],bb[2],t)];
  }
  return out;
}
function applyPose(s,p){
  if(!s||!s.rig||!s.poseRoot||!p)return;
  s.poseRoot.position.x=p.rootX;s.poseRoot.position.y=p.rootY;s.poseRoot.position.z=p.rootZ;
  for(var i=0;i<BODY.length;i++)setEuler(s.rig[BODY[i]],p[BODY[i]]);
}
function startTransition(s,from,to){
  if(!s||from===to)return;
  var key=from+'>'+to,d=DUR[key];if(!d)return;
  s._stanceVisualTransition={from:from,to:to,key:key,t:0,duration:d,source:snapshot(s)};
}
function detectTransition(s){
  var req=stance(s),last=s._stanceVisualRequested;
  if(last==null){s._stanceVisualRequested=req;return;}
  if(req!==last){startTransition(s,last,req);s._stanceVisualRequested=req;}
}
function kneelPose(source,target,key){
  var k={rootY:KNEEL.rootY,rootX:KNEEL.rootX,rootZ:KNEEL.rootZ};
  for(var i=0;i<BODY.length;i++){var n=BODY[i],v=KNEEL[n]||[0,0,0];k[n]=v.slice();}
  /* Crouch<->prone starts/ends lower than the full stand transition, so keep the bridge compact. */
  if(key==='crouch>prone'||key==='prone>crouch')k.rootY=-.39;
  return k;
}
function applyTransition(s,dt,target){
  var tr=s._stanceVisualTransition;if(!tr)return;
  tr.t+=dt;var u=Math.min(1,tr.t/tr.duration),p;
  if(tr.key.indexOf('prone')>=0&&tr.key!=='stand>crouch'&&tr.key!=='crouch>stand'){
    var knee=kneelPose(tr.source,target,tr.key),split=(tr.from==='prone'?.58:.40);
    if(u<split)p=mixPose(tr.source,knee,ease(u/split));
    else p=mixPose(knee,target,ease((u-split)/(1-split)));
  }else p=mixPose(tr.source,target,ease(u));
  applyPose(s,p);
  if(u>=1){s._stanceVisualTransition=null;}
}
function slerpBrace(n,target,w,tmp){
  if(!n||w<=0)return;var from=n.rotationQuaternion;
  if(!from){from=Q.FromEulerAngles(n.rotation.x,n.rotation.y,n.rotation.z);}
  Q.SlerpToRef(from,target,w,tmp);n.rotationQuaternion=tmp.clone();
}
function braceWeight(tr){
  if(!tr||tr.key.indexOf('prone')<0)return 0;
  var u=Math.min(1,tr.t/tr.duration);
  /* Plant the left hand around the kneeling/lowering bridge, then return it to the fore-end. */
  var c=tr.from==='prone'?.48:.46,w=1-Math.min(1,Math.abs(u-c)/.24);
  return ease(Math.max(0,w));
}
var qTmpA=new Q(),qTmpB=new Q();
function applyBrace(s){
  var tr=s._stanceVisualTransition,w=braceWeight(tr);if(w<=.001||!s.rig)return;
  /* Right arm remains whatever weapon IK produced. Only the left arm releases the fore-end to
     brace the body briefly during the prone transition. */
  slerpBrace(s.rig.upperArmL,qBraceUpper,w,qTmpA);
  slerpBrace(s.rig.forearmL,qBraceFore,w,qTmpB);
}
function lowCrawl(s,dt,speed){
  if(!s||!s.prone||!s.crawling||!(speed>.02)||!s.rig)return;
  var r=s.rig,rate=2.05+Math.min(1,speed)*1.9;
  s._lowCrawlPhase=(s._lowCrawlPhase||0)+dt*rate;
  var wave=Math.sin(s._lowCrawlPhase),rp=.5+.5*wave,lp=1-rp;
  /* A low crawl is a knee draw, not a swim kick: one knee opens and comes forward while the
     opposite leg stays long. Feet remain near the ground and the pelvis only rolls subtly. */
  setEuler(r.thighR,[.02+.15*rp,0,.10+.19*rp]);
  setEuler(r.shinR,[.10+.40*rp,0,0]);
  setEuler(r.footR,[-.07-.07*rp,0,-.03*rp]);
  setEuler(r.thighL,[.02+.15*lp,0,-.10-.19*lp]);
  setEuler(r.shinL,[.10+.40*lp,0,0]);
  setEuler(r.footL,[-.07-.07*lp,0,.03*lp]);
  /* Tiny body weight shift sells propulsion without lifting the legs into a flutter kick. */
  var h=euler(r.hips);setEuler(r.hips,[h[0],wave*.035,wave*.025]);
  s.poseRoot.position.x=wave*.012;s.poseRoot.position.z=.03+Math.cos(s._lowCrawlPhase*2)*.006;
}

M.setCrouch=function(s,v){
  var before=stance(s),out=oldCrouch.apply(this,arguments),after=stance(s);
  if(s&&after!==before){startTransition(s,before,after);s._stanceVisualRequested=after;}
  return out;
};
M.setProne=function(s,v){
  var before=stance(s),out=oldProne.apply(this,arguments),after=stance(s);
  if(s&&after!==before){startTransition(s,before,after);s._stanceVisualRequested=after;}
  return out;
};
M.animateWalk=function(s,dt,speed){
  if(!s)return oldAnimate.apply(this,arguments);
  detectTransition(s);
  var out=oldAnimate.apply(this,arguments);
  if(s.dead){s._stanceVisualTransition=null;return out;}
  lowCrawl(s,+dt||0,+speed||0);
  var target=snapshot(s);applyTransition(s,+dt||0,target);applyBrace(s);
  return out;
};

root.BattleStanceTransitionCrawl={
  version:'1.0',durations:DUR,
  libraryReference:{name:'Universal Animation Library [Standard]',license:'CC0',humanoidCompatible:true,containsProneCrawl:false},
  transition:function(s,from,to){startTransition(s,from,to);}
};
console.log('[ANIM] six rigged stance transitions + grounded low-crawl override active');
})(typeof window!=='undefined'?window:globalThis);
