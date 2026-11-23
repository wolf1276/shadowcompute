import { ledger } from '../../contracts/contract/managed/shadow-vault/contract/index.js';
import { ledgerState } from './providers.js';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { ReceiptSource } from './gateway.js';
export function chainReceipts(address:string,indexer:string,indexerWS:string,node:string,decode:(data:Parameters<typeof ledger>[0])=>Pick<ReturnType<typeof ledger>,'receipts'>=ledger):ReceiptSource{
 if(!/^[0-9a-f]{64}$/.test(address))throw new Error('Invalid configured vault address');
 const provider=indexerPublicDataProvider(indexer,indexerWS);
 return {instance:Buffer.from(address,'hex'),async receipt(n){
  // Pin the read to the node's finalized block, rather than trusting an indexed best-chain tip.
  const response=await fetch(node,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'chain_getFinalizedHead',params:[]}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Finality unavailable');
  const head=await response.json() as {result?:string};
  if(!head.result||!/^0x[0-9a-f]{64}$/.test(head.result))throw new Error('Invalid finalized head');
  const read=await provider.queryContractState(address,{type:'blockHash',blockHash:head.result.slice(2)});
  if(!read)return null;
  const state=decode(ledgerState(read));
  return state.receipts.member(n)?state.receipts.lookup(n):null;
 }};
}
