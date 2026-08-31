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
    if(best){r.pts[idx]=[best.x,best.y];junctions.push({road:r.id,host:best.host.id,end,s:best.s,snap:best.d});}
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

/* ---------- 4. road distance field ---------- */
const dist=new Float32Array(N*N).fill(Infinity),rid=new Uint8Array(N*N).fill(255),sarc=new Float32Array(N*N);
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
        const o=j*N+i;
        if(d<dist[o]){dist[o]=d;rid[o]=k;sarc[o]=r.s[seg-1]+u*(r.s[seg]-r.s[seg-1]);}
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
        const lo=E-dd*FILL_SLOPE,hi=E+dd*CUT_SLOPE;
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
  junctions,grade:gradeReport,
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
