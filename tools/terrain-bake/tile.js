/* Two-level tiling of the baked surface.
   Coarse everywhere, fine only over road prisms - the only sharp thing in the field
   (curvature p99.9 3.0 /m on road vs 0.13 off it, see stats.sharpness).

   Node-centred, NOT cell-centred: samples sit at i*RES so a 4:1 refinement nests
   exactly, every coarse node is also a fine node. Cell centres do not nest
   ((I+0.5)*4 is never (i+0.5)) and that misalignment is what turns into cracks.

   Seam rule: where a fine tile meets a coarse one, the fine edge nodes are snapped
   onto the coarse edge's linear interpolation. The coarse tile draws straight spans
   between its 1 m nodes; the fine tile's extra nodes then lie exactly ON those spans,
   so the shared boundary is the same curve from both sides - no crack, and grass
   sampling either tile gets the same height. */
'use strict';

function makeSampler(height,N,RES){          /* bilinear over the cell-centred bake */
  return function H(x,y){
    const fx=Math.min(N-1.0001,Math.max(0,x/RES-0.5)),fy=Math.min(N-1.0001,Math.max(0,y/RES-0.5));
    const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0,o=y0*N+x0;
    const a=height[o],b=height[o+1],c=height[o+N],d=height[o+N+1];
    return a+(b-a)*tx+(c-a)*ty+(a-b-c+d)*tx*ty;
  };
}

function buildTiles(H,opt){
  const {WORLD,TILE,COARSE,FINE,isFine}=opt;
  if(Math.abs(TILE/COARSE-Math.round(TILE/COARSE))>1e-9)throw new Error('TILE must be a whole number of coarse cells');
  if(Math.abs(COARSE/FINE-Math.round(COARSE/FINE))>1e-9)throw new Error('COARSE must be a whole number of fine cells');
  /* Pad out to a whole number of tiles. A tile that runs off the coarse grid gets its
     edge nodes clamped, and the snap then writes the WRONG values - that showed up as
     a 0.26 m crack for every TILE that does not divide WORLD. */
  const nT=Math.ceil(WORLD/TILE-1e-9), WT=nT*TILE, R=Math.round(COARSE/FINE);
  const GC=Math.round(WT/COARSE)+1, GF=Math.round(TILE/FINE)+1;
  const coarse=new Float32Array(GC*GC);
  for(let j=0;j<GC;j++)for(let i=0;i<GC;i++)coarse[j*GC+i]=H(i*COARSE,j*COARSE);
  const fine=new Map();
  for(let tj=0;tj<nT;tj++)for(let ti=0;ti<nT;ti++){
    if(!isFine(ti,tj))continue;
    const g=new Float32Array(GF*GF),ox=ti*TILE,oy=tj*TILE;
    for(let j=0;j<GF;j++)for(let i=0;i<GF;i++)g[j*GF+i]=H(ox+i*FINE,oy+j*FINE);
    fine.set(tj*nT+ti,g);
  }
  /* snap fine edges that face a coarse neighbour */
  const cAt=(i,j)=>coarse[Math.min(GC-1,Math.max(0,j))*GC+Math.min(GC-1,Math.max(0,i))];
  let snapped=0,snapMax=0;
  for(const [key,g] of fine){
    const ti=key%nT,tj=(key-ti)/nT, ci0=ti*TILE/COARSE, cj0=tj*TILE/COARSE;
    const edges=[[0,-1,'top'],[0,1,'bottom'],[-1,0,'left'],[1,0,'right']];
    for(const [dx,dy] of edges){
      const ni=ti+dx,nj=tj+dy;
      if(ni>=0&&ni<nT&&nj>=0&&nj<nT&&fine.has(nj*nT+ni))continue;   /* fine|fine: already identical */
      for(let k=0;k<GF;k++){
        const i=dx===0?k:(dx<0?0:GF-1), j=dy===0?k:(dy<0?0:GF-1);
        const cf=k/R, c0=Math.floor(cf), t=cf-c0;                   /* position along the coarse edge */
        const ci=dx===0?ci0+c0:ci0+(dx<0?0:TILE/COARSE), cj=dy===0?cj0+c0:cj0+(dy<0?0:TILE/COARSE);
        const a=dx===0?cAt(ci,cj):cAt(ci,cj), b=dx===0?cAt(ci+1,cj):cAt(ci,cj+1);
        const v=a+(b-a)*t, o=j*GF+i;
        const d=Math.abs(v-g[o]); if(d>snapMax)snapMax=d; if(d>1e-9)snapped++;
        g[o]=v;
      }
    }
  }
  return {coarse,fine,nT,GC,GF,R,TILE,COARSE,FINE,WORLD,WT,snapped,snapMax};
}

/* The runtime lookup grass and the mesh both use. */
function sampleTiled(T,x,y){
  const ti=Math.min(T.nT-1,Math.max(0,Math.floor(x/T.TILE))),tj=Math.min(T.nT-1,Math.max(0,Math.floor(y/T.TILE)));
  const g=T.fine.get(tj*T.nT+ti);
  if(g){const lx=(x-ti*T.TILE)/T.FINE, ly=(y-tj*T.TILE)/T.FINE;
    const i=Math.min(T.GF-2,Math.max(0,Math.floor(lx))),j=Math.min(T.GF-2,Math.max(0,Math.floor(ly)));
    const tx=lx-i,ty=ly-j,o=j*T.GF+i;
    return g[o]+(g[o+1]-g[o])*tx+(g[o+T.GF]-g[o])*ty+(g[o]-g[o+1]-g[o+T.GF]+g[o+T.GF+1])*tx*ty;}
  const fx=x/T.COARSE,fy=y/T.COARSE;
  const i=Math.min(T.GC-2,Math.max(0,Math.floor(fx))),j=Math.min(T.GC-2,Math.max(0,Math.floor(fy)));
  const tx=fx-i,ty=fy-j,o=j*T.GC+i;
  return T.coarse[o]+(T.coarse[o+1]-T.coarse[o])*tx+(T.coarse[o+T.GC]-T.coarse[o])*ty
    +(T.coarse[o]-T.coarse[o+1]-T.coarse[o+T.GC]+T.coarse[o+T.GC+1])*tx*ty;
}

/* Walk every fine|coarse boundary and confirm both sides return the same height. */
function seamError(T){
  let mx=0,n=0;
  for(const key of T.fine.keys()){
    const ti=key%T.nT,tj=(key-ti)/T.nT;
    for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
      const ni=ti+dx,nj=tj+dy;
      if(ni<0||ni>=T.nT||nj<0||nj>=T.nT||T.fine.has(nj*T.nT+ni))continue;
      for(let k=0;k<=400;k++){
        const u=k/400*T.TILE;
        const x=dx===0?ti*T.TILE+u:(ti+(dx<0?0:1))*T.TILE, y=dy===0?tj*T.TILE+u:(tj+(dy<0?0:1))*T.TILE;
        const e=1e-6;
        const inside=sampleTiled(T,x-dx*e,y-dy*e), outside=sampleTiled(T,x+dx*e,y+dy*e);
        const d=Math.abs(inside-outside); if(d>mx)mx=d; n++;
      }
    }
  }
  return {samples:n,maxMismatch:mx};
}
module.exports={makeSampler,buildTiles,sampleTiled,seamError};
