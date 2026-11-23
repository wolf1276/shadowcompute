import {existsSync,readFileSync,writeFileSync,mkdirSync,openSync,closeSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,parseAbi,type Abi,type Hex} from 'viem';
import {WebSocket} from 'ws';
import pino from 'pino';
import {previewDeploymentConfig} from '../packages/backend/src/prepaid-deployment.js';
import {savePrivate} from '../packages/backend/src/notes.js';
import {PREVIEW_CONFIG} from '../packages/backend/src/config.js';
import {startWallet} from '../packages/backend/src/wallet.js';
import type {WalletConnection} from '../packages/backend/src/providers.js';
import {deployPrepaid} from '../packages/backend/src/prepaid-client.js';
import {bytes32} from '../packages/contracts/contract/witnesses.js';
import {CreditTreasury,treasuryAbi,type TreasuryConfig} from '../packages/backend/src/credit-treasury.js';
Object.assign(globalThis,{WebSocket});process.umask(0o077);
const manifestFile='artifacts/deployment.prepaid.preview.json',journal='.private-states/prepaid-preview-deploy.pending',issuerFile='.private-states/prepaid-issuer.preview.json';
const reportFile='artifacts/prepaid-preview-preflight.json';
async function main(){
 let config:ReturnType<typeof previewDeploymentConfig>;
 try{config=previewDeploymentConfig(process.env);}catch(error){
  const report={at:new Date().toISOString(),ready:false,submittedTransactions:0,blocker:(error as Error).message};savePrivate(reportFile,report);console.log(JSON.stringify(report,null,2));process.exitCode=1;return;
 }
 const read=createPublicClient({transport:http(config.rpc,{timeout:15000})});
 if(await read.getChainId()!==11155111)throw new Error('Wrong source chain; no deployment submitted');
 const balance=await read.getBalance({address:config.account.address});
 const report={at:new Date().toISOString(),ready:balance>0n,sourceChainId:11155111,network:'preview',deployer:config.account.address,testEthWei:balance.toString(),submittedTransactions:0,existingState:[manifestFile,journal,issuerFile].filter(existsSync)};
 savePrivate(reportFile,report);console.log(JSON.stringify(report,null,2));
 if(process.argv.includes('--check'))return;
 if(process.env.ALLOW_PUBLIC_TEST_DEPLOY!=='yes')throw new Error('Set ALLOW_PUBLIC_TEST_DEPLOY=yes for public test submission');
 if(balance===0n)throw new Error('Existing Sepolia deployer has no test gas');
 if(report.existingState.length)throw new Error('Existing Preview deployment/recovery state: reconcile; never overwrite or blindly redeploy');
 if(existsSync('.env.prepaid.preview.runtime'))throw new Error('Preview runtime configuration already exists');
 const artifact=(path:string)=>JSON.parse(readFileSync(path,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
 const tokenArtifact=artifact('packages/bridge-evm/out/CreditTreasury.t.sol/TestStable.json'),treasuryArtifact=artifact('packages/bridge-evm/out/CreditTreasury.sol/CreditTreasury.json');
 const chain={id:11155111,name:'Sepolia',nativeCurrency:{name:'Sepolia Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[config.rpc]}}};
 const wallet=createWalletClient({account:config.account,chain,transport:http(config.rpc)});
 // Sync the already-funded Preview wallet before creating any source contracts.
 const midnight=await startWallet(pino({level:'warn'}),{...PREVIEW_CONFIG,walletNetworkId:'preview'},{network:'preview',role:'ALICE',faucet:'',syncTimeoutMs:900000});
 try{
  mkdirSync('.private-states',{recursive:true,mode:0o700});closeSync(openSync(journal,'wx',0o600));
  const state:Record<string,unknown>={status:'prepared',network:'preview',sourceChain:11155111,deployer:config.account.address};
  const checkpoint=(status:string,extra:Record<string,unknown>={})=>{Object.assign(state,{status},extra);savePrivate(journal,state);};
  // Persist a signed source transaction BEFORE broadcast. A lost response retains
  // the exact bytes/hash for reconciliation, never a replacement payment.
  async function send(label:string,input:Parameters<typeof wallet.prepareTransactionRequest>[0]){
   const request=await wallet.prepareTransactionRequest(input);
   const raw=await wallet.signTransaction(request);checkpoint(`${label}-signed`,{[`${label}Raw`]:raw});
   const hash=await read.sendRawTransaction({serializedTransaction:raw});checkpoint(`${label}-submitted`,{[`${label}Hash`]:hash});
   const receipt=await read.waitForTransactionReceipt({hash,timeout:180000});if(receipt.status!=='success')throw new Error(`${label} reverted`);return receipt;
  }
  const {encodeDeployData,encodeFunctionData}=await import('viem');
  const token=await send('token',{data:encodeDeployData({abi:tokenArtifact.abi,bytecode:tokenArtifact.bytecode.object})});if(!token.contractAddress)throw new Error('Missing token deployment address');const asset=token.contractAddress;checkpoint('token-confirmed',{asset});
  const treasury=await send('treasury',{data:encodeDeployData({abi:treasuryArtifact.abi,bytecode:treasuryArtifact.bytecode.object,args:[asset,10000n,config.account.address,config.account.address]})});if(!treasury.contractAddress)throw new Error('Missing treasury address');const address=treasury.contractAddress;checkpoint('treasury-confirmed',{treasury:address});
  const secret=bytes32();savePrivate(issuerFile,{secret});checkpoint('midnight-deployment-pending');
  const recordedWallet:WalletConnection={getCoinPublicKey:()=>midnight.getCoinPublicKey(),getEncryptionPublicKey:()=>midnight.getEncryptionPublicKey(),balanceTx:tx=>midnight.balanceTx(tx),submitTx:async tx=>{checkpoint('midnight-signed',{midnightRaw:Buffer.from(tx.serialize()).toString('hex')});const id=await midnight.submitTx(tx);checkpoint('midnight-submitted',{midnightSubmittedId:id});return id;}};
  const deployed=await deployPrepaid(recordedWallet,PREVIEW_CONFIG,secret,{chain:11155111n,treasury:Buffer.from(address.slice(2),'hex'),asset:Buffer.from(asset.slice(2),'hex'),creditPrice:10000n});
  const bridge=deployed.deployTxData.public.contractAddress;checkpoint('midnight-confirmed',{bridge,midnightDeployTx:deployed.deployTxData.public.txId});
  await send('link',{to:address,data:encodeFunctionData({abi:treasuryAbi,functionName:'initializeBridge',args:[`0x${bridge}`]})});
  const source:TreasuryConfig={rpc:config.rpc,chainId:11155111,address,asset,bridge:`0x${bridge}`,creditPrice:'10000',decimals:6,deploymentBlock:treasury.blockNumber.toString(),relay:config.account.address};
  const service=new CreditTreasury(source);await service.verify();
  const manifest={kind:'prepaid',network:'preview',address:bridge,source,sourceDeployTx:treasury.transactionHash,midnightDeployTx:deployed.deployTxData.public.txId,testAsset:'Valueless Sepolia demo ERC20; unrestricted mint; not USDC',at:new Date().toISOString()};
  // Never publish provider URL credentials from a private RPC configuration.
  savePrivate('.private-states/deployment.prepaid.preview.json',manifest);
  savePrivate(manifestFile,{...manifest,source:{...source,rpc:'CONFIGURE_PRIVATE_SEPOLIA_RPC'}});
  const runtime=['FUNDING_MODE=prepaid','MIDNIGHT_NETWORK=preview',`VAULT_ADDRESS=${bridge}`,'PREPAID_MANIFEST=.private-states/deployment.prepaid.preview.json',`PREPAID_ISSUER_FILE=${issuerFile}`,'PORT=8793','GATEWAY_DB=.private-states/prepaid-preview-gateway.db','GATEWAY_URL=http://127.0.0.1:8793','TERMINAL_PORT=8794','MODEL_CATALOG=config/models.local.json','AI_ADAPTER=opencode-compact','LOCAL_OLLAMA_KEY=ollama-local-no-key-required'];
  writeFileSync('.env.prepaid.preview.runtime',runtime.join('\n')+'\n',{mode:0o600,flag:'wx'});checkpoint('confirmed',{manifest:manifestFile});
  console.log(JSON.stringify({network:'preview',treasury:address,midnightBridge:bridge,asset,manifest:manifestFile}));
 }finally{await midnight.stop();}
}
main().catch(()=>{console.error('Preview deployment stopped. Preserve the private journal and inspect/reconcile the last transaction before retrying. No automatic redeployment was attempted.');process.exitCode=1;});
