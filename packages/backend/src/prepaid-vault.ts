import {creditNote,validateCreditSeed} from '../../terminal/prepaid-notes.js';
import {encodeFunctionData,parseAbi} from 'viem';
import {treasuryAbi} from './credit-treasury.js';
import {WalletJobs,type WalletJob} from './wallet-jobs.js';
import {walletKeys} from './browser-vault.js';
import {GatewayError} from './gateway.js';
import {PrepaidClient} from './prepaid-client.js';
import {pureCircuits,prepaidNote,type PrepaidNote} from '../../contracts/contract/prepaid.js';
import {PrepaidRelay,type PrepaidManifest} from './prepaid-relay.js';
import type {NetworkConfig} from './config.js';
const hex=/^[a-f0-9]{64}$/;
export function parsePrepaidNote(input:unknown):PrepaidNote{
 if(!input||typeof input!=='object')throw new GatewayError(400,'Private credit note required');const value=input as Record<string,unknown>;
 const bytes=(name:string)=>{if(typeof value[name]!=='string'||!hex.test(value[name] as string))throw new GatewayError(400,'Invalid private credit note');return Uint8Array.from(Buffer.from(value[name] as string,'hex'));};
 if(typeof value.balance!=='string'||!/^\d{1,10}$/.test(value.balance)||BigInt(value.balance)>1000000000n)throw new GatewayError(400,'Invalid private credit balance');
 return prepaidNote({secret:bytes('secret'),salt:bytes('salt'),nextSalt:bytes('nextSalt'),balance:BigInt(value.balance)});
}
export class PrepaidVault extends WalletJobs {
 readonly relay:PrepaidRelay;
 constructor(readonly config:NetworkConfig,readonly manifest:PrepaidManifest){super();this.relay=new PrepaidRelay(manifest,config);}
 async status(){const state=await this.relay.read();return {funding:'prepaid',vault:this.manifest.address,source:{...this.manifest.source,rpc:this.manifest.source.chainId===31337?this.manifest.source.rpc:undefined},pendingUnits:state.pendingUnits.toString(),outstandingUnits:state.outstandingUnits.toString(),consumedUnits:state.consumedUnits.toString(),refundedUnits:state.refundedUnits.toString()};}
 async recover(input:unknown){
  const seed=validateCreditSeed(input),state=await this.relay.read(),instance=Buffer.from(this.manifest.address,'hex');
  const exists=async(index:number)=>{const note=parsePrepaidNote(await creditNote(seed,index));return state.commitments.member(pureCircuits.noteCommit(note.secret,note.salt,note.balance,instance));};
  if(!await exists(0))return {claimed:false};
  let low=0,high=Number(seed.units);while(low<high){const mid=Math.ceil((low+high)/2);if(await exists(mid))low=mid;else high=mid-1;}
  const encoded=await creditNote(seed,low),note=parsePrepaidNote(encoded),id=pureCircuits.noteNullifier(note.secret,note.salt,note.balance,instance);
  return {claimed:true,sequence:low,note:encoded,id:Buffer.from(id).toString('hex'),spent:state.spentNotes.member(id),refunded:state.refunds.member(id),receipt:state.receipts.member(id)};
 }
 async payment(input:unknown){
  const note=parsePrepaidNote(input);if(note.balance===0n)throw new GatewayError(400,'Buy at least one credit');
  await this.relay.source.verify();const source=this.manifest.source,commitment=`0x${Buffer.from(pureCircuits.noteCommit(note.secret,note.salt,note.balance,Buffer.from(this.manifest.address,'hex'))).toString('hex')}` as `0x${string}`;
  const amount=note.balance*BigInt(source.creditPrice);
  const existingSourceTx=await this.relay.source.findPayment(commitment);
  return {existingSourceTx,chainId:source.chainId,commitment,amount:amount.toString(),approve:{to:source.asset,data:encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[source.address,amount]})},deposit:{to:source.address,data:encodeFunctionData({abi:treasuryAbi,functionName:'deposit',args:[note.balance,commitment]})}};
 }
 start(body:unknown){
  if(!body||typeof body!=='object')throw new GatewayError(400,'Invalid prepaid operation');const b=body as Record<string,unknown>;
  if(b.action==='authorize-payment'){if(typeof b.sourceTx!=='string'||!/^0x[a-f0-9]{64}$/i.test(b.sourceTx))throw new GatewayError(400,'Invalid payment transaction');if(b.expectedCommitment!==undefined&&(typeof b.expectedCommitment!=='string'||!/^0x[a-f0-9]{64}$/i.test(b.expectedCommitment)))throw new GatewayError(400,'Invalid payment commitment');return this.launch(job=>{job.stage='source-finality';return this.relay.authorize(b.sourceTx as `0x${string}`,b.expectedCommitment as `0x${string}`|undefined);});}
  if(b.action==='settle-spend'||b.action==='release-refund'){if(typeof b.id!=='string'||!hex.test(b.id))throw new GatewayError(400,'Invalid settlement');return this.launch(job=>{job.stage='confirming';return this.relay.settle(b.action==='settle-spend'?'SPEND':'REFUND',`0x${b.id as string}`);});}
  if(!['claim-payment','spend-credit','refund-credits'].includes(String(b.action)))throw new GatewayError(400,'Invalid prepaid action');
  const note=parsePrepaidNote(b.note),keys=walletKeys(b.keys,this.config.networkId);
  if(b.action==='claim-payment'&&(typeof b.depositId!=='string'||!hex.test(b.depositId)))throw new GatewayError(400,'Invalid deposit identifier');
  if(b.action==='spend-credit'&&(typeof b.bearer!=='string'||!hex.test(b.bearer)))throw new GatewayError(400,'Invalid request bearer');
  if(b.action==='refund-credits'&&(typeof b.recipient!=='string'||!/^0x[a-f0-9]{40}$/i.test(b.recipient)))throw new GatewayError(400,'Invalid refund recipient');
  return this.launch(job=>this.execute(job,b,note,keys));
 }
 private async execute(job:WalletJob,b:Record<string,unknown>,note:PrepaidNote,keys:{coin:string;encryption:string}){
  const client=new PrepaidClient(this.connectedWallet(job,keys),this.config,this.manifest.address,`prepaid-${job.id}`),instance=Buffer.from(this.manifest.address,'hex');
  try{
   if(b.action==='claim-payment'){const result=await client.call('claimDeposit',[Buffer.from(b.depositId as string,'hex')],note);return {txId:result.public.txId};}
   const id=Buffer.from(pureCircuits.noteNullifier(note.secret,note.salt,note.balance,instance)).toString('hex');
   if(b.action==='spend-credit'){const bearer=Buffer.from(b.bearer as string,'hex'),expiry=BigInt(Math.floor(Date.now()/1000)+300);const result=await client.call('redeem',[pureCircuits.receiptBinding(bearer,instance),expiry],note);return {txId:result.public.txId,id,redemption:{nullifier:id,bearer:b.bearer}};}
   const result=await client.call('requestRefund',[Buffer.from((b.recipient as string).slice(2),'hex')],note);return {txId:result.public.txId,id};
  }finally{await client.close();}
 }
 async reconcile(note:unknown){const p=parsePrepaidNote(note),state=await this.relay.read(),instance=Buffer.from(this.manifest.address,'hex'),id=pureCircuits.noteNullifier(p.secret,p.salt,p.balance,instance);return {id:Buffer.from(id).toString('hex'),exists:state.commitments.member(pureCircuits.noteCommit(p.secret,p.salt,p.balance,instance)),spent:state.spentNotes.member(id),receipt:state.receipts.member(id),refund:state.refunds.member(id)};}
}
