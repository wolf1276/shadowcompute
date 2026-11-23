import {submitCallTx,deployContract} from '@midnight-ntwrk/midnight-js-contracts';
import {compiledPrepaid,prepaidZkPath,prepaidNote,ledger,type PrepaidNote} from '../../contracts/contract/prepaid.js';
import {buildProviders,ledgerState,type WalletConnection} from './providers.js';
import type {NetworkConfig} from './config.js';
export class PrepaidClient {
 readonly providers;
 constructor(wallet:WalletConnection,readonly config:NetworkConfig,readonly address:string,readonly stateId:string){this.providers=buildProviders(wallet,prepaidZkPath,config);}
 async read(){return ledger(ledgerState(await this.providers.publicDataProvider.queryContractState(this.address)));}
 async call(circuitId:'authorizeDeposit'|'claimDeposit'|'redeem'|'requestRefund',args:unknown[],state:PrepaidNote){
  await this.providers.privateStateProvider.forContract(this.address).set(this.stateId,state);
  return submitCallTx(this.providers,{compiledContract:compiledPrepaid,contractAddress:this.address,privateStateId:this.stateId,circuitId,args} as never);
 }
 async close(){await this.providers.privateStateProvider.forContract(this.address).remove(this.stateId);}
}
export async function deployPrepaid(wallet:WalletConnection,config:NetworkConfig,issuerSecret:Uint8Array,source:{chain:bigint;treasury:Uint8Array;asset:Uint8Array;creditPrice:bigint}){
 if(!['undeployed','preview'].includes(config.networkId))throw new Error('Test networks only');
 if(config.networkId!=='undeployed'&&process.env.ALLOW_PUBLIC_TEST_DEPLOY!=='yes')throw new Error('Public test deployment requires explicit test flag');
 const providers=buildProviders(wallet,prepaidZkPath,config);
 return deployContract(providers,{compiledContract:compiledPrepaid,privateStateId:'prepaid-issuer',initialPrivateState:prepaidNote({issuerSecret}),args:[source.chain,source.treasury,source.asset,source.creditPrice]});
}
