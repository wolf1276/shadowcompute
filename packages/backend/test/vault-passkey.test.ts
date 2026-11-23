import {it,expect} from 'vitest';
import type {WebAuthnClient} from '@category-labs/mera';
import {openVaultStore,openVaultWithPasskey,newPosition,vaultStoreName,vaultUnlockHint} from '../../terminal/vault-store.js';
import {passkeyError} from '../../terminal/vault-passkey.js';
const password='Recovery password for vault 9!',scope='preview:vault:wallet';
const disk=()=>{const map=new Map<string,string>();return {getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};};
function authenticator(){
 const id=new Uint8Array([1,2,3,4]);let creates=0,assertions=0;
 const prf=async(salt:Uint8Array)=>new Uint8Array(await crypto.subtle.digest('SHA-256',salt as Uint8Array<ArrayBuffer>));
 const client:WebAuthnClient={
  async createCredential(request){creates++;expect(request.rp.id).toBe('localhost');expect(request.userVerification).toBe('required');return {credentialId:id,prfEnabled:true,prfOutput:await prf(request.prfSalt)};},
  async getCredential(request){assertions++;expect(request.rpId).toBe('localhost');expect(request.userVerification).toBe('required');expect(request.allowCredential?.credentialId).toEqual(id);return {credentialId:id,prfOutput:await prf(request.prfSalt)};},
 };
 return {client,get creates(){return creates;},get assertions(){return assertions;}};
}
it('enrolls real Mera encryption over existing notes and unlocks the same scoped vault',async()=>{
 const storage=disk(),auth=authenticator(),store=await openVaultStore(storage,password,scope),note=newPosition('0');
 const state={positions:[{note,status:'active'}],credits:[],history:[],pending:{action:'deposit',note}};
 await store.save(state);await store.enablePasskey({rpId:'localhost',webAuthnClient:auth.client});
 expect(await vaultUnlockHint(storage,scope,null,'localhost')).toEqual({exists:true,hasPasskey:true});expect(await vaultUnlockHint(storage,scope,null,'other.example')).toEqual({exists:true,hasPasskey:false});
 expect(store.data).toEqual(state);expect(store.hasPasskey).toBe(true);expect(auth.creates).toBe(1);
 const backup=store.backup();expect(backup).not.toContain(password);expect(backup).not.toContain(note.secret);store.close();
 const unlocked=await openVaultWithPasskey(storage,scope,{rpId:'localhost',webAuthnClient:auth.client});
 expect(unlocked.data).toEqual(state);expect(auth.assertions).toBe(1);
 await unlocked.save({...state,history:[{action:'confirmed'}]});expect(JSON.parse(unlocked.backup()).passkey).toBeDefined();
 const fallback=await openVaultStore(storage,password,scope);expect(fallback.data.history).toHaveLength(1);
 const recovered=await openVaultWithPasskey(disk(),scope,{rpId:'localhost',webAuthnClient:auth.client},backup);expect(recovered.data).toEqual(state);
 const passwordRecovery=await openVaultStore(disk(),password,scope,backup);expect(passwordRecovery.hasPasskey).toBe(true);
});
it('preserves password recovery when registration is cancelled or PRF is unsupported',async()=>{
 for(const result of ['cancel','no-prf']){
  const storage=disk(),store=await openVaultStore(storage,password,scope);await store.save({positions:[],credits:[],history:[],pending:null});const before=store.backup();
  const client:WebAuthnClient={async createCredential(){if(result==='cancel')throw new Error('cancelled');return {credentialId:new Uint8Array([1]),prfEnabled:false};},async getCredential(){throw new Error('unexpected');}};
  await expect(store.enablePasskey({rpId:'localhost',webAuthnClient:client})).rejects.toThrow();expect(store.backup()).toBe(before);expect(store.hasPasskey).toBe(false);
  expect((await openVaultStore(storage,password,scope)).data.positions).toEqual([]);
 }
 expect(passkeyError({code:'PRF_UNAVAILABLE'})).toContain('recovery password');
 expect(passkeyError({code:'PASSKEY_OPERATION_FAILED'})).toContain('cancelled');
});
it('rejects hostname and encrypted scope mismatches without rewriting the notes',async()=>{
 const storage=disk(),auth=authenticator(),store=await openVaultStore(storage,password,scope);await store.save({positions:[],credits:[],history:[],pending:null});await store.enablePasskey({rpId:'localhost',webAuthnClient:auth.client});const backup=store.backup();
 await expect(openVaultWithPasskey(storage,scope,{rpId:'other.example',webAuthnClient:auth.client})).rejects.toThrow('hostname');expect(auth.assertions).toBe(0);
 await expect(openVaultWithPasskey(disk(),'preview:vault:other-wallet',{rpId:'localhost',webAuthnClient:auth.client},backup)).rejects.toThrow('does not match');
 expect(store.backup()).toBe(backup);
});
it('rejects tampered passkey ciphertext while the recovery password still opens notes',async()=>{
 const storage=disk(),auth=authenticator(),store=await openVaultStore(storage,password,scope);await store.save({positions:[],credits:[],history:[],pending:null});await store.enablePasskey({rpId:'localhost',webAuthnClient:auth.client});
 const record=JSON.parse(store.backup());record.passkey.vault.ciphertext=(record.passkey.vault.ciphertext[0]==='A'?'B':'A')+record.passkey.vault.ciphertext.slice(1);storage.setItem(await vaultStoreName(scope),JSON.stringify(record));
 await expect(openVaultWithPasskey(storage,scope,{rpId:'localhost',webAuthnClient:auth.client})).rejects.toThrow();expect((await openVaultStore(storage,password,scope)).data.positions).toEqual([]);
 record.passkey={bad:true};storage.setItem(await vaultStoreName(scope),JSON.stringify(record));const recovered=await openVaultStore(storage,password,scope);expect(recovered.passkeyRecoveryNeeded).toBe(true);expect(recovered.hasPasskey).toBe(false);
});
it('does not save a passkey when the store closes during enrollment',async()=>{
 const storage=disk(),auth=authenticator(),store=await openVaultStore(storage,password,scope);await store.save({positions:[],credits:[],history:[],pending:null});const before=store.backup();
 let proceed!:()=>void;const waiting=new Promise<void>(resolve=>{proceed=resolve;});
 const client:WebAuthnClient={...auth.client,async createCredential(request){await waiting;return auth.client.createCredential(request);}};
 const enrolling=store.enablePasskey({rpId:'localhost',webAuthnClient:client});
 await expect(store.save(store.data)).rejects.toThrow('being saved');store.close();proceed();await expect(enrolling).rejects.toThrow('locked');expect(store.backup()).toBe(before);
});
it('leaves the original encrypted vault intact if saving enrollment fails',async()=>{
 const backing=disk();let full=false;
 const storage={getItem:backing.getItem,setItem(key:string,value:string){if(full)throw new Error('Storage full');backing.setItem(key,value);}};
 const store=await openVaultStore(storage,password,scope),note=newPosition('0');await store.save({positions:[{note,status:'active'}],credits:[],history:[],pending:null});const before=store.backup();full=true;
 await expect(store.enablePasskey({rpId:'localhost',webAuthnClient:authenticator().client})).rejects.toThrow('Storage full');expect(store.hasPasskey).toBe(false);expect(store.backup()).toBe(before);full=false;
 expect((await openVaultStore(storage,password,scope)).data.positions[0].note.secret).toBe(note.secret);
});
