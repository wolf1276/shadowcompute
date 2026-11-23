import { WebSocket } from 'ws';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import pino from 'pino';
import { submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { compiledToken,tokenZkPath,privateState,bytes32,type PrivateState } from '../packages/contracts/contract/index.js';
import type { Contract as Token } from '../packages/contracts/contract/managed/test-token/contract/index.js';
import { startWallet } from '../packages/backend/src/wallet.js';
import { getConfig } from '../packages/backend/src/config.js';
import { buildProviders } from '../packages/backend/src/providers.js';
import { VaultClient,deployDemo,type CreditNote } from '../packages/backend/src/client.js';
import { savePrivate,loadPrivate } from '../packages/backend/src/notes.js';
import { recipientOf,encryptionKeys,waitForShieldedBalance } from '../packages/backend/src/coins.js';
Object.assign(globalThis,{WebSocket});
process.umask(0o077);
const [action,arg]=process.argv.slice(2);
const actions=['deploy','mint','deposit','fund','advance','claim','redeem','withdraw','status'];
if(!actions.includes(action))throw new Error(`Usage: npm run client -- ${actions.join('|')} [amount|note-file]`);
const network=process.env.MIDNIGHT_NETWORK??'local';
if(!['local','preview'].includes(network))throw new Error('This CLI supports local and Preview test networks only');
const config=getConfig(),logger=pino({level:'warn'}),role=process.env.CLIENT_ROLE??'ALICE';
const wallet=await startWallet(logger,{...config,walletNetworkId:config.networkId},{network,role,faucet:config.faucet,syncTimeoutMs:network==='local'?180000:900000});
const adminFile=network==='local'?'.private-states/admin.json':`.private-states/${network}/admin.json`,deploymentFile=network==='local'?'artifacts/deployment.json':`artifacts/deployment.${network}.json`;
try{
 if(action==='deploy'){
  if(existsSync(deploymentFile)||existsSync(`${deploymentFile}.pending`))throw new Error('A deployment or pending deployment exists; reconcile it before redeploying');
  if(role!=='ALICE')throw new Error('Use CLIENT_ROLE=ALICE for demo deployment');
  if(existsSync(adminFile))throw new Error('An admin state already exists; preserve it and reconcile before deploying');
  const admin=privateState();savePrivate(adminFile,admin);
  writeFileSync(`${deploymentFile}.pending`,JSON.stringify({network:config.networkId,status:'deploying-token'},null,2),{mode:0o600,flag:'wx'});
  const d=await deployDemo(wallet,config,admin,wallet,1000000n,10000n,1000n,token=>writeFileSync(`${deploymentFile}.pending`,JSON.stringify({network:config.networkId,status:'deploying-vault',...token},null,2),{mode:0o600}));
  mkdirSync('artifacts',{recursive:true});writeFileSync(deploymentFile,JSON.stringify({network:config.networkId,address:d.address,tokenAddress:d.tokenAddress,color:d.color.hex,deployTx:d.deployTx,tokenDeployTx:d.tokenDeployTx},null,2));
  console.info(`Vault deployed: ${d.address}`);
  const {unlinkSync}=await import('node:fs');unlinkSync(`${deploymentFile}.pending`);
 }else{
  const d=JSON.parse(readFileSync(deploymentFile,'utf8')) as {address:string;tokenAddress:string;color:string};
  const client=new VaultClient(wallet,config,d.address,`cli-${role}`);
  const noteFile=arg??`.private-states/${role}-position.json`;
  if(action==='mint'){
   if(!arg||!/^\d+$/.test(arg)||BigInt(arg)<=0n||BigInt(arg)>1000000000000n)throw new Error('Mint amount must be 1–1000000000000');
   await submitCallTx<Token<undefined>,'mint'>(buildProviders(wallet,tokenZkPath,config),{compiledContract:compiledToken,contractAddress:d.tokenAddress,circuitId:'mint',args:[recipientOf(wallet),BigInt(arg),bytes32()],additionalCoinEncPublicKeyMappings:encryptionKeys(wallet)});
   await waitForShieldedBalance(wallet,d.color,b=>b>=BigInt(arg));console.info('Test tokens minted');
  }else if(action==='fund'){
   await client.fundReserve();console.info('One reward unit funded');
  }else if(action==='advance'){
   if(!arg||!/^\d+$/.test(arg))throw new Error('Specify an absolute simulated second, e.g. 31536000');
   await client.advanceSimulation(loadPrivate(adminFile) as PrivateState,BigInt(arg));console.info('SIMULATED clock advanced; this is not real yield');
  }else if(action==='status'){
   const l=await client.read();console.info(JSON.stringify({principal:l.principal.toString(),reserve:l.reserve.toString(),allocated:l.allocated.toString(),issued:l.issued.toString(),redeemed:l.redeemed.toString(),simulatedSeconds:l.simulatedSeconds.toString(),simulatedApyBps:l.apyBps.toString()},null,2));
  }else if(action==='deposit'){
   if(existsSync(noteFile))throw new Error('Note file exists; choose a fresh filename for each deposit');
   const l=await client.read(),note=privateState({checkpoint:l.simulatedSeconds});
   savePrivate(noteFile,note);savePrivate(`${noteFile}.pending`,{action,note});
   await client.deposit(note);savePrivate(`${noteFile}.pending`,{status:'confirmed'});console.info(`Private position saved locally: ${noteFile}`);
  }else if(action==='claim'){
   if(existsSync(`${noteFile}.credit`))throw new Error('Move the existing credit note to a fresh filename before claiming another');
   const note=loadPrivate(noteFile) as PrivateState,l=await client.read();
   savePrivate(`${noteFile}.pending`,{action,note,expectedTime:l.simulatedSeconds});
   const result=await client.claim(note,l.simulatedSeconds);
   // Save the owned credit before replacing the consumed position note.
   savePrivate(`${noteFile}.credit`,result.credit);savePrivate(noteFile,result.next);savePrivate(`${noteFile}.pending`,{status:'confirmed'});
   console.info(`Credit note saved: ${noteFile}.credit. Redeem through a different local wallet role.`);
  }else if(action==='redeem'){
   if(!arg)throw new Error('Specify a credit note file; use a different CLIENT_ROLE from its funding wallet');
   if(role!=='ALICE')throw new Error('Demo settlement wallet/relay is ALICE; use CLIENT_ROLE=ALICE');
   const credit=loadPrivate(noteFile) as CreditNote,bearer=bytes32(),expires=BigInt(Math.floor(Date.now()/1000)+300);
   savePrivate(`${noteFile}.pending`,{action,credit,bearer,expires});
   const result=await client.redeem(credit,bearer,expires,wallet);savePrivate(`${noteFile}.redemption`,result.redemption);savePrivate(`${noteFile}.pending`,{status:'confirmed'});
   console.info(`Anonymous gateway credential saved: ${noteFile}.redemption`);
  }else if(action==='withdraw'){
   const note=loadPrivate(noteFile) as PrivateState;savePrivate(`${noteFile}.pending`,{action,note});
   await client.withdraw(note);savePrivate(`${noteFile}.pending`,{status:'confirmed-withdrawal'});console.info('Principal withdrawn; this position note is spent');
  }
 }
}catch(e){console.error(e instanceof Error?e.message:'Operation failed');console.error('Keep any .pending journal: an interrupted transaction needs on-chain reconciliation before retrying.');process.exitCode=1;}
finally{await wallet.stop();}
