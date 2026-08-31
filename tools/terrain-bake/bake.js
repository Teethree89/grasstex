/* SVG map -> terrain heightfield + material splat.
   Paint what is smooth, compute what is sharp, solve what is coupled:
     - #terrain ellipses are rasterised, quantised to 8 bit, blurred, and fBm added.
       The blur is what makes 8-bit authoring safe; see stats.banding.
     - #roads centrelines drive a distance field. The cross-section is per-material
       DATA, not painted - a stroke gives width, never a transverse profile.
     - Longitudinal grade and daylight are solved against the terrain, because both
       depend on ground the author does not control. */
'use strict';
const fs=require('fs'),path=require('path');
const {png}=require('./png.js');

const WORLD=+(process.env.WORLD||600), RES=0.25, N=Math.round(WORLD/RES);   /* 0.25 m grid */
const LOW=1.0, NL=Math.round(WORLD/LOW);                    /* authored base grid */
const BLUR_M=5.0, NOISE_AMP=2.6, NOISE_BASE=70, NOISE_OCT=5;
const DS=2.0, MAX_GRADE=0.08, GRADE_ITERS=600;              /* 8 % longitudinal */
const CUT_SLOPE=0.5, FILL_SLOPE=0.4, MAX_DAYLIGHT=35;       /* 1:2 cut, 1:2.5 fill */
const JUNCTION_TOL=9.0;

/* Cross-sections. One entry per road class: this is what makes dirt read as dirt
   in GEOMETRY, not just in texture. All segments meet end-to-end by construction,
   so there are no seam steps in the profile. */
const MATERIALS={
  asphalt:{splat:1,crown:0.15,shoulder:1.00,drop:0.05,ditchW:1.60,ditchD:0.55,back:1.20},
  dirt:   {splat:2,crown:0.06,shoulder:0.50,drop:0.03,ditchW:1.00,ditchD:0.22,back:0.80},
  cobble: {splat:3,crown:0.04,shoulder:0.40,drop:0.02,ditchW:0.60,ditchD:0.12,back:0.50},
};
const ss=t=>{t=t<0?0:t>1?1:t;return t*t*(3-2*t);};
function skirtHalf(m){return m.shoulder+m.ditchW+m.back;}
function prismHalf(m,hw){return hw+skirtHalf(m);}
function crownOf(m,hw,t){const u=t/hw;return m.crown*(1-u*u);}
/* Bands are offsets OUTWARD FROM THE PAVED EDGE, so u is distance past that edge -
   not distance from a centreline. For a network u is min over roads, which is the
   distance to the UNION of the paved regions: in the wedge between two roads u stays
   small, so the wedge reads as shoulder instead of two ditches colliding in it. */
function skirt(m,u){
  if(u<=m.shoulder)return -m.drop*ss(u/m.shoulder);
  const a=m.shoulder+m.ditchW; if(u<=a)return -m.drop+(-m.ditchD+m.drop)*ss((u-m.shoulder)/m.ditchW);
  const b=a+m.back;            if(u<=b)return -m.ditchD*(1-ss((u-a)/m.back));
  return 0;
}
function profile(m,hw,t){return t<=hw?crownOf(m,hw,t):skirt(m,t-hw);}

/* ---------------- SVG (controlled subset: ellipse/circle + path M,L,C,Q,Z) ------------- */
function attrs(tag){const o={};tag.replace(/([\w-]+)\s*=\s*"([^"]*)"/g,(_,k,v)=>{o[k]=v;return '';});return o;}
function layer(svg,id){const m=svg.match(new RegExp('<g[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</g>'));return m?m[1]:'';}
function parseD(d){
  const tok=d.match(/[MmLlCcQqZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)||[];
  const pts=[];let i=0,cx=0,cy=0,sx=0,sy=0,cmd='M';
  const num=()=>parseFloat(tok[i++]);
  const push=(x,y)=>{const l=pts[pts.length-1];if(!l||Math.hypot(x-l[0],y-l[1])>1e-9)pts.push([x,y]);};
  const bez=(x1,y1,x2,y2,x3,y3)=>{                          /* flatten to ~1 m chords */
    const n=Math.max(4,Math.ceil((Math.hypot(x1-cx,y1-cy)+Math.hypot(x2-x1,y2-y1)+Math.hypot(x3-x2,y3-y2))/1));
    for(let k=1;k<=n;k++){const u=k/n,v=1-u;
      push(v*v*v*cx+3*v*v*u*x1+3*v*u*u*x2+u*u*u*x3, v*v*v*cy+3*v*v*u*y1+3*v*u*u*y2+u*u*u*y3);}
    cx=x3;cy=y3;};
  while(i<tok.length){
    if(/[MmLlCcQqZz]/.test(tok[i]))cmd=tok[i++];
    const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
    if(C==='Z'){push(sx,sy);cx=sx;cy=sy;continue;}
    if(C==='M'){const x=num()+(rel?cx:0),y=num()+(rel?cy:0);push(x,y);cx=sx=x;cy=sy=y;cmd=rel?'l':'L';continue;}
    if(C==='L'){const x=num()+(rel?cx:0),y=num()+(rel?cy:0);push(x,y);cx=x;cy=y;continue;}
    if(C==='C'){const a=num()+(rel?cx:0),b=num()+(rel?cy:0),c=num()+(rel?cx:0),d2=num()+(rel?cy:0),e=num()+(rel?cx:0),f=num()+(rel?cy:0);bez(a,b,c,d2,e,f);continue;}
    if(C==='Q'){const a=num()+(rel?cx:0),b=num()+(rel?cy:0),e=num()+(rel?cx:0),f=num()+(rel?cy:0);
      bez(cx+2/3*(a-cx),cy+2/3*(b-cy),e+2/3*(a-e),f+2/3*(b-f),e,f);continue;}
    i++;
  }
  return pts;
}
function readMap(file){
  const svg=fs.readFileSync(file,'utf8');
  const hills=[...layer(svg,'terrain').matchAll(/<(ellipse|circle)\b([^>]*)\/?>/g)].map(m=>{
    const a=attrs(m[2]);return {cx:+a.cx,cy:+a.cy,rx:+(a.rx||a.r),ry:+(a.ry||a.r),
      h:+(a['data-height']||0),fo:+(a['data-falloff']||0.2)};});
  const roads=[...layer(svg,'roads').matchAll(/<path\b([^>]*)\/?>/g)].map(m=>{
    const a=attrs(m[1]),mat=MATERIALS[a.class];
    if(!mat)throw new Error('unknown road class: '+a.class);
    return {id:a.id||'road',cls:a.class,mat,hw:(+a['stroke-width'])/2,pts:parseD(a.d)};});
  return {hills,roads};
}

/* ---------------- authored base: rasterise -> 8 bit -> blur -> +fBm ------------------- */
function boxBlur(src,n,r){
  const tmp=new Float32Array(n*n),out=new Float32Array(n*n),w=2*r+1;
  for(let y=0;y<n;y++){let acc=0;
    for(let k=-r;k<=r;k++)acc+=src[y*n+Math.min(n-1,Math.max(0,k))];
    for(let x=0;x<n;x++){tmp[y*n+x]=acc/w;
      acc+=src[y*n+Math.min(n-1,x+r+1)]-src[y*n+Math.min(n-1,Math.max(0,x-r))];}}
  for(let x=0;x<n;x++){let acc=0;
    for(let k=-r;k<=r;k++)acc+=tmp[Math.min(n-1,Math.max(0,k))*n+x];
    for(let y=0;y<n;y++){out[y*n+x]=acc/w;
      acc+=tmp[Math.min(n-1,y+r+1)*n+x]-tmp[Math.min(n-1,Math.max(0,y-r))*n+x];}}
  return out;
}
function hash2(x,y,s){let h=(x|0)*374761393+(y|0)*668265263+s*1274126177;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi,s),b=hash2(xi+1,yi,s),c=hash2(xi,yi+1,s),d=hash2(xi+1,yi+1,s);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function fbm(x,y,s){let f=1/NOISE_BASE,a=0.5,sum=0,norm=0;
  for(let o=0;o<NOISE_OCT;o++){sum+=a*(vnoise(x*f,y*f,s+o*17)*2-1);norm+=a;f*=2.07;a*=0.5;}
  return sum/norm;}

function buildBase(hills){
  /* paint at 1 m in metres */
  const raw=new Float32Array(NL*NL);
  for(let y=0;y<NL;y++)for(let x=0;x<NL;x++){
    const px=(x+0.5)*LOW,py=(y+0.5)*LOW;let h=0;
    for(const e of hills){
      const d=Math.hypot((px-e.cx)/e.rx,(py-e.cy)/e.ry);
      if(d<1)h+=e.h*(1-ss((d-e.fo)/(1-e.fo)));
    }
    raw[y*NL+x]=h;
  }
  /* Quantise to 8 bit exactly as an SVG raster would arrive, twice: once plain and
     once with white-noise dither. Plain quantisation error is spatially CORRELATED -
     it follows the contour bands - so a blur does not average it away. Dither
     decorrelates it first, and only then does the blur behave like a mean filter. */
  let lo=Infinity,hi=-Infinity;for(const v of raw){if(v<lo)lo=v;if(v>hi)hi=v;}
  const step=(hi-lo)/255;
  const qP=new Float32Array(NL*NL),qD=new Float32Array(NL*NL);
  for(let i=0;i<raw.length;i++){
    const u=(raw[i]-lo)/step;
    qP[i]=lo+Math.round(u)*step;
    qD[i]=lo+Math.round(u+(hash2(i%NL,(i/NL)|0,991)-0.5))*step;
  }
  const r=Math.round(BLUR_M/LOW),tri=a=>boxBlur(boxBlur(boxBlur(a,NL,r),NL,r),NL,r);
  const bRef=tri(raw),bP=tri(qP),bD=tri(qD);
  const err=(a,b)=>{let mx=0,ss2=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d>mx)mx=d;ss2+=d*d;}
    return {max:mx,rms:Math.sqrt(ss2/a.length)};};
  return {low:bD,quantStep:step,quantErr:err(qP,raw),
    bandPlain:err(bP,bRef),bandDither:err(bD,bRef)};
}
function sampleLow(low,px,py){
  const x=Math.min(NL-1.001,Math.max(0,px/LOW-0.5)),y=Math.min(NL-1.001,Math.max(0,py/LOW-0.5));
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  const a=low[y0*NL+x0],b=low[y0*NL+x0+1],c=low[(y0+1)*NL+x0],d=low[(y0+1)*NL+x0+1];
  return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;
}
module.exports={WORLD,RES,N,LOW,NL,DS,MAX_GRADE,GRADE_ITERS,CUT_SLOPE,FILL_SLOPE,MAX_DAYLIGHT,
  JUNCTION_TOL,NOISE_AMP,MATERIALS,ss,prismHalf,skirtHalf,crownOf,skirt,profile,readMap,buildBase,sampleLow,fbm,png};
