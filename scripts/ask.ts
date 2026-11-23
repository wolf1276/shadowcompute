import { WebSocket } from 'ws';
import { readFileSync,existsSync } from 'node:fs';
import pino from 'pino';
import { getConfig } from '../packages/backend/src/config.js';
import { startWallet } from '../packages/backend/src/wallet.js';
import { VaultClient,type CreditNote } from '../packages/backend/src/client.js';
import { loadPrivate,savePrivate } from '../packages/backend/src/notes.js';
import { bytes32 } from '../packages/contracts/contract/witnesses.js';
import type { Redemption } from '../packages/backend/src/gateway.js';
Object.assign(globalThis,{WebSocket});process.umask(0o077);
const file=process.argv[2];if(!file)throw new Error('Usage: printf prompt | npm run ask -- CREDIT_NOTE_FILE');
const prompt=readFileSync(0,'utf8').trim();if(!prompt||Buffer.byteLength(prompt)>16000)throw new Error('Prompt must contain 1–16000 bytes');
const receiptFile=file.endsWith('.redemption')?file:`${file}.redemption`;
const progress=(stage:string)=>{if(process.argv.includes('--progress'))console.info(JSON.stringify({type:'progress',stage}));};
let redemption:Redemption;
if(existsSync(receiptFile))redemption=loadPrivate(receiptFile) as Redemption;
else{
 if(existsSync(`${file}.pending`))throw new Error('An earlier redemption may have finalized. Preserve the pending journal and reconcile it before retrying; do not overwrite its bearer secret.');
 const network=process.env.MIDNIGHT_NETWORK??'local';if(!['local','preview'].includes(network))throw new Error('Test networks only');
 const config=getConfig(),manifest=JSON.parse(readFileSync(network==='local'?'artifacts/deployment.json':`artifacts/deployment.${network}.json`,'utf8'));
 progress('authorizing');
 const relay=await startWallet(pino({level:'warn'}),{...config,walletNetworkId:config.networkId},{network,role:'ALICE',faucet:config.faucet,syncTimeoutMs:900000});
 try{
  const credit=loadPrivate(file) as CreditNote,bearer=bytes32(),expires=BigInt(Math.floor(Date.now()/1000)+300);
  savePrivate(`${file}.pending`,{credit,bearer,expires,vault:manifest.address});
  const result=await new VaultClient(relay,config,manifest.address,'ask-relay').redeem(credit,bearer,expires,relay);
  redemption=result.redemption;savePrivate(receiptFile,redemption);savePrivate(`${file}.pending`,{status:'confirmed',txId:result.tx.public.txId});
 }finally{await relay.stop();}
}
const modelIndex=process.argv.indexOf('--model');const model=modelIndex<0?undefined:process.argv[modelIndex+1];if(modelIndex>=0&&(!model||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(model)))throw new Error('Invalid model selection');
const endpoint=process.env.GATEWAY_URL??'http://127.0.0.1:8787';
progress('requesting-ai');
const response=await fetch(`${endpoint}/v1/inference`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt,redemption,...(model?{model}:{})}),signal:AbortSignal.timeout(385000)});
const answer=await response.json() as {response?:string;error?:string;cached?:boolean;chargedCredits?:number};
if(!response.ok){console.error(answer.error??'Inference failed');console.error(`Keep ${receiptFile}; retry the identical prompt with this same credit, without another on-chain payment.`);process.exitCode=1;}
else if(process.argv.includes('--json')){console.info(JSON.stringify(answer));}
else{console.info(answer.response);console.info(`\nCredit cost: ${answer.chargedCredits}; cached retry: ${answer.cached}`);}
