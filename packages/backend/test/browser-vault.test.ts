import {it,expect} from 'vitest';
import {MidnightBech32m,ShieldedCoinPublicKey,ShieldedEncryptionPublicKey} from '@midnightntwrk/wallet-sdk';
import {walletKeys,parseNote,encodeNote,BrowserVault} from '../src/browser-vault.js';
import {privateState} from '../../contracts/contract/index.js';
import {LOCAL_CONFIG} from '../src/config.js';
it('roundtrips constrained private openings and rejects malformed or overflowing notes',()=>{
 const note=privateState();expect(parseNote(encodeNote(note))).toEqual(note);
 expect(()=>parseNote({...encodeNote(note),secret:'bad'})).toThrow('Invalid private note');
 expect(()=>parseNote({...encodeNote(note),carry:(1n<<128n).toString()})).toThrow('overflow');
});
it('decodes shielded wallet keys for the selected network only',()=>{
 const coin=ShieldedCoinPublicKey.fromHexString('aa'.repeat(32)),encryption=ShieldedEncryptionPublicKey.fromHexString('bb'.repeat(32));
 const keys={shieldedCoinPublicKey:ShieldedCoinPublicKey.codec.encode('preview',coin).asString(),shieldedEncryptionPublicKey:ShieldedEncryptionPublicKey.codec.encode('preview',encryption).asString()};
 expect(walletKeys(keys,'preview')).toEqual({coin:'aa'.repeat(32),encryption:'bb'.repeat(32)});expect(()=>walletKeys(keys,'undeployed')).toThrow('selected network');
 expect(()=>walletKeys({shieldedCoinPublicKey:'aa'.repeat(32),shieldedEncryptionPublicKey:'bb'.repeat(32)},'preview')).toThrow();
});
it('does not expose a job by an invalid identifier or accept stale wallet responses',()=>{
 const service=new BrowserVault(LOCAL_CONFIG,{address:'aa'.repeat(32),tokenAddress:'bb'.repeat(32),color:'cc'.repeat(32)});
 expect(()=>service.poll('unknown')).toThrow('Unknown');expect(()=>service.reply('unknown','request',null,false)).toThrow('no longer pending');
 expect(()=>service.start({action:'sweep'})).toThrow('Invalid vault action');
});

it('accepts exactly one matching wallet reply and rejects stale request IDs',()=>{
 const service=new BrowserVault(LOCAL_CONFIG,{address:'aa'.repeat(32),tokenAddress:'bb'.repeat(32),color:'cc'.repeat(32)});let replies=0;
 service.jobs.set('operation',{id:'operation',status:'working',request:{id:'request',method:'submitTransaction',tx:'aa'},reply:()=>{replies++;}});
 expect(()=>service.reply('operation','other',null,false)).toThrow('no longer pending');expect(replies).toBe(0);
 service.reply('operation','request',null,false);expect(replies).toBe(1);expect(()=>service.reply('operation','request',null,false)).toThrow('no longer pending');
});
it('reports wallet and confirmation stages from actual bridge requests',async()=>{
 const service=new BrowserVault(LOCAL_CONFIG,{address:'aa'.repeat(32),tokenAddress:'bb'.repeat(32),color:'cc'.repeat(32)});
 const job={id:'progress-job',status:'working' as const,stage:'preparing-proof',startedAt:Date.now()};service.jobs.set(job.id,job);
 const bridge=service as unknown as {request(operation:typeof job,method:string,tx:string):Promise<unknown>};
 const balanced=bridge.request(job,'balanceUnsealedTransaction','aa');expect(service.poll(job.id).stage).toBe('wallet-approval');let request=service.poll(job.id).request!;
 service.reply(job.id,request.id,{tx:'bb'},false);await balanced;expect(service.poll(job.id).stage).toBe('preparing-submission');
 const submitted=bridge.request(job,'submitTransaction','bb');expect(service.poll(job.id).stage).toBe('submitting');request=service.poll(job.id).request!;
 service.reply(job.id,request.id,null,false);await submitted;expect(service.poll(job.id)).toMatchObject({stage:'confirming',status:'working',startedAt:job.startedAt});
});
