/* Camera-relative chunked LOD over the tiled heightfield.

   This is the other half of the tiling. Tiles are fine where the ROADS are, forever;
   a mesh has to be fine where the CAMERA is, per frame. Both read the same field, so
   the old invariant ("grass samples the mesh's grid") relaxes to "grass and the mesh
   sample the same field" and tessellation becomes a free LOD choice.

   Crack fix is the same one the tiling uses: where a fine chunk meets a coarser one,
   the fine chunk's extra edge vertices are snapped onto the coarse edge's linear
   interpolation, so both sides describe the same curve. T-junctions in the index
   buffer, but no gap. */
'use strict';
const {sampleTiled}=require('./tile.js');

const LOD=[0.25,0.5,1,2,4];                 /* spacing per level */
const BAND=[30,60,120,240];                 /* level L applies out to BAND[L] */
function levelFor(d){for(let L=0;L<BAND.length;L++)if(d<BAND[L])return L;return LOD.length-1;}

/* Camera distance sets the ceiling on detail; CONTENT sets the floor. The finest
   level only buys anything where the sharp thing is - a road prism - and the tiling
   already knows where those are. Everywhere else the near field is capped one level
   coarser, which is free: grass is excluded from the corridor, so nothing stands on
   the geometry that level was resolving. */
function build(T,cam,opt){
  const CH=(opt&&opt.chunk)||32, RANGE=(opt&&opt.range)||300;
  const floorL=(opt&&opt.floorLevel)||(()=>0);
  const nC=Math.ceil(T.WT/CH), chunks=new Map();
  for(let cj=0;cj<nC;cj++)for(let ci=0;ci<nC;ci++){
    const x0=ci*CH,y0=cj*CH,mx=x0+CH/2,my=y0+CH/2;
    const d=Math.hypot(mx-cam[0],my-cam[1]);
    if(d-CH*0.71>RANGE)continue;
    chunks.set(cj*nC+ci,{ci,cj,d,L:Math.max(levelFor(Math.max(0,d-CH*0.71)),floorL(ci,cj))});
  }
  /* vertex grids */
  for(const c of chunks.values()){
    const s=LOD[c.L],n=Math.round(CH/s),g=new Float32Array((n+1)*(n+1));
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)g[j*(n+1)+i]=sampleTiled(T,c.ci*CH+i*s,c.cj*CH+j*s);
    c.n=n;c.s=s;c.g=g;
  }
  /* snap edges facing a coarser neighbour */
  let snaps=0;
  for(const c of chunks.values()){
    const n=c.n,G=n+1;
    for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
      const nb=chunks.get((c.cj+dy)*nC+(c.ci+dx));
      if(!nb||nb.L<=c.L)continue;                 /* only snap toward the coarser side */
      const step=Math.round(LOD[nb.L]/c.s);       /* fine verts per coarse span */
      for(let k=0;k<=n;k++){
        if(k%step===0)continue;                   /* coincides with a coarse vertex */
        const k0=Math.floor(k/step)*step,k1=Math.min(n,k0+step),t=(k-k0)/(k1-k0);
        const idx=(kk)=>(dy===0?(kk*G+(dx<0?0:n)):((dy<0?0:n)*G+kk));
        c.g[idx(k)]=c.g[idx(k0)]+(c.g[idx(k1)]-c.g[idx(k0)])*t;snaps++;
      }
    }
  }
  let verts=0,tris=0;for(const c of chunks.values()){verts+=(c.n+1)*(c.n+1);tris+=c.n*c.n*2;}
  return {chunks,nC,CH,cam,verts,tris,snaps,T};
}

/* The surface the GPU actually rasterises: barycentric over the LOD triangle. */
function meshHeight(M,x,y){
  const ci=Math.floor(x/M.CH),cj=Math.floor(y/M.CH),c=M.chunks.get(cj*M.nC+ci);
  if(!c)return null;
  const lx=(x-ci*M.CH)/c.s,ly=(y-cj*M.CH)/c.s;
  const i=Math.min(c.n-1,Math.max(0,Math.floor(lx))),j=Math.min(c.n-1,Math.max(0,Math.floor(ly)));
  const u=lx-i,v=ly-j,G=c.n+1,o=j*G+i;
  const h00=c.g[o],h10=c.g[o+1],h01=c.g[o+G],h11=c.g[o+G+1];
  return (u+v<=1)?h00+(h10-h00)*u+(h01-h00)*v
                 :h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
}
module.exports={LOD,BAND,levelFor,build,meshHeight};
