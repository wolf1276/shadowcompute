import type { Contract as TestTokenContract } from '../../contracts/contract/managed/test-token/contract/index.js';
import { submitCallTx, deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { compiledVault,compiledToken,zkPath,tokenZkPath,ledger,pureCircuits,privateState,bytes32,type PrivateState,type Ledger } from '../../contracts/contract/index.js';
import { buildProviders,ledgerState,type ShadowProviders,type WalletConnection } from './providers.js';
import type { MidnightWalletProvider } from './wallet.js';
import type { NetworkConfig } from './config.js';
import { freshCoin,recipientOf,encryptionKeys,tokenColor } from './coins.js';
export type PositionNote=PrivateState;
export type CreditNote={secret:Uint8Array};
export class VaultClient {
 readonly providers:ShadowProviders;
 constructor(readonly wallet:WalletConnection,readonly config:NetworkConfig,readonly address:string,readonly stateId:string){this.providers=buildProviders(wallet,zkPath,config);}
 async read():Promise<Ledger>{return ledger(ledgerState(await this.providers.publicDataProvider.queryContractState(this.address)));}
 async setState(p:PrivateState){await this.providers.privateStateProvider.forContract(this.address).set(this.stateId,p);}
 async call<K extends 'deposit'|'withdraw'|'fundReserve'|'advanceSimulation'|'claim'|'redeem'>(id:K,args:unknown[],p:PrivateState,extra:Map<string,string>=new Map()){
  await this.setState(p);
  // Circuit arguments are checked by generated Compact code before proving; SDK overloads cannot express this dynamic dispatcher.
  return submitCallTx(this.providers,{compiledContract:compiledVault,contractAddress:this.address,privateStateId:this.stateId,circuitId:id,...(args.length?{args}:{}),additionalCoinEncPublicKeyMappings:extra} as never);
 }
 async deposit(note:PositionNote){
  const l=await this.read();
  if(note.checkpoint!==l.simulatedSeconds||note.carry!==0n)throw new Error('New note must start at current simulated time with zero carry');
  return this.call('deposit',[freshCoin(Buffer.from(l.asset).toString('hex'),l.lotSize)],note);
 }
 async withdraw(note:PositionNote){
  const l=await this.read();const first=[...l.principalCoins][0];if(!first)throw new Error('No principal coin');
  return this.call('withdraw',[first[0]],note);
 }
 async fundReserve(){const l=await this.read();return this.call('fundReserve',[freshCoin(Buffer.from(l.asset).toString('hex'),l.rewardUnit)],privateState());}
 async advanceSimulation(admin:PrivateState,seconds:bigint){return this.call('advanceSimulation',[seconds],admin);}
 async claim(note:PositionNote,expectedTime?:bigint,rotation?:Pick<PositionNote,'nextSalt'|'creditSecret'>){
  const l=await this.read();
  if(expectedTime!==undefined&&expectedTime!==l.simulatedSeconds)throw new Error('Simulation clock changed; rebuild claim');
  const credit={secret:note.creditSecret};
  const next:PositionNote={...note,salt:note.nextSalt,nextSalt:rotation?.nextSalt??bytes32(),creditSecret:rotation?.creditSecret??bytes32(),checkpoint:l.simulatedSeconds,carry:note.carry+l.lotSize*l.apyBps*(l.simulatedSeconds-note.checkpoint)-l.rewardUnit*31536000n*10000n};
  const tx=await this.call('claim',[l.simulatedSeconds],note);
  return {tx,next,credit};
 }
 async redeem(credit:CreditNote,bearer:Uint8Array,expires:bigint,gatewayWallet:MidnightWalletProvider){
  const l=await this.read();const first=[...l.reserveCoins][0];if(!first)throw new Error('No reserve coin');
  const instance=Buffer.from(this.address,'hex');
  const tx=await this.call('redeem',[first[0],pureCircuits.receiptBinding(bearer,instance),expires],privateState({creditSecret:credit.secret}),encryptionKeys(gatewayWallet));
  return {tx,redemption:{nullifier:Buffer.from(pureCircuits.creditNullifier(credit.secret,instance)).toString('hex'),bearer:Buffer.from(bearer).toString('hex')}};
 }
}
export async function deployDemo(sponsor:MidnightWalletProvider,config:NetworkConfig,admin:PrivateState,gatewayWallet:MidnightWalletProvider,lot=1000000n,unit=10000n,apyBps=1000n,onTokenDeployed?:(token:{tokenAddress:string;tokenDeployTx:string;color:string})=>void){
 if(!['undeployed','preview','preprod'].includes(config.networkId))throw new Error('Only local/preview/preprod test networks are supported');
 if(config.networkId!=='undeployed'&&process.env.ALLOW_PUBLIC_TEST_DEPLOY!=='yes')throw new Error('Public test deployment requires ALLOW_PUBLIC_TEST_DEPLOY=yes; never use real funds');
 const tokenProviders=buildProviders(sponsor,tokenZkPath,config);
 const token=await deployContract(tokenProviders,{compiledContract:compiledToken});
 const tokenAddress=token.deployTxData.public.contractAddress;
 const color=tokenColor('private-tip-jar:demo-token:',tokenAddress);
 onTokenDeployed?.({tokenAddress,tokenDeployTx:token.deployTxData.public.txId,color:color.hex});
 const providers=buildProviders(sponsor,zkPath,config);
 const vault=await deployContract(providers,{compiledContract:compiledVault,privateStateId:'admin',initialPrivateState:admin,args:[color.bytes,lot,unit,apyBps,recipientOf(gatewayWallet)]});
 return {tokenAddress,color,address:vault.deployTxData.public.contractAddress,tokenProviders,tokenDeployTx:token.deployTxData.public.txId,deployTx:vault.deployTxData.public.txId};
}
export async function mintTestTokens(deployment:Awaited<ReturnType<typeof deployDemo>>,recipient:MidnightWalletProvider,amount:bigint){
 return submitCallTx<TestTokenContract<undefined>,'mint'>(deployment.tokenProviders,{compiledContract:compiledToken,contractAddress:deployment.tokenAddress,circuitId:'mint',args:[recipientOf(recipient),amount,bytes32()],additionalCoinEncPublicKeyMappings:encryptionKeys(recipient)});
}
