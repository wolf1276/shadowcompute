import { WebSocket } from 'ws';
import pino from 'pino';
import * as Rx from 'rxjs';
import { MidnightWalletProvider,resolveWallet,syncWallet } from '../packages/backend/src/wallet.js';
import { getConfig } from '../packages/backend/src/config.js';
Object.assign(globalThis,{WebSocket});
const config=getConfig();
if(config.networkId!=='preview')throw new Error('Preview only');
const logger=pino({level:'warn'});
const wallet=await MidnightWalletProvider.build(logger,{...config,walletNetworkId:config.networkId},resolveWallet('preview','ALICE').secret);
try{
 await wallet.start();
 let last=0;
 const progress=wallet.wallet.state().pipe(Rx.tap(state=>{if(Date.now()-last<30000)return;last=Date.now();console.info(JSON.stringify({progress:{shielded:state.shielded.progress,unshielded:state.unshielded.progress,dust:state.dust.progress}},(_key,value)=>typeof value==='bigint'?value.toString():value));})).subscribe();
 const state=await syncWallet(logger,wallet.wallet,900000);
 progress.unsubscribe();
 const balance=Object.values(state.unshielded.balances).reduce((a,b)=>a+b,0n);
 console.info(JSON.stringify({network:'preview',synced:true,nightSmallestUnits:balance.toString(),dustAvailableCoins:state.dust.availableCoins.length,dustSpecks:state.dust.balance(new Date()).toString()}));
}finally{await wallet.stop();}
