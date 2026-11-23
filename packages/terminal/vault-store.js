import {enrollVaultPasskey,unlockVaultPasskey,parseVaultPasskey} from './vault-passkey.js';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const b64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const randomSecret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const newPosition=checkpoint=>({secret:randomSecret(),salt:randomSecret(),nextSalt:randomSecret(),creditSecret:randomSecret(),checkpoint:String(checkpoint),carry:'0'});
export function nextPosition(note,config){const elapsed=BigInt(config.simulatedSeconds)-BigInt(note.checkpoint);return {...note,salt:note.nextSalt,nextSalt:randomSecret(),creditSecret:randomSecret(),checkpoint:config.simulatedSeconds,carry:String(BigInt(note.carry)+BigInt(config.lotSize)*BigInt(config.apyBps)*elapsed-BigInt(config.rewardUnit)*31536000n*10000n)};}
export function earnedYield(note,config){return BigInt(note.carry)+BigInt(config.lotSize)*BigInt(config.apyBps)*(BigInt(config.simulatedSeconds)-BigInt(note.checkpoint));}
export async function vaultStoreName(scope){return 'shadowcompute-vault-v1:'+hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(scope))));}
export async function vaultUnlockHint(storage,scope,backup,rpId){
 const saved=backup??storage.getItem(await vaultStoreName(scope));
 if(!saved)return {exists:false,hasPasskey:false};
 try{const record=JSON.parse(saved);if(record.passkey)parseVaultPasskey(record.passkey,rpId);return {exists:true,hasPasskey:!!record.passkey};}
 catch{return {exists:true,hasPasskey:false};}
}
export async function openVaultWithPasskey(storage,scope,options,backup){
 const saved=backup??storage.getItem(await vaultStoreName(scope));
 if(!saved)throw new Error('No saved passkey vault. Unlock with your recovery password and enable a passkey first.');
 const record=JSON.parse(saved);if(!record.passkey)throw new Error('No passkey is enabled for this vault. Use your recovery password.');
 let password=await unlockVaultPasskey(record.passkey,scope,options);
 try{return await openVaultStore(storage,password,scope,backup);}finally{password='';}
}
export async function openVaultStore(storage,password,scope,backup){
 if(typeof password!=='string'||password.length<16)throw new Error('Use a vault password with at least 16 characters.');
 const name=await vaultStoreName(scope);
 const existing=storage.getItem(name);if(existing&&backup)throw new Error('A vault already exists here. Back it up before replacing it.');
 const restored=backup?JSON.parse(backup):null;
 const record=existing?JSON.parse(existing):restored??{version:1,salt:b64(crypto.getRandomValues(new Uint8Array(16)))};
 if(record.version!==1||typeof record.salt!=='string')throw new Error('Unsupported vault backup');
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(record.salt),iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const decrypt=async r=>{try{if(r.version!==1||r.salt!==record.salt)throw new Error();const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(r.iv),additionalData:encoder.encode(scope)},key,bytes(r.ciphertext));const data=JSON.parse(new TextDecoder().decode(plain));if(!Array.isArray(data.positions)||!Array.isArray(data.credits)||!Array.isArray(data.history))throw new Error();return data;}catch{throw new Error('Wrong password, wallet, network or damaged vault backup.');}};
 let closed=false,writing=false,enrolling=false,passkeyRecoveryNeeded=false;
 let data=existing||restored?await decrypt(record):{positions:[],credits:[],history:[],pending:null};
 const write=async next=>{if(closed)throw new Error('Vault is locked');if(writing||enrolling)throw new Error('Private notes are being saved. Try again after the current action.');const snapshot=structuredClone(next);writing=true;try{const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(scope)},key,encoder.encode(JSON.stringify(snapshot)));const out={version:1,salt:record.salt,iv:b64(iv),ciphertext:b64(new Uint8Array(encrypted)),...(record.passkey?{passkey:record.passkey}:{})};if(closed)throw new Error('Vault is locked');storage.setItem(name,JSON.stringify(out));data=snapshot;}finally{writing=false;}};
 if(record.passkey){try{record.passkey=parseVaultPasskey(record.passkey);}catch{delete record.passkey;passkeyRecoveryNeeded=true;}}
 if(restored)await write(data);
 async function enablePasskey(options){
  if(closed)throw new Error('Vault is locked');
  if(record.passkey)throw new Error('A passkey is already enabled for this vault.');
  if(writing||enrolling)throw new Error('Private notes are being saved. Try again after the current action.');
  enrolling=true;
  try{
   const wrapper=await enrollVaultPasskey(password,scope,options);
   if(closed)throw new Error('Vault is locked');
   record.passkey=wrapper;enrolling=false;
   try{await write(data);passkeyRecoveryNeeded=false;}catch(error){delete record.passkey;throw error;}
  }finally{enrolling=false;}
 }
 async function importBackup(input){
  if(closed)throw new Error('Vault is locked');
  if(writing||enrolling)throw new Error('Private notes are being saved. Try again after the current action.');
  if(data.positions.length||data.credits.length||data.history.length||data.pending||data.inferences?.length)throw new Error('Restore into an empty vault in a separate browser profile. Existing notes must not be overwritten by an older backup.');
  if(typeof input!=='string'||input.length>2_000_000)throw new Error('Backup is too large');
  const r=JSON.parse(input);if(r.salt!==record.salt)throw new Error('Import this backup before creating a new vault in this browser.');
  const restored=await decrypt(r),previous=record.passkey;
  record.passkey=r.passkey?parseVaultPasskey(r.passkey):undefined;
  try{await write(restored);}catch(error){record.passkey=previous;throw error;}
  return restored;
 }
 return {
  get data(){return data;},get hasPasskey(){return !!record.passkey;},get passkeyRecoveryNeeded(){return passkeyRecoveryNeeded;},enablePasskey,
  close:()=>{closed=true;password='';},save:write,backup:()=>storage.getItem(name),import:importBackup,
 };
}

export async function acquireVaultLock(locks,scope){
 if(!locks?.request)throw new Error('Use a browser with Web Locks support to protect private notes across tabs.');
 let release;
 const acquired=new Promise((resolve,reject)=>{
  const held=new Promise(done=>{release=done;});
  locks.request('shadowcompute:'+scope,{ifAvailable:true},lock=>{if(!lock){reject(new Error('This vault is open in another tab. Lock or close it there, then try again.'));return;}resolve();return held;}).catch(reject);
 });
 await acquired;return release;
}
