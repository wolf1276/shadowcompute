import {createPublicClient,createWalletClient,http,parseAbi,type Abi,type Address,type Hex} from 'viem';
import {readFileSync,existsSync,renameSync,mkdirSync} from 'node:fs';
import {WebSocket} from 'ws';
import pino from 'pino';
import {savePrivate} from '../packages/backend/src/notes.js';
import {LOCAL_CONFIG} from '../packages/backend/src/config.js';
import {startWallet} from '../packages/backend/src/wallet.js';
import {deployPrepaid} from '../packages/backend/src/prepaid-client.js';
import {bytes32} from '../packages/contracts/contract/witnesses.js';
import {finalizedPrepaid} from '../packages/backend/src/prepaid-relay.js';
import {treasuryAbi,CreditTreasury,type TreasuryConfig} from '../packages/backend/src/credit-treasury.js';
Object.assign(globalThis,{WebSocket});process.umask(0o077);
const file='artifacts/deployment.prepaid.local.json',journal='.private-states/prepaid-deploy.pending',issuerFile='.private-states/prepaid-issuer.json';
if(existsSync(file)||existsSync(journal)||existsSync(issuerFile)){
 if(!process.argv.includes('--replace-empty-test-deployment')||!existsSync(file))throw new Error('Prepaid deployment or recovery state exists; preserve it and reconcile before another deployment');
 const previous=JSON.parse(readFileSync(file,'utf8'));const old=new CreditTreasury(previous.source);await old.verify();
 const [liability,revenue,state]=await Promise.all([old.public.readContract({address:old.config.address,abi:treasuryAbi,functionName:'refundableCredits'}),old.public.readContract({address:old.config.address,abi:treasuryAbi,functionName:'earnedRevenue'}),finalizedPrepaid(previous.address,LOCAL_CONFIG)]);
 if(liability!==0n||revenue!==0n||state.pendingUnits!==0n||state.outstandingUnits!==0n||state.consumedUnits!==0n||state.refundedUnits!==0n)throw new Error('Cannot replace a used or funded bridge');
 const archive=`.private-states/prepaid-empty-archive-${Date.now()}`;mkdirSync(archive,{mode:0o700});
 for(const path of [file,journal,issuerFile])if(existsSync(path))renameSync(path,`${archive}/${path.split('/').at(-1)}`);
}
const rpc='http://127.0.0.1:18545',chain={id:31337,name:'ShadowCompute local testnet',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}};
const read=createPublicClient({transport:http(rpc)});if(await read.getChainId()!==31337)throw new Error('Expected dedicated local Anvil chain');
const accounts=await createWalletClient({transport:http(rpc)}).getAddresses();if(accounts.length<3)throw new Error('Dedicated Anvil accounts required');
const wallet=createWalletClient({account:accounts[0],chain,transport:http(rpc)});
const artifact=(path:string)=>JSON.parse(readFileSync(path,'utf8')) as {abi:Abi;bytecode:{object:Hex}};
const stable=artifact('packages/bridge-evm/out/CreditTreasury.t.sol/TestStable.json'),treasury=artifact('packages/bridge-evm/out/CreditTreasury.sol/CreditTreasury.json');
savePrivate(journal,{status:'prepared'});
const tokenHash=await wallet.deployContract({abi:stable.abi,bytecode:stable.bytecode.object});savePrivate(journal,{status:'token-submitted',hash:tokenHash});const tokenReceipt=await read.waitForTransactionReceipt({hash:tokenHash});if(!tokenReceipt.contractAddress)throw new Error('Test token deployment failed');const asset=tokenReceipt.contractAddress;
const treasuryHash=await wallet.deployContract({abi:treasury.abi,bytecode:treasury.bytecode.object,args:[asset,10000n,accounts[0],accounts[2]]});savePrivate(journal,{status:'treasury-submitted',hash:treasuryHash,asset});const treasuryReceipt=await read.waitForTransactionReceipt({hash:treasuryHash});if(!treasuryReceipt.contractAddress)throw new Error('Treasury deployment failed');const address=treasuryReceipt.contractAddress;
const secret=bytes32();savePrivate(issuerFile,{secret});
const midnight=await startWallet(pino({level:'warn'}),{...LOCAL_CONFIG,walletNetworkId:LOCAL_CONFIG.networkId},{network:'local',role:'ALICE',faucet:'',syncTimeoutMs:180000});
try{
 const deployment=await deployPrepaid(midnight,LOCAL_CONFIG,secret,{chain:31337n,treasury:Buffer.from(address.slice(2),'hex'),asset:Buffer.from(asset.slice(2),'hex'),creditPrice:10000n});
 const bridge=deployment.deployTxData.public.contractAddress,hash=await wallet.writeContract({address,abi:treasuryAbi,functionName:'initializeBridge',args:[`0x${bridge}`]});savePrivate(journal,{status:'link-submitted',hash,asset,address,bridge});await read.waitForTransactionReceipt({hash});
 const source:TreasuryConfig={rpc,chainId:31337,address,asset,bridge:`0x${bridge}`,creditPrice:'10000',decimals:6,deploymentBlock:treasuryReceipt.blockNumber.toString(),relay:accounts[0]};await new CreditTreasury(source).verify();
 const mint=await wallet.writeContract({address:asset,abi:parseAbi(['function mint(address,uint256)']),functionName:'mint',args:[accounts[1],100000000n]});await read.waitForTransactionReceipt({hash:mint});
 const manifest={kind:'prepaid',network:'local',address:bridge,source,sourceDeployTx:treasuryHash,midnightDeployTx:deployment.deployTxData.public.txId,testAsset:'Valueless local ERC20; not native USDC',at:new Date().toISOString()};
 savePrivate(file,manifest);savePrivate(journal,{status:'confirmed',manifest:file});
 const lines=['FUNDING_MODE=prepaid','MIDNIGHT_NETWORK=local',`VAULT_ADDRESS=${bridge}`,'PREPAID_MANIFEST=artifacts/deployment.prepaid.local.json','PORT=8789','GATEWAY_DB=.private-states/prepaid-gateway.db','GATEWAY_URL=http://127.0.0.1:8789','TERMINAL_PORT=8792','AI_ADAPTER=opencode-compact','MODEL_CATALOG=config/models.local.json','LOCAL_OLLAMA_KEY=ollama-local-no-key-required'];
 const {writeFileSync}=await import('node:fs');writeFileSync('.env.prepaid',lines.join('\n')+'\n',{mode:0o600});
 console.log(JSON.stringify({network:'local',treasury:address,midnightBridge:bridge,sourceToken:asset,manifest:file}));
}finally{await midnight.stop();}
