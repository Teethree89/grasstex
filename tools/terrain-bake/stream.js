/* Incremental LOD streaming: rebuild only what the camera's move actually changed.

   Two things make this different from calling lod.build() every frame:

   - Hysteresis. A chunk sitting on a band edge flips level on sub-metre camera
     jitter, and this project's camera has footstep kicks. Refining needs
     d < BAND-H, coarsening needs d >= BAND+H, so the two thresholds never coincide.
   - Neighbour invalidation. A chunk's edge vertices are snapped to its COARSER
     neighbours, so when chunk A changes level, A's four neighbours hold stale snaps
     even though their own level did not change. Miss this and cracks reopen as you
     walk. Edges are re-sampled from the field before re-snapping rather than being
     stored, so a re-snap can never compound a previous one. */
'use strict';
const {sampleTiled}=require('./tile.js');
const {LOD,BAND,levelFor}=require('./lod.js');

function levelHyst(d,prev,H){
  if(prev===undefined)return levelFor(d);
  let want=prev;
  while(want>0&&d<BAND[want-1]-H)want--;                 /* refine only well inside  */
  while(want<LOD.length-1&&d>=BAND[want]+H)want++;       /* coarsen only well outside */
  return want;
}

function create(T,opt){
  return {T,CH:opt.chunk||32,range:opt.range||300,HYST:opt.hyst===undefined?6:opt.hyst,
    floorLevel:opt.floorLevel||(()=>0),budget:opt.budget||4,
    nC:Math.ceil(T.WT/(opt.chunk||32)),chunks:new Map(),dirty:new Set(),
    stat:{levelChanges:0,rebuilds:0,vertsRebuilt:0,maxQueue:0}};
}
const key=(st,ci,cj)=>cj*st.nC+ci;

function resample(st,c){
  const s=LOD[c.L],n=Math.round(st.CH/s),G=n+1,g=new Float32Array(G*G);
  for(let j=0;j<G;j++)for(let i=0;i<G;i++)g[j*G+i]=sampleTiled(st.T,c.ci*st.CH+i*s,c.cj*st.CH+j*s);
  c.n=n;c.s=s;c.g=g;
}
function snap(st,c){
  const n=c.n,G=n+1;
  for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
    const idx=k=>(dy===0?(k*G+(dx<0?0:n)):((dy<0?0:n)*G+k));
    /* restore from the field first: a stale snap must never seed the next one */
    for(let k=0;k<=n;k++){const i=dx===0?k:(dx<0?0:n),j=dy===0?k:(dy<0?0:n);
      c.g[j*G+i]=sampleTiled(st.T,c.ci*st.CH+i*c.s,c.cj*st.CH+j*c.s);}
    const nb=st.chunks.get(key(st,c.ci+dx,c.cj+dy));
    if(!nb||nb.L<=c.L)continue;
    const step=Math.round(LOD[nb.L]/c.s);
    for(let k=0;k<=n;k++){
      if(k%step===0)continue;
      const k0=Math.floor(k/step)*step,k1=Math.min(n,k0+step),t=(k-k0)/(k1-k0);
      c.g[idx(k)]=c.g[idx(k0)]+(c.g[idx(k1)]-c.g[idx(k0)])*t;
    }
  }
}
function markDirty(st,ci,cj){
  for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
    const k=key(st,ci+dx,cj+dy);if(st.chunks.has(k))st.dirty.add(k);
  }
}

/* Returns what this tick actually did. Drains at most `budget` chunks, so state is
   transiently mixed - which is the point of streaming, and why the equivalence test
   below drains first. */
function update(st,cam){
  let changed=0,added=0,removed=0;
  for(let cj=0;cj<st.nC;cj++)for(let ci=0;ci<st.nC;ci++){
    const k=key(st,ci,cj),mx=(ci+0.5)*st.CH,my=(cj+0.5)*st.CH;
    const d=Math.hypot(mx-cam[0],my-cam[1]),inRange=d-st.CH*0.71<=st.range;
    const cur=st.chunks.get(k);
    if(!inRange){if(cur){st.chunks.delete(k);markDirty(st,ci,cj);removed++;}continue;}
    const de=Math.max(0,d-st.CH*0.71);
    const L=Math.max(levelHyst(de,cur?cur.L:undefined,st.HYST),st.floorLevel(ci,cj));
    if(!cur){st.chunks.set(k,{ci,cj,L,n:0,s:0,g:null});markDirty(st,ci,cj);added++;}
    else if(cur.L!==L){cur.L=L;markDirty(st,ci,cj);changed++;}
  }
  st.stat.levelChanges+=changed;
  if(st.dirty.size>st.stat.maxQueue)st.stat.maxQueue=st.dirty.size;
  /* Nearest first. The dirty set arrives in scan order, which is fine for the ~10
     chunks a walking step dirties but wrong for a cold start or a teleport, where it
     would fill in the far field while the ground under the camera is still missing. */
  let done=0;
  const order=Array.from(st.dirty).map(k=>{const c=st.chunks.get(k);
    return [k,c?Math.hypot((c.ci+0.5)*st.CH-cam[0],(c.cj+0.5)*st.CH-cam[1]):Infinity];})
    .sort((a,b)=>a[1]-b[1]);
  for(const [k] of order){
    if(done>=st.budget)break;
    st.dirty.delete(k);const c=st.chunks.get(k);if(!c)continue;
    resample(st,c);snap(st,c);
    st.stat.rebuilds++;st.stat.vertsRebuilt+=(c.n+1)*(c.n+1);done++;
  }
  return {levelChanges:changed,added,removed,rebuilt:done,queued:st.dirty.size};
}
function drain(st){let n=0;while(st.dirty.size){
  const k=st.dirty.values().next().value;st.dirty.delete(k);
  const c=st.chunks.get(k);if(!c)continue;resample(st,c);snap(st,c);n++;}
  return n;}
module.exports={create,update,drain,levelHyst};
