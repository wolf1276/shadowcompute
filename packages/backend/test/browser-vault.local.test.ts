import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import pino from 'pino';
import {WebSocket} from 'ws';
import {Transaction} from '@midnight-ntwrk/midnight-js-protocol/v9';
import {LedgerTransaction} from '@midnight-ntwrk/midnight-js-types';
import {ShieldedCoinPublicKey,ShieldedEncryptionPublicKey} from '@midnightntwrk/wallet-sdk';
import {startWallet,type MidnightWalletProvider} from '../src/wallet.js';
import {LOCAL_CONFIG} from '../src/config.js';
import {deployDemo,mintTestTokens,VaultClient} from '../src/client.js';
import {BrowserVault,encodeNote} from '../src/browser-vault.js';
import {privateState} from '../../contracts/contract/index.js';
import {waitForShieldedBalance} from '../src/coins.js';
import {Gateway,MockAdapter} from '../src/gateway.js';
import {chainReceipts} from '../src/receipt-source.js';
import {assertNotInPublicState} from '../../contracts/sim.js';
import {nextPosition} from '../../terminal/vault-store.js';
Object.assign(globalThis,{WebSocket});process.env.PRIVATE_STATE_PASSWORD??='Local-Only-ShadowCompute-Password';
it('approves real serialized wallet transactions, deposits, claims and withdraws with real proofs',async()=>{
 const config=LOCAL_CONFIG,env={...config,walletNetworkId:config.networkId},logger=pino({level:'warn'});
 const sponsor=await startWallet(logger,env,{network:'local',role:'ALICE',faucet:'',syncTimeoutMs:180000});let user:MidnightWalletProvider|undefined;
 try{
  user=await startWallet(logger,env,{network:'local',role:'BOB',faucet:'',syncTimeoutMs:180000});
  const admin=privateState(),deployment=await deployDemo(sponsor,config,admin,sponsor);
  await mintTestTokens(deployment,sponsor,10000n);await waitForShieldedBalance(sponsor,deployment.color,10000n);
  const owner=new VaultClient(sponsor,config,deployment.address,'browser-test-admin');await owner.fundReserve();
  const service=new BrowserVault(config,{address:deployment.address,tokenAddress:deployment.tokenAddress,color:deployment.color.hex});
  console.info('Browser vault: fresh contracts and funded reserve ready');
  const keys={shieldedCoinPublicKey:ShieldedCoinPublicKey.codec.encode('undeployed',ShieldedCoinPublicKey.fromHexString(user.getCoinPublicKey())).asString(),shieldedEncryptionPublicKey:ShieldedEncryptionPublicKey.codec.encode('undeployed',ShieldedEncryptionPublicKey.fromHexString(user.getEncryptionPublicKey())).asString()};
  let approvals=0;const transactions:string[]=[];
  async function run(action:string,payload:Record<string,unknown>,decline=false){
   console.info(`Browser vault: ${action}${decline?' (decline check)':''}`);
   const {id}=service.start({action,keys,...payload}),handled=new Set<string>();const deadline=Date.now()+300000;
   while(Date.now()<deadline){const job=service.poll(id);if(job.status==='done'){transactions.push((job.result as {txId:string}).txId);return job.result as any;}if(job.status==='failed'){if(decline){expect(job.submissionAttempted).toBe(false);return;}throw new Error(job.error);}
    if(job.request&&!handled.has(job.request.id)){
     handled.add(job.request.id);
     if(decline){service.reply(id,job.request.id,null,true);continue;}
     if(job.request.method==='balanceUnsealedTransaction'){approvals++;const tx=await user!.balanceTx(LedgerTransaction.fromBytes('v9','Unbound',Buffer.from(job.request.tx,'hex')));service.reply(id,job.request.id,{tx:Buffer.from(tx instanceof Uint8Array?tx:tx.serialize()).toString('hex')},false);}
     else{await user!.submitTx(Transaction.deserialize('signature','proof','binding',Buffer.from(job.request.tx,'hex')));service.reply(id,job.request.id,null,false);}
    }
    await new Promise(r=>setTimeout(r,100));
   }throw new Error('Browser bridge integration timed out');
  }
  await run('mint',{nonce:'cd'.repeat(32)});await waitForShieldedBalance(user,deployment.color,1000000n);
  const note=privateState();await run('deposit',{note:encodeNote(note)});expect((await service.reconcile(encodeNote(note))).exists).toBe(true);
  await owner.advanceSimulation(admin,3153601n);
  const state=await service.status(),next=nextPosition(encodeNote(note),state);
  const claimed=await run('claim',{note:encodeNote(note),next});expect(claimed.next).toEqual(next);expect((await service.reconcile(encodeNote(note))).spent).toBe(true);
  assertNotInPublicState(await owner.read(),{ownerSecret:note.secret,salt:note.salt,creditSecret:note.creditSecret});
  const paid=service.startRedemption({secret:claimed.credit.secret,bearer:'ef'.repeat(32)});let receipt:any;
  const redemptionDeadline=Date.now()+300000;
  while(Date.now()<redemptionDeadline){const job=service.poll(paid.id);if(job.status==='done'){receipt=job.result;break;}if(job.status==='failed')throw new Error(job.error);await new Promise(r=>setTimeout(r,500));}
  expect(receipt).toBeDefined();
  const gateway=new Gateway(chainReceipts(deployment.address,config.indexer,config.indexerWS,config.node),new MockAdapter(),':memory:');
  try{const request={prompt:'Explain private witnesses briefly.',redemption:receipt.redemption};expect((await gateway.infer(request)).response).toContain('OFFLINE MOCK');expect((await gateway.infer(request)).cached).toBe(true);}finally{gateway.close();}
  const replay=service.startRedemption({secret:claimed.credit.secret,bearer:'ef'.repeat(32)});
  for(let i=0;i<100;i++){if(service.poll(replay.id).status==='done')break;await new Promise(r=>setTimeout(r,100));}
  expect((service.poll(replay.id).result as any).redemption).toEqual(receipt.redemption);
  await run('withdraw',{note:claimed.next});await waitForShieldedBalance(user,deployment.color,1000000n);expect((await service.status()).reserve).toBe('0');
  const fresh=privateState({checkpoint:3153601n});await run('deposit',{note:encodeNote(fresh)},true);expect((await service.reconcile(encodeNote(fresh))).exists).toBe(false);
  expect(approvals).toBe(4);
  writeFileSync('artifacts/browser-vault-local.json',JSON.stringify({network:'local',vault:deployment.address,transactions,walletApprovals:approvals,walletHarness:'Real SDK wallet with automated connector-style balance/submit approval; not a browser extension approval',principalReturned:true,claimProved:true,withdrawalProved:true,redemptionTx:receipt.txId,redemptionProved:true,gateway:'OFFLINE MOCK with actual finalized receipt',cachedRetry:true,receiptReplayDidNotPayAgain:true,publicSecretInspectionPassed:true,declinedApprovalDidNotSubmit:true,at:new Date().toISOString()},null,2));
 }finally{await user?.stop();await sponsor.stop();}
});
