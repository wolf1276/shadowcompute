import {it,expect} from 'vitest';
import {openVaultStore,newPosition,nextPosition,earnedYield,acquireVaultLock} from '../../terminal/vault-store.js';
const storage=()=>{const map=new Map<string,string>();return {map,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};};
it('encrypts private notes and pending journals, rejects wrong passwords and restores scoped backups',async()=>{
 const disk=storage(),password='My long vault password 9!',scope='preview:vault:wallet';
 const opened=await openVaultStore(disk,password,scope),note=newPosition('0');
 await opened.save({positions:[{note,status:'active'}],credits:[],history:[],pending:{action:'withdraw',note}});
 const backup=opened.backup();opened.close();await expect(opened.save({positions:[],credits:[],history:[]})).rejects.toThrow('locked');expect(opened.backup()).toBe(backup);expect(backup).not.toContain(note.secret);expect(backup).not.toContain('withdraw');
 await expect(openVaultStore(disk,'Wrong long password 9!',scope)).rejects.toThrow('Wrong password');expect(opened.backup()).toBe(backup);
 const again=await openVaultStore(disk,password,scope);expect(again.data.pending.note.secret).toBe(note.secret);
 const restored=await openVaultStore(storage(),password,scope,backup);expect(restored.data.positions[0].note).toEqual(note);
 await expect(openVaultStore(storage(),password,'preview:vault:another-wallet',backup)).rejects.toThrow('Wrong password');
});
it('uses the on-chain simulated checkpoint and preserves fractional carry across a claim',()=>{
 const note=newPosition('0'),config={lotSize:'1000000',apyBps:'1000',rewardUnit:'10000',simulatedSeconds:'3153601'};
 const earned=earnedYield(note,config);expect(earned).toBe(3153601000000000n);
 const next=nextPosition(note,config);expect(next.salt).toBe(note.nextSalt);expect(next.secret).toBe(note.secret);expect(next.carry).toBe('1000000000');expect(next.checkpoint).toBe('3153601');
 expect(next.nextSalt).not.toBe(note.nextSalt);expect(next.creditSecret).not.toBe(note.creditSecret);
});

it('prevents a second tab from writing the same private vault until the first releases it',async()=>{
 const held=new Set<string>();
 const locks={async request(name:string,_options:unknown,callback:(lock:unknown)=>Promise<unknown>|void){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
 const release=await acquireVaultLock(locks,'same-account');
 await expect(acquireVaultLock(locks,'same-account')).rejects.toThrow('another tab');
 const other=await acquireVaultLock(locks,'different-account');other();release();await new Promise(r=>setTimeout(r,0));
 const again=await acquireVaultLock(locks,'same-account');again();
});

it('refuses overlapping saves and snapshots caller data before encryption',async()=>{
 const disk=storage(),store=await openVaultStore(disk,'My long vault password 9!','preview:vault:wallet');
 const first={positions:[],credits:[],history:[{action:'deposit'}],pending:null};
 const saving=store.save(first);first.history[0].action='mutated';
 await expect(store.save({positions:[],credits:[],history:[],pending:null})).rejects.toThrow('being saved');
 await saving;expect(store.data.history[0].action).toBe('deposit');
 const reopened=await openVaultStore(disk,'My long vault password 9!','preview:vault:wallet');
 expect(reopened.data).toEqual(store.data);
});
it('refuses a stale backup that would overwrite newer private notes',async()=>{
 const store=await openVaultStore(storage(),'My long vault password 9!','preview:vault:wallet');
 await store.save({positions:[],credits:[],history:[],pending:null});const old=store.backup();
 const note=newPosition('0');await store.save({positions:[{note,status:'active'}],credits:[],history:[],pending:null});
 const latest=store.backup();await expect(store.import(old)).rejects.toThrow('must not be overwritten');
 expect(store.backup()).toBe(latest);expect(store.data.positions[0].note.secret).toBe(note.secret);
});
