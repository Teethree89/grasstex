/* Grass placement/masking + terrain sampling API.
   Candidate clumps are filtered before thin-instance buffers are written.
   Terrain height/normal sampling is also resolved once at chunk build time. */
(function(root){
  'use strict';

  function finite(n,fallback){ n=+n; return Number.isFinite(n)?n:fallback; }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function pt(p){ return {x:finite(p&&p.x,0),z:finite(p&&p.z,0)}; }

  function pointInPolygon(x,z,points){
    var inside=false;
    for(var i=0,j=points.length-1;i<points.length;j=i++){
      var a=points[i],b=points[j];
      var cross=((a.z>z)!==(b.z>z)) && (x<(b.x-a.x)*(z-a.z)/((b.z-a.z)||1e-12)+a.x);
      if(cross)inside=!inside;
    }
    return inside;
  }
  function distSqToSegment(x,z,a,b){
    var vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z,vv=vx*vx+vz*vz;
    var t=vv>1e-12?(wx*vx+wz*vz)/vv:0;t=clamp(t,0,1);
    var dx=x-(a.x+vx*t),dz=z-(a.z+vz*t);return dx*dx+dz*dz;
  }
  function normalizeShape(shape){
    if(!shape||typeof shape!=='object')throw new Error('Grass area must be an object');
    var s=Object.assign({},shape),type=String(s.type||'polygon').toLowerCase();s.type=type;
    if(type==='polygon'){s.points=(s.points||[]).map(pt);if(s.points.length<3)throw new Error('Polygon grass area needs at least 3 points');}
    else if(type==='circle'){s.x=finite(s.x,0);s.z=finite(s.z,0);s.radius=Math.max(0,finite(s.radius,0));}
    else if(type==='box'){s.x=finite(s.x,0);s.z=finite(s.z,0);s.width=Math.max(0,finite(s.width,0));s.depth=Math.max(0,finite(s.depth,0));s.rotation=finite(s.rotation,0);}
    else if(type==='corridor'){s.points=(s.points||[]).map(pt);s.width=Math.max(0,finite(s.width,0));if(s.points.length<2)throw new Error('Grass corridor needs at least 2 path points');}
    else if(type==='segment'){s.start=pt(s.start);s.end=pt(s.end);s.clearance=Math.max(0,finite(s.clearance,0));}
    else throw new Error('Unsupported grass area type: '+type);
    return s;
  }
  function contains(s,x,z){
    if(s.type==='polygon')return pointInPolygon(x,z,s.points);
    if(s.type==='circle'){var dx=x-s.x,dz=z-s.z;return dx*dx+dz*dz<=s.radius*s.radius;}
    if(s.type==='box'){var bx=x-s.x,bz=z-s.z,c=Math.cos(-s.rotation),sn=Math.sin(-s.rotation),lx=bx*c-bz*sn,lz=bx*sn+bz*c;return Math.abs(lx)<=s.width*.5&&Math.abs(lz)<=s.depth*.5;}
    if(s.type==='corridor'){var r=s.width*.5,rr=r*r;for(var i=1;i<s.points.length;i++)if(distSqToSegment(x,z,s.points[i-1],s.points[i])<=rr)return true;return false;}
    if(s.type==='segment')return distSqToSegment(x,z,s.start,s.end)<=s.clearance*s.clearance;
    return false;
  }

  function normalizeTerrainSample(v){
    if(typeof v==='number')v={height:v};
    v=v||{};
    var h=finite(v.height,finite(v.y,0)),n=v.normal||{x:0,y:1,z:0};
    var nx=finite(n.x,0),ny=finite(n.y,1),nz=finite(n.z,0),len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    nx/=len;ny/=len;nz/=len;
    var slope=Number.isFinite(+v.slope)?+v.slope:Math.acos(clamp(ny,-1,1))*180/Math.PI;
    return {height:h,normal:{x:nx,y:ny,z:nz},slope:slope};
  }

  function GrassPlacementAPI(options){
    options=options||{};
    this.includes=[];this.excludes=[];
    this.allowedSurfaces=new Set(options.allowedSurfaces||[]);this.excludedSurfaces=new Set(options.excludedSurfaces||[]);
    this.surfaceResolver=typeof options.surfaceResolver==='function'?options.surfaceResolver:null;
    this.terrainSampler=typeof options.terrainSampler==='function'?options.terrainSampler:null;
    this.maxSlope=Number.isFinite(+options.maxSlope)?Math.max(0,+options.maxSlope):90;
    this.autoRebuild=options.autoRebuild!==false;this.revision=0;
  }
  GrassPlacementAPI.prototype._changed=function(){this.revision++;if(this.autoRebuild&&typeof root.rebuildWorld==='function'){try{root.rebuildWorld(true);}catch(_){}}return this;};

  GrassPlacementAPI.prototype.addArea=function(shape){this.includes.push(normalizeShape(shape));return this._changed();};
  GrassPlacementAPI.prototype.includeArea=GrassPlacementAPI.prototype.addArea;
  GrassPlacementAPI.prototype.excludeArea=function(shape){this.excludes.push(normalizeShape(shape));return this._changed();};
  GrassPlacementAPI.prototype.clearAreas=function(){this.includes.length=0;this.excludes.length=0;return this._changed();};
  GrassPlacementAPI.prototype.clearIncludes=function(){this.includes.length=0;return this._changed();};
  GrassPlacementAPI.prototype.clearExclusions=function(){this.excludes.length=0;return this._changed();};
  GrassPlacementAPI.prototype.excludeCircle=function(x,z,radius){return this.excludeArea({type:'circle',x:x,z:z,radius:radius});};
  GrassPlacementAPI.prototype.excludeBox=function(x,z,width,depth,rotation){return this.excludeArea({type:'box',x:x,z:z,width:width,depth:depth,rotation:rotation||0});};
  GrassPlacementAPI.prototype.excludePolygon=function(points){return this.excludeArea({type:'polygon',points:points});};
  GrassPlacementAPI.prototype.excludeCorridor=function(points,width){return this.excludeArea({type:'corridor',points:points,width:width});};
  GrassPlacementAPI.prototype.excludeSegment=function(start,end,clearance){return this.excludeArea({type:'segment',start:start,end:end,clearance:clearance});};

  GrassPlacementAPI.prototype.allowSurface=function(name){this.allowedSurfaces.add(String(name));return this._changed();};
  GrassPlacementAPI.prototype.disallowSurface=function(name){this.allowedSurfaces.delete(String(name));return this._changed();};
  GrassPlacementAPI.prototype.excludeSurface=function(name){this.excludedSurfaces.add(String(name));return this._changed();};
  GrassPlacementAPI.prototype.includeSurface=function(name){this.excludedSurfaces.delete(String(name));return this._changed();};
  GrassPlacementAPI.prototype.setSurfaceResolver=function(fn){this.surfaceResolver=typeof fn==='function'?fn:null;return this._changed();};

  GrassPlacementAPI.prototype.setTerrainSampler=function(fn){this.terrainSampler=typeof fn==='function'?fn:null;return this._changed();};
  GrassPlacementAPI.prototype.clearTerrainSampler=function(){this.terrainSampler=null;return this._changed();};
  GrassPlacementAPI.prototype.setMaxSlope=function(degrees){this.maxSlope=Math.max(0,finite(degrees,90));return this._changed();};
  GrassPlacementAPI.prototype.setTerrainMesh=function(mesh){
    if(!mesh)return this.clearTerrainSampler();
    var B=root.BABYLON;
    return this.setTerrainSampler(function(x,z){
      var height=0,normal={x:0,y:1,z:0};
      if(typeof mesh.getHeightAtCoordinates==='function')height=finite(mesh.getHeightAtCoordinates(x,z),0);
      if(typeof mesh.getNormalAtCoordinatesToRef==='function'&&B&&B.Vector3){var n=new B.Vector3(0,1,0);mesh.getNormalAtCoordinatesToRef(x,z,n);normal={x:n.x,y:n.y,z:n.z};}
      else if(typeof mesh.getNormalAtCoordinates==='function'){var q=mesh.getNormalAtCoordinates(x,z);if(q)normal={x:q.x,y:q.y,z:q.z};}
      return {height:height,normal:normal};
    });
  };
  GrassPlacementAPI.prototype.sampleTerrain=function(x,z,context){
    if(!this.terrainSampler)return {height:0,normal:{x:0,y:1,z:0},slope:0};
    try{return normalizeTerrainSample(this.terrainSampler(+x,+z,context||null));}
    catch(_){return {height:0,normal:{x:0,y:1,z:0},slope:0};}
  };
  GrassPlacementAPI.prototype.isSlopeAllowed=function(sample){return !sample||finite(sample.slope,0)<=this.maxSlope;};

  GrassPlacementAPI.prototype.isAllowed=function(x,z,context){
    x=+x;z=+z;if(!Number.isFinite(x)||!Number.isFinite(z))return false;
    if(this.includes.length){var inAny=false;for(var i=0;i<this.includes.length;i++)if(contains(this.includes[i],x,z)){inAny=true;break;}if(!inAny)return false;}
    for(var j=0;j<this.excludes.length;j++)if(contains(this.excludes[j],x,z))return false;
    var surface=context&&context.surface;
    if(surface==null&&this.surfaceResolver){try{surface=this.surfaceResolver(x,z,context||null);}catch(_){surface=null;}}
    if(surface!=null){surface=String(surface);if(this.excludedSurfaces.has(surface))return false;if(this.allowedSurfaces.size&&!this.allowedSurfaces.has(surface))return false;}
    else if(this.allowedSurfaces.size)return false;
    return true;
  };
  GrassPlacementAPI.prototype.test=GrassPlacementAPI.prototype.isAllowed;
  GrassPlacementAPI.prototype.requestRebuild=function(){if(typeof root.rebuildWorld==='function')root.rebuildWorld(true);return this;};
  GrassPlacementAPI.prototype.snapshot=function(){return {revision:this.revision,includes:this.includes.slice(),excludes:this.excludes.slice(),allowedSurfaces:Array.from(this.allowedSurfaces),excludedSurfaces:Array.from(this.excludedSurfaces),maxSlope:this.maxSlope,hasTerrainSampler:!!this.terrainSampler};};

  root.GrassPlacementAPI=GrassPlacementAPI;
  if(!root.GrassAPI)root.GrassAPI=new GrassPlacementAPI();
})(typeof window!=='undefined'?window:globalThis);
