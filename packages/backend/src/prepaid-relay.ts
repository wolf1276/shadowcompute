import {relayJournalDirectory} from './prepaid-deployment.js';
import {existsSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import pino from 'pino';
import type {Hex} from 'viem';
import {CreditTreasury,type TreasuryConfig} from './credit-treasury.js';
import {loadPrivate,savePrivate} from './notes.js';
import {PrepaidClient} from './prepaid-client.js';
import {prepaidNote,ledger as decode} from '../../contracts/contract/prepaid.js';
import {getConfig,type NetworkConfig} from './config.js';
import {startWallet} from './wallet.js';
import {indexerPublicDataProvider} from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {ledgerState} from './providers.js';
export type PrepaidManifest={kind:'prepaid';network:'local'|'preview';address:string;source:TreasuryConfig};
export async function finalizedPrepaid(address:string,config:NetworkConfig){
 const response=await fetch(config.node,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'chain_getFinalizedHead',params:[]}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Midnight finality unavailable');const data=await response.json() as {result?:string};if(!data.result||!/^0x[0-9a-f]{64}$/.test(data.result))throw new Error('Invalid Midnight finalized block');
 const reader=indexerPublicDataProvider(config.indexer,config.indexerWS);return decode(ledgerState(await reader.queryContractState(address,{type:'blockHash',blockHash:data.result.slice(2)})));
}
export class PrepaidRelay {
 readonly source:CreditTreasury;busy=false;
 constructor(readonly manifest:PrepaidManifest,readonly config:NetworkConfig=getConfig(),readonly journalDirectory=relayJournalDirectory(manifest.network,manifest.address)){
  if(!['local','preview'].includes(manifest.network)||!['undeployed','preview'].includes(config.networkId)||manifest.network!==(config.networkId==='undeployed'?'local':'preview')||!/^([a-f0-9]{64})$/.test(manifest.address)||manifest.source.bridge.toLowerCase()!=='0x'+manifest.address)throw new Error('Invalid prepaid bridge manifest');
  this.source=new CreditTreasury(manifest.source);mkdirSync(journalDirectory,{recursive:true,mode:0o700});
 }
 enqueueSpend(id:Hex){
  if(!/^0x[0-9a-f]{64}$/i.test(id))throw new Error('Invalid settlement ID');
  const file=join(this.journalDirectory,`queue-${id.slice(2)}.json`);if(!existsSync(file))savePrivate(file,{id,status:'queued'});
 }
 async drain(){
  if(this.busy)return;
  const ledger=await this.read();let discovered=0;
  // shortcut: scan finalized receipts for this testnet demo; use an event indexer at production scale.
  for(const [key] of ledger.receipts){const id=`0x${Buffer.from(key).toString('hex')}` as Hex;const file=join(this.journalDirectory,`queue-${id.slice(2)}.json`);if(!existsSync(file)){this.enqueueSpend(id);if(++discovered>=25)break;}}
  for(const name of readdirSync(this.journalDirectory).filter(name=>/^queue-[0-9a-f]{64}\.json$/.test(name)).slice(-100)){
   const file=join(this.journalDirectory,name),entry=loadPrivate(file) as {id:Hex;status:string};if(entry.status==='confirmed')continue;
   try{await this.settle('SPEND',entry.id);savePrivate(file,{...entry,status:'confirmed'});}catch{savePrivate(file,{...entry,status:'queued',lastAttempt:new Date().toISOString(),message:'Settlement pending or needs journal reconciliation'});}
   break;
  }
 }
 async read(){return finalizedPrepaid(this.manifest.address,this.config);}
 private async exclusive<T>(run:()=>Promise<T>){if(this.busy)throw new Error('Bridge relay busy; preserve the same operation and retry later');this.busy=true;try{return await run();}finally{this.busy=false;}}
 async authorize(sourceTx:Hex,expectedCommitment?:Hex){return this.exclusive(async()=>{
  const deposit=await this.source.deposit(sourceTx),id=Buffer.from(deposit.depositId.slice(2),'hex'),commitment=Buffer.from(deposit.ownerCommitment.slice(2),'hex');
  if(expectedCommitment&&deposit.ownerCommitment.toLowerCase()!==expectedCommitment.toLowerCase())throw new Error('Payment commitment does not match the requested private credit note');
  const state=await this.read();if(state.sourceChain!==BigInt(this.manifest.source.chainId)||Buffer.from(state.treasury).toString('hex')!==this.manifest.source.address.slice(2).toLowerCase()||Buffer.from(state.asset).toString('hex')!==this.manifest.source.asset.slice(2).toLowerCase()||state.creditPrice!==BigInt(this.manifest.source.creditPrice))throw new Error('Midnight/source binding mismatch');
  const journal=join(this.journalDirectory,`deposit-${deposit.depositId.slice(2)}.json`);
  if(state.authorizedDeposits.member(id))return {depositId:deposit.depositId,commitment:deposit.ownerCommitment,credits:deposit.credits.toString(),confirmed:true};
  if(existsSync(journal)){const previous=loadPrivate(journal) as {status:string};if(previous.status==='confirmed'){const end=Date.now()+30000;while(Date.now()<end){const confirmed=await this.read();if(confirmed.authorizedDeposits.member(id))return {depositId:deposit.depositId,commitment:deposit.ownerCommitment,credits:deposit.credits.toString(),confirmed:true};await new Promise(resolve=>setTimeout(resolve,1000));}}throw new Error('Approval pending or uncertain; reconcile before retrying');}
  const issuerFile=process.env.PREPAID_ISSUER_FILE??(this.manifest.network==='preview'?'.private-states/prepaid-issuer.preview.json':'.private-states/prepaid-issuer.json');const issuer=loadPrivate(issuerFile) as {secret:Uint8Array};if(!(issuer.secret instanceof Uint8Array)||issuer.secret.length!==32)throw new Error('Bridge issuer is not configured');
  const wallet=await startWallet(pino({level:'warn'}),{...this.config,walletNetworkId:this.config.networkId},{network:this.manifest.network,role:'ALICE',faucet:this.config.faucet,syncTimeoutMs:900000});
  const client=new PrepaidClient(wallet,this.config,this.manifest.address,`approve-${deposit.depositId.slice(2)}`);
  try{savePrivate(journal,{status:'pending',depositId:deposit.depositId,sourceTx,blockHash:deposit.blockHash,commitment:deposit.ownerCommitment,credits:deposit.credits});const result=await client.call('authorizeDeposit',[id,commitment,deposit.credits],prepaidNote({issuerSecret:issuer.secret}));savePrivate(journal,{status:'confirmed',sourceTx,depositId:deposit.depositId,txId:result.public.txId});return {depositId:deposit.depositId,commitment:deposit.ownerCommitment,credits:deposit.credits.toString(),confirmed:true,txId:result.public.txId};}
  finally{await client.close();await wallet.stop();}
 });}
 async settle(kind:'SPEND'|'REFUND',id:Hex){return this.exclusive(async()=>{
  if(!/^0x[0-9a-f]{64}$/i.test(id))throw new Error('Invalid settlement identifier');
  const state=await this.read(),key=Buffer.from(id.slice(2),'hex');
  if(kind==='SPEND'?!state.receipts.member(key):!state.refunds.member(key))throw new Error('No finalized Midnight settlement');
  const refund=kind==='REFUND'?state.refunds.lookup(key):undefined;
  const journal=join(this.journalDirectory,`${kind.toLowerCase()}-${id.slice(2)}.json`);
  if(await this.source.messageProcessed(kind,id))return {confirmed:true,id,sourceTx:existsSync(journal)?(loadPrivate(journal) as {hash?:string}).hash:undefined};
  let entry=existsSync(journal)?loadPrivate(journal) as {status:string;hash?:Hex}:undefined;
  if(entry&&!entry.hash)throw new Error('Settlement outcome uncertain; reconcile the existing journal');
  if(!entry){
   savePrivate(journal,{status:'pending',kind,id});
   const hash=await this.source.send(kind,id,refund?{units:refund.units,recipient:`0x${Buffer.from(refund.recipient).toString('hex')}`}:undefined);entry={status:'submitted',hash};savePrivate(journal,entry);
  }
  await this.source.waitFinalizedReceipt(entry.hash!);
  if(!await this.source.messageProcessed(kind,id))throw new Error('Source settlement is not finalized');
  savePrivate(journal,{status:'confirmed',hash:entry.hash});return {confirmed:true,id,sourceTx:entry.hash};
 });}
}
