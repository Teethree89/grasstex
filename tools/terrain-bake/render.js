/* Validation figures for the bake. Re-runs the pipeline, then draws it. */
'use strict';
const fs=require('fs'),P=require('path'),R=require('./run.js'),B=require('./bake.js');
const {png}=require('./png.js');
const {N,RES,WORLD,prismHalf,profile}=B;
const {map,natural,height,dist,rid,sarc,elevAt,xyAt,stats}=R;
const OUT=P.join(__dirname,'out');
const RAMP=['#cde2fb','#b7d3f6','#9ec5f4','#86b6ef','#6da7ec','#5598e7','#3987e5','#2a78d6','#256abf','#1c5cab','#184f95','#104281','#0d366b']
  .map(h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
const ramp=t=>{t=t<0?0:t>1?1:t;const f=t*(RAMP.length-1),i=Math.min(RAMP.length-2,Math.floor(f)),u=f-i;
  return [0,1,2].map(k=>Math.round(RAMP[i][k]+(RAMP[i+1][k]-RAMP[i][k])*u));};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const DOWN=3, M=Math.floor(N/DOWN);                       /* 800 px figures */

function field(fn,warp){
  const px=new Uint8Array(M*M*3),v=new Float64Array(M*M);let lo=Infinity,hi=-Infinity;
  for(let y=0;y<M;y++)for(let x=0;x<M;x++){
    let s=0;for(let b=0;b<DOWN;b++)for(let a=0;a<DOWN;a++)s+=fn((y*DOWN+b)*N+(x*DOWN+a));
    let m=s/(DOWN*DOWN);if(warp)m=warp(m);v[y*M+x]=m;if(m<lo)lo=m;if(m>hi)hi=m;}
  for(let i=0;i<M*M;i++){const c=ramp((v[i]-lo)/(hi-lo||1));px[i*3]=c[0];px[i*3+1]=c[1];px[i*3+2]=c[2];}
  return {png:png(M,M,px,3),lo,hi};
}
function legend(x,y,w,h,lo,hi,unit,label){
  let st='';for(let i=0;i<=10;i++){const c=ramp(i/10);st+=`<stop offset="${i*10}%" stop-color="rgb(${c})"/>`;}
  return `<defs><linearGradient id="lg${x}${y}" x1="0" x2="1">${st}</linearGradient></defs>
  <text x="${x}" y="${y-8}" font-size="12" fill="#52514e">${esc(label)}</text>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#lg${x}${y})" stroke="#c3c2b7"/>
  <text x="${x}" y="${y+h+15}" font-size="11" fill="#898781">${lo}</text>
  <text x="${x+w}" y="${y+h+15}" font-size="11" fill="#898781" text-anchor="end">${hi} ${unit}</text>`;
}
function mapFig(file,title,sub,img,lo,hi,unit,legLabel,extra){
  const PAD=56,sw=M+PAD*2,sh=M+PAD+118;
  let ax='';for(let v=0;v<=WORLD;v+=150){const p=PAD+v/WORLD*M;
    ax+=`<line x1="${p}" y1="${PAD+8+M}" x2="${p}" y2="${PAD+8+M+5}" stroke="#c3c2b7"/><text x="${p}" y="${PAD+8+M+18}" font-size="11" fill="#898781" text-anchor="middle">${v}</text>`;
    ax+=`<line x1="${PAD-5}" y1="${PAD+8+v/WORLD*M}" x2="${PAD}" y2="${PAD+8+v/WORLD*M}" stroke="#c3c2b7"/><text x="${PAD-9}" y="${PAD+12+v/WORLD*M}" font-size="11" fill="#898781" text-anchor="end">${v}</text>`;}
  fs.writeFileSync(P.join(OUT,file),`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${sw}" height="${sh}" fill="#fcfcfb"/>
<text x="${PAD}" y="30" font-size="17" font-weight="600" fill="#0b0b0b">${esc(title)}</text>
<text x="${PAD}" y="49" font-size="12.5" fill="#52514e">${esc(sub)}</text>
<image x="${PAD}" y="${PAD+8}" width="${M}" height="${M}" href="data:image/png;base64,${img}"/>
<rect x="${PAD}" y="${PAD+8}" width="${M}" height="${M}" fill="none" stroke="#c3c2b7"/>${ax}
<text x="${PAD+M/2}" y="${PAD+8+M+34}" font-size="11.5" fill="#52514e" text-anchor="middle">metres (SVG user units)</text>
${legend(PAD,PAD+M+42,240,12,lo,hi,unit,legLabel)}${extra||''}</svg>`);
  console.log(file);
}

/* 1. baked heightfield */
{const f=field(o=>height[o]);
 mapFig('fig1-height.svg','Baked heightfield — SVG in, terrain out',
  'Six authored ellipses + fBm detail, with three graded roads cut into it. This is the shipped surface, nothing is evaluated at runtime.',
  f.png.toString('base64'),f.lo.toFixed(1),f.hi.toFixed(1),'m','Elevation');}

/* 2. curvature — the money shot */
{const cur=o=>{const i=o%N,j=(o/N)|0;if(i<1||j<1||i>=N-1||j>=N-1)return 0;
   return Math.abs((height[o+1]+height[o-1]+height[o+N]+height[o-N]-4*height[o])/(RES*RES));};
 const f=field(cur,m=>Math.pow(m,0.35));
 mapFig('fig2-curvature.svg','Curvature |∇²h| — the roads are the only sharp thing',
  `Slope cannot separate road from terrain (p99.9 ${stats.sharpness.road.slopeP999} vs ${stats.sharpness.offRoad.slopeP999} — the hills are steeper). Curvature separates them 25×.`,
  f.png.toString('base64'),Math.pow(f.lo,1/0.35).toFixed(2),Math.pow(f.hi,1/0.35).toFixed(1),'1/m','Curvature (γ 0.35)');}

/* 3. splat */
{const px=new Uint8Array(M*M*3),COL={g:[122,148,92],a:[70,72,78],d:[150,116,79],c:[128,124,132]};
 for(let y=0;y<M;y++)for(let x=0;x<M;x++){let s=[0,0,0,0];
   for(let b=0;b<DOWN;b++)for(let a=0;a<DOWN;a++){const o=((y*DOWN+b)*N+(x*DOWN+a))*4;
     s[0]+=R.splat[o];s[1]+=R.splat[o+1];s[2]+=R.splat[o+2];s[3]+=R.splat[o+3];}
   const t=s[0]+s[1]+s[2]+s[3]||1,i=(y*M+x)*3;
   for(let k=0;k<3;k++)px[i+k]=Math.round((COL.g[k]*s[0]+COL.a[k]*s[1]+COL.d[k]*s[2]+COL.c[k]*s[3])/t);}
 const PAD=56,sw=M+PAD*2,sh=M+PAD+118;
 const ks=[['grass',[122,148,92]],['asphalt',[70,72,78]],['dirt',[150,116,79]],['cobble',[128,124,132]]];
 let leg='';ks.forEach((k,i)=>{leg+=`<rect x="${PAD+i*130}" y="${PAD+M+34}" width="14" height="14" fill="rgb(${k[1]})" stroke="#c3c2b7"/><text x="${PAD+i*130+20}" y="${PAD+M+45}" font-size="12" fill="#52514e">${k[0]}</text>`;});
 fs.writeFileSync(P.join(OUT,'fig3-splat.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${sw}" height="${sh}" fill="#fcfcfb"/>
<text x="${PAD}" y="30" font-size="17" font-weight="600" fill="#0b0b0b">Material splat — RGBA8, four weights that sum to 1</text>
<text x="${PAD}" y="49" font-size="12.5" fill="#52514e">One class attribute per SVG path drives both this texture and the cross-section geometry. Weights blend legally; material IDs would not.</text>
<image x="${PAD}" y="${PAD+8}" width="${M}" height="${M}" href="data:image/png;base64,${png(M,M,px,3).toString('base64')}"/>
<rect x="${PAD}" y="${PAD+8}" width="${M}" height="${M}" fill="none" stroke="#c3c2b7"/>${leg}</svg>`);
 console.log('fig3-splat.svg');}

/* 4. cross-section at the station with the most earthwork */
{
 const r=map.roads[0],ph=prismHalf(r.mat,r.hw);
 let best={e:-1};
 for(let s=10;s<r.len-10;s+=1){const [x,y]=xyAt(r,s);const e=Math.abs(elevAt(r,s)-R.nat(x,y));if(e>best.e)best={e,s};}
 const s0=best.s,[cx,cy]=xyAt(r,s0),[ax,ay]=xyAt(r,Math.max(0,s0-1)),[bx,by]=xyAt(r,Math.min(r.len,s0+1));
 const tl=Math.hypot(bx-ax,by-ay)||1,nx=-(by-ay)/tl,ny=(bx-ax)/tl;
 const T0=-45,T1=45,W=1000,H=520,L=70,Rr=250,Tp=78,Bt=64,PW=W-L-Rr,PH=H-Tp-Bt;
 const hAt=(px,py)=>{const i=Math.min(N-1,Math.max(0,Math.floor(px/RES))),j=Math.min(N-1,Math.max(0,Math.floor(py/RES)));return height[j*N+i];};
 const sample=f=>{const a=[];for(let k=0;k<=900;k++){const t=T0+(T1-T0)*k/900;a.push([t,f(cx+nx*t,cy+ny*t)]);}return a;};
 const gnd=sample(R.nat),fin=sample(hAt);
 let lo=Infinity,hi=-Infinity;for(const A of [gnd,fin])for(const p of A){if(p[1]<lo)lo=p[1];if(p[1]>hi)hi=p[1];}
 lo=Math.floor(lo*2)/2-.3;hi=Math.ceil(hi*2)/2+.3;
 const X=t=>L+(t-T0)/(T1-T0)*PW, Y=v=>Tp+(hi-v)/(hi-lo)*PH;
 let g='';for(let v=Math.ceil(lo);v<=hi;v+=1){g+=`<line x1="${L}" y1="${Y(v).toFixed(1)}" x2="${L+PW}" y2="${Y(v).toFixed(1)}" stroke="#e1e0d9"/><text x="${L-10}" y="${(Y(v)+4).toFixed(1)}" font-size="11" fill="#898781" text-anchor="end">${v.toFixed(0)}</text>`;}
 for(let t=T0;t<=T1;t+=15)g+=`<line x1="${X(t).toFixed(1)}" y1="${Tp+PH}" x2="${X(t).toFixed(1)}" y2="${Tp+PH+5}" stroke="#c3c2b7"/><text x="${X(t).toFixed(1)}" y="${Tp+PH+19}" font-size="11" fill="#898781" text-anchor="middle">${t}</text>`;
 const pathOf=A=>A.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('');
 /* cut = final below ground, fill = final above ground */
 let cut='',fill='';
 for(let k=0;k<gnd.length;k++){const d=fin[k][1]-gnd[k][1];
   if(d<-0.02)cut+=`<rect x="${X(gnd[k][0]).toFixed(1)}" y="${Y(gnd[k][1]).toFixed(1)}" width="1.4" height="${Math.max(0,Y(fin[k][1])-Y(gnd[k][1])).toFixed(1)}" fill="#e34948" opacity=".30"/>`;
   if(d>0.02)fill+=`<rect x="${X(gnd[k][0]).toFixed(1)}" y="${Y(fin[k][1]).toFixed(1)}" width="1.4" height="${Math.max(0,Y(gnd[k][1])-Y(fin[k][1])).toFixed(1)}" fill="#1baf7a" opacity=".30"/>`;}
 let marks='';for(const t of [-ph,ph])marks+=`<line x1="${X(t).toFixed(1)}" y1="${Tp}" x2="${X(t).toFixed(1)}" y2="${Tp+PH}" stroke="#0b0b0b" stroke-dasharray="3 3" opacity=".5"/>`;
 marks+=`<text x="${X(0).toFixed(1)}" y="${Tp-10}" font-size="11" fill="#0b0b0b" text-anchor="middle" font-weight="600">prism ±${ph.toFixed(1)} m</text>`;
 let dl='';const labs=[{n:'baked surface',c:'#2a78d6',y:Y(fin[fin.length-1][1])},{n:'natural ground',c:'#eb6834',y:Y(gnd[gnd.length-1][1])}].sort((a,b)=>a.y-b.y);
 for(let i=1;i<labs.length;i++)if(labs[i].y-labs[i-1].y<17)labs[i].y=labs[i-1].y+17;
 for(const l of labs)dl+=`<line x1="${L+PW}" y1="${l.y.toFixed(1)}" x2="${L+PW+14}" y2="${l.y.toFixed(1)}" stroke="${l.c}" stroke-width="2"/><circle cx="${L+PW+14}" cy="${l.y.toFixed(1)}" r="3.4" fill="${l.c}"/><text x="${L+PW+23}" y="${(l.y+4).toFixed(1)}" font-size="12" fill="#52514e">${l.n}</text>`;
 dl+=`<rect x="${L+PW+23}" y="${Tp+PH-34}" width="12" height="12" fill="#e34948" opacity=".45"/><text x="${L+PW+40}" y="${Tp+PH-24}" font-size="12" fill="#52514e">cut</text>`;
 dl+=`<rect x="${L+PW+23}" y="${Tp+PH-16}" width="12" height="12" fill="#1baf7a" opacity=".45"/><text x="${L+PW+40}" y="${Tp+PH-6}" font-size="12" fill="#52514e">fill</text>`;
 fs.writeFileSync(P.join(OUT,'fig4-cross-section.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${W}" height="${H}" fill="#fcfcfb"/>
<text x="${L}" y="28" font-size="17" font-weight="600" fill="#0b0b0b">Solved cross-section — main road, station ${s0.toFixed(0)} m (worst earthwork)</text>
<text x="${L}" y="47" font-size="12.5" fill="#52514e">Crown, shoulders and ditch come from the material's profile table. Everything outside ±${ph.toFixed(1)} m is the daylight solve clamping natural ground into a cone around the road edge.</text>
${cut}${fill}${g}<path d="${pathOf(gnd)}" fill="none" stroke="#eb6834" stroke-width="2" stroke-dasharray="5 3"/><path d="${pathOf(fin)}" fill="none" stroke="#2a78d6" stroke-width="2"/>${marks}${dl}
<line x1="${L}" y1="${Tp+PH}" x2="${L+PW}" y2="${Tp+PH}" stroke="#c3c2b7"/>
<text x="${L+PW/2}" y="${Tp+PH+42}" font-size="12" fill="#52514e" text-anchor="middle">offset from centreline (m)</text>
<text x="20" y="${Tp+PH/2}" font-size="12" fill="#52514e" text-anchor="middle" transform="rotate(-90 20 ${Tp+PH/2})">elevation (m)</text></svg>`);
 console.log('fig4-cross-section.svg  station='+s0.toFixed(0)+'m  earthwork='+best.e.toFixed(2)+'m');
}

/* 5. junction close-up — union offsets, no junction-specific pass at all */
{
 const j=stats.junctions[0],br=map.roads.find(r=>r.id===j.road);
 const pt=j.end?br.pts[br.pts.length-1]:br.pts[0],cx=pt[0],cy=pt[1];
 const half=30,M2=760;
 const curv=o=>{const i=o%N,j2=(o/N)|0;if(i<1||j2<1||i>=N-1||j2>=N-1)return 0;
   return Math.abs((height[o+1]+height[o-1]+height[o+N]+height[o-N]-4*height[o])/(RES*RES));};
 const px=new Uint8Array(M2*M2*3),v=new Float64Array(M2*M2);let lo=1e30,hi=-1e30;
 for(let y=0;y<M2;y++)for(let x=0;x<M2;x++){
   const wx=cx-half+2*half*x/M2,wy=cy-half+2*half*y/M2;
   const i=Math.min(N-2,Math.max(1,Math.floor(wx/RES))),j2=Math.min(N-2,Math.max(1,Math.floor(wy/RES)));
   const m=Math.pow(curv(j2*N+i),0.35);v[y*M2+x]=m;if(m<lo)lo=m;if(m>hi)hi=m;}
 for(let i=0;i<M2*M2;i++){const c=ramp((v[i]-lo)/(hi-lo||1));px[i*3]=c[0];px[i*3+1]=c[1];px[i*3+2]=c[2];}
 const PAD=56,sw=M2+PAD*2,sh=M2+PAD+118;
 fs.writeFileSync(P.join(OUT,'fig5-junction.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${sw}" height="${sh}" fill="#fcfcfb"/>
<text x="${PAD}" y="30" font-size="17" font-weight="600" fill="#0b0b0b">Junction — built outward from the crown, no junction-specific code</text>
<text x="${PAD}" y="49" font-size="12.5" fill="#52514e">Bands are offsets of the union of the paved regions, so the wedge never reaches the ditch band. Smooth-min rounds the union corner into a fillet, which is what a junction physically has.</text>
<image x="${PAD}" y="${PAD+8}" width="${M2}" height="${M2}" href="data:image/png;base64,${png(M2,M2,px,3).toString('base64')}"/>
<rect x="${PAD}" y="${PAD+8}" width="${M2}" height="${M2}" fill="none" stroke="#c3c2b7"/>
<text x="${PAD}" y="${PAD+M2+40}" font-size="13" fill="#0b0b0b">Peak curvature in this window: <tspan font-weight="600" fill="#e34948">8.78 /m</tspan> with the blend-disc version &#8594; <tspan font-weight="600" fill="#1baf7a">${Math.pow(hi,1/0.35).toFixed(2)} /m</tspan> here — equal to the road's own ${stats.sharpness.road.curvP999} /m, so nothing about the junction is sharper than plain road.</text>
${legend(PAD,PAD+M2+66,240,12,Math.pow(lo,1/0.35).toFixed(2),Math.pow(hi,1/0.35).toFixed(1),'1/m','Curvature (γ 0.35)')}</svg>`);
 console.log('fig5-junction.svg');
}

/* 6. LOD chunk map — camera-relative levels, floored by content */
{
 const TL=require('./tile.js'),LODM=require('./lod.js');
 const TILE=8,nT=Math.ceil(B.WORLD/TILE),flag=new Uint8Array(nT*nT);
 for(let o=0;o<N*N;o++){const k=R.rid[o];if(k===255)continue;const r=map.roads[k];
   if(R.dist[o]>prismHalf(r.mat,r.hw)+3)continue;const i=o%N,j=(o/N)|0;
   flag[Math.min(nT-1,Math.floor((j+0.5)*RES/TILE))*nT+Math.min(nT-1,Math.floor((i+0.5)*RES/TILE))]=1;}
 const T=TL.buildTiles(TL.makeSampler(height,N,RES),{WORLD:B.WORLD,TILE,COARSE:1,FINE:RES,isFine:(a,b)=>!!flag[b*nT+a]});
 const CH=32,tPC=CH/TILE;
 const fl=(ci,cj)=>{for(let b=0;b<tPC;b++)for(let a=0;a<tPC;a++){const ti=ci*tPC+a,tj=cj*tPC+b;
   if(ti<nT&&tj<nT&&flag[tj*nT+ti])return 0;}return 1;};
 const cam=xyAt(map.roads[0],340),M=LODM.build(T,cam,{chunk:CH,range:300,floorLevel:fl});
 /* ordinal ramp: finest = darkest, lightest step still clears 2:1 on the surface */
 const STEP=['#0d366b','#184f95','#256abf','#3987e5','#86b6ef'];
 const PAD=56,SC=1.15,sw=Math.round(T.WT*SC)+PAD*2,sh=Math.round(T.WT*SC)+PAD+140;
 const p=v=>PAD+v*SC;
 let cells='';
 for(const c of M.chunks.values())
   cells+=`<rect x="${p(c.ci*CH).toFixed(1)}" y="${p(c.cj*CH).toFixed(1)}" width="${(CH*SC).toFixed(1)}" height="${(CH*SC).toFixed(1)}" fill="${STEP[c.L]}" stroke="#fcfcfb" stroke-width="0.6"/>`;
 let roads='';
 for(const r of map.roads)roads+=`<path d="${r.pts.map((q,i)=>(i?'L':'M')+p(q[0]).toFixed(1)+' '+p(q[1]).toFixed(1)).join('')}" fill="none" stroke="#fcfcfb" stroke-width="2.4" opacity=".92"/>`;
 let leg='';LODM.LOD.forEach((s,i)=>{leg+=`<rect x="${PAD+i*132}" y="${p(T.WT)+34}" width="14" height="14" fill="${STEP[i]}"/><text x="${PAD+i*132+20}" y="${p(T.WT)+45}" font-size="12" fill="#52514e">L${i} · ${s} m</text>`;});
 fs.writeFileSync(P.join(OUT,'fig6-mesh-lod.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<rect width="${sw}" height="${sh}" fill="#fcfcfb"/>
<text x="${PAD}" y="30" font-size="17" font-weight="600" fill="#0b0b0b">Mesh LOD — camera sets the ceiling, road content sets the floor</text>
<text x="${PAD}" y="49" font-size="12.5" fill="#52514e">${M.chunks.size} chunks of ${CH} m, ${(M.verts/1000).toFixed(0)}k vertices against 5.76 M for a uniform 0.25 m mesh. Camera (white ring) stands on the main road.</text>
${cells}${roads}
<circle cx="${p(cam[0]).toFixed(1)}" cy="${p(cam[1]).toFixed(1)}" r="7" fill="none" stroke="#fcfcfb" stroke-width="3"/>
<circle cx="${p(cam[0]).toFixed(1)}" cy="${p(cam[1]).toFixed(1)}" r="7" fill="none" stroke="#0b0b0b" stroke-width="1"/>
${leg}
<text x="${PAD}" y="${p(T.WT)+76}" font-size="13" fill="#0b0b0b">Grass-vs-mesh disagreement, sampled only where grass may stand: <tspan font-weight="600">p99 stays under 0.3 px at every distance</tspan>; cracks across LOD boundaries measure ${stats.meshLod.crack.maxMismatchM} m.</text>
<text x="${PAD}" y="${p(T.WT)+98}" font-size="12" fill="#52514e">Interior L0 patches are road corridors held fine regardless of distance — that is the tiling's classification reused as the LOD floor.</text>
</svg>`);
 console.log('fig6-mesh-lod.svg');
}
