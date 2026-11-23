import {createPublicClient,createWalletClient,http,parseAbi,decodeEventLog,keccak256,encodeAbiParameters,parseAbiParameters,getAddress,type Address,type Hex} from 'viem';
import {privateKeyToAccount,type PrivateKeyAccount} from 'viem/accounts';
export const treasuryAbi=parseAbi([
 'event CreditDeposit(bytes32 indexed depositId,address indexed payer,bytes32 indexed ownerCommitment,uint64 credits,uint256 amount,bytes32 midnightBridge)',
 'function asset() view returns(address)','function relay() view returns(address)','function creditPrice() view returns(uint64)','function midnightBridge() view returns(bytes32)',
 'function refundableCredits() view returns(uint256)','function earnedRevenue() view returns(uint256)','function consumedMessages(bytes32) view returns(bool)',
 'function usedCommitments(bytes32) view returns(bool)','function deposit(uint64,bytes32) returns(bytes32)','function settleConsumed(bytes32)','function refund(bytes32,uint64,address)','function initializeBridge(bytes32)','function collectRevenue()',
]);
export type TreasuryConfig={rpc:string;chainId:31337|11155111;address:Address;asset:Address;bridge:Hex;creditPrice:string;decimals:6;deploymentBlock:string;relay:Address};
export class CreditTreasury {
 readonly public;
 constructor(readonly config:TreasuryConfig){
  const url=new URL(config.rpc);if(config.chainId!==31337&&config.chainId!==11155111)throw new Error('Only local and Sepolia testnets are supported');
  if(config.chainId===31337&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Local treasury RPC must be loopback');
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('Treasury RPC requires HTTPS');
  if(!/^0x[0-9a-f]{64}$/i.test(config.bridge)||!/^\d+$/.test(config.creditPrice)||BigInt(config.creditPrice)<=0n||config.decimals!==6)throw new Error('Invalid treasury configuration');
  getAddress(config.address);getAddress(config.asset);getAddress(config.relay);
  this.public=createPublicClient({transport:http(config.rpc,{timeout:15000})});
 }
 async verify(){
  if(await this.public.getChainId()!==this.config.chainId)throw new Error('Wrong treasury network');
  const read=(functionName:'asset'|'relay'|'creditPrice'|'midnightBridge')=>this.public.readContract({address:this.config.address,abi:treasuryAbi,functionName});
  const [asset,relay,price,bridge,decimals]=await Promise.all([read('asset'),read('relay'),read('creditPrice'),read('midnightBridge'),this.public.readContract({address:this.config.asset,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals'})]);
  if(decimals!==6||String(asset).toLowerCase()!==this.config.asset.toLowerCase()||String(relay).toLowerCase()!==this.config.relay.toLowerCase()||price!==BigInt(this.config.creditPrice)||String(bridge).toLowerCase()!==this.config.bridge.toLowerCase())throw new Error('Treasury manifest does not match its contracts');
 }
 async finalizedReceipt(hash:Hex){
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('Invalid source transaction');
  await this.verify();const receipt=await this.public.getTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Source transaction failed');
  const [finalized,block]=await Promise.all([this.public.getBlock({blockTag:'finalized'}),this.public.getBlock({blockNumber:receipt.blockNumber})]);
  if(finalized.number===null||receipt.blockNumber>finalized.number||block.hash!==receipt.blockHash)throw new Error('Source transaction is not finalized');return receipt;
 }
 async waitFinalizedReceipt(hash:Hex,timeoutMs=900000){
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('Invalid source transaction');await this.verify();
  const receipt=await this.public.waitForTransactionReceipt({hash,timeout:Math.min(timeoutMs,120000)});if(receipt.status!=='success')throw new Error('Source transaction failed');
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){const finalized=await this.public.getBlock({blockTag:'finalized'});if(finalized.number!==null&&receipt.blockNumber<=finalized.number)return this.finalizedReceipt(hash);await new Promise(resolve=>setTimeout(resolve,2000));}
  throw new Error('Source finality still pending. Keep and resume the existing transaction hash.');
 }
 async deposit(hash:Hex){
  const receipt=await this.waitFinalizedReceipt(hash),events=[];
  for(const log of receipt.logs){if(log.address.toLowerCase()!==this.config.address.toLowerCase())continue;try{const event=decodeEventLog({abi:treasuryAbi,eventName:'CreditDeposit',data:log.data,topics:log.topics});events.push(event.args);}catch{}}
  if(events.length!==1)throw new Error('Expected exactly one supported treasury deposit');
  const event=events[0];if(event.midnightBridge.toLowerCase()!==this.config.bridge.toLowerCase()||event.credits<=0n||event.credits>1000000000n||event.amount!==event.credits*BigInt(this.config.creditPrice))throw new Error('Invalid deposit funding');
  return {...event,sourceTx:hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash};
 }
 async findPayment(commitment:Hex){
  await this.verify();const logs=await this.public.getLogs({address:this.config.address,event:treasuryAbi[0],args:{ownerCommitment:commitment},fromBlock:BigInt(this.config.deploymentBlock),toBlock:'latest',strict:true});
  if(logs.length>1)throw new Error('Ambiguous payment commitment');return logs[0]?.transactionHash;
 }
 async fundTestWallet(recipient:Address){
  if(this.config.chainId!==31337)throw new Error('The faucet is only available on the dedicated local test chain');getAddress(recipient);await this.verify();
  const response=await fetch(this.config.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'anvil_setBalance',params:[recipient,'0xde0b6b3a7640000']})});const rpc=await response.json() as {error?:unknown};if(rpc.error)throw new Error('Local test gas faucet unavailable');
  const wallet=await this.wallet(),hash=await wallet.writeContract({address:this.config.asset,abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[recipient,100000000n]});await this.public.waitForTransactionReceipt({hash});return {sourceTx:hash,testOnly:true};
 }
 messageKey(kind:'SPEND'|'REFUND',id:Hex){return keccak256(encodeAbiParameters(parseAbiParameters('string, bytes32, bytes32'),[kind,this.config.bridge,id]));}
 async messageProcessed(kind:'SPEND'|'REFUND',id:Hex){await this.verify();return this.public.readContract({address:this.config.address,abi:treasuryAbi,functionName:'consumedMessages',args:[this.messageKey(kind,id)],blockTag:'finalized'});}
 async wallet(){
  await this.verify();let account:Address|PrivateKeyAccount;
  if(this.config.chainId===31337){const addresses=await createWalletClient({transport:http(this.config.rpc)}).getAddresses();const local=addresses.find(address=>address.toLowerCase()===this.config.relay.toLowerCase());if(!local)throw new Error('Local relay account is unavailable');account=local;}
  else{const key=process.env.EVM_RELAY_PRIVATE_KEY;if(!key||!/^0x[0-9a-f]{64}$/i.test(key))throw new Error('EVM_RELAY_PRIVATE_KEY is required for Sepolia');account=privateKeyToAccount(key as Hex);if(account.address.toLowerCase()!==this.config.relay.toLowerCase())throw new Error('Wrong source relay key');}
  return createWalletClient({account,transport:http(this.config.rpc),chain:{id:this.config.chainId,name:'ShadowCompute testnet',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[this.config.rpc]}}}});
 }
 async send(kind:'SPEND'|'REFUND',id:Hex,refund?:{units:bigint;recipient:Address}){
  const wallet=await this.wallet();
  return kind==='SPEND'?wallet.writeContract({address:this.config.address,abi:treasuryAbi,functionName:'settleConsumed',args:[id]}):wallet.writeContract({address:this.config.address,abi:treasuryAbi,functionName:'refund',args:[id,refund!.units,refund!.recipient]});
 }
}
