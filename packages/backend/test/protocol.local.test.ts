import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import pino from 'pino';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-js';
import { Contract, ledger } from '../../contracts/contract/managed/smoke/contract/index.js';
import { startWallet, type MidnightWalletProvider } from '../src/wallet.js';
import { getConfig } from '../src/config.js';
import { buildProviders, ledgerState } from '../src/providers.js';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
Object.assign(globalThis, { WebSocket });
process.env.PRIVATE_STATE_PASSWORD ??= 'Local-Only-ShadowCompute-Password';
const logger = pino({level:'warn'});
const config = getConfig();
const path = fileURLToPath(new URL('../../contracts/contract/managed/smoke',import.meta.url));
const compiled = CompiledContract.make('Smoke',Contract).pipe(CompiledContract.withVacantWitnesses,CompiledContract.withCompiledFileAssets(path));
describe('real local Midnight proof and transaction',()=>{
 let wallet: MidnightWalletProvider;
 beforeAll(async()=>{ wallet=await startWallet(logger,{...config,walletNetworkId:config.networkId},{network:process.env.MIDNIGHT_NETWORK ?? 'local',role:'ALICE',faucet:config.faucet,syncTimeoutMs:180000}); });
 afterAll(async()=>{ await wallet?.stop(); });
 it('deploys and proves ping on the node',async()=>{
  const p=buildProviders(wallet,path,config);
  const deployed=await deployContract(p,{compiledContract:compiled});
  const address=deployed.deployTxData.public.contractAddress;
  const result=await submitCallTx(p,{compiledContract:compiled,contractAddress:address,circuitId:'ping'});
  expect(ledger(ledgerState(await p.publicDataProvider.queryContractState(address))).interactions).toBe(1n);
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/phase1.json',JSON.stringify({milestone:'phase1',contractAddress:address,txId:result.public.txId,at:new Date().toISOString()},null,2));
  console.info('Phase 1: deployed and finalized ping');
  let corrupted=0;
  const proxy=createServer(async(req,res)=>{
   const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
   const upstream=await fetch(config.proofServer+req.url,{method:'POST',headers:{'content-type':'application/octet-stream'},body:Buffer.concat(chunks)});
   const output=Buffer.from(await upstream.arrayBuffer());
   if(req.url==='/prove'&&upstream.ok&&output.length>64){output[output.length-64]^=1;corrupted++;}
   res.writeHead(upstream.status).end(output);
  });
  await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
  try{
   const bad=buildProviders(wallet,path,{...config,proofServer:`http://127.0.0.1:${(proxy.address() as {port:number}).port}`});
   await expect(submitCallTx(bad,{compiledContract:compiled,contractAddress:address,circuitId:'ping'})).rejects.toThrow();
   expect(corrupted).toBeGreaterThan(0);
   expect(ledger(ledgerState(await p.publicDataProvider.queryContractState(address))).interactions).toBe(1n);
   console.info('Phase 1: tampered proof response rejected, ledger unchanged');
  }finally{await new Promise<void>(r=>proxy.close(()=>r()));}
 });
});

import { mkdirSync,writeFileSync } from 'node:fs';
import { VaultClient,deployDemo,mintTestTokens } from '../src/client.js';
import { privateState,bytes32,pureCircuits } from '../../contracts/contract/index.js';
import { shieldedBalance,waitForShieldedBalance } from '../src/coins.js';
import { Gateway,MockAdapter } from '../src/gateway.js';
import { chainReceipts } from '../src/receipt-source.js';
import { assertNotInPublicState } from '../../contracts/sim.js';
import { server } from '../src/server.js';

describe('complete proof-backed ShadowCompute backend',()=>{
 let sponsor:MidnightWalletProvider,user:MidnightWalletProvider;
 beforeAll(async()=>{
  const env={...config,walletNetworkId:config.networkId};
  sponsor=await startWallet(logger,env,{network:'local',role:'ALICE',faucet:'',syncTimeoutMs:180000});
  user=await startWallet(logger,env,{network:'local',role:'BOB',faucet:'',syncTimeoutMs:180000});
 });
 afterAll(async()=>{await user?.stop();await sponsor?.stop();});
 it('mints, funds, deposits, privately claims/redeems, runs HTTP inference and withdraws principal',async()=>{
  const admin=privateState(),alice=privateState(),bob=privateState();
  const d=await deployDemo(sponsor,config,admin,sponsor);console.info('E2E: deployed token and vault');
  const owner=new VaultClient(user,config,d.address,'owner');
  const relay=new VaultClient(sponsor,config,d.address,'relay');
  await mintTestTokens(d,user,2000000n);await mintTestTokens(d,sponsor,20000n);
  await waitForShieldedBalance(user,d.color,2000000n);await waitForShieldedBalance(sponsor,d.color,20000n);
  const walletCoins=(await user.wallet.waitForSyncedState()).shielded.availableCoins.map(c=>Buffer.from(c.coin.nonce,'hex'));
  await relay.fundReserve();await relay.fundReserve();console.info('E2E: funded real shielded reward reserve');
  const depositTx=await owner.deposit(alice);await owner.deposit(bob);
  expect((await owner.read()).principal).toBe(2000000n);console.info('E2E: deposited two shielded lots');
  await expect(owner.withdraw({...alice,secret:bob.secret})).rejects.toThrow();
  await expect(owner.claim(alice)).rejects.toThrow(/Insufficient simulated yield/);
  await relay.advanceSimulation(admin,31536000n);
  const claim=await owner.claim(alice);console.info('E2E: proved private credit claim');
  await expect(owner.claim(alice)).rejects.toThrow(/already spent/);
  const tampered={...claim.next,carry:claim.next.carry+1n};await expect(owner.claim(tampered)).rejects.toThrow();
  const l=await relay.read();
  expect(l.allocated).toBe(10000n);expect(l.reserve).toBe(20000n);
  assertNotInPublicState(l,{admin:admin.secret,position:alice.secret,salt:alice.salt,nextSalt:alice.nextSalt,credit:claim.credit.secret,userWallet:Buffer.from(user.getCoinPublicKey(),'hex'),...Object.fromEntries(walletCoins.map((c,i)=>[`walletNonce${i}`,c]))});
  const bearer=bytes32();const expires=BigInt(Math.floor(Date.now()/1000)+300);
  await expect(relay.redeem({secret:bytes32()},bearer,expires,sponsor)).rejects.toThrow();
  const redeemed=await relay.redeem(claim.credit,bearer,expires,sponsor);console.info('E2E: separate relay redeemed credit with a real proof');
  await expect(relay.redeem(claim.credit,bearer,expires,sponsor)).rejects.toThrow(/already redeemed/);
  const gateway=new Gateway(chainReceipts(d.address,config.indexer,config.indexerWS,config.node),new MockAdapter(),':memory:');
  const app=server(gateway);await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));
  try{
   const port=(app.address() as {port:number}).port;
   const request=async(body:unknown)=>fetch(`http://127.0.0.1:${port}/v1/inference`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const bad=await request({prompt:'test',redemption:{...redeemed.redemption,bearer:Buffer.from(bytes32()).toString('hex')}});expect(bad.status).toBe(403);
   const body={prompt:'Explain private proof-backed AI credits in one sentence.',redemption:redeemed.redemption};
   const response=await request(body);expect(response.status).toBe(200);expect((await response.json() as {response:string}).response).toContain('OFFLINE MOCK');
   expect((await (await request(body)).json() as {cached:boolean}).cached).toBe(true);
   expect((await request({...body,prompt:'a different request'})).status).toBe(409);
  }finally{await new Promise<void>(r=>app.close(()=>r()));gateway.close();}
  await owner.withdraw(claim.next);await owner.withdraw(bob);
  await expect(owner.withdraw(bob)).rejects.toThrow();
  const final=await owner.read();expect(final.principal).toBe(0n);expect(final.allocated).toBe(0n);expect(final.reserve).toBe(10000n);expect(final.redeemed).toBe(1n);
  await waitForShieldedBalance(user,d.color,2000000n);
  expect(await shieldedBalance(sponsor,d.color)).toBe(10000n);
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/local-e2e.json',JSON.stringify({network:'undeployed',at:new Date().toISOString(),vault:d.address,token:d.tokenAddress,deployTx:d.deployTx,depositTx:depositTx.public.txId,claimTx:claim.tx.public.txId,redemptionTx:redeemed.tx.public.txId,realProofs:true,inference:'offline-mock',principalRestored:'2000000',remainingReserve:'10000'},null,2));
 });
});
