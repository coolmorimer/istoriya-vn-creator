// Deterministic solid-colour test fixtures and screenshot sampling, not game art.
import {deflateSync,inflateSync} from 'node:zlib';
function crc32(data) {
 let crc=0xffffffff;
 for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 return (crc^0xffffffff)>>>0;
}
function chunk(name,data) {
 const type=Buffer.from(name),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
 length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([type,data])));
 return Buffer.concat([length,type,data,checksum]);
}
export function solidPng(width,height,rgba) {
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc((width*4+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const colour=typeof rgba==='function'?rgba(x,y):rgba;for(let c=0;c<4;c++)rows[y*(width*4+1)+1+x*4+c]=colour[c]??255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function pngPixels(png) {
 let offset=8,width,height,channels;const parts=[];
 while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);offset+=length+12;
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=({2:3,6:4})[data[9]];if(data[8]!==8||!channels||data[12]!==0)throw Error('QA PNG decoder expects non-interlaced 8-bit RGB/RGBA.');}
  if(type==='IDAT')parts.push(data);
 }
 const raw=inflateSync(Buffer.concat(parts)),stride=width*channels,pixels=Buffer.alloc(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unsupported PNG filter');for(let x=0;x<stride;x++){
  const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,diagonal=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
  pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+[0,left,up,Math.floor((left+up)/2),paeth(left,up,diagonal)][filter])&255;
 }}
 return {width,height,pixel:(x,y)=>[...pixels.subarray((Math.floor(y)*width+Math.floor(x))*channels,(Math.floor(y)*width+Math.floor(x))*channels+3)]};
}
