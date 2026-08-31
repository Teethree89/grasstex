/* Minimal PNG writer (RGB8 / RGBA8). No dependencies. */
const zlib=require('zlib');
const T=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=-1;for(let i=0;i<b.length;i++)c=T[(c^b[i])&255]^(c>>>8);return(c^-1)>>>0;}
function chunk(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type,'ascii'),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);}
function png(w,h,px,ch){
  ch=ch||3;const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=ch===4?6:2;
  const stride=w*ch,raw=Buffer.alloc((stride+1)*h);
  for(let y=0;y<h;y++){raw[y*(stride+1)]=0;Buffer.from(px.buffer,px.byteOffset+y*stride,stride).copy(raw,y*(stride+1)+1);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={png};
