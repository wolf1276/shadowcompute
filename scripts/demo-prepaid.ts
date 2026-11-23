import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {WebSocket} from 'ws';
import {createWalletClient,http,parseAbi,type Hex} from 'viem';
import {ShieldedCoinPublicKey,ShieldedEncryptionPublicKey} from '@midnightntwrk/wallet-sdk';
import {Transaction} from '@midnight-ntwrk/midnight-js-protocol/v9';
import {LedgerTransaction} from '@midnight-ntwrk/midnight-js-types';
import pino from 'pino';
import assert from 'node:assert/strict';
import {PrepaidVault} from '../packages/backend/src/prepaid-vault.js';
import type {PrepaidManifest} from '../packages/backend/src/prepaid-relay.js';
import {LOCAL_CONFIG} from '../packages/backend/src/config.js';
import {startWallet} from '../packages/backend/src/wallet.js';
import {treasuryAbi} from '../packages/backend/src/credit-treasury.js';
import {newCreditSeed,creditNote,creditBearer} from '../packages/terminal/prepaid-notes.js';
import {savePrivate,loadPrivate} from '../packages/backend/src/notes.js';
import {DatabaseSync} from 'node:sqlite';
import {pureCircuits} from '../packages/contracts/contract/prepaid.js';
import {Gateway} from '../packages/backend/src/gateway.js';
import {chainReceipts} from '../packages/backend/src/receipt-source.js';
import {ledger} from '../packages/contracts/contract/prepaid.js';
import {loadModelRouter} from '../packages/backend/src/models.js';
Object.assign(globalThis,{WebSocket});process.umask(0o077);
const manifest=JSON.parse(readFileSync('artifacts/deployment.prepaid.local.json','utf8')) as PrepaidManifest;if(manifest.network!=='local'||manifest.source.chainId!==31337)throw new Error('Dedicated local test chains only');
const service=new PrepaidVault(LOCAL_CONFIG,manifest),source=service.relay.source;await source.verify();
const addresses=await createWalletClient({transport:http(source.config.rpc)}).getAddresses(),payer=addresses[1],chain={id:31337,name:'Local test EVM',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[source.config.rpc]}}};
const evm=createWalletClient({account:payer,transport:http(source.config.rpc),chain}),tokenAbi=parseAbi(['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)']);
const resumeIndex=process.argv.indexOf('--resume'),resumed=resumeIndex>=0?loadPrivate(process.argv[resumeIndex+1]) as {seed:ReturnType<typeof newCreditSeed>;paymentHash:Hex;gatewayFile?:string;beforeBalance?:string;counterBase?:{consumed:string;refunded:string}}:null;
const startingState=await service.relay.read();
const counterBase=resumed?.counterBase??(resumed?{consumed:'0',refunded:'0'}:{consumed:startingState.consumedUnits.toString(),refunded:startingState.refundedUnits.toString()});
if(!resumed){
 const [liability,revenue]=await Promise.all([source.public.readContract({address:source.config.address,abi:treasuryAbi,functionName:'refundableCredits'}),source.public.readContract({address:source.config.address,abi:treasuryAbi,functionName:'earnedRevenue'})]);
 assert.equal(liability,0n,'Rehearse only on an idle instance with no refundable liabilities');assert.equal(revenue,0n,'Settle existing earned revenue before another rehearsal');assert.equal(startingState.pendingUnits,0n);assert.equal(startingState.outstandingUnits,0n);
}
const seed=resumed?.seed??newCreditSeed('5'),original=await creditNote(seed),payment=await service.payment(original);const recoveryFile=resumed?process.argv[resumeIndex+1]:`.private-states/prepaid-demo-${Date.now()}.json`;
const currentBalance=await source.public.readContract({address:source.config.asset,abi:tokenAbi,functionName:'balanceOf',args:[payer]});let paymentHash:Hex,before:bigint;
if(resumed){paymentHash=resumed.paymentHash;assert.equal(payment.existingSourceTx?.toLowerCase(),paymentHash.toLowerCase());const receipt=await source.finalizedReceipt(paymentHash);if(resumed.beforeBalance!==undefined)before=BigInt(resumed.beforeBalance);
 else{
  try{before=await source.public.readContract({address:source.config.asset,abi:tokenAbi,functionName:'balanceOf',args:[payer],blockNumber:receipt.blockNumber-1n});}
  catch{
   // Anvil snapshots may retain logs but not historical execution state.
   const transfers=await source.public.getLogs({address:source.config.asset,event:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])[0],fromBlock:0n,toBlock:receipt.blockNumber-1n,strict:true});
   before=0n;for(const {args} of transfers){if(args.to.toLowerCase()===payer.toLowerCase())before+=args.value;if(args.from.toLowerCase()===payer.toLowerCase())before-=args.value;}
   assert(before>=50000n,'Historical balance unavailable; preserve recovery state instead of replaying payment');
  }
 }}
else{before=currentBalance;savePrivate(recoveryFile,{counterBase,beforeBalance:before.toString(),seed,note:original});const approval=await evm.writeContract({address:source.config.asset,abi:tokenAbi,functionName:'approve',args:[source.config.address,50000n]});await source.public.waitForTransactionReceipt({hash:approval});paymentHash=await evm.writeContract({address:source.config.address,abi:treasuryAbi,functionName:'deposit',args:[5n,payment.commitment]});await source.public.waitForTransactionReceipt({hash:paymentHash});savePrivate(recoveryFile,{counterBase,beforeBalance:before.toString(),seed,note:original,paymentHash});}
console.info('Prepaid demo: actual EVM payment included; waiting for source finality');
const authorized=await service.relay.authorize(paymentHash);const replay=await service.relay.authorize(paymentHash);assert.equal(replay.depositId,authorized.depositId);console.info('Prepaid demo: finalized source event authorized on Midnight');
const user=await startWallet(pino({level:'warn'}),{...LOCAL_CONFIG,walletNetworkId:LOCAL_CONFIG.networkId},{network:'local',role:'BOB',faucet:'',syncTimeoutMs:180000});
const keys={shieldedCoinPublicKey:ShieldedCoinPublicKey.codec.encode('undeployed',ShieldedCoinPublicKey.fromHexString(user.getCoinPublicKey())).asString(),shieldedEncryptionPublicKey:ShieldedEncryptionPublicKey.codec.encode('undeployed',ShieldedEncryptionPublicKey.fromHexString(user.getEncryptionPublicKey())).asString()};
const transactions:string[]=[];let approvals=0;
async function run(action:string,body:Record<string,unknown>){
 const job=service.start({action,keys,...body}),handled=new Set<string>(),end=Date.now()+600000;
 while(Date.now()<end){const state=service.poll(job.id);if(state.status==='done'){const result=state.result as {txId?:string;id?:string;redemption?:{nullifier:string;bearer:string}};if(result.txId)transactions.push(result.txId);return result;}if(state.status==='failed')throw new Error(state.error);
  if(state.request&&!handled.has(state.request.id)){handled.add(state.request.id);if(state.request.method==='balanceUnsealedTransaction'){approvals++;const tx=await user.balanceTx(LedgerTransaction.fromBytes('v9','Unbound',Buffer.from(state.request.tx,'hex')));service.reply(job.id,state.request.id,{tx:Buffer.from(tx instanceof Uint8Array?tx:tx.serialize()).toString('hex')},false);}else{await user.submitTx(Transaction.deserialize('signature','proof','binding',Buffer.from(state.request.tx,'hex')));service.reply(job.id,state.request.id,null,false);}}
  await new Promise(resolve=>setTimeout(resolve,250));
 }throw new Error('Prepaid wallet operation timed out; preserve its private recovery file');
}
let gatewayFile=resumed?.gatewayFile??(resumed?undefined:process.env.GATEWAY_DB);
if(!gatewayFile&&resumed){const note=await creditNote(seed),id=Buffer.from(pureCircuits.noteNullifier(Buffer.from(note.secret,'hex'),Buffer.from(note.salt,'hex'),BigInt(note.balance),Buffer.from(manifest.address,'hex'))).toString('hex');for(const file of readdirSync('.private-states').filter(file=>/^prepaid-demo-gateway-\d+\.db$/.test(file))){const db=new DatabaseSync('.private-states/'+file,{readOnly:true});const found=db.prepare('SELECT nullifier FROM requests WHERE nullifier=?').get(id);db.close();if(found){gatewayFile='.private-states/'+file;break;}}}
gatewayFile??=process.env.GATEWAY_DB??`.private-states/prepaid-demo-gateway-${Date.now()}.db`;
const gateway=new Gateway(chainReceipts(manifest.address,LOCAL_CONFIG.indexer,LOCAL_CONFIG.indexerWS,LOCAL_CONFIG.node,ledger),loadModelRouter('config/models.local.json'),gatewayFile);
const models:{id:string;response:string;receiptReused:boolean;cached:boolean}[]=[];
async function finalized(check:(state:Awaited<ReturnType<typeof service.relay.read>>)=>boolean){const end=Date.now()+30000;while(Date.now()<end){if(check(await service.relay.read()))return;await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error('Midnight finality did not reach the expected state');}
try{
 const initial=await service.recover(seed);if(!initial.claimed)await run('claim-payment',{depositId:authorized.depositId.slice(2),note:original});if((initial.sequence??0)>2)throw new Error('This demo only resumes its first two model requests');console.info('Prepaid demo: five private credits claimed with a real SDK wallet');
 for(const [index,model,prompt] of [[0,'qwen-small','Reply with exactly READY.'],[1,'qwen-coder','Return only the TypeScript expression for adding 2n and 3n.']] as const){
  const note=await creditNote(seed,index),bearer=await creditBearer(seed,index),id=Buffer.from(pureCircuits.noteNullifier(Buffer.from(note.secret,'hex'),Buffer.from(note.salt,'hex'),BigInt(note.balance),Buffer.from(manifest.address,'hex'))).toString('hex');const spent=index<(initial.sequence??0)?{id,redemption:{nullifier:id,bearer}}:await run('spend-credit',{note,bearer});savePrivate(recoveryFile,{counterBase,beforeBalance:before.toString(),seed,sequence:index+1,paymentHash,gatewayFile,redemption:spent.redemption,prompt,model});
  await finalized(state=>state.receipts.member(Buffer.from(spent.id!,'hex')));await service.relay.settle('SPEND',`0x${spent.id}`);
  const request={prompt,model,redemption:spent.redemption};console.info(`Prepaid demo: requesting real local model ${model}`);const answer=await gateway.infer(request),cached=await gateway.infer(request);assert.equal(cached.cached,true);assert.equal(cached.response,answer.response);
  await assert.rejects(gateway.infer({...request,model:model==='qwen-small'?'qwen-coder':'qwen-small'}),/another request/);models.push({id:model,response:answer.response,receiptReused:true,cached:answer.cached});
 }
 const recovered=await service.recover(seed);assert.equal(recovered.sequence,2);assert.equal(recovered.note?.balance,'3');console.info('Prepaid demo: original payment seed recovered the remaining three credits');
 const refunded=recovered.refunded?{id:recovered.id}:await run('refund-credits',{note:await creditNote(seed,2),recipient:payer});savePrivate(recoveryFile,{counterBase,beforeBalance:before.toString(),seed,paymentHash,gatewayFile,refundId:refunded.id});await finalized(state=>state.refunds.member(Buffer.from(refunded.id!,'hex')));
 const release=await service.relay.settle('REFUND',`0x${refunded.id}`);await service.relay.settle('REFUND',`0x${refunded.id}`);
 const collect=await(await source.wallet()).writeContract({address:source.config.address,abi:treasuryAbi,functionName:'collectRevenue'});await source.public.waitForTransactionReceipt({hash:collect});
 const after=await source.public.readContract({address:source.config.asset,abi:tokenAbi,functionName:'balanceOf',args:[payer]}),liability=await source.public.readContract({address:source.config.address,abi:treasuryAbi,functionName:'refundableCredits'}),treasuryBalance=await source.public.readContract({address:source.config.asset,abi:tokenAbi,functionName:'balanceOf',args:[source.config.address]});
 assert.equal(before-after,20000n);assert.equal(liability,0n);assert.equal(treasuryBalance,0n);const final=await service.relay.read();assert.equal(final.consumedUnits,BigInt(counterBase.consumed)+2n);assert.equal(final.refundedUnits,BigInt(counterBase.refunded)+3n);assert.equal(final.outstandingUnits,0n);
 const evidence={network:'Dedicated local Anvil + actual local Midnight node/proof server',publicTestnetDeployment:false,treasury:source.config.address,midnightBridge:manifest.address,asset:source.config.asset,assetType:'Valueless local test ERC20',creditPriceSmallestUnits:'10000',creditsPurchased:5,creditsConsumed:2,creditsRefunded:3,netPayerCostSmallestUnits:(before-after).toString(),sourcePayment:paymentHash,sourceRefund:release.sourceTx,sourceRevenueCollection:collect,midnightTransactionsCapturedThisRun:transactions,walletApprovalsThisRun:approvals,aggregateCounterBase:counterBase,resumedExistingPayment:!!resumed,models,finalityChecked:true,depositReplayDidNotMintAgain:true,modelSwitchReplayRejected:true,refundReplayDidNotPayAgain:true,originalSeedRecoveredUnspentBalance:true,outstandingCredits:final.outstandingUnits.toString(),sourceRefundLiability:liability.toString(),sourceTreasuryBalance:treasuryBalance.toString(),at:new Date().toISOString()};
 writeFileSync(process.env.PREPAID_EVIDENCE_FILE??(resumed?'artifacts/prepaid-resume.json':'artifacts/prepaid-e2e.json'),JSON.stringify(evidence,null,2));console.info('PASS: stable payment → private multi-model credits → actual inference → unused-credit refund; consumed value alone became revenue.');
}finally{gateway.close();await user.stop();}
