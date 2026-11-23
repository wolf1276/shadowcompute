import {privateKeyToAccount} from 'viem/accounts';
import type {Hex} from 'viem';

export function previewDeploymentConfig(env:NodeJS.ProcessEnv){
 const missing=['SEPOLIA_RPC_URL','EVM_RELAY_PRIVATE_KEY','MIDNIGHT_PREVIEW_ALICE_SEED','PRIVATE_STATE_PASSWORD'].filter(key=>!env[key]?.trim());
 if(missing.length)throw new Error(`Missing local configuration: ${missing.join(', ')}. Never paste secrets into chat.`);
 const url=new URL(env.SEPOLIA_RPC_URL!);
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('Sepolia RPC must use HTTPS without URL user credentials');
 if(!/^0x[0-9a-f]{64}$/i.test(env.EVM_RELAY_PRIVATE_KEY!))throw new Error('Invalid EVM relay private key');
 if(!/^[0-9a-f]{64}$/i.test(env.MIDNIGHT_PREVIEW_ALICE_SEED!))throw new Error('Expected existing Preview seed as 32-byte hex');
 if(env.PRIVATE_STATE_PASSWORD!.length<16)throw new Error('Private-state password must contain at least 16 characters');
 if(env.MIDNIGHT_NETWORK!=='preview')throw new Error('Deployment requires MIDNIGHT_NETWORK=preview');
 const account=privateKeyToAccount(env.EVM_RELAY_PRIVATE_KEY as Hex);
 return {rpc:url.href,account,chainId:11155111 as const};
}

export function relayJournalDirectory(network:string,address:string){
 if(!/^[a-f0-9]{64}$/.test(address)||!['local','preview'].includes(network))throw new Error('Invalid relay journal scope');
 // Keep existing local recovery files in place; Preview must never share them.
 return network==='local'?'.private-states/prepaid-relay':`.private-states/prepaid-relay-preview-${address}`;
}
