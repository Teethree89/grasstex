/* Grass placement/masking API.
   Designed to sit in front of the deterministic grass streamer. It does not move or
   delete rendered clumps after the fact; candidate positions are accepted/rejected
   before they enter thin-instance buffers.

   Global usage:
     GrassAPI.addArea({type:'polygon', points:[{x:0,z:0}, ...]});
     GrassAPI.excludeCircle(x,z,radius);
     GrassAPI.excludeBox(x,z,width,depth,rotationRadians);
     GrassAPI.excludePolygon(points);
     GrassAPI.excludeCorridor(pathPoints,width);
     GrassAPI.excludeSegment(start,end,clearance);
*/
(function(root){
  'use strict';

  function finite(n,fallback){ n=+n; return Number.isFinite(n)?n:fallback; }
  function pt(p){ return {x:finite(p&&p.x,0),z:finite(p&&p.z,0)}; }

  function pointInPolygon(x,z,points){
    var inside=false;
    for(var i=0,j=points.length-1;i<points.length;j=i++){
      var a=points[i],b=points[j];
      var cross=((a.z>z)!==(b.z>z)) &&
        (x < (b.x-a.x)*(z-a.z)/((b.z-a.z)||1e-12)+a.x);
      if(cross) inside=!inside;
    }
    return inside;
  }

  function distSqToSegment(x,z,a,b){
    var vx=b.x-a.x,vz=b.z-a.z,wx=x-a.x,wz=z-a.z;
    var vv=vx*vx+vz*vz;
    var t=vv>1e-12?(wx*vx+wz*vz)/vv:0;
    t=Math.max(0,Math.min(1,t));
    var dx=x-(a.x+vx*t),dz=z-(a.z+vz*t);
    return dx*dx+dz*dz;
  }

  function normalizeShape(shape){
    if(!shape||typeof shape!=='object') throw new Error('Grass area must be an object');
    var s=Object.assign({},shape),type=String(s.type||'polygon').toLowerCase();
    s.type=type;
    if(type==='polygon'){
      s.points=(s.points||[]).map(pt);
      if(s.points.length<3) throw new Error('Polygon grass area needs at least 3 points');
    }else if(type==='circle'){
      s.x=finite(s.x,0);s.z=finite(s.z,0);s.radius=Math.max(0,finite(s.radius,0));
    }else if(type==='box'){
      s.x=finite(s.x,0);s.z=finite(s.z,0);s.width=Math.max(0,finite(s.width,0));
      s.depth=Math.max(0,finite(s.depth,0));s.rotation=finite(s.rotation,0);
    }else if(type==='corridor'){
      s.points=(s.points||[]).map(pt);s.width=Math.max(0,finite(s.width,0));
      if(s.points.length<2) throw new Error('Grass corridor needs at least 2 path points');
    }else if(type==='segment'){
      s.start=pt(s.start);s.end=pt(s.end);s.clearance=Math.max(0,finite(s.clearance,0));
    }else throw new Error('Unsupported grass area type: '+type);
    return s;
  }

  function contains(s,x,z){
    if(s.type==='polygon') return pointInPolygon(x,z,s.points);
    if(s.type==='circle'){
      var dx=x-s.x,dz=z-s.z;return dx*dx+dz*dz<=s.radius*s.radius;
    }
    if(s.type==='box'){
      var dx=x-s.x,dz=z-s.z,c=Math.cos(-s.rotation),sn=Math.sin(-s.rotation);
      var lx=dx*c-dz*sn,lz=dx*sn+dz*c;
      return Math.abs(lx)<=s.width*.5 && Math.abs(lz)<=s.depth*.5;
    }
    if(s.type==='corridor'){
      var r=s.width*.5,rr=r*r;
      for(var i=1;i<s.points.length;i++) if(distSqToSegment(x,z,s.points[i-1],s.points[i])<=rr) return true;
      return false;
    }
    if(s.type==='segment') return distSqToSegment(x,z,s.start,s.end)<=s.clearance*s.clearance;
    return false;
  }

  function GrassPlacementAPI(options){
    options=options||{};
    this.includes=[];
    this.excludes=[];
    this.allowedSurfaces=new Set(options.allowedSurfaces||[]);
    this.excludedSurfaces=new Set(options.excludedSurfaces||[]);
    this.surfaceResolver=typeof options.surfaceResolver==='function'?options.surfaceResolver:null;
    this.autoRebuild=options.autoRebuild!==false;
    this.revision=0;
  }

  GrassPlacementAPI.prototype._changed=function(){
    this.revision++;
    if(this.autoRebuild && typeof root.rebuildWorld==='function'){
      try{ root.rebuildWorld(true); }catch(_){ }
    }
    return this;
  };

  GrassPlacementAPI.prototype.addArea=function(shape){ this.includes.push(normalizeShape(shape));return this._changed(); };
  GrassPlacementAPI.prototype.includeArea=GrassPlacementAPI.prototype.addArea;
  GrassPlacementAPI.prototype.excludeArea=function(shape){ this.excludes.push(normalizeShape(shape));return this._changed(); };
  GrassPlacementAPI.prototype.clearAreas=function(){ this.includes.length=0;this.excludes.length=0;return this._changed(); };
  GrassPlacementAPI.prototype.clearIncludes=function(){ this.includes.length=0;return this._changed(); };
  GrassPlacementAPI.prototype.clearExclusions=function(){ this.excludes.length=0;return this._changed(); };

  GrassPlacementAPI.prototype.excludeCircle=function(x,z,radius){ return this.excludeArea({type:'circle',x:x,z:z,radius:radius}); };
  GrassPlacementAPI.prototype.excludeBox=function(x,z,width,depth,rotation){ return this.excludeArea({type:'box',x:x,z:z,width:width,depth:depth,rotation:rotation||0}); };
  GrassPlacementAPI.prototype.excludePolygon=function(points){ return this.excludeArea({type:'polygon',points:points}); };
  GrassPlacementAPI.prototype.excludeCorridor=function(points,width){ return this.excludeArea({type:'corridor',points:points,width:width}); };
  GrassPlacementAPI.prototype.excludeSegment=function(start,end,clearance){ return this.excludeArea({type:'segment',start:start,end:end,clearance:clearance}); };

  GrassPlacementAPI.prototype.allowSurface=function(name){ this.allowedSurfaces.add(String(name));return this._changed(); };
  GrassPlacementAPI.prototype.disallowSurface=function(name){ this.allowedSurfaces.delete(String(name));return this._changed(); };
  GrassPlacementAPI.prototype.excludeSurface=function(name){ this.excludedSurfaces.add(String(name));return this._changed(); };
  GrassPlacementAPI.prototype.includeSurface=function(name){ this.excludedSurfaces.delete(String(name));return this._changed(); };
  GrassPlacementAPI.prototype.setSurfaceResolver=function(fn){ this.surfaceResolver=typeof fn==='function'?fn:null;return this._changed(); };

  GrassPlacementAPI.prototype.isAllowed=function(x,z,context){
    x=+x;z=+z;if(!Number.isFinite(x)||!Number.isFinite(z)) return false;

    if(this.includes.length){
      var inAny=false;
      for(var i=0;i<this.includes.length;i++) if(contains(this.includes[i],x,z)){inAny=true;break;}
      if(!inAny) return false;
    }
    for(var j=0;j<this.excludes.length;j++) if(contains(this.excludes[j],x,z)) return false;

    var surface=context&&context.surface;
    if(surface==null && this.surfaceResolver){
      try{ surface=this.surfaceResolver(x,z,context||null); }catch(_){ surface=null; }
    }
    if(surface!=null){
      surface=String(surface);
      if(this.excludedSurfaces.has(surface)) return false;
      if(this.allowedSurfaces.size && !this.allowedSurfaces.has(surface)) return false;
    }else if(this.allowedSurfaces.size){
      return false;
    }
    return true;
  };

  GrassPlacementAPI.prototype.test=GrassPlacementAPI.prototype.isAllowed;
  GrassPlacementAPI.prototype.requestRebuild=function(){
    if(typeof root.rebuildWorld==='function') root.rebuildWorld(true);
    return this;
  };
  GrassPlacementAPI.prototype.snapshot=function(){
    return {
      revision:this.revision,
      includes:this.includes.slice(),
      excludes:this.excludes.slice(),
      allowedSurfaces:Array.from(this.allowedSurfaces),
      excludedSurfaces:Array.from(this.excludedSurfaces)
    };
  };

  root.GrassPlacementAPI=GrassPlacementAPI;
  if(!root.GrassAPI) root.GrassAPI=new GrassPlacementAPI();
})(typeof window!=='undefined'?window:globalThis);
