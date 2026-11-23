import { WebSocket } from 'ws';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import { startWallet } from '../packages/backend/src/wallet.js';
import { getConfig } from '../packages/backend/src/config.js';
import { VaultClient,mintTestTokens } from '../packages/backend/src/client.js';
import { buildProviders } from '../packages/backend/src/providers.js';
import { tokenZkPath,privateState,bytes32 } from '../packages/contracts/contract/index.js';
import { loadPrivate,savePrivate } from '../packages/backend/src/notes.js';
import { shieldedBalance,waitForShieldedBalance } from '../packages/backend/src/coins.js';
Object.assign(globalThis,{WebSocket});process.umask(0o077);
const network=process.env.MIDNIGHT_NETWORK??'local';if(!['local','preview'].includes(network))throw new Error('Test networks only');
const config=getConfig(),logger=pino({level:'warn'}),env={...config,walletNetworkId:config.networkId};
const manifest=JSON.parse(readFileSync(network==='local'?'artifacts/deployment.json':`artifacts/deployment.${network}.json`,'utf8'));
const dir=join('.private-states',`demo-${Date.now()}`);mkdirSync(dir,{recursive:true,mode:0o700});
const sponsor=await startWallet(logger,env,{network,role:'ALICE',faucet:config.faucet,syncTimeoutMs:900000});
let user:typeof sponsor|undefined;
try{
 user=await startWallet(logger,env,{network,role:'BOB',faucet:config.faucet,syncTimeoutMs:900000});
 const owner=new VaultClient(user,config,manifest.address,'demo-owner'),relay=new VaultClient(sponsor,config,manifest.address,'demo-relay');
 let l=await owner.read();
 const deployment={...manifest,color:{hex:manifest.color,bytes:Buffer.from(manifest.color,'hex')},tokenProviders:buildProviders(sponsor,tokenZkPath,config),deployTx:manifest.deployTx,tokenDeployTx:manifest.tokenDeployTx};
 const before=await shieldedBalance(user,manifest.color);
 const minted=before<l.lotSize?l.lotSize-before:0n;
 if(minted>0n){await mintTestTokens(deployment,user,minted);await waitForShieldedBalance(user,manifest.color,l.lotSize);}
 await mintTestTokens(deployment,sponsor,3n*l.rewardUnit);
 await waitForShieldedBalance(sponsor,manifest.color,b=>b>=3n*l.rewardUnit);
 for(let i=0;i<3;i++)await relay.fundReserve();
 console.info('1/6 Funded three actual test-token reward units; yield is SIMULATED.');
 let note=privateState({checkpoint:l.simulatedSeconds});savePrivate(join(dir,'position.json'),note);
 const deposit=await owner.deposit(note);console.info('2/6 Deposited one shielded principal lot.');
 const seconds=(3n*l.rewardUnit*31536000n*10000n+l.lotSize*l.apyBps-1n)/(l.lotSize*l.apyBps);
 await relay.advanceSimulation(loadPrivate(network==='local'?'.private-states/admin.json':`.private-states/${network}/admin.json`) as typeof note,l.simulatedSeconds+seconds);
 console.info(`3/6 Advanced the SIMULATED clock by ${seconds} seconds; not real-world earnings.`);
 const claims:string[]=[];
 for(let i=0;i<3;i++){
  savePrivate(join(dir,'claim.pending'),{note,time:(await owner.read()).simulatedSeconds});
  const claimed=await owner.claim(note);savePrivate(join(dir,`credit-${i+1}.json`),claimed.credit);
  note=claimed.next;savePrivate(join(dir,'position.json'),note);claims.push(claimed.tx.public.txId);
 }
 console.info('4/6 Proved and saved THREE funded private AI credit notes.');
 const withdrawn=await owner.withdraw(note);await waitForShieldedBalance(user,manifest.color,before+minted);
 console.info('5/6 Principal returned to the user; claimed credits remain spendable.');
 console.info(`6/6 Use one real credit: printf '%s' 'Explain zero-knowledge proofs briefly.' | npm run ask -- ${join(dir,'credit-1.json')}`);
 writeFileSync('artifacts/demo-latest.json',JSON.stringify({network:config.networkId,vault:manifest.address,at:new Date().toISOString(),depositTx:deposit.public.txId,claimTxs:claims,withdrawTx:withdrawn.public.txId,creditsGenerated:3,creditCostPerRequest:1,principalReturned:true,yield:'SIMULATED',privateNoteDirectory:dir},null,2));
}catch(e){console.error(e instanceof Error?e.message:'Demo failed');console.error(`Private recovery notes are in ${dir}; do not blindly rerun an uncertain transaction.`);process.exitCode=1;}
finally{await user?.stop();await sponsor.stop();}
