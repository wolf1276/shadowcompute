import {compactExample} from './compact-example.js';
export const setupSteps=['Connect wallet','Secure vault','Save backup','Deposit','Claim allowance','Use AI'];
export function onboardingState({connected=false,data=null,claimReady=false}={}){
 let index=0,action='wallet-connect',label='Connect wallet',description='Connect your Midnight wallet. It approves transactions; your vault unlock is separate.';
 if(connected){index=1;action='vault-password';label='Secure your vault';description='Create or unlock your vault. You can enable a passkey after unlocking; keep your recovery password.';}
 if(connected&&data){
  const active=data.positions.some(p=>p.status==='active'),allowance=data.credits.some(c=>c.onChain==='active'&&!c.receipt);
  if(allowance){index=5;action='terminal-tab';label='Build a contract';description='Your funded allowance is ready. Open the AI workspace.';}
  else if(active){index=4;action=claimReady?'vault-claim':'vault-refresh';label=claimReady?'Claim allowance':'Refresh position';description=claimReady?'Claim your funded allowance, then use it in the AI workspace.':'Waiting for claimable simulated yield and funded reserve. The demo operator advances time; your principal remains withdrawable.';}
  else if(data.setupBackupConfirmed||data.history.length){index=3;const hasAssetHistory=data.history.some(h=>['mint','deposit','withdraw'].includes(h.action));action=hasAssetHistory?'vault-deposit':'vault-mint';label=hasAssetHistory?'Deposit one lot':'Get test assets';description=hasAssetHistory?'Deposit one lot with your wallet, then save a new encrypted backup. Your wallet needs test DUST for fees.':'Get the supported test asset first. Then deposit one lot and save a new backup. Your wallet still needs test DUST for transaction fees.';}
  else{index=2;action='vault-backup';label='Download encrypted backup';description='Save your encrypted backup and recovery password. Back up again after every deposit or claim: this first backup cannot recover notes created later.';}
  if(data.pending){action='vault-reconcile';label='Check pending transaction';description='Your previous transaction may still complete. Check it before sending another.';}
 }
 return {index,action,label,description,complete:index===5&&!data?.pending,done:[connected,!!(connected&&data),!!data?.setupBackupConfirmed,!!data?.positions.length,!!data?.credits.length,!!data?.inferences?.some(r=>r.status==='done')]};
}
export function unlockPresentation({exists=false,hasPasskey=false,supported=false}={}){
 return {passkeyFirst:hasPasskey&&supported,showPasskey:hasPasskey,passwordOpen:!hasPasskey||!supported,passwordLabel:exists?'Use recovery password':'Create a password vault',submitLabel:exists?'Unlock with password':'Create vault',description:hasPasskey?(supported?'Unlock your vault using your device’s passkey. Your wallet still approves transactions.':'Passkey unlock is unavailable here. Use your recovery password.'):exists?'Enter your recovery password to unlock. You can enable a passkey after unlocking.':'Choose a recovery password to secure your private notes, then optionally enable a passkey.'};
}
export function inferenceExperience(adapter){
 if(adapter==='opencode-compact')return {compact:true,label:'Compact contract builder',placeholder:'Describe the Compact contract you want to build…',note:'Returns Compact source checked by the compiler. Review and test it before deployment.',suggestions:[{label:'Build a private budget',prompt:compactExample}]};
 if(adapter==='mock')return {compact:false,label:'Offline mock demo',placeholder:'Enter a test prompt…',note:'Offline mock responses only. No real model is running in this mode.',suggestions:[{label:'Try a demo request',prompt:'Show an example offline demo response.'}]};
 if(['provider','opencode'].includes(adapter))return {compact:false,label:'AI text assistant',placeholder:'Ask a question about your project…',note:'Text responses only. This assistant cannot access files or execute commands.',suggestions:[{label:'Understand private witnesses',prompt:'Explain private witnesses and public disclosures in Midnight Compact, with a short example.'},{label:'Plan a contract',prompt:'Outline the authorization and accounting checks for a private budget contract.'}]};
 return {compact:false,label:'Checking AI mode',placeholder:'Waiting for the configured AI mode…',note:'Reconnect to the gateway to load its capabilities.',suggestions:[]};
}
const stages={'preparing-payment':'Preparing stablecoin payment','source-approval':'Approve test-token allowance in your EVM wallet','source-payment':'Submitting the source-chain transaction','source-finality':'Checking finalized source payment','source-refund':'Releasing your unused-credit refund',unlocking:'Unlocking your vault','creating-passkey':'Waiting for passkey setup',starting:'Starting request', 'preparing-proof':'Preparing transaction and proof','wallet-approval':'Waiting for wallet approval','preparing-submission':'Preparing submission',submitting:'Submitting transaction',confirming:'Waiting for transaction confirmation','syncing-relay':'Connecting the allowance relay',balancing:'Balancing the allowance transaction',authorizing:'Authorizing private allowance','requesting-ai':'Requesting AI response'};
export function progressDescription(stage){return stages[stage]??'Checking operation status';}
export function elapsedLabel(startedAt,now=Date.now()){
 if(!Number.isFinite(startedAt))return '';
 const seconds=Math.max(0,Math.floor((now-startedAt)/1000));return seconds<60?`${seconds}s elapsed`:`${Math.floor(seconds/60)}m ${seconds%60}s elapsed`;
}
