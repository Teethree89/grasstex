/* Bake driver: map.svg -> height.u16.bin + splat.png + stats.json */
'use strict';
const fs=require('fs'),P=require('path'),B=require('./bake.js');
const {WORLD,RES,N,NL,DS,MAX_GRADE,GRADE_ITERS,CUT_SLOPE,FILL_SLOPE,MAX_DAYLIGHT,
  JUNCTION_TOL,NOISE_AMP,ss,prismHalf,skirtHalf,crownOf,skirt,profile,readMap,buildBase,sampleLow,fbm,png}=B;
const SMOOTH_LEN=40;
const OUT=process.env.OUTDIR||P.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const t0=Date.now(),log=m=>console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] ${m}`);

/* ---------- 1. authored base ---------- */
const map=readMap(process.env.MAP||P.join(__dirname,'map.svg'));
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

/* ---------- 5. compose: union offsets, one continuous design surface ----------
   Built outward from the crown the way a vector would stroke it: the bands are offsets
   of the UNION of the paved regions, u = min_k (t_k - hw_k). That single change removes
   the need for a ditch-suppression disc and for scaling it by 1/sin(theta) - a junction
   wedge has small u from both sides, so it never reaches the ditch band at all.
   Design elevation is one smooth inverse-square blend of the nearby roads, so the crown,
   the skirt and the daylight cone all hang off the same continuous surface and cannot
   step against each other. */
const height=new Float32Array(N*N),splat=new Uint8Array(N*N*4);
const dayBins=map.roads.map(r=>new Float32Array(Math.ceil(r.len/DS)+1));
const WFAR0=20,WFAR1=45;
const wOf=t=>t>=WFAR1?0:(1/((t+1)*(t+1)))*(1-ss((t-WFAR0)/(WFAR1-WFAR0)));
/* Polynomial smooth-min. Plain min() on the union distance is only C0, and its crease
   shows up as a curvature ridge; smin rounds it over a k-metre band - which is also
   physically what a junction has, a fillet rather than a corner. */
const SMIN_K=+(process.env.SMIN_K||3.0);
function smin(x,y){const h=Math.max(SMIN_K-Math.abs(x-y),0)/SMIN_K;return Math.min(x,y)-h*h*SMIN_K*0.25;}
let capped=0,influenced=0;
for(let o=0;o<N*N;o++){
  const k0=rid[o];
  if(k0===255){height[o]=natural[o];splat[o*4]=255;continue;}
  const cand=[{r:map.roads[k0],t:dist[o],s:sarc[o],k:k0}];
  const k1=rid1[o];if(k1!==255&&isFinite(dist1[o]))cand.push({r:map.roads[k1],t:dist1[o],s:sarc1[o],k:k1});
  /* Blend the material PARAMETERS, never the per-road profiles: blending profiles
     would let both roads assert a ditch in the wedge, which is the artifact. The
     union distance decides which band we are in; the blend decides its shape. */
  let wsum=0,esum=0,u=Infinity,hw=0,cr=0,shd=0,drp=0,dw=0,dd_=0,bk=0,sw=[0,0,0,0];
  for(const c of cand){c.w=wOf(c.t);wsum+=c.w;}
  if(wsum<=0){cand[0].w=1;wsum=1;}
  for(const c of cand){const m=c.r.mat,w=c.w/wsum,ui=c.t-c.r.hw;
    u=u===Infinity?ui:smin(u,ui);
    esum+=w*elevAt(c.r,c.s);hw+=w*c.r.hw;cr+=w*m.crown;shd+=w*m.shoulder;
    drp+=w*m.drop;dw+=w*m.ditchW;dd_+=w*m.ditchD;bk+=w*m.back;sw[m.splat]+=w;}
  const E=esum,mb={crown:cr,shoulder:shd,drop:drp,ditchW:dw,ditchD:dd_,back:bk},sh=skirtHalf(mb);
  let h,pav=0;
  if(u<=0){h=E+crownOf(mb,hw,Math.max(0,u+hw));influenced++;pav=1;}
  else if(u<=sh){h=E+skirt(mb,u);influenced++;pav=1-ss(u/0.45);}
  else{
    const dl=u-sh;h=natural[o];
    if(dl<=MAX_DAYLIGHT){influenced++;
      const lo=E-dl*FILL_SLOPE,hi=E+dl*CUT_SLOPE;
      if(h>hi)h=hi;else if(h<lo)h=lo;
      if(h!==natural[o]){const pk=cand[0].k,bi=Math.min(dayBins[pk].length-1,Math.round(cand[0].s/DS));
        if(dl>dayBins[pk][bi])dayBins[pk][bi]=dl;
        if(dl>MAX_DAYLIGHT-RES)capped++;}
    }
  }
  height[o]=h;
  const v=Math.round(255*pav),tw=sw[1]+sw[2]+sw[3]||1;
  splat[o*4]=255-v;
  splat[o*4+1]=Math.round(v*sw[1]/tw);splat[o*4+2]=Math.round(v*sw[2]/tw);splat[o*4+3]=Math.round(v*sw[3]/tw);
}
log('composed (union offsets)');

/* junction cells, for the same before/after curvature measure as the disc version */
function curvAt(arr,o){const i=o%N,j=(o/N)|0;if(i<1||j<1||i>=N-1||j>=N-1)return 0;
  return Math.abs((arr[o+1]+arr[o-1]+arr[o+N]+arr[o-N]-4*arr[o])/(RES*RES));}
const jc=(()=>{const c=[];
  for(const j of junctions){const R=22;
    const i0=Math.max(0,Math.floor((j.x-R)/RES)),i1=Math.min(N-1,Math.ceil((j.x+R)/RES));
    const j0=Math.max(0,Math.floor((j.y-R)/RES)),j1=Math.min(N-1,Math.ceil((j.y+R)/RES));
    for(let jj=j0;jj<=j1;jj++)for(let ii=i0;ii<=i1;ii++){
      if(Math.hypot((ii+0.5)*RES-j.x,(jj+0.5)*RES-j.y)>=R)continue;c.push(curvAt(height,jj*N+ii));}}
  c.sort((a,b)=>a-b);
  return {cells:c.length,p999:+c[Math.floor(c.length*0.999)].toFixed(3),mean:+(c.reduce((a,b)=>a+b,0)/c.length).toFixed(4)};})();
log(`junction curvature p99.9 ${jc.p999} (disc version was 3.019, nearest-road 19.762)`);

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
  junctions,grade:gradeReport,junctions_:jc,
  daylight:{samples:dayAll.length,min:pct(0),median:pct(0.5),p95:pct(0.95),max:pct(0.999),
    cappedCells:capped,cappedPct:+(100*capped/(influenced||1)).toFixed(3),capM:MAX_DAYLIGHT},
  sharpness:{road:sharp(nearRoad),offRoad:sharp(o=>!nearRoad(o))},
  bytes:{uniformU16:N*N*2,splatPng:fs.statSync(P.join(OUT,'splat.png')).size},
};
fs.writeFileSync(P.join(OUT,'stats.json'),JSON.stringify(stats,null,2));
fs.writeFileSync(P.join(OUT,'height.meta.json'),JSON.stringify({grid:N,res:RES,world:WORLD,min:hlo,max:hhi,format:'uint16-le'},null,2));
/* ---------- 7. two-level tiling ---------- */
const TL=require('./tile.js');
const H=TL.makeSampler(height,N,RES);
const PRISM_MARGIN=3.0;
function tileClassifier(TILE){
  const nT=Math.round(WORLD/TILE),flag=new Uint8Array(nT*nT);
  for(let o=0;o<N*N;o++){const k=rid[o];if(k===255)continue;
    const r=map.roads[k];if(dist[o]>prismHalf(r.mat,r.hw)+PRISM_MARGIN)continue;
    const i=o%N,j=(o/N)|0;
    flag[Math.min(nT-1,Math.floor((j+0.5)*RES/TILE))*nT+Math.min(nT-1,Math.floor((i+0.5)*RES/TILE))]=1;}
  return {nT,flag};
}
function evalTiling(TILE,COARSE,FINE){
  const {nT,flag}=tileClassifier(TILE);
  const T=TL.buildTiles(H,{WORLD,TILE,COARSE,FINE,isFine:(ti,tj)=>!!flag[tj*nT+ti]});
  const nFine=T.fine.size, bytes=(T.GC*T.GC+nFine*T.GF*T.GF)*2;
  /* error against the uniform 0.25 m bake, split by whether we are on a prism */
  const on=[],off=[];
  for(let n=0;n<300000;n++){
    const x=Math.random()*WORLD,y=Math.random()*WORLD;
    const i=Math.min(N-1,Math.floor(x/RES)),j=Math.min(N-1,Math.floor(y/RES)),o=j*N+i;
    const e=Math.abs(TL.sampleTiled(T,x,y)-H(x,y));
    const k=rid[o],pr=k!==255&&dist[o]<=prismHalf(map.roads[k].mat,map.roads[k].hw);
    (pr?on:off).push(e);
  }
  const q=(A,f)=>{A.sort((a,b)=>a-b);return +A[Math.floor(A.length*f)].toFixed(4);};
  return {TILE,fineTiles:nFine,totalTiles:nT*nT,finePct:+(100*nFine/(nT*nT)).toFixed(1),
    bytes,MB:+(bytes/1048576).toFixed(2),
    seam:TL.seamError(T),
    errOnPrismMm:{p50:q(on,.5)*1000|0,p99:q(on,.99)*1000|0,max:+(on[on.length-1]*1000).toFixed(0)},
    errOffPrismMm:{p50:q(off,.5)*1000|0,p99:q(off,.99)*1000|0,max:+(off[off.length-1]*1000).toFixed(0)}};
}
const uniformMB=+(N*N*2/1048576).toFixed(2);
const sweep=[8,16,32,64].map(t=>evalTiling(t,1.0,RES));
for(const r of sweep)log(`tile ${String(r.TILE).padStart(2)} m: ${String(r.fineTiles).padStart(4)}/${r.totalTiles} fine (${r.finePct}%)  ${String(r.MB).padStart(5)} MB (${(uniformMB/r.MB).toFixed(1)}x vs uniform ${uniformMB} MB)  seam max ${r.seam.maxMismatch.toExponential(1)} m  off-prism err p99 ${r.errOffPrismMm.p99} mm`);
stats.tiling={uniformMB,coarseRes:1.0,fineRes:RES,prismMargin:PRISM_MARGIN,sweep};
fs.writeFileSync(P.join(OUT,'stats.json'),JSON.stringify(stats,null,2));

/* ---------- 8. camera-relative mesh LOD over the tiled field ---------- */
const LODM=require('./lod.js');
{
  const TILE=8,{nT,flag}=tileClassifier(TILE);
  const T=TL.buildTiles(H,{WORLD,TILE,COARSE:1.0,FINE:RES,isFine:(a,b)=>!!flag[b*nT+a]});
  /* stand on the main road so the fine tiles are actually under the camera */
  const camS=340,[cxx,cyy]=xyAt(map.roads[0],camS),cam=[cxx,cyy];
    /* a 32 m chunk may sit over several 8 m tiles; it earns level 0 if any is fine */
  const CH=32,tPerC=CH/TILE;
  const floorLevel=(ci,cj)=>{for(let b=0;b<tPerC;b++)for(let a=0;a<tPerC;a++){
      const ti=ci*tPerC+a,tj=cj*tPerC+b;
      if(ti<nT&&tj<nT&&flag[tj*nT+ti])return 0;}
    return 1;};
  const M=LODM.build(T,cam,{chunk:CH,range:300,floorLevel});
  const perL={};for(const c of M.chunks.values()){const k='L'+c.L+' @'+LODM.LOD[c.L]+'m';
    perL[k]=perL[k]||{chunks:0,verts:0};perL[k].chunks++;perL[k].verts+=(c.n+1)*(c.n+1);}

  /* Does grass (which samples the FIELD) agree with what the GPU draws? Report the
     disagreement in pixels as well as metres - a sub-pixel error at 200 m is not an
     error anyone can see, and that is the actual acceptance test. */
  const PXPERRAD=1080/(60*Math.PI/180);
  /* Only sample where grass can actually stand. The road corridor is excluded
     (ROAD_CLEAR half-width 6.75 m in the demo), so disagreement over the prism is
     disagreement nobody can see - measuring it would flatter or damn the LOD for
     the wrong reason. */
  const GRASS_CLEAR=6.75;
  const bands=[[0,30],[30,60],[60,120],[120,240],[240,300]].map(([a,b])=>({a,b,e:[]}));
  let onRoadSkipped=0;
  for(let n=0;n<400000;n++){
    const th=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*300;
    const x=cam[0]+Math.cos(th)*d,y=cam[1]+Math.sin(th)*d;
    if(x<0||y<0||x>=T.WT||y>=T.WT)continue;
    const gi=Math.min(N-1,Math.floor(x/RES)),gj=Math.min(N-1,Math.floor(y/RES));
    if(rid[gj*N+gi]!==255&&dist[gj*N+gi]<=GRASS_CLEAR){onRoadSkipped++;continue;}
    const mh=LODM.meshHeight(M,x,y);if(mh===null)continue;
    const e=Math.abs(TL.sampleTiled(T,x,y)-mh);
    for(const bd of bands)if(d>=bd.a&&d<bd.b){bd.e.push([e,d]);break;}
  }
  const bandStat=bands.map(bd=>{const es=bd.e.map(v=>v[0]).sort((p,q)=>p-q);
    const px=bd.e.map(([e,d])=>e/Math.max(1,d)*PXPERRAD).sort((p,q)=>p-q);
    return {band:bd.a+'-'+bd.b+' m',n:es.length,
      p99mm:+(es[Math.floor(es.length*.99)]*1000).toFixed(1),maxMm:+(es[es.length-1]*1000).toFixed(1),
      p99px:+px[Math.floor(px.length*.99)].toFixed(3),maxPx:+px[px.length-1].toFixed(3)};});

  /* cracks across LOD boundaries */
  let crack=0,crackN=0;
  for(const c of M.chunks.values())for(const [dx,dy] of [[1,0],[0,1]]){
    const nb=M.chunks.get((c.cj+dy)*M.nC+(c.ci+dx));if(!nb||nb.L===c.L)continue;
    for(let k=0;k<=300;k++){const u=k/300*M.CH,e=1e-6;
      const x=dx?(c.ci+1)*M.CH:c.ci*M.CH+u, y=dy?(c.cj+1)*M.CH:c.cj*M.CH+u;
      const a=LODM.meshHeight(M,x-dx*e,y-dy*e),b=LODM.meshHeight(M,x+dx*e,y+dy*e);
      if(a===null||b===null)continue;const dd=Math.abs(a-b);if(dd>crack)crack=dd;crackN++;}
  }
  stats.meshLod={chunk:32,range:300,contentFloor:true,levels:LODM.LOD,bands:LODM.BAND,cam:cam.map(v=>+v.toFixed(1)),
    chunks:M.chunks.size,vertices:M.verts,triangles:M.tris,edgeSnaps:M.snaps,perLevel:perL,
    uniformVertices:Math.round((WORLD/RES+1)**2),shippedTodayVertices:69133,
    crack:{samples:crackN,maxMismatchM:+crack.toExponential(2)},grassClear:6.75,onRoadSkipped,agreement:bandStat};
  log(`mesh LOD: ${M.chunks.size} chunks, ${(M.verts/1000).toFixed(0)}k verts, ${(M.tris/1000).toFixed(0)}k tris, ${M.snaps} edge snaps, crack max ${crack.toExponential(1)} m`);
  for(const b of bandStat)log(`   ${b.band.padEnd(10)} grass-vs-mesh p99 ${String(b.p99mm).padStart(6)} mm  max ${String(b.maxMm).padStart(7)} mm   |  p99 ${String(b.p99px).padStart(6)} px  max ${String(b.maxPx).padStart(6)} px`);
}
/* ---------- 8b. emit the shipping asset pack ---------- */
{
  const TILE=8,{nT,flag}=tileClassifier(TILE);
  const T=TL.buildTiles(H,{WORLD,TILE,COARSE:1.0,FINE:RES,isFine:(a,b)=>!!flag[b*nT+a]});
  const {buffer,manifest}=TL.packTiles(T);
  fs.mkdirSync(P.join(OUT,'asset'),{recursive:true});
  fs.writeFileSync(P.join(OUT,'asset','terrain.bin'),buffer);
  fs.writeFileSync(P.join(OUT,'asset','terrain.json'),JSON.stringify(manifest));
  fs.copyFileSync(P.join(OUT,'splat.png'),P.join(OUT,'asset','splat.png'));
  /* Road-space UVs. The shipped material paints the road from vPositionW.x, which is a
     straight-road assumption baked into GLSL; a curved or branching road needs (s,t)
     carried as data. R = arc length wrapped to the texture repeat, G = SIGNED offset
     across the road, so lane markings stay put through curves and at junctions. */
  const REPEAT=9.0,ruv=new Uint8Array(N*N*3);
  for(let o=0;o<N*N;o++){
    const k=rid[o];if(k===255)continue;
    const r=map.roads[k],hw=r.hw,t=dist[o];if(t>prismHalf(r.mat,hw)+1)continue;
    const sa=sarc[o],[px,py]=xyAt(r,sa),[ax,ay]=xyAt(r,Math.max(0,sa-1)),[bx,by]=xyAt(r,Math.min(r.len,sa+1));
    const tl=Math.hypot(bx-ax,by-ay)||1,tx=(bx-ax)/tl,ty=(by-ay)/tl;
    const i=o%N,j=(o/N)|0,wx=(i+0.5)*RES-px,wy=(j+0.5)*RES-py;
    const sgn=(tx*wy-ty*wx)>=0?1:-1;
    /* Arc length is periodic, so store it as a POINT ON A CIRCLE, not as a sawtooth.
       A wrapped 0..1 ramp has a 255->0 cliff, and 2.9 % of road cells straddle one -
       bilinear filtering then sweeps the whole road texture across a single texel and
       draws a hard line across the carriageway. sin/cos interpolate through the wrap
       and the shader recovers the phase with atan. */
    var ph=(sa/REPEAT)*Math.PI*2;
    ruv[o*3]=Math.round((Math.sin(ph)*0.5+0.5)*255);
    ruv[o*3+1]=Math.round(Math.max(0,Math.min(1,sgn*t/(hw*2)+0.5))*255);
    ruv[o*3+2]=Math.round((Math.cos(ph)*0.5+0.5)*255);
  }
  fs.writeFileSync(P.join(OUT,'asset','roaduv.png'),png(N,N,ruv,3));
  manifest.roadRepeatM=REPEAT;
  fs.writeFileSync(P.join(OUT,'asset','terrain.json'),JSON.stringify(manifest));
  /* round-trip: unpack and confirm the runtime sees the same surface */
  const T2=TL.fromPacked(manifest,buffer);let mx=0;
  for(let n=0;n<200000;n++){const x=Math.random()*WORLD,y=Math.random()*WORLD;
    const d=Math.abs(TL.sampleTiled(T,x,y)-TL.sampleTiled(T2,x,y));if(d>mx)mx=d;}
  const bin=fs.statSync(P.join(OUT,'asset','terrain.bin')).size;
  const spl=fs.statSync(P.join(OUT,'asset','splat.png')).size;
  stats.asset={tile:TILE,binBytes:bin,splatBytes:spl,
    totalMB:+((bin+spl)/1048576).toFixed(2),quantStepMm:+((manifest.max-manifest.min)/65535*1000).toFixed(3),
    roundTripMaxErrM:+mx.toExponential(2),fineTiles:manifest.fineTiles.length};
  log(`asset pack: terrain.bin ${(bin/1048576).toFixed(2)} MB + splat ${(spl/1024).toFixed(0)} KB, quant step ${stats.asset.quantStepMm} mm, round-trip max err ${stats.asset.roundTripMaxErrM} m`);
}

/* ---------- 9. incremental streaming ---------- */
const STR=require('./stream.js');
{
  const TILE=8,{nT,flag}=tileClassifier(TILE);
  const T=TL.buildTiles(H,{WORLD,TILE,COARSE:1.0,FINE:RES,isFine:(a,b)=>!!flag[b*nT+a]});
  const CH=32,tPC=CH/TILE;
  const floorLevel=(ci,cj)=>{for(let b=0;b<tPC;b++)for(let a=0;a<tPC;a++){
      const ti=ci*tPC+a,tj=cj*tPC+b;if(ti<nT&&tj<nT&&flag[tj*nT+ti])return 0;}return 1;};
  const r0=map.roads[0];
  /* walk the main road with lateral jitter - this camera has footstep kicks, and
     sub-metre jitter is exactly what makes an unhysteresed chunk flip levels */
  const SPEED=1.5,FPS=60,STEP=SPEED/FPS;              /* 1.5 m/s on foot, per frame */
  function path(steps){const out=[];let seed=12345;
    const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff-0.5;};
    for(let i=0;i<steps;i++){const sArc=200+i*STEP;if(sArc>r0.len-10)break;
      const [x,y]=xyAt(r0,sArc),[ax,ay]=xyAt(r0,Math.max(0,sArc-1)),[bx,by]=xyAt(r0,Math.min(r0.len,sArc+1));
      const tl=Math.hypot(bx-ax,by-ay)||1,nx=-(by-ay)/tl,ny=(bx-ax)/tl,jit=rnd()*0.8;
      out.push([x+nx*jit,y+ny*jit]);}
    return out;}
  const walk=path(4000);       /* ~100 m, 66 s */

  function run(HYST,budget){
    const st=STR.create(T,{chunk:CH,range:300,hyst:HYST,budget,floorLevel});
    /* cold start is one big build; exclude it so the numbers describe steady state */
    STR.update(st,walk[0]);const coldQueue=st.dirty.size+1;STR.drain(st);
    const before={...st.stat};
    let perTick=[],queued=0,latency=0,run_=0;
    for(let i=1;i<walk.length;i++){const r=STR.update(st,walk[i]);
      perTick.push(r.rebuilt);if(r.queued>queued)queued=r.queued;
      run_=r.queued>0?run_+1:0;if(run_>latency)latency=run_;}
    STR.drain(st);
    return {st,perTick,maxQueued:queued,coldQueue,maxLatencyTicks:latency,
      steady:{rebuilds:st.stat.rebuilds-before.rebuilds,verts:st.stat.vertsRebuilt-before.vertsRebuilt,
        levelChanges:st.stat.levelChanges-before.levelChanges}};
  }
    const A=run(0,999), Bh=run(6,4);
  /* cold start: how many ticks until the chunk under the camera exists? */
  const coldFill=(()=>{const st=STR.create(T,{chunk:CH,range:300,hyst:6,budget:4,floorLevel});
    const cam=walk[0],ci=Math.floor(cam[0]/CH),cj=Math.floor(cam[1]/CH);
    for(let t=1;t<=400;t++){STR.update(st,cam);
      const c=st.chunks.get(cj*st.nC+ci);if(c&&c.g)return t;}
    return -1;})();
  /* isolate what hysteresis is actually for: a camera standing still and jittering */
  function jitterOnly(HYST){const st=STR.create(T,{chunk:CH,range:300,hyst:HYST,budget:999,floorLevel});
    let seed=999;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff-0.5;};
    const [bx,by]=xyAt(r0,BAND_PROBE);
    STR.update(st,[bx,by]);STR.drain(st);const base=st.stat.levelChanges;
    for(let i=0;i<600;i++){STR.update(st,[bx+rnd()*0.8,by+rnd()*0.8]);STR.drain(st);}
    return st.stat.levelChanges-base;}
  const BAND_PROBE=260;
  const jitNo=jitterOnly(0),jitYes=jitterOnly(6);

  /* A: with no hysteresis the streamed state must be identical to a cold build */
  const cold=LODM.build(T,walk[walk.length-1],{chunk:CH,range:300,floorLevel});
  let lvlDiff=0,gridMax=0,missing=0;
  for(const [k,c] of cold.chunks){const sc=A.st.chunks.get(k);
    if(!sc){missing++;continue;}
    if(sc.L!==c.L){lvlDiff++;continue;}
    for(let i=0;i<c.g.length;i++){const d=Math.abs(c.g[i]-sc.g[i]);if(d>gridMax)gridMax=d;}}

  /* B: cracks after streaming - the neighbour-invalidation test */
  function cracks(st){let mx=0,n=0;const M={chunks:st.chunks,nC:st.nC,CH:st.CH};
    for(const c of st.chunks.values())for(const [dx,dy] of [[1,0],[0,1]]){
      const nb=st.chunks.get((c.cj+dy)*st.nC+(c.ci+dx));if(!nb||nb.L===c.L)continue;
      for(let k=0;k<=200;k++){const u=k/200*st.CH,e=1e-6;
        const x=dx?(c.ci+1)*st.CH:c.ci*st.CH+u,y=dy?(c.cj+1)*st.CH:c.cj*st.CH+u;
        const a=LODM.meshHeight(M,x-dx*e,y-dy*e),b=LODM.meshHeight(M,x+dx*e,y+dy*e);
        if(a===null||b===null)continue;const d=Math.abs(a-b);if(d>mx)mx=d;n++;}}
    return {samples:n,max:mx};}

  const fullVerts=stats.meshLod.vertices*walk.length;
  const nz=Bh.perTick.filter(v=>v>0).length;
  stats.streaming={
    steps:walk.length,speedMps:SPEED,fps:FPS,stepM:+STEP.toFixed(4),jitterM:0.8,chunk:CH,budgetChunksPerTick:4,hystM:6,
    equivalence:{levelMismatches:lvlDiff,missingChunks:missing,maxGridDiffM:+gridMax.toExponential(2),
      note:'hyst 0 vs cold lod.build at the final camera position'},
    cracksAfterWalk:{max:+cracks(Bh.st).max.toExponential(2),samples:cracks(Bh.st).samples},
    hysteresis:{walkNoHyst:A.steady.levelChanges,walkHyst6:Bh.steady.levelChanges,
      standStillJitterNoHyst:jitNo,standStillJitterHyst6:jitYes},
    work:{ticksWithWork:nz,ticksIdle:walk.length-1-nz,chunksRebuiltSteady:Bh.steady.rebuilds,
      vertsRebuiltSteady:Bh.steady.verts,vertsIfFullRebuildEachTick:fullVerts,
      saving:+(fullVerts/Math.max(1,Bh.steady.verts)).toFixed(0),
      coldStartQueue:Bh.coldQueue,ticksToCameraChunk:coldFill,maxSteadyQueue:Bh.maxQueued,maxLatencyTicks:Bh.maxLatencyTicks}};
  const S=stats.streaming;
  log(`streaming: ${S.steps} steps x ${S.stepM} m, budget ${S.budgetChunksPerTick} chunks/tick`);
  log(`   equivalence vs cold build: ${S.equivalence.levelMismatches} level mismatches, max grid diff ${S.equivalence.maxGridDiffM} m`);
  log(`   cracks after the walk: ${S.cracksAfterWalk.max} m over ${S.cracksAfterWalk.samples} samples`);
  log(`   hysteresis, walking: ${S.hysteresis.walkNoHyst} level changes -> ${S.hysteresis.walkHyst6} with 6 m`);
  log(`   hysteresis, standing still + jitter: ${S.hysteresis.standStillJitterNoHyst} -> ${S.hysteresis.standStillJitterHyst6}`);
  log(`   work: ${S.work.ticksIdle}/${S.steps-1} ticks idle, ${(S.work.vertsRebuiltSteady/1e6).toFixed(2)} M verts vs ${(S.work.vertsIfFullRebuildEachTick/1e6).toFixed(0)} M rebuilding every tick (${S.work.saving}x)`);
  log(`   queue: cold start ${S.work.coldStartQueue} chunks, steady peak ${S.work.maxSteadyQueue}, worst backlog ${S.work.maxLatencyTicks} ticks (${(S.work.maxLatencyTicks/60).toFixed(2)} s)`);
  log(`   cold start: ground under the camera ready after ${S.work.ticksToCameraChunk} tick(s)`);
}
fs.writeFileSync(P.join(OUT,'stats.json'),JSON.stringify(stats,null,2));

if(require.main===module)console.log(JSON.stringify({tiling:stats.tiling.sweep.map(r=>({TILE:r.TILE,MB:r.MB})),meshLod:stats.meshLod},null,2));
log('done');
module.exports={map,natural,dist,rid,sarc,dist1,rid1,sarc1,height,splat,stats,elevAt,xyAt,nat,base};
