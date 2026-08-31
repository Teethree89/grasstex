/* Procedural map generator -> map.svg in the schema readMap() already parses.

   The interesting part is not the random hills, it is that roads are ROUTED rather
   than drawn. A road laid across the terrain has to be paid for twice - once in the
   grade solver, which cuts and fills to keep it under MAX_GRADE, and again in the
   daylight solve, whose width blows up as cross-slope approaches the batter. Routing
   with a grade-penalised Dijkstra keeps both small by following saddles and contours,
   which is what a surveyor does and what the bake is cheapest at.

   --grade-weight is the knob, measured over seed 7 (12 hills, 59 % of the map sloped):

     weight   road m   max grade   mean cut   daylight p95   asset MB   route on slope
     naive      2048       6.70 %     0.267 m        20.7 m      2.36            58 %
        4       3083       3.42 %     0.147 m        13.1 m      2.32            21 %
       12       3259       3.01 %     0.117 m         1.8 m      2.46             0 %
       25       3261       3.01 %     0.117 m         1.9 m      2.48             0 %

   Past ~12 the router saturates: it always buys the flat detour and roads stop
   touching terrain at all, which is cheap and looks wrong. The default is 5 - roads
   still climb, earthwork roughly halves, and it is the cheapest asset of the four,
   because longer roads and narrower corridors very nearly cancel.

   Usage: node genmap.js [--seed N] [--world 600] [--roads 3] [--naive] [--out FILE] */
'use strict';
const fs=require('fs');
const bake=require('./bake.js');

function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const ss=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};

function makeHills(rnd,W,n){
  const out=[];
  for(let i=0;i<n;i++){
    /* alternate sign so the map has valleys to route through, not just bumps to climb */
    const up=i%3!==2, r=W*(0.13+rnd()*0.16), ar=0.6+rnd()*0.9;
    out.push({cx:+(W*0.08+rnd()*W*0.84).toFixed(1),cy:+(W*0.08+rnd()*W*0.84).toFixed(1),
      rx:+(r*ar).toFixed(1),ry:+(r/ar).toFixed(1),
      h:+((up?1:-1)*(8+rnd()*26)).toFixed(1),fo:+(0.14+rnd()*0.18).toFixed(2)});
  }
  return out;
}
/* Hills are summed, so raising --hills raises the whole world rather than just
   populating it: 30 ellipses stacked to 149 m of relief over 1200 m, which put slopes
   near the batter everywhere and drove road curvature p99.9 from 3.3 to 53.7. Measure
   the peak-to-peak the ellipse set actually produces and rescale to the target, so
   hill COUNT controls texture and --relief alone controls amplitude. */
function normalizeRelief(hills,W,target){
  let lo=Infinity,hi=-Infinity;
  for(let y=0;y<=W;y+=W/120)for(let x=0;x<=W;x+=W/120){
    const h=fieldAt(hills,x,y);if(h<lo)lo=h;if(h>hi)hi=h;}
  const span=hi-lo;if(!(span>0.01))return hills;
  const k=target/span;
  for(const e of hills)e.h=+(e.h*k).toFixed(2);
  return hills;
}
const fieldAt=(hills,x,y)=>{let h=0;
  for(const e of hills){const d=Math.hypot((x-e.cx)/e.rx,(y-e.cy)/e.ry);
    if(d<1)h+=e.h*(1-ss((d-e.fo)/(1-e.fo)));}
  return h;};

/* --- grade-penalised Dijkstra over a coarse lattice --- */
/* Distance from each lattice node to any road already placed. Without this the
   cross-slope penalty funnels every road down the same valleys, and at 1200 m two of
   them ended up parallel 11 m apart with their ditches interleaved - 100 % of the
   high-curvature cells in that bake had a second road within 45 m. A road either
   joins a corridor at a junction or keeps well clear of it. */
function occupancy(roads,W,C,n){
  const occ=new Float64Array(n*n).fill(Infinity);
  for(const r of roads)for(let s=1;s<r.pts.length;s++){
    const A=r.pts[s-1],Bp=r.pts[s],vx=Bp[0]-A[0],vy=Bp[1]-A[1],vv=vx*vx+vy*vy;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const x=i*C,y=j*C;
      let u=vv>1e-12?((x-A[0])*vx+(y-A[1])*vy)/vv:0;u=u<0?0:u>1?1:u;
      const d=Math.hypot(x-(A[0]+vx*u),y-(A[1]+vy*u)),o=j*n+i;
      if(d<occ[o])occ[o]=d;}
  }
  return occ;
}
function route(hills,W,a,b,opt){
  const C=opt.cell,n=Math.round(W/C)+1,idx=(i,j)=>j*n+i;
  const H=new Float64Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++)H[idx(i,j)]=fieldAt(hills,i*C,j*C);
  const occ=opt.occ||null, AR=opt.avoidR||0;
  const NB=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const dist=new Float64Array(n*n).fill(Infinity),prev=new Int32Array(n*n).fill(-1);
  const s=idx(Math.round(a[0]/C),Math.round(a[1]/C)),g=idx(Math.round(b[0]/C),Math.round(b[1]/C));
  dist[s]=0;
  const heap=[[0,s]],push=(v)=>{heap.push(v);let c=heap.length-1;
    while(c>0){const p=(c-1)>>1;if(heap[p][0]<=heap[c][0])break;[heap[p],heap[c]]=[heap[c],heap[p]];c=p;}};
  const pop=()=>{const t=heap[0],e=heap.pop();if(heap.length){heap[0]=e;let c=0;
    for(;;){const l=2*c+1,r=l+1;let m=c;
      if(l<heap.length&&heap[l][0]<heap[m][0])m=l;
      if(r<heap.length&&heap[r][0]<heap[m][0])m=r;
      if(m===c)break;[heap[m],heap[c]]=[heap[c],heap[m]];c=m;}}
    return t;};
  const seen=new Uint8Array(n*n);
  while(heap.length){
    const [d,u]=pop();if(seen[u])continue;seen[u]=1;if(u===g)break;
    const ui=u%n,uj=(u-ui)/n;
    for(const [dx,dy] of NB){
      const vi=ui+dx,vj=uj+dy;if(vi<0||vj<0||vi>=n||vj>=n)continue;
      const v=idx(vi,vj),len=Math.hypot(dx,dy)*C;
      const grade=Math.abs(H[v]-H[u])/len;
      if(grade>opt.maxGrade)continue;                    /* impassable, not merely dear */
      /* Grade is what the grade solver pays for; CROSS-slope is what the daylight
         solve pays for, and its width goes as 1/(batter - cross) - unbounded as the
         hillside approaches the batter. Penalising grade alone routes along a contour
         cut into a steep face, which is cheap to grade and ruinous to daylight. */
      const mx=(ui+vi)/2*C,my=(uj+vj)/2*C,e=C*0.5;
      const px=(dx||1e-9),py=(dy||0),pl=Math.hypot(px,py);
      const nx=-py/pl,ny=px/pl;                          /* unit normal to travel */
      const cross=Math.abs(fieldAt(hills,mx+nx*e,my+ny*e)-fieldAt(hills,mx-nx*e,my-ny*e))/(2*e);
      let cost=len*(1+opt.gradeWeight*Math.pow(grade/opt.maxGrade,2)
                     +opt.crossWeight*Math.pow(Math.min(cross,opt.batter*0.98)/opt.batter,2));
      if(occ&&AR>0){
        /* exempt the neighbourhood of the start so a branch can leave its host */
        const sx=vi*C-a[0],sy=vj*C-a[1];
        if(Math.hypot(sx,sy)>AR){
          const d=occ[v];
          if(d<AR)cost+=len*opt.avoidWeight*Math.pow(1-d/AR,2);
        }
      }
      if(d+cost<dist[v]){dist[v]=d+cost;prev[v]=u;push([d+cost,v]);}
    }
  }
  if(!isFinite(dist[g]))return null;
  const path=[];for(let u=g;u!==-1;u=prev[u]){const i=u%n;path.push([i*C,((u-i)/n)*C]);}
  return path.reverse();
}
function simplify(pts,eps){                              /* Douglas-Peucker */
  if(pts.length<3)return pts;
  const d=(p,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],L=Math.hypot(vx,vy)||1;
    return Math.abs((p[0]-a[0])*vy-(p[1]-a[1])*vx)/L;};
  let mi=0,md=0;
  for(let i=1;i<pts.length-1;i++){const q=d(pts[i],pts[0],pts[pts.length-1]);if(q>md){md=q;mi=i;}}
  if(md<=eps)return [pts[0],pts[pts.length-1]];
  return simplify(pts.slice(0,mi+1),eps).slice(0,-1).concat(simplify(pts.slice(mi),eps));
}
/* An 8-neighbour lattice path is a staircase, and Douglas-Peucker can leave corners
   sharp enough that a Catmull-Rom fit cusps through them. A 0.2 m turning radius on a
   7 m road means the prism folds through itself - the offset self-intersection case.
   Relax any vertex whose circumradius is under minR toward its neighbours' midpoint;
   endpoints are pinned so junctions stay put. */
function circumR(a,b,c){
  const A=Math.hypot(b[0]-a[0],b[1]-a[1]),B=Math.hypot(c[0]-b[0],c[1]-b[1]),C=Math.hypot(c[0]-a[0],c[1]-a[1]);
  const ar=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;
  return ar<1e-9?Infinity:(A*B*C)/(4*ar);
}
function minRadius(pts){let m=Infinity;
  for(let i=2;i<pts.length;i++)m=Math.min(m,circumR(pts[i-2],pts[i-1],pts[i]));return m;}
function relax(pts,minR,iters){
  const p=pts.map(q=>q.slice());
  for(let it=0;it<iters;it++){
    let worst=Infinity;
    for(let i=1;i<p.length-1;i++){
      const R=circumR(p[i-1],p[i],p[i+1]);if(R<worst)worst=R;
      if(R>=minR)continue;
      const mx=(p[i-1][0]+p[i+1][0])/2,my=(p[i-1][1]+p[i+1][1])/2;
      p[i][0]+=(mx-p[i][0])*0.35;p[i][1]+=(my-p[i][1])*0.35;
    }
    if(worst>=minR)break;
  }
  return p;
}
function resample(pts,step){                             /* even spacing; uneven spans are
                                                            what makes a spline overshoot */
  const out=[pts[0].slice()];let carry=0;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
    let t=step-carry;
    while(t<=L){out.push([a[0]+(b[0]-a[0])*t/L,a[1]+(b[1]-a[1])*t/L]);t+=step;}
    carry=(L-(t-step));
  }
  const last=pts[pts.length-1];
  if(Math.hypot(last[0]-out[out.length-1][0],last[1]-out[out.length-1][1])>step*0.4)out.push(last.slice());
  else out[out.length-1]=last.slice();
  return out;
}
/* CENTRIPETAL Catmull-Rom (alpha = 0.5). The uniform form overshoots wherever spans are
   uneven and can cusp - which is how a relaxed 30 m polyline still produced a 0.2 m
   turning radius once fitted. The centripetal parameterisation provably admits no cusps
   or self-intersections, which is exactly the guarantee an offset prism needs. */
/* Control points for one centripetal Catmull-Rom span. */
function crSpan(pts,i){
  const A=0.5,kn=(a,b)=>Math.pow(Math.hypot(b[0]-a[0],b[1]-a[1]),A)||1e-6;
  const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
  const d1=kn(p0,p1),d2=kn(p1,p2),d3=kn(p2,p3);
  const c1=[0,1].map(k=>p1[k]+((p1[k]-p0[k])/d1-(p2[k]-p0[k])/(d1+d2)+(p2[k]-p1[k])/d2)*d2/3);
  const c2=[0,1].map(k=>p2[k]-((p2[k]-p1[k])/d2-(p3[k]-p1[k])/(d2+d3)+(p3[k]-p2[k])/d3)*d2/3);
  return [p1,c1,c2,p2];
}
/* Measure the CURVE, not the control polyline. Relaxing vertices to 30 m still left a
   0.2 m radius once fitted, and a hairpin out of the lattice router cannot be removed
   by local relaxation at all - so smooth globally and re-fit until the fitted curve
   itself clears the prism. */
function curveMinRadius(pts){
  const s=[];
  for(let i=0;i<pts.length-1;i++){
    const [a,c1,c2,b]=crSpan(pts,i),n=8;
    for(let k=(i?1:0);k<=n;k++){const t=k/n,u=1-t;
      s.push([u*u*u*a[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*b[0],
              u*u*u*a[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*b[1]]);}
  }
  let mn=Infinity;
  for(let i=2;i<s.length;i++)mn=Math.min(mn,circumR(s[i-2],s[i-1],s[i]));
  return mn;
}
function smoothPass(pts){                                /* Laplacian, endpoints pinned */
  const q=pts.map(p=>p.slice());
  for(let i=1;i<pts.length-1;i++)for(const k of [0,1])
    q[i][k]=pts[i][k]*0.5+(pts[i-1][k]+pts[i+1][k])*0.25;
  return q;
}
function fitFor(pts,prismHalf,o){
  let p=relax(resample(simplify(pts,o.eps),o.step),o.minR,600);
  const want=prismHalf*1.4;
  for(let pass=0;pass<300&&curveMinRadius(p)<want;pass++)p=smoothPass(p);
  return p;
}
function toPath(pts){
  const f=v=>(+v).toFixed(2),A=0.5;
  const kn=(a,b)=>Math.pow(Math.hypot(b[0]-a[0],b[1]-a[1]),A)||1e-6;
  let d='M '+f(pts[0][0])+' '+f(pts[0][1]);
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    const d1=kn(p0,p1),d2=kn(p1,p2),d3=kn(p2,p3);
    const c1=[0,1].map(k=>{
      const m=((p1[k]-p0[k])/d1-(p2[k]-p0[k])/(d1+d2)+(p2[k]-p1[k])/d2)*d2;
      return p1[k]+m/3;});
    const c2=[0,1].map(k=>{
      const m=((p2[k]-p1[k])/d2-(p3[k]-p1[k])/(d2+d3)+(p3[k]-p2[k])/d3)*d2;
      return p2[k]-m/3;});
    d+=' C '+f(c1[0])+' '+f(c1[1])+' '+f(c2[0])+' '+f(c2[1])+' '+f(p2[0])+' '+f(p2[1]);
  }
  return d;
}
function edgePoint(rnd,W){const s=Math.floor(rnd()*4),t=W*(0.15+rnd()*0.7);
  return s===0?[t,0]:s===1?[t,W]:s===2?[0,t]:[W,t];}

const CLASS=[['asphalt',7.0],['dirt',4.6],['cobble',3.6]];

function generate(o){
  const rnd=rng(o.seed),W=o.world,hills=normalizeRelief(makeHills(rnd,W,o.hills),W,o.relief);
  const opt={cell:o.cell,maxGrade:o.maxGrade,gradeWeight:o.naive?0:o.gradeWeight,
    crossWeight:o.naive?0:o.crossWeight,batter:o.batter};
  const roads=[];
  for(let attempt=0;attempt<40&&roads.length<1;attempt++){
    const a=edgePoint(rnd,W);let b=edgePoint(rnd,W);
    if(Math.hypot(b[0]-a[0],b[1]-a[1])<W*0.7)continue;
    const p=route(hills,W,a,b,opt);
    if(p&&p.length>4){const ph=bake.prismHalf(bake.MATERIALS[CLASS[0][0]],CLASS[0][1]/2);
      roads.push({id:'r0',depth:0,pts:fitFor(p,ph,o)});}
  }
  if(!roads.length)return null;
  for(let k=1;k<o.roads;k++){
    for(let attempt=0;attempt<30;attempt++){
      const host=roads[Math.floor(rnd()*roads.length)];
      if(host.depth>=CLASS.length-1)continue;
      const hi=1+Math.floor(rnd()*(host.pts.length-2));
      const a=host.pts[hi],b=edgePoint(rnd,W);
      if(Math.hypot(b[0]-a[0],b[1]-a[1])<W*0.25)continue;
      const nn=Math.round(W/opt.cell)+1;
      const p=route(hills,W,a,b,Object.assign({},opt,{occ:occupancy(roads,W,opt.cell,nn),avoidR:o.avoidR,avoidWeight:o.avoidWeight}));
      if(!p||p.length<4)continue;
      const dep=Math.min(CLASS.length-1,host.depth+1);
      const ph=bake.prismHalf(bake.MATERIALS[CLASS[dep][0]],CLASS[dep][1]/2);
      const sp=fitFor(p,ph,o);sp[0]=a.slice();          /* start exactly on the host */
      roads.push({id:'r'+k,depth:host.depth+1,pts:sp});break;
    }
  }
  return {hills,roads};
}
function toSVG(m,o){
  const W=o.world;
  const hills=m.hills.map(e=>'    <ellipse cx="'+e.cx+'" cy="'+e.cy+'" rx="'+e.rx+'" ry="'+e.ry+
    '" data-height="'+e.h+'" data-falloff="'+e.fo+'"/>').join('\n');
  const roads=m.roads.map(r=>{const [cls,w]=CLASS[Math.min(CLASS.length-1,r.depth)];
    return '    <path id="'+r.id+'" class="'+cls+'" stroke-width="'+w+'"\n          d="'+toPath(r.pts)+'"/>';}).join('\n');
  return '<?xml version="1.0" encoding="utf-8"?>\n'+
  '<!-- GENERATED by genmap.js - seed '+o.seed+', world '+W+' m, '+m.roads.length+' roads, routing '+
  (o.naive?'NAIVE (grade ignored)':'grade-penalised')+'.\n'+
  '     Regenerate: node genmap.js --seed '+o.seed+(o.naive?' --naive':'')+' -->\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+W+'" width="'+W+'" height="'+W+'">\n'+
  '  <g id="terrain">\n'+hills+'\n  </g>\n  <g id="roads">\n'+roads+'\n  </g>\n</svg>\n';
}

if(require.main===module){
  const a=process.argv.slice(2),get=(k,d)=>{const i=a.indexOf(k);return i<0?d:a[i+1];};
  const o={seed:+get('--seed',7),world:+get('--world',600),roads:+get('--roads',3),
    hills:+get('--hills',12),cell:+get('--cell',8),maxGrade:+get('--max-grade',0.10),
    gradeWeight:+get('--grade-weight',5),eps:+get('--eps',7),minR:+get('--min-radius',30),step:+get('--step',18),
    crossWeight:+get('--cross-weight',12),batter:+get('--batter',0.5),
    avoidR:+get('--avoid-radius',45),avoidWeight:+get('--avoid-weight',30),
    relief:+get('--relief',60),
    naive:a.indexOf('--naive')>=0,out:get('--out',__dirname+'/map.svg')};
  const m=generate(o);
  if(!m){console.error('genmap: no route found for seed '+o.seed);process.exit(1);}
  fs.writeFileSync(o.out,toSVG(m,o));
  const grades=m.roads.map(r=>{let mx=0;
    for(let i=1;i<r.pts.length;i++){
      const a=r.pts[i-1],b=r.pts[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(2,Math.ceil(L/2));
      for(let k=1;k<=n;k++){const t0=(k-1)/n,t1=k/n;
        const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
        mx=Math.max(mx,Math.abs(fieldAt(m.hills,p1[0],p1[1])-fieldAt(m.hills,p0[0],p0[1]))/(L/n));}}
    return mx;});
  /* Validate what the BAKE will consume, not the control polyline: read the file back,
     flatten the beziers exactly as readMap does, and check every road's turning radius
     clears its own prism half-width. Below that the offset prism folds through itself,
     and no amount of junction handling downstream can fix it. */
  const back=bake.readMap(o.out);
  let worstRatio=Infinity,bad=[];
  for(const r of back.roads){
    let mn=Infinity;
    for(let i=10;i<r.pts.length;i++)mn=Math.min(mn,minRadius([r.pts[i-10],r.pts[i-5],r.pts[i]]));
    const ph=bake.prismHalf(r.mat,r.hw),ratio=mn/ph;
    if(ratio<worstRatio)worstRatio=ratio;
    if(ratio<1.2)bad.push(r.id+' ('+mn.toFixed(1)+' m vs prism '+ph.toFixed(1)+' m)');
  }
  console.log(o.out+': seed '+o.seed+', '+m.hills.length+' hills, '+m.roads.length+' roads, '+
    'worst natural grade '+(Math.max(...grades)*100).toFixed(1)+'%, '+
    'tightest turn '+worstRatio.toFixed(2)+'x its prism half-width'+(o.naive?' (naive)':''));
  if(bad.length){console.error('  FAIL: prism folds through itself on '+bad.join(', ')+
    ' - raise --min-radius or --step');process.exitCode=1;}
}
module.exports={generate,toSVG,fieldAt,minRadius,curveMinRadius};
