import {ASSET_FIELDS} from '../../runtime/asset-fields.mjs';

export function windowsFilePath(source) {
 const url=new URL(source);if(url.protocol!=='file:'||url.search||url.hash)throw Error('Некорректная ссылка на файл.');
 let pathname=decodeURIComponent(url.pathname);
 if(url.hostname&&url.hostname!=='localhost')return `\\\\${url.hostname}${pathname.replaceAll('/','\\')}`;
 if(/^\/[a-z]:\//i.test(pathname))pathname=pathname.slice(1);
 return pathname.replaceAll('/','\\');
}
// Transport URLs live only in renderer memory. Preserve authored text verbatim.
export function createNativeMedia(convertFileSrc) {
 const originals=new Map(),converted=new Map();
 const visit=(value,transform,field='')=>{
  if(Array.isArray(value))return value.map(v=>visit(v,transform));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,transform,k)]));
  return ASSET_FIELDS.has(field)&&typeof value==='string'?transform(value):value;
 };
 const toRenderer=source=>{
  if(!source.startsWith('file:'))return source;
  if(converted.has(source))return converted.get(source);
  try{const url=convertFileSrc(windowsFilePath(source));originals.set(url,source);converted.set(source,url);return url;}catch{return source;}
 };
 return {toRenderer:value=>visit(value,toRenderer),toNative:value=>visit(value,source=>originals.get(source)??source)};
}
export async function auditNativeMedia(call,media,rows){
 const native=rows.map(row=>media.toNative({source:row.source})),result=await call('audit-media',native);
 if(!Array.isArray(result)||result.length!==rows.length||result.some((row,i)=>row.source!==native[i].source))throw Error('Ответ проверки файлов не совпадает с запросом. Повторите проверку.');
 return result.map((row,i)=>({...row,source:rows[i].source}));
}
