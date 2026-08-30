/* v55 amortized world streaming with terrain-height/slope support.
   Candidate RNG remains deterministic; masks and terrain rejection happen only after
   the full candidate random sequence is consumed. Terrain is sampled once per clump
   when a chunk is built, then baked into near/medium/far/fill instance matrices. */
(function(){
  if(typeof BABYLON==='undefined'||typeof scene==='undefined'||typeof camera==='undefined'||typeof engine==='undefined')return;
  if(typeof CHUNK==='undefined'||typeof perChunkCount!=='function'||typeof rng!=='function'||typeof hash2D!=='function')return;
  if(typeof nearTypes==='undefined'||typeof medTypes==='undefined'||typeof farTypes==='undefined'||typeof nearPatch==='undefined')return;

  var BUDGET_MS=2.0,COMMITS_PER_FRAME=1,PAD=CHUNK*2.0,HYST=CHUNK*.4;
  var NEAR_D=(typeof NEAR_END!=='undefined'?NEAR_END:30)+PAD;
  var MED_D=(typeof MED_END!=='undefined'?MED_END:165)+PAD;
  var FAR_LO=Math.max(0,(typeof FAR_START!=='undefined'?FAR_START:150)-PAD);
  var FAR_HI=(typeof FAR_END!=='undefined'?FAR_END:242)+PAD,RING=Math.max(NEAR_D,MED_D,FAR_HI);

  var nearM=[],nearS=[],medM=[],farM=[],patchM=null;
  var nearN=new Int32Array(6),seedN=new Int32Array(6),medN=new Int32Array(6),farN=new Int32Array(6),patchN=0;
  var bound=new WeakMap(),job=null,haveWorld=false,builtX=1e9,builtZ=1e9,builtDen=-1;

  function fit(list,i,need){var a=list[i];if(!a||a.length<need)list[i]=new Float32Array(Math.ceil(need*1.25)+16);return list[i];}
  function push(mesh,kind,data,stride,instances){var b=bound.get(mesh);if(!b){b={};bound.set(mesh,b);}if(b[kind]!==data){mesh.thinInstanceSetBuffer(kind,data,stride,false);b[kind]=data;}else mesh.thinInstanceBufferUpdated(kind);if(instances>=0)mesh.thinInstanceCount=instances;}

  function startJob(den){
    var count=perChunkCount(),ox=camera.position.x,oz=camera.position.z,range=Math.ceil(RING/CHUNK)+1;
    var cx=Math.floor(ox/CHUNK),cz=Math.floor(oz/CHUNK),list=[],nearC=0,medFullC=0,medHalfC=0,farC=0;
    for(var z=cz-range;z<=cz+range;z++)for(var x=cx-range;x<=cx+range;x++){
      var dx=(x+.5)*CHUNK-ox,dz=(z+.5)*CHUNK-oz,d=Math.sqrt(dx*dx+dz*dz);if(d>RING)continue;
      var wn=d<=NEAR_D,wm=d<=MED_D,wf=d>=FAR_LO&&d<=FAR_HI;if(!wn&&!wm&&!wf)continue;
      if(wn)nearC++;if(wm){if(wn)medFullC++;else medHalfC++;}if(wf)farC++;list.push({x:x,z:z,d:d,n:wn,m:wm,f:wf});
    }
    list.sort(function(a,b){return a.d-b.d;});
    var c6=new Int32Array(6),cm=new Int32Array(6),cf=new Int32Array(6);
    for(var i=0;i<count;i++){var v=i%6;c6[v]++;if((Math.floor(i/6)&1)===0)cm[v]++;if(i%7===0)cf[v]++;}
    for(var t=0;t<6;t++){
      fit(nearM,t,nearC*c6[t]*16);fit(nearS,t,nearC*c6[t]);fit(medM,t,(medFullC*c6[t]+medHalfC*cm[t])*16);fit(farM,t,farC*cf[t]*16);
      nearN[t]=seedN[t]=medN[t]=farN[t]=0;
    }
    var pNeed=nearC*count*16;if(!patchM||patchM.length<pNeed)patchM=new Float32Array(Math.ceil(pNeed*1.25)+16);patchN=0;
    job={list:list,i:0,count:count,commit:0};builtX=ox;builtZ=oz;builtDen=den;
    if(typeof status!=='undefined'&&status)status.textContent='Streaming terrain grass…';
  }

  function visitChunk(cx,cz,count,sink){
    var r=rng(hash2D(cx,cz)),ox=cx*CHUNK,oz=cz*CHUNK;
    for(var i=0;i<count;i++){
      var x=ox+r()*CHUNK,z=oz+r()*CHUNK,yaw=r()*Math.PI*2,s=.70+r()*.48,h=.82+r()*.30,seed=r();
      var ctx={chunkX:cx,chunkZ:cz,index:i,seed:seed};
      if(window.GrassAPI&&typeof window.GrassAPI.isAllowed==='function'&&!window.GrassAPI.isAllowed(x,z,ctx))continue;
      var terrain={height:0,normal:{x:0,y:1,z:0},slope:0};
      if(window.GrassAPI&&typeof window.GrassAPI.sampleTerrain==='function')terrain=window.GrassAPI.sampleTerrain(x,z,ctx)||terrain;
      if(window.GrassAPI&&typeof window.GrassAPI.isSlopeAllowed==='function'&&!window.GrassAPI.isSlopeAllowed(terrain))continue;
      sink(i,x,z,yaw,s,h,seed,terrain);
    }
  }

  function writeUpright(a,o,c,sn,s,sy,x,y,z){
    a[o]=c*s;a[o+1]=0;a[o+2]=-sn*s;a[o+3]=0;
    a[o+4]=0;a[o+5]=sy;a[o+6]=0;a[o+7]=0;
    a[o+8]=sn*s;a[o+9]=0;a[o+10]=c*s;a[o+11]=0;
    a[o+12]=x;a[o+13]=y;a[o+14]=z;a[o+15]=1;
  }

  function writePatch(a,o,yaw,scale,x,y,z,n){
    n=n||{x:0,y:1,z:0};var nx=n.x||0,ny=n.y==null?1:n.y,nz=n.z||0;
    var len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;nx/=len;ny/=len;nz/=len;
    var fx=Math.sin(yaw),fz=Math.cos(yaw);
    var dot=fx*nx+fz*nz;fx-=dot*nx;var fy=-dot*ny;fz-=dot*nz;
    len=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;fx/=len;fy/=len;fz/=len;
    var rx=ny*fz-nz*fy,ry=nz*fx-nx*fz,rz=nx*fy-ny*fx;
    a[o]=rx*scale;a[o+1]=ry*scale;a[o+2]=rz*scale;a[o+3]=0;
    a[o+4]=nx*scale;a[o+5]=ny*scale;a[o+6]=nz*scale;a[o+7]=0;
    a[o+8]=fx*scale;a[o+9]=fy*scale;a[o+10]=fz*scale;a[o+11]=0;
    a[o+12]=x;a[o+13]=y+.018;a[o+14]=z;a[o+15]=1;
  }

  function bakeChunk(e,count){
    var wn=e.n,wm=e.m,wf=e.f;
    visitChunk(e.x,e.z,count,function(i,gx,gz,yaw,gs,gh,seed,terrain){
      var v=i%6,s=gs,sy=gs*gh,c=Math.cos(yaw),sn=Math.sin(yaw),gy=+terrain.height||0,a,o;
      if(wn){
        a=nearM[v];o=nearN[v];writeUpright(a,o,c,sn,s,sy,gx,gy,gz);nearN[v]=o+16;nearS[v][seedN[v]++]=seed;
        var pw=(typeof V!=='undefined'&&V[v]&&V[v].width)?V[v].width:.71,ps=gs*pw/.65,q=patchN;
        writePatch(patchM,q,yaw,ps,gx,gy,gz,terrain.normal);patchN=q+16;
      }
      if(wm&&(wn||(Math.floor(i/6)&1)===0)){a=medM[v];o=medN[v];writeUpright(a,o,c,sn,s,sy,gx,gy,gz);medN[v]=o+16;}
      if(wf&&i%7===0){a=farM[v];o=farN[v];writeUpright(a,o,c,sn,s,sy,gx,gy,gz);farN[v]=o+16;}
    });
  }

  function commitType(t){push(nearTypes[t].mesh,'matrix',nearM[t],16,nearN[t]/16);push(nearTypes[t].mesh,'instanceSeed',nearS[t],1,-1);push(medTypes[t].mesh,'matrix',medM[t],16,medN[t]/16);push(farTypes[t].mesh,'matrix',farM[t],16,farN[t]/16);}
  function step(unlimited){
    if(!job)return;var t0=performance.now(),L=job.list;
    while(job.i<L.length){bakeChunk(L[job.i],job.count);job.i++;if(!unlimited&&performance.now()-t0>BUDGET_MS)return;}
    var done=0;while(job.commit<7){if(job.commit<6)commitType(job.commit);else push(nearPatch,'matrix',patchM,16,patchN/16);job.commit++;if(!unlimited&&++done>=COMMITS_PER_FRAME)return;}
    var total=0;for(var t=0;t<6;t++)total+=nearN[t]/16+medN[t]/16+farN[t]/16;job=null;haveWorld=true;
    if(typeof status!=='undefined'&&status)status.textContent='Ready — '+Math.round(total).toLocaleString()+' instances • '+L.length+' chunks';
  }

  window.rebuildWorld=function(force){
    var den=+density.value,dx=camera.position.x-builtX,dz=camera.position.z-builtZ,moved=Math.sqrt(dx*dx+dz*dz),jump=!haveWorld||moved>MED_D;
    if(force||den!==builtDen)startJob(den);else if(!job&&moved>HYST)startJob(den);
    if(job){window.__grassStreamBusy=true;step(jump);window.__grassStreamBusy=!!job;}
  };
  window.GrassStream={visitChunk:visitChunk,get busy(){return!!job;},setBudget:function(ms){BUDGET_MS=Math.max(.5,+ms||2);},stats:function(){return{chunks:job?job.list.length:0,progress:job?job.i/job.list.length:1};}};
})();
