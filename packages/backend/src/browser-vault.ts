import {WalletJobs,type WalletJob as Job} from './wallet-jobs.js';
import pino from 'pino';
import {startWallet} from './wallet.js';
import {bytes32} from '../../contracts/contract/index.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Transaction } from '@midnight-ntwrk/midnight-js-protocol/v9';
import { submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { MidnightBech32m,ShieldedCoinPublicKey,ShieldedEncryptionPublicKey } from '@midnightntwrk/wallet-sdk';
import { compiledToken,tokenZkPath,zkPath,ledger,pureCircuits,type PrivateState } from '../../contracts/contract/index.js';
import { buildProviders,ledgerState,type WalletConnection } from './providers.js';
import { VaultClient } from './client.js';
import { GatewayError } from './gateway.js';
import type { NetworkConfig } from './config.js';
import type { Contract as Token } from '../../contracts/contract/managed/test-token/contract/index.js';

const hex32=/^[0-9a-f]{64}$/;
export function parseNote(input:unknown):PrivateState{
 if(!input||typeof input!=='object')throw new GatewayError(400,'Private position note required');
 const p=input as Record<string,unknown>;
 const bytes=(k:string)=>{if(typeof p[k]!=='string'||!hex32.test(p[k] as string))throw new GatewayError(400,'Invalid private note');return Uint8Array.from(Buffer.from(p[k] as string,'hex'));};
 const integer=(k:string,max:bigint)=>{if(typeof p[k]!=='string'||!/^\d{1,40}$/.test(p[k] as string))throw new GatewayError(400,'Invalid note checkpoint');const n=BigInt(p[k] as string);if(n>max)throw new GatewayError(400,'Note checkpoint overflow');return n;};
 return {secret:bytes('secret'),salt:bytes('salt'),nextSalt:bytes('nextSalt'),creditSecret:bytes('creditSecret'),checkpoint:integer('checkpoint',(1n<<64n)-1n),carry:integer('carry',(1n<<128n)-1n)};
}
export function encodeNote(p:PrivateState){return {...Object.fromEntries(['secret','salt','nextSalt','creditSecret'].map(k=>[k,Buffer.from(p[k as 'secret']).toString('hex')])),checkpoint:p.checkpoint.toString(),carry:p.carry.toString()};}
export function walletKeys(input:unknown,network:string){
 const p=input as {shieldedCoinPublicKey?:unknown;shieldedEncryptionPublicKey?:unknown};
 const decode=(value:unknown,kind:typeof ShieldedCoinPublicKey|typeof ShieldedEncryptionPublicKey)=>{
  if(typeof value!=='string'||value.length>300)throw new GatewayError(400,'Invalid wallet key');
  try{return kind.codec.decode(network,MidnightBech32m.parse(value)).toHexString();}catch{throw new GatewayError(400,'Wallet shielded keys must match the selected network');}
 };
 return {coin:decode(p?.shieldedCoinPublicKey,ShieldedCoinPublicKey),encryption:decode(p?.shieldedEncryptionPublicKey,ShieldedEncryptionPublicKey)};
}
export class BrowserVault extends WalletJobs {
 private relayBusy=false;
 readonly manifest:{address:string;tokenAddress:string;color:string};
 readonly reader;
 constructor(readonly config:NetworkConfig,manifest?:{address:string;tokenAddress:string;color:string}){
  super();this.manifest=manifest??JSON.parse(readFileSync(config.networkId==='preview'?'artifacts/deployment.preview.json':'artifacts/deployment.json','utf8'));
  this.reader=indexerPublicDataProvider(config.indexer,config.indexerWS);
 }
 async status(){const l=ledger(ledgerState(await this.reader.queryContractState(this.manifest.address)));return {network:this.config.networkId,vault:this.manifest.address,token:this.manifest.tokenAddress,asset:this.manifest.color,lotSize:l.lotSize.toString(),rewardUnit:l.rewardUnit.toString(),apyBps:l.apyBps.toString(),simulatedSeconds:l.simulatedSeconds.toString(),reserve:l.reserve.toString(),allocated:l.allocated.toString()};}
 start(body:unknown){
  if(this.jobs.size>=50)throw new GatewayError(409,'Vault session history is full; restart only after pending operations settle');
  const b=body as {action?:unknown;keys?:unknown;note?:unknown;nonce?:unknown;next?:unknown};
  if(!b||!['deposit','claim','withdraw','mint'].includes(String(b.action)))throw new GatewayError(400,'Invalid vault action');
  const action=b.action as 'deposit'|'claim'|'withdraw'|'mint',keys=walletKeys(b.keys,this.config.networkId);
  const note=action==='mint'?undefined:parseNote(b.note);
  if(action==='mint'&&(typeof b.nonce!=='string'||!hex32.test(b.nonce)))throw new GatewayError(400,'Fresh mint nonce required');
  const next=action==='claim'?parseNote(b.next):undefined;
  const job:Job={id:randomUUID(),status:'working',stage:'preparing-proof',startedAt:Date.now()};this.jobs.set(job.id,job);
  void this.execute(job,action,keys,note,b.nonce as string,next).then(result=>{job.result=result;job.status='done';}).catch(()=>{job.status='failed';job.error='Operation did not complete. Keep the private pending journal and check the chain before retrying.';}).finally(()=>{delete job.reply;delete job.request;if(job.timer)clearTimeout(job.timer);});
  return {id:job.id,status:job.status};
 }
 startRedemption(body:unknown){
  const b=body as {secret?:unknown;bearer?:unknown};
  if(!b||typeof b.secret!=='string'||!hex32.test(b.secret)||typeof b.bearer!=='string'||!hex32.test(b.bearer))throw new GatewayError(400,'Invalid private allowance');
  if(this.relayBusy||this.jobs.size>=50)throw new GatewayError(409,'Redemption relay is busy; keep the same allowance and try later');
  const secret=Buffer.from(b.secret,'hex'),bearer=Buffer.from(b.bearer,'hex');
  const job:Job={id:randomUUID(),status:'working',stage:'preparing-proof',startedAt:Date.now()};this.jobs.set(job.id,job);this.relayBusy=true;
  void this.redeem(secret,bearer,job).then(result=>{job.result=result;job.txId=result.txId;job.status='done';}).catch(()=>{job.status='failed';job.error='Redemption was not confirmed. Keep this same bearer and allowance for reconciliation; do not pay with a different allowance.';}).finally(()=>{this.relayBusy=false;});
  return {id:job.id,status:job.status};
 }
 private async redeem(secret:Uint8Array,bearer:Uint8Array,job:Job){
  const state=ledger(ledgerState(await this.reader.queryContractState(this.manifest.address))),instance=Buffer.from(this.manifest.address,'hex');
  const nullifier=pureCircuits.creditNullifier(secret,instance),binding=pureCircuits.receiptBinding(bearer,instance);
  const redemption={nullifier:Buffer.from(nullifier).toString('hex'),bearer:Buffer.from(bearer).toString('hex')};
  if(state.receipts.member(nullifier)){
   if(!Buffer.from(state.receipts.lookup(nullifier).binding).equals(Buffer.from(binding)))throw new Error('Allowance already spent');
   return {redemption,txId:undefined};
  }
  if(!state.creditCommitments.member(pureCircuits.creditCommit(secret,instance))||state.spentCredits.member(nullifier))throw new Error('No unspent allowance');
  const network=this.config.networkId==='undeployed'?'local':'preview';
  job.stage='syncing-relay';
  const relay=await startWallet(pino({level:'warn'}),{...this.config,walletNetworkId:this.config.networkId},{network,role:'ALICE',faucet:this.config.faucet,syncTimeoutMs:900000});
  job.stage='preparing-proof';
  const settlement:WalletConnection={getCoinPublicKey:()=>relay.getCoinPublicKey(),getEncryptionPublicKey:()=>relay.getEncryptionPublicKey(),balanceTx:async tx=>{job.stage='balancing';return relay.balanceTx(tx);},submitTx:async tx=>{job.stage='submitting';const id=await relay.submitTx(tx);job.txId=id;job.stage='confirming';return id;}};
  const client=new VaultClient(settlement,this.config,this.manifest.address,`browser-relay-${randomUUID()}`);
  try{
   if(Buffer.from(state.gateway.bytes).toString('hex')!==relay.getCoinPublicKey())throw new Error('Relay does not match settlement wallet');
   const result=await client.redeem({secret},bearer,BigInt(Math.floor(Date.now()/1000)+300),relay);
   return {redemption:result.redemption,txId:result.tx.public.txId};
  }finally{await client.providers.privateStateProvider.forContract(this.manifest.address).remove(client.stateId);await relay.stop();}
 }
 private async execute(job:Job,action:string,keys:{coin:string;encryption:string},note:PrivateState|undefined,nonce:string,next?:PrivateState){
  const wallet=this.connectedWallet(job,keys);
  if(action==='mint'){
   const providers=buildProviders(wallet,tokenZkPath,this.config);
   const state=await this.status();
   const tx=await submitCallTx<Token<undefined>,'mint'>(providers,{compiledContract:compiledToken,contractAddress:this.manifest.tokenAddress,circuitId:'mint',args:[{bytes:Buffer.from(keys.coin,'hex')},BigInt(state.lotSize),Buffer.from(nonce,'hex')],additionalCoinEncPublicKeyMappings:new Map([[keys.coin,keys.encryption]])});
   return {action,txId:tx.public.txId};
  }
  const client=new VaultClient(wallet,this.config,this.manifest.address,`browser-${job.id}`);
  try{
   if(action==='deposit'){const tx=await client.deposit(note!);return {action,txId:tx.public.txId};}
   if(action==='withdraw'){const tx=await client.withdraw(note!);return {action,txId:tx.public.txId};}
   const result=await client.claim(note!,next!.checkpoint,{nextSalt:next!.nextSalt,creditSecret:next!.creditSecret});return {action,txId:result.tx.public.txId,next:encodeNote(result.next),credit:{secret:Buffer.from(result.credit.secret).toString('hex')}};
  }finally{await client.providers.privateStateProvider.forContract(this.manifest.address).remove(`browser-${job.id}`);}
 }
 async allowances(input:unknown){
  if(!Array.isArray(input)||input.length>1024)throw new GatewayError(400,'Invalid private allowance list');
  const notes=input.map(c=>{if(!c||typeof c.id!=='string'||c.id.length>80||typeof c.secret!=='string'||!hex32.test(c.secret)||(c.bearer!==undefined&&(typeof c.bearer!=='string'||!hex32.test(c.bearer))))throw new GatewayError(400,'Invalid private allowance');return c;});
  const state=ledger(ledgerState(await this.reader.queryContractState(this.manifest.address))),instance=Buffer.from(this.manifest.address,'hex');
  return notes.map(c=>{const secret=Buffer.from(c.secret,'hex'),nullifier=pureCircuits.creditNullifier(secret,instance);return {id:c.id,exists:state.creditCommitments.member(pureCircuits.creditCommit(secret,instance)),spent:state.spentCredits.member(nullifier)};});
 }
 async reconcile(note:unknown){
  const p=parseNote(note),l=ledger(ledgerState(await this.reader.queryContractState(this.manifest.address))),instance=Buffer.from(this.manifest.address,'hex');
  const commitment=pureCircuits.positionCommit(p.secret,p.salt,p.checkpoint,p.carry,instance);
  const nullifier=pureCircuits.positionNullifier(p.secret,p.salt,p.checkpoint,p.carry,instance);
  return {exists:l.positionCommitments.member(commitment),spent:l.spentPositions.member(nullifier)};
 }
}
