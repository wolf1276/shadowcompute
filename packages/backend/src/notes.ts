import { mkdirSync,writeFileSync,renameSync,readFileSync } from 'node:fs';
import { dirname } from 'node:path';
// Normalize before JSON.stringify: wallet dependencies may install BigInt.prototype.toJSON.
function encode(value:unknown):unknown {
 if(typeof value==='bigint')return {$bigint:value.toString()};
 if(value instanceof Uint8Array)return {$bytes:Buffer.from(value).toString('hex')};
 if(Array.isArray(value))return value.map(encode);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
 return value;
}
// Only explicit client-side use: the inference server never imports or stores position notes.
export function savePrivate(path:string,value:unknown){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 writeFileSync(`${path}.tmp`,JSON.stringify(encode(value),null,2),{mode:0o600});renameSync(`${path}.tmp`,path);
}
export function loadPrivate(path:string):unknown{
 return JSON.parse(readFileSync(path,'utf8'),(_k,v)=>{
  if(v&&typeof v==='object'&&Object.keys(v).length===1){if('$bigint'in v)return BigInt(v.$bigint);if('$bytes'in v)return new Uint8Array(Buffer.from(v.$bytes,'hex'));}return v;
 });
}
