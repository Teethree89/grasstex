/* Bake driver: map.svg -> height.u16.bin + splat.png + stats.json */
'use strict';
const fs=require('fs'),P=require('path'),B=require('./bake.js');
const {WORLD,RES,N,NL,DS,MAX_GRADE,GRADE_ITERS,CUT_SLOPE,FILL_SLOPE,MAX_DAYLIGHT,
  JUNCTION_TOL,NOISE_AMP,ss,prismHalf,profile,readMap,buildBase,sampleLow,fbm,png}=B;
const SMOOTH_LEN=40;
const OUT=P.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const t0=Date.now(),log=m=>console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] ${m}`);

/* ---------- 1. authored base ---------- */
const map=readMap(P.join(__dirname,'map.svg'));
const base=buildBase(map.hills);
log(`base: 8-bit step ${base.quantStep.toFixed(3)} m | banding after blur - plain ${(base.bandPlain.rms*1000).toFixed(1)} mm rms, dithered ${(base.bandDither.rms*1000).toFixed(1)} mm rms`);

const natural=new Float32Array(N*N);
for(let j=0;j<N;j++)for(let i=0;i<N;i++){const px=(i+0.5)*RES,py=(j+0.5)*RES;
  natural[j*N+i]=sampleLow(base.low,px,py)+NOISE_AMP*fbm(px,py,7);}
log('natural terrain built');
const nat=(px,py)=>{const i=Math.min(N-1,Math.max(0,Math.floor(px/RES))),j=Math.min(N-1,Math.max(0,Math.floor(py/RES)));return natural[j*N+i];};

/* ---------- 2. arc-length + junction snapping ---------- */
function arclen(pts){const s=[0];for(let i=1;i<pts.length;i++)s.push(s[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return s;}
function nearestOn(r,x,y){let best={d:Infinity};
  for(let i=1;i<r.pts.length;i++){const a=r.pts[i-1],b=r.pts[i];
    const vx=b[0]-a[0],vy=b[1]-a[1],vv=vx*vx+vy*vy;
    let u=vv>1e-12?((x-a[0])*vx+(y-a[1])*vy)/vv:0;u=u<0?0:u>1?1:u;
    const qx=a[0]+vx*u,qy=a[1]+vy*u,d=Math.hypot(x-qx,y-qy);
    if(d<best.d)best={d,s:r.s[i-1]+u*(r.s[i]-r.s[i-1]),x:qx,y:qy};}
  return best;}
for(const r of map.roads){r.s=arclen(r.pts);r.len=r.s[r.s.length-1];}
const junctions=[];
for(let k=1;k<map.roads.length;k++){const r=map.roads[k];
  for(const end of [0,1]){
    const idx=end?r.pts.length-1:0,pt=r.pts[idx];
    let best=null;
    for(let h=0;h<k;h++){const q=nearestOn(map.roads[h],pt[0],pt[1]);
      if(q.d<JUNCTION_TOL&&(!best||q.d<best.d))best={...q,host:map.roads[h]};}
    if(best){r.pts[idx]=[best.x,best.y];junctions.push({road:r.id,host:best.host.id,end,s:best.s,snap:best.d,x:best.x,y:best.y});}
  }
  r.s=arclen(r.pts);r.len=r.s[r.s.length-1];
}
log(`junctions: ${junctions.map(j=>`${j.road}->${j.host} (moved ${j.snap.toFixed(2)} m)`).join(', ')||'none'}`);

/* ---------- 3. longitudinal grading ---------- */
function xyAt(r,s){let i=1;while(i<r.s.length-1&&r.s[i]<s)i++;
  const u=(s-r.s[i-1])/Math.max(1e-9,r.s[i]-r.s[i-1]);
  return [r.pts[i-1][0]+(r.pts[i][0]-r.pts[i-1][0])*u,r.pts[i-1][1]+(r.pts[i][1]-r.pts[i-1][1])*u];}
function elevAt(r,s){const f=Math.min(r.prof.length-1.001,Math.max(0,s/DS)),i=Math.floor(f);
  return r.prof[i]+(r.prof[i+1]-r.prof[i])*(f-i);}
const gradeReport=[];
for(const r of map.roads){
  const ns=Math.max(2,Math.ceil(r.len/DS)+1),g=new Float64Array(ns);
  for(let i=0;i<ns;i++){const [x,y]=xyAt(r,Math.min(r.len,i*DS));g[i]=nat(x,y);}
  const pins=[];
  for(const j of junctions)if(j.road===r.id){const host=map.roads.find(q=>q.id===j.host);
    pins.push({i:j.end?ns-1:0,v:elevAt(host,j.s)});}
  const p=Float64Array.from(g),maxD=MAX_GRADE*DS,MU=0.35,LAM=MU/Math.pow(SMOOTH_LEN/DS,2);
  for(let it=0;it<GRADE_ITERS;it++){
    const q=Float64Array.from(p);
    for(let i=1;i<ns-1;i++)p[i]=q[i]+LAM*(g[i]-q[i])+MU*(q[i-1]-2*q[i]+q[i+1]);
    for(const pn of pins)p[pn.i]=pn.v;
    for(let i=1;i<ns;i++){const d=p[i]-p[i-1];if(d>maxD)p[i]=p[i-1]+maxD;else if(d<-maxD)p[i]=p[i-1]-maxD;}
    for(let i=ns-2;i>=0;i--){const d=p[i]-p[i+1];if(d>maxD)p[i]=p[i+1]+maxD;else if(d<-maxD)p[i]=p[i+1]-maxD;}
    for(const pn of pins)p[pn.i]=pn.v;
  }
  r.prof=p;
  let mg=0,drift=0,cut=0,fill=0;
  for(let i=1;i<ns;i++)mg=Math.max(mg,Math.abs(p[i]-p[i-1])/DS);
  for(const pn of pins)drift=Math.max(drift,Math.abs(p[pn.i]-pn.v));
  for(let i=0;i<ns;i++){const d=p[i]-g[i];if(d<0)cut+=-d;else fill+=d;}
  gradeReport.push({road:r.id,len:+r.len.toFixed(1),maxGrade:+(mg*100).toFixed(2),
    pinDrift:+drift.toFixed(4),meanCut:+(cut/ns).toFixed(2),meanFill:+(fill/ns).toFixed(2)});
}
log('graded: '+gradeReport.map(g=>`${g.road} ${g.maxGrade}% cut ${g.meanCut} fill ${g.meanFill}`).join(' | '));

/* ---------- 4. road distance field (two nearest roads) ----------
   One nearest road is not enough. Wherever two daylight regions overlap the Voronoi
   boundary between them is a STEP, because the two roads sit at different design
   elevations - and that boundary runs far beyond any junction disc. Keeping the two
   nearest lets the compose pass intersect both cones instead of picking one. */
const dist=new Float32Array(N*N).fill(Infinity),rid=new Uint8Array(N*N).fill(255),sarc=new Float32Array(N*N);
const dist1=new Float32Array(N*N).fill(Infinity),rid1=new Uint8Array(N*N).fill(255),sarc1=new Float32Array(N*N);
for(let k=0;k<map.roads.length;k++){const r=map.roads[k],reach=prismHalf(r.mat,r.hw)+MAX_DAYLIGHT;
  for(let seg=1;seg<r.pts.length;seg++){
    const a=r.pts[seg-1],b=r.pts[seg];
    const i0=Math.max(0,Math.floor((Math.min(a[0],b[0])-reach)/RES)),i1=Math.min(N-1,Math.ceil((Math.max(a[0],b[0])+reach)/RES));
    const j0=Math.max(0,Math.floor((Math.min(a[1],b[1])-reach)/RES)),j1=Math.min(N-1,Math.ceil((Math.max(a[1],b[1])+reach)/RES));
    const vx=b[0]-a[0],vy=b[1]-a[1],vv=vx*vx+vy*vy;
    for(let j=j0;j<=j1;j++){const py=(j+0.5)*RES;
      for(let i=i0;i<=i1;i++){const px=(i+0.5)*RES;
        let u=vv>1e-12?((px-a[0])*vx+(py-a[1])*vy)/vv:0;u=u<0?0:u>1?1:u;
        const dx=px-(a[0]+vx*u),dy=py-(a[1]+vy*u),d=Math.sqrt(dx*dx+dy*dy);
        if(d>reach)continue;
        const o=j*N+i,sv=r.s[seg-1]+u*(r.s[seg]-r.s[seg-1]);
        if(rid[o]===k){if(d<dist[o]){dist[o]=d;sarc[o]=sv;}continue;}
        if(rid1[o]===k&&d>=dist[o]){if(d<dist1[o]){dist1[o]=d;sarc1[o]=sv;}continue;}
        if(d<dist[o]){dist1[o]=dist[o];rid1[o]=rid[o];sarc1[o]=sarc[o];dist[o]=d;rid[o]=k;sarc[o]=sv;}
        else if(d<dist1[o]){dist1[o]=d;rid1[o]=k;sarc1[o]=sv;}
      }}
  }}
log('distance field built');

/* ---------- 5. compose: prism, cut/fill, daylight ---------- */
const height=new Float32Array(N*N),splat=new Uint8Array(N*N*4);
const dayBins=map.roads.map(r=>new Float32Array(Math.ceil(r.len/DS)+1));
let capped=0,influenced=0;
for(let o=0;o<N*N;o++){
  const k=rid[o];let h=natural[o],g=255,a=0,d2=0,c=0;
  if(k!==255){
    const r=map.roads[k],m=r.mat,hw=r.hw,ph=prismHalf(m,hw),t=dist[o],E=elevAt(r,sarc[o]);
    if(t<=ph){h=E+profile(m,hw,t);influenced++;
      const w=1-ss((t-hw)/0.45);                 /* paved core, short feather */
      const v=Math.round(255*w);g=255-v;
      if(m.splat===1)a=v;else if(m.splat===2)d2=v;else c=v;
    }else{
      const dd=t-ph;
      if(dd<=MAX_DAYLIGHT){influenced++;
        /* Ground must daylight to EVERY nearby road, so intersect the cones. max/min
           of continuous functions stays continuous - the old nearest-road pick did
           not, which is what put a step along the Voronoi boundary. */
        let lo=E-dd*FILL_SLOPE,hi=E+dd*CUT_SLOPE;
        const k1=rid1[o];
        if(k1!==255){const r1=map.roads[k1],dd1=Math.max(0,dist1[o]-prismHalf(r1.mat,r1.hw));
          if(dd1<=MAX_DAYLIGHT){const E1=elevAt(r1,sarc1[o]);
            const l1=E1-dd1*FILL_SLOPE,h1=E1+dd1*CUT_SLOPE;
            if(l1>lo)lo=l1;if(h1<hi)hi=h1;}}
        if(lo>hi){const mid=(lo+hi)*0.5;lo=hi=mid;}
        if(h>hi)h=hi;else if(h<lo)h=lo;
        if(h!==natural[o]){const bi=Math.min(dayBins[k].length-1,Math.round(sarc[o]/DS));
          if(dd>dayBins[k][bi])dayBins[k][bi]=dd;
          if(dd>MAX_DAYLIGHT-RES){capped++;}   /* still binding at the cap = needs a wall */
        }
      }
    }
  }
  height[o]=h;splat[o*4]=g;splat[o*4+1]=a;splat[o*4+2]=d2;splat[o*4+3]=c;
}
log('composed');

/* ---------- 5b. junction blending ----------
   Nearest-road assignment is wrong wherever two roads are both close: the profiles
   meet at a hard boundary and the branch drives its ditch straight through the host's
   pavement. Inside a disc around each node we instead blend every incident road by
   inverse-square distance to its centreline, and fade each road's ditch out toward a
   crown-only apron - a ditch across a junction is the artifact, not a feature.
   The disc result is lerped against the nearest-road result by b, which reaches 0 at
   the rim, so the patch cannot introduce a seam of its own. */
function crownOnly(m,hw,t){if(t>hw)return 0;const u=t/hw;return m.crown*(1-u*u);}
const nodes=[];
function tangent(r,s){const e=1.0,[ax,ay]=xyAt(r,Math.max(0,s-e)),[bx,by]=xyAt(r,Math.min(r.len,s+e));
  const L=Math.hypot(bx-ax,by-ay)||1;return [(bx-ax)/L,(by-ay)/L];}
for(const j of junctions){
  const br=map.roads.find(q=>q.id===j.road),ho=map.roads.find(q=>q.id===j.host);
  const inc=[{r:br,s:j.end?br.len:0},{r:ho,s:j.s}];
  /* Two prisms of half-width p crossing at angle t overlap over ~p/sin(t), so a disc
     sized only by width leaves the acute-angle wedge outside it - which is exactly
     where the two ditches collide. Scale the radius by 1/sin(theta) and cap it. */
  const t0=tangent(inc[0].r,inc[0].s),t1=tangent(inc[1].r,inc[1].s);
  const sinT=Math.max(0.30,Math.abs(t0[0]*t1[1]-t0[1]*t1[0]));
  const ph=Math.max(...inc.map(i=>prismHalf(i.r.mat,i.r.hw)));
  nodes.push({x:j.x,y:j.y,inc,sinT:+sinT.toFixed(3),R:Math.min(42,2.2*ph/sinT)});
}
log('junction discs: '+nodes.map(n=>`R=${n.R.toFixed(1)} m (sin${String.fromCharCode(952)}=${n.sinT})`).join(', '));
let jCells=0;const preJ=[];
for(const nd of nodes){
  const Rin=0.35*nd.R;
  const i0=Math.max(0,Math.floor((nd.x-nd.R)/RES)),i1=Math.min(N-1,Math.ceil((nd.x+nd.R)/RES));
  const j0=Math.max(0,Math.floor((nd.y-nd.R)/RES)),j1=Math.min(N-1,Math.ceil((nd.y+nd.R)/RES));
  for(let jj=j0;jj<=j1;jj++)for(let ii=i0;ii<=i1;ii++){
    const px=(ii+0.5)*RES,py=(jj+0.5)*RES,dn=Math.hypot(px-nd.x,py-nd.y);
    if(dn>=nd.R)continue;
    const b=1-ss((dn-Rin)/(nd.R-Rin));if(b<=0)continue;
    const o=jj*N+ii;preJ.push([o,height[o]]);jCells++;
    let wsum=0,hsum=0,Esum=0,tRel=Infinity,sw=[0,0,0,0];
    for(const k of nd.inc){
      const q=nearestOn(k.r,px,py),m=k.r.mat,hw=k.r.hw,ph=prismHalf(m,hw);
      const E=elevAt(k.r,q.s),t=q.d;
      const prof=profile(m,hw,t)*(1-b)+crownOnly(m,hw,t)*b;
      const w=1/(t*t+0.25);
      wsum+=w;hsum+=w*(E+prof);Esum+=w*E;
      if(t-ph<tRel)tRel=t-ph;
      const pav=(1-ss((t-hw)/0.45))*w;
      if(m.splat===1)sw[1]+=pav;else if(m.splat===2)sw[2]+=pav;else sw[3]+=pav;
    }
    const hJ0=hsum/wsum,EJ=Esum/wsum;
    let hJ;
    if(tRel<=0)hJ=hJ0;
    else{const dd=tRel,lo=EJ-dd*FILL_SLOPE,hi=EJ+dd*CUT_SLOPE,nv=natural[o];
      hJ=nv>hi?hi:nv<lo?lo:nv;}
    height[o]=height[o]*(1-b)+hJ*b;
    const paved=Math.min(1,(sw[1]+sw[2]+sw[3])/wsum);
    for(let c=1;c<4;c++){const v=255*(paved?sw[c]/wsum:0);
      splat[o*4+c]=Math.round(splat[o*4+c]*(1-b)+Math.min(255,v)*b);}
    splat[o*4]=Math.round(splat[o*4]*(1-b)+255*(1-Math.min(1,paved))*b);
  }
}
log(`junction blending: ${nodes.length} nodes, ${jCells} cells`);
/* how much sharpness did the nearest-road seam contribute? */
function curvAt(arr,o){const i=o%N,j=(o/N)|0;if(i<1||j<1||i>=N-1||j>=N-1)return 0;
  return Math.abs((arr[o+1]+arr[o-1]+arr[o+N]+arr[o-N]-4*arr[o])/(RES*RES));}
const before=new Float32Array(height);for(const [o,v] of preJ)before[o]=v;
const cB=[],cA=[];for(const [o] of preJ){cB.push(curvAt(before,o));cA.push(curvAt(height,o));}
cB.sort((a,b)=>a-b);cA.sort((a,b)=>a-b);
const jc={p999Before:+cB[Math.floor(cB.length*0.999)].toFixed(3),p999After:+cA[Math.floor(cA.length*0.999)].toFixed(3),
  meanBefore:+(cB.reduce((a,b)=>a+b,0)/cB.length).toFixed(4),meanAfter:+(cA.reduce((a,b)=>a+b,0)/cA.length).toFixed(4)};
log(`junction curvature p99.9 ${jc.p999Before} -> ${jc.p999After}`);

/* ---------- 6. outputs + stats ---------- */
let hlo=Infinity,hhi=-Infinity;for(const v of height){if(v<hlo)hlo=v;if(v>hhi)hhi=v;}
const u16=new Uint16Array(N*N);
for(let o=0;o<N*N;o++)u16[o]=Math.round((height[o]-hlo)/(hhi-hlo)*65535);
fs.writeFileSync(P.join(OUT,'height.u16.bin'),Buffer.from(u16.buffer));
fs.writeFileSync(P.join(OUT,'splat.png'),png(N,N,splat,4));

const dayAll=[];for(const b of dayBins)for(const v of b)if(v>0)dayAll.push(v);
dayAll.sort((x,y)=>x-y);
const pct=q=>dayAll.length?+dayAll[Math.min(dayAll.length-1,Math.floor(q*dayAll.length))].toFixed(2):0;
/* is the road still the sharpest thing, now that fBm is in the base? */
function sharp(pred){const g=[],c=[];
  for(let j=1;j<N-1;j+=3)for(let i=1;i<N-1;i+=3){const o=j*N+i;if(!pred(o))continue;
    g.push(Math.hypot((height[o+1]-height[o-1])/(2*RES),(height[o+N]-height[o-N])/(2*RES)));
    c.push(Math.abs((height[o+1]+height[o-1]+height[o+N]+height[o-N]-4*height[o])/(RES*RES)));}
  g.sort((a,b)=>a-b);c.sort((a,b)=>a-b);const q=(A,f)=>+A[Math.floor(A.length*f)].toFixed(3);
  return {slopeP50:q(g,.5),slopeP999:q(g,.999),curvP999:q(c,.999)};}
const nearRoad=o=>rid[o]!==255&&dist[o]<=prismHalf(map.roads[rid[o]].mat,map.roads[rid[o]].hw)+2;
const stats={
  world:{size:WORLD,res:RES,grid:N},
  base:{quantStepM:+base.quantStep.toFixed(4),quantErrRmsMm:+(base.quantErr.rms*1000).toFixed(1),
    bandingPlainRmsMm:+(base.bandPlain.rms*1000).toFixed(2),bandingDitherRmsMm:+(base.bandDither.rms*1000).toFixed(2)},
  heightRange:{min:+hlo.toFixed(2),max:+hhi.toFixed(2),u16StepMm:+((hhi-hlo)/65535*1000).toFixed(3)},
  junctions,grade:gradeReport,junctionBlend:{nodes:nodes.map(n=>({R:+n.R.toFixed(1),sinTheta:n.sinT})),cells:jCells,curvature:jc},
  daylight:{samples:dayAll.length,min:pct(0),median:pct(0.5),p95:pct(0.95),max:pct(0.999),
    cappedCells:capped,cappedPct:+(100*capped/(influenced||1)).toFixed(3),capM:MAX_DAYLIGHT},
  sharpness:{road:sharp(nearRoad),offRoad:sharp(o=>!nearRoad(o))},
  bytes:{uniformU16:N*N*2,splatPng:fs.statSync(P.join(OUT,'splat.png')).size},
};
fs.writeFileSync(P.join(OUT,'stats.json'),JSON.stringify(stats,null,2));
fs.writeFileSync(P.join(OUT,'height.meta.json'),JSON.stringify({grid:N,res:RES,world:WORLD,min:hlo,max:hhi,format:'uint16-le'},null,2));
if(require.main===module)console.log(JSON.stringify(stats,null,2));
log('done');
module.exports={map,natural,dist,rid,sarc,height,splat,stats,elevAt,xyAt,nat,base};
