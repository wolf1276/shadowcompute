import {randomUUID} from 'node:crypto';
import {Transaction} from '@midnight-ntwrk/midnight-js-protocol/v9';
import {GatewayError} from './gateway.js';
import type {WalletConnection} from './providers.js';
export type WalletPrompt={id:string;method:'balanceUnsealedTransaction'|'submitTransaction';tx:string};
export type WalletJob={id:string;status:'working'|'done'|'failed';stage?:string;startedAt?:number;request?:WalletPrompt;result?:unknown;error?:string;submissionAttempted?:boolean;txId?:string;reply?:(value:unknown)=>void;timer?:ReturnType<typeof setTimeout>};
export class WalletJobs {
 readonly jobs=new Map<string,WalletJob>();
 get busy(){return [...this.jobs.values()].some(job=>job.status==='working');}
 poll(id:unknown){if(typeof id!=='string'||!this.jobs.has(id))throw new GatewayError(404,'Unknown vault operation');const {status,request,result,error,submissionAttempted,txId,stage,startedAt}=this.jobs.get(id)!;return {id,status,request,result,error,submissionAttempted:!!submissionAttempted,txId,stage,startedAt};}
 reply(id:unknown,requestId:unknown,value:unknown,error:unknown){const job=typeof id==='string'?this.jobs.get(id):undefined;if(!job?.reply||job.request?.id!==requestId)throw new GatewayError(409,'Wallet request is no longer pending');const reply=job.reply;delete job.reply;delete job.request;reply(error?{error:true}:value);}
 launch(run:(job:WalletJob)=>Promise<unknown>){
  if(this.jobs.size>=200)throw new GatewayError(409,'Session history is full; settle pending operations before restarting');
  const job:WalletJob={id:randomUUID(),status:'working',stage:'preparing-proof',startedAt:Date.now()};this.jobs.set(job.id,job);
  void run(job).then(result=>{job.result=result;job.status='done';}).catch(()=>{job.status='failed';job.error='Operation did not complete. Preserve the pending journal and check its outcome before retrying.';}).finally(()=>{delete job.reply;delete job.request;if(job.timer)clearTimeout(job.timer);});
  return {id:job.id,status:job.status};
 }
 protected async request(job:WalletJob,method:WalletPrompt['method'],tx:string):Promise<unknown>{
  if(tx.length>16_000_000)throw new Error('Transaction too large');
  return new Promise((resolve,reject)=>{
   job.stage=method==='balanceUnsealedTransaction'?'wallet-approval':'submitting';job.request={id:randomUUID(),method,tx};
   job.timer=setTimeout(()=>{delete job.reply;delete job.request;reject(new Error('Wallet approval timed out'));},300000);
   job.reply=value=>{clearTimeout(job.timer);if(value&&typeof value==='object'&&'error' in value)reject(new Error('Wallet declined'));else{job.stage=method==='submitTransaction'?'confirming':'preparing-submission';resolve(value);}};
  });
 }
 protected connectedWallet(job:WalletJob,keys:{coin:string;encryption:string}):WalletConnection{
  return {getCoinPublicKey:()=>keys.coin,getEncryptionPublicKey:()=>keys.encryption,
   balanceTx:async tx=>{const answer=await this.request(job,'balanceUnsealedTransaction',Buffer.from(tx.serialize()).toString('hex')) as {tx?:unknown};if(typeof answer?.tx!=='string'||answer.tx.length>16_000_000||!/^([a-f0-9]{2})+$/i.test(answer.tx))throw new Error('Invalid wallet transaction');return Transaction.deserialize('signature','proof','binding',Buffer.from(answer.tx,'hex'));},
   submitTx:async tx=>{const bytes=tx.serialize();const final=Transaction.deserialize('signature','proof','binding',bytes);job.submissionAttempted=true;job.txId=final.identifiers()[0];await this.request(job,'submitTransaction',Buffer.from(bytes).toString('hex'));return job.txId;}};
 }
}
