import {openVaultStore,openVaultWithPasskey,vaultUnlockHint,acquireVaultLock} from './vault-store.js';
import {passkeyError} from './vault-passkey.js';
import {newCreditSeed,creditNote,creditBearer} from './prepaid-notes.js';
const $=id=>document.getElementById(id);
export function initPrepaid({api,wallet,network,onAllowance,onRequests,onBusy,onProgress,onBalance}){
 let store=null,config=null,busy=false,account='',release=null,restore=null,hint={},hintLayout='',evm='',backupOffered=false,version=0,startedAt=0;
 const message=text=>{$('prepaid-status').textContent=text;};
 const progress=stage=>onProgress?.({stage,startedAt});
 const scope=()=>`prepaid:${network()}:${config.vault}:${wallet().address}`;
 const post=(path,body)=>api('/api/prepaid/'+path,body);
 function render(){
  onBusy?.(busy);$('prepaid-unlock').hidden=!!store;$('prepaid-dashboard').hidden=!store;
  const supported=location.hostname==='localhost'&&globalThis.isSecureContext&&!!globalThis.PublicKeyCredential;
  $('prepaid-passkey').hidden=!hint.hasPasskey;$('prepaid-passkey').disabled=busy||!supported;
  const layout=JSON.stringify([hint,supported]);if(layout!==hintLayout){$('prepaid-password-choice').open=!hint.hasPasskey||!supported;hintLayout=layout;}
  $('prepaid-password').disabled=busy;$('prepaid-unlock-submit').disabled=busy;$('prepaid-restore').disabled=busy;
  if(!store)return;
  const notes=store.data.prepaidNotes??[],balance=notes.filter(n=>n.verified&&!n.spent).reduce((sum,n)=>sum+BigInt(n.note.balance),0n);
  $('prepaid-balance').textContent=balance.toString();$('prepaid-price').textContent=config?`${BigInt(config.source.creditPrice)/1000000n}.${String(BigInt(config.source.creditPrice)%1000000n).padStart(6,'0')} tUSD`:'—';
  $('prepaid-source').textContent=config?`Source: ${config.source.chainId===31337?'dedicated local test chain':'Sepolia'} · Treasury ${config.source.address}. Test tokens have no monetary value.`:'Reading treasury…';
  $('prepaid-test-tokens').hidden=config?.source.chainId!==31337;
  $('prepaid-evm-connect').textContent=evm?evm.slice(0,8)+'…'+evm.slice(-6):'Connect EVM wallet';
  for(const id of ['prepaid-buy','prepaid-refund','prepaid-evm-connect','prepaid-test-tokens','prepaid-enable-passkey','prepaid-refresh','prepaid-lock'])$(id).disabled=busy;
  $('prepaid-buy').disabled||=!!store.data.pending;$('prepaid-refund').disabled||=!!store.data.pending||balance===0n;
  $('prepaid-enable-passkey').disabled||=store.hasPasskey||!supported||!!store.data.pending;$('prepaid-enable-passkey').textContent=store.hasPasskey?'Passkey enabled':'Enable passkey unlock';
  $('prepaid-backup').disabled=busy;$('prepaid-resume').disabled=busy;$('prepaid-recover-source').disabled=busy;
  $('prepaid-pending').hidden=!store.data.pending;
  $('prepaid-confirm-backup').hidden=!(backupOffered&&store.data.pending?.kind==='payment'&&!store.data.pending.backupAcknowledged);$('prepaid-confirm-backup').disabled=busy;
  $('prepaid-pending-text').textContent=store.data.pending?.kind==='payment'&&!store.data.pending.backupAcknowledged?'Save the encrypted payment backup and recovery password before paying. It contains the private seed needed to claim and recover these credits.':'Keep this journal. Check the existing transaction before making another payment.';
  $('prepaid-history').replaceChildren(...store.data.history.slice().reverse().map(item=>{const row=document.createElement('div');row.className='vault-history-row';const label=document.createElement('span');label.textContent=item.action;const hash=document.createElement('code');hash.textContent=item.txId;row.append(label,hash);return row;}));
  onBalance?.({available:balance.toString(),purchased:store.data.prepaidPurchased??'0'});
  onAllowance?.(notes.map(n=>({id:n.id,status:n.verified&&!n.spent&&BigInt(n.note.balance)>0n&&!store.data.pending?'ready':'checking'})));
  onRequests?.(store.data.inferences??[]);
 }
 function lock(){version++;store?.close();release?.();store=null;release=null;account='';backupOffered=false;$('prepaid-password').value='';onAllowance?.(null);onRequests?.([]);onBalance?.({available:'0',purchased:'0'});render();void loadHint();}
 async function save(data){await store.save(data);render();}
 async function loadHint(){if(!config||!wallet())return;const address=wallet().address;try{const next=await vaultUnlockHint(localStorage,scope(),restore,location.hostname);if(!store&&wallet()?.address===address){hint=next;render();}}catch{message('Could not read credit-wallet metadata. Preserve your backup.');}}
 async function refresh(){
  try{config=await api('/api/prepaid/status');if(!store){await loadHint();render();return;}
   if(!busy){const opened=store,data=structuredClone(opened.data);for(const item of data.prepaidNotes??[]){const recovered=await post('recover',{seed:item.seed});if(opened!==store)return;if(recovered.claimed){item.note=recovered.note;item.sequence=recovered.sequence;item.spent=recovered.spent;item.verified=!recovered.spent;}else item.verified=false;}await save(data);}
   render();
  }catch{message('Could not verify the credit treasury. Preserve notes and retry when both test chains are available.');}
 }
 async function unlock(event,passkey=false){event?.preventDefault();if(busy)return;if(!wallet())return message('Connect your Midnight wallet first.');
  busy=true;startedAt=Date.now();progress('unlocking');render();const attempt=++version,address=wallet().address;let acquired;
  try{if(!config)throw new Error('Wait for the treasury to load.');acquired=await acquireVaultLock(navigator.locks,scope());const opened=passkey?await openVaultWithPasskey(localStorage,scope(),{rpId:location.hostname},restore):await openVaultStore(localStorage,$('prepaid-password').value,scope(),restore);
   if(attempt!==version||wallet()?.address!==address){opened.close();throw new Error('Wallet changed while unlocking.');}
   store=opened;release=acquired;acquired=null;account=address;restore=null;const data=structuredClone(store.data);data.prepaidNotes??=[];data.prepaidPurchased??='0';data.inferences??=[];
   for(const request of data.inferences)if(request.status==='working'){request.status='failed';request.error='Interrupted. Check pending spending, then retry the same model and prompt.';}
   await save(data);$('prepaid-password').value='';message('Credit wallet unlocked. Back up before paying; use the same model and prompt for a paid retry.');
  }catch(error){acquired?.();lock();message(passkey?passkeyError(error):error.message);}finally{busy=false;render();}
  if(store)await refresh();
 }
 async function sourceWallet(){
  if(!window.ethereum?.request)throw new Error('Open in a browser with an EVM wallet. Your Midnight wallet remains separate.');
  const accounts=await window.ethereum.request({method:'eth_requestAccounts'});if(!/^0x[0-9a-f]{40}$/i.test(accounts?.[0]))throw new Error('No EVM account available');evm=accounts[0];
  const chainId='0x'+config.source.chainId.toString(16),current=await window.ethereum.request({method:'eth_chainId'});
  if(current.toLowerCase()!==chainId){try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}catch(error){if(error.code!==4902||config.source.chainId!==31337)throw error;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:'ShadowCompute local testnet',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:[config.source.rpc]}]});}}
  if((await window.ethereum.request({method:'eth_chainId'})).toLowerCase()!==chainId)throw new Error('Wrong source network');render();return evm;
 }
 async function sourceTransaction(call){if(!/^0x[0-9a-f]{40}$/i.test(call.to)||!/^0x([0-9a-f]{2})+$/i.test(call.data))throw new Error('Invalid payment call');const from=await sourceWallet();return window.ethereum.request({method:'eth_sendTransaction',params:[{from,to:call.to,data:call.data,value:'0x0'}]});}
 async function waitSource(hash){const end=Date.now()+120000;while(Date.now()<end){const receipt=await window.ethereum.request({method:'eth_getTransactionReceipt',params:[hash]});if(receipt){if(receipt.status!=='0x1')throw new Error('Source transaction reverted; keep the existing journal.');return;}await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error('Source confirmation is taking longer. Keep the saved transaction hash.');}
 async function start(action,extra){const body={action,...extra};if(['claim-payment','spend-credit','refund-credits'].includes(action)){if(!wallet()||wallet().address!==account||(await wallet().api.getUnshieldedAddress()).unshieldedAddress!==account)throw new Error('Reconnect the original Midnight wallet.');body.keys=await wallet().api.getShieldedAddresses();}
  const job=await post('start',body);const data=structuredClone(store.data);data.pending.operationId=job.id;await save(data);return drive(job.id);
 }
 async function drive(id){const end=Date.now()+900000;while(Date.now()<end){const job=await post('poll',{id});progress(job.stage);if(job.txId&&store.data.pending.txId!==job.txId){const data=structuredClone(store.data);data.pending.txId=job.txId;await save(data);}if(job.status==='done')return job.result;if(job.status==='failed')throw new Error(job.error);
   if(job.request){const data=structuredClone(store.data),pending=data.pending;pending.handledRequests??=[];if(pending.handledRequests.includes(job.request.id))throw new Error('An approval may already have completed. Check the existing operation.');pending.handledRequests.push(job.request.id);await save(data);let value,error=false;
    try{if(!wallet()||wallet().address!==account||(await wallet().api.getUnshieldedAddress()).unshieldedAddress!==account)throw new Error('Wallet changed');value=job.request.method==='balanceUnsealedTransaction'?await wallet().api.balanceUnsealedTransaction(job.request.tx):await wallet().api.submitTransaction(job.request.tx);}catch{error=true;}
    await post('reply',{id,requestId:job.request.id,value:value??null,error});}
   await new Promise(resolve=>setTimeout(resolve,800));
  }throw new Error('Operation still pending. Preserve its journal and check again.');
 }
 function history(data,action,txId){if(txId&&!data.history.some(item=>item.txId===txId))data.history.push({action,txId,at:new Date().toISOString()});}
 async function recoverFinal(seed,minSequence=0){const end=Date.now()+45000;while(Date.now()<end){const recovered=await post('recover',{seed});if(recovered.claimed&&recovered.sequence>=minSequence)return recovered;progress('confirming');await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error('Midnight finality is still catching up. Preserve this journal and check again.');}
 async function finishPayment(result={}){const latest=await recoverFinal(store.data.pending.seed);result={...result,...latest};const data=structuredClone(store.data),pending=data.pending;if(!data.prepaidNotes.some(item=>item.id===pending.noteId)){data.prepaidNotes.push({id:pending.noteId,seed:pending.seed,note:result.note??pending.note,sequence:result.sequence??0,verified:!result.spent,spent:!!result.spent,sourceTx:pending.sourceTx,depositId:pending.depositId});data.prepaidPurchased=String(BigInt(data.prepaidPurchased)+BigInt(pending.seed.units));}history(data,'Credits purchased',result.txId??pending.txId);data.pending=result.refunded?{kind:'refund',noteId:pending.noteId,note:result.note,id:result.id,phase:'release-refund',handledRequests:[]}:null;await save(data);message('Credits claimed on Midnight. Choose a model in the AI workspace. Download a current backup.');}
 async function continuePayment(){
  let pending=store.data.pending;if(!pending.backupAcknowledged)return message('Download the encrypted payment backup, then confirm you saved it and the recovery password.');
  if(!pending.sourceTx){progress('preparing-payment');const quote=await post('payment',{note:pending.note});if(quote.existingSourceTx){const data=structuredClone(store.data);data.pending.sourceTx=quote.existingSourceTx;await save(data);}
   else{if(pending.sourceSubmitting)throw new Error('Payment may have submitted. Recover its existing hash; do not pay again.');if(quote.chainId!==config.source.chainId||quote.approve.to.toLowerCase()!==config.source.asset.toLowerCase()||quote.deposit.to.toLowerCase()!==config.source.address.toLowerCase())throw new Error('Payment target changed');
    await sourceWallet();progress('source-approval');const approval=await sourceTransaction(quote.approve);const approved=structuredClone(store.data);approved.pending.approveTx=approval;await save(approved);await waitSource(approval);
    const data=structuredClone(store.data);data.pending.sourceSubmitting=true;await save(data);progress('source-payment');
    try{const hash=await sourceTransaction(quote.deposit);const submitted=structuredClone(store.data);submitted.pending.sourceTx=hash;await save(submitted);}catch(error){if(error.code===4001){const declined=structuredClone(store.data);declined.pending.sourceSubmitting=false;await save(declined);}throw error;}
   }}
  pending=store.data.pending;if(!pending.depositId){progress('source-finality');const quote=await post('payment',{note:pending.note});const approved=await start('authorize-payment',{sourceTx:pending.sourceTx,expectedCommitment:quote.commitment});const data=structuredClone(store.data);data.pending.depositId=approved.depositId.slice(2);delete data.pending.operationId;data.pending.handledRequests=[];await save(data);}
  const recovered=await post('recover',{seed:store.data.pending.seed});if(recovered.claimed){await finishPayment(recovered);return;}
  const claimed=await start('claim-payment',{depositId:store.data.pending.depositId,note:store.data.pending.note});await finishPayment(claimed);
 }
 async function resume(){if(!store?.data.pending||busy)return;busy=true;startedAt=Date.now();progress('confirming');render();try{
  const pending=store.data.pending;if(pending.operationId){let job;try{job=await post('poll',{id:pending.operationId});}catch{}
   if(job?.status==='working'){const result=await drive(job.id);await finishPending(result);return;}
   if(job?.status==='done'){await finishPending(job.result);return;}
  }
  if(pending.kind==='payment'){await continuePayment();return;}
  const check=await post('reconcile',{note:pending.note});if(pending.kind==='spend'&&check.receipt){await finishSpend({id:check.id,redemption:{nullifier:check.id,bearer:pending.bearer}});return;}
  if(pending.kind==='refund'&&check.refund){await releaseRefund(check.id);return;}
  throw new Error('No expected finalized outcome yet. Keep the journal and check again; no replacement was sent.');
 }catch(error){message(error.message);}finally{busy=false;render();}}
 async function finishPending(result){const pending=store.data.pending;if(pending.kind==='payment'){if(!pending.depositId){const data=structuredClone(store.data);data.pending.depositId=result.depositId.slice(2);delete data.pending.operationId;data.pending.handledRequests=[];await save(data);await continuePayment();}else await finishPayment(result);}else if(pending.kind==='spend')await finishSpend(result);else if(pending.kind==='refund'){if(pending.phase==='release-refund')await finishRefundRelease(result);else await releaseRefund(result.id??pending.id,result);}}
 async function buy(){if(!store||busy||store.data.pending)return;try{const seed=newCreditSeed($('prepaid-quantity').value),note=await creditNote(seed);const data=structuredClone(store.data);data.pending={kind:'payment',seed,note,noteId:crypto.randomUUID(),handledRequests:[],backupAcknowledged:false};backupOffered=false;await save(data);message('Download your encrypted payment backup before continuing. It contains the private credit recovery seed.');}catch(error){message(error.message);}}
 async function finishSpend(result){const pendingBefore=store.data.pending,itemBefore=store.data.prepaidNotes.find(item=>item.id===pendingBefore.noteId),latest=await recoverFinal(itemBefore.seed,pendingBefore.sequence+1);const data=structuredClone(store.data),pending=data.pending,item=data.prepaidNotes.find(note=>note.id===pending.noteId),request=data.inferences.find(entry=>entry.id===pending.requestId);item.note=latest.note;item.sequence=latest.sequence;item.verified=!latest.spent;item.spent=latest.spent;request.redemption=result.redemption??{nullifier:result.id,bearer:pending.bearer};request.status='failed';request.error='Credit authorized. Continue the same model and prompt to request or recover the answer.';history(data,'Request authorized',result.txId??pending.txId);data.pending=latest.refunded?{kind:'refund',noteId:pending.noteId,note:latest.note,id:latest.id,phase:'release-refund',handledRequests:[]}:null;await save(data);}
 async function infer(noteId,prompt,model,requestId){
  if(!store||busy||store.data.pending)throw new Error('Unlock credits and finish any pending operation first.');
  let request=requestId?store.data.inferences.find(entry=>entry.id===requestId):null;if(request&&(request.prompt!==prompt||request.model!==model))throw new Error('Keep the original model and prompt for this paid request.');if(request?.status==='done')return request.answer;
  busy=true;startedAt=Date.now();progress('authorizing');render();
  try{
   if(!request){const item=store.data.prepaidNotes.find(entry=>entry.id===noteId&&entry.verified&&!entry.spent&&BigInt(entry.note.balance)>0n);if(!item)throw new Error('No verified prepaid balance. Refresh credits.');
    const id=crypto.randomUUID(),data=structuredClone(store.data);request={id,credit:noteId,prompt,...(model?{model}:{}),status:'working',startedAt};data.inferences.push(request);data.pending={kind:'spend',noteId,note:item.note,next:await creditNote(item.seed,item.sequence+1),sequence:item.sequence,bearer:await creditBearer(item.seed,item.sequence),requestId:id,handledRequests:[]};await save(data);onRequests?.(store.data.inferences,id);const spent=await start('spend-credit',{note:item.note,bearer:store.data.pending.bearer});await finishSpend(spent);request=store.data.inferences.find(entry=>entry.id===id);
   }
   if(!request.redemption)throw new Error('Check the existing pending authorization before retrying.');const data=structuredClone(store.data),entry=data.inferences.find(item=>item.id===request.id);entry.status='working';delete entry.error;await save(data);onRequests?.(store.data.inferences,request.id);progress('requesting-ai');
   const answer=await post('inference',{prompt:request.prompt,...(request.model?{model:request.model}:{}),redemption:request.redemption});const finished=structuredClone(store.data),done=finished.inferences.find(item=>item.id===request.id);done.status='done';done.answer=answer;await save(finished);onRequests?.(store.data.inferences,request.id);return answer;
  }catch(error){if(store){const data=structuredClone(store.data),entry=data.inferences.find(item=>item.id===(request?.id??store.data.pending?.requestId));if(entry){entry.status='failed';entry.error=error.message;await save(data);onRequests?.(store.data.inferences,entry.id);}}throw error;}finally{busy=false;render();}
 }
 async function finishRefundRelease(result){const finished=structuredClone(store.data);history(finished,'Unused credit refund confirmed',result.sourceTx);finished.pending=null;await save(finished);message('Refund confirmed in the EVM treasury. Unspent test-token value was released to the chosen wallet.');}
 async function releaseRefund(id,result={}){const data=structuredClone(store.data),pending=data.pending;pending.id=id;pending.phase='release-refund';delete pending.operationId;pending.handledRequests=[];const item=data.prepaidNotes.find(note=>note.id===pending.noteId);item.spent=true;item.verified=false;history(data,'Unused credits burned for refund',result.txId??pending.txId);await save(data);progress('source-refund');const released=await start('release-refund',{id});await finishRefundRelease(released);}
 async function refund(){if(!store||busy||store.data.pending)return;busy=true;startedAt=Date.now();progress('preparing-proof');render();try{const recipient=await sourceWallet(),item=store.data.prepaidNotes.find(note=>note.verified&&!note.spent&&BigInt(note.note.balance)>0n);if(!item)throw new Error('No refundable private balance.');const data=structuredClone(store.data);data.pending={kind:'refund',noteId:item.id,note:item.note,recipient,handledRequests:[]};await save(data);const result=await start('refund-credits',{note:item.note,recipient});await releaseRefund(result.id,result);}catch(error){message(error.message);}finally{busy=false;render();}}
 $('prepaid-unlock-form').onsubmit=event=>unlock(event);$('prepaid-passkey').onclick=()=>unlock(null,true);$('prepaid-lock').onclick=lock;$('prepaid-refresh').onclick=refresh;$('prepaid-buy').onclick=buy;$('prepaid-resume').onclick=resume;$('prepaid-refund').onclick=refund;
 $('prepaid-evm-connect').onclick=async()=>{try{await sourceWallet();message('EVM wallet connected on the source test network.');}catch(error){message(error.message);}};
 $('prepaid-test-tokens').onclick=async()=>{if(busy)return;busy=true;startedAt=Date.now();progress('source-payment');render();try{const recipient=await sourceWallet();const result=await post('test-funds',{recipient});message(`Local test tokens and gas supplied. Transaction ${result.sourceTx}`);}catch(error){message(error.message);}finally{busy=false;render();}};
 $('prepaid-enable-passkey').onclick=async()=>{if(!store||busy)return;busy=true;startedAt=Date.now();progress('creating-passkey');render();try{await store.enablePasskey({rpId:location.hostname});message('Passkey enabled. Keep the recovery password and download a current backup.');}catch(error){message(passkeyError(error));}finally{busy=false;render();}};
 $('prepaid-backup').onclick=()=>{if(!store||busy)return;const url=URL.createObjectURL(new Blob([store.backup()],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`shadowcompute-prepaid-${network()}-encrypted.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);backupOffered=true;render();};
 $('prepaid-confirm-backup').onclick=async()=>{if(!store||busy||!backupOffered||store.data.pending?.kind!=='payment')return;const data=structuredClone(store.data);data.pending.backupAcknowledged=true;await save(data);await resume();};
 $('prepaid-restore').onchange=async event=>{try{const file=event.target.files[0];if(file?.size>2000000)throw new Error('Backup too large');restore=file?await file.text():null;await loadHint();message('Backup selected. Unlock with the original password or passkey, wallet and hostname.');}catch(error){message(error.message);}};
 $('prepaid-recover-source').onclick=async()=>{if(!store||busy||store.data.pending?.kind!=='payment')return;const hash=$('prepaid-source-hash').value.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash))return message('Enter the existing treasury payment hash from your EVM wallet.');const quote=await post('payment',{note:store.data.pending.note});if(quote.existingSourceTx&&quote.existingSourceTx.toLowerCase()!==hash.toLowerCase())return message('That hash does not match this private payment commitment.');const data=structuredClone(store.data);data.pending.sourceTx=hash;data.pending.backupAcknowledged=true;await save(data);await resume();};
 window.addEventListener('pagehide',lock);
 return {open:refresh,walletChanged:lock,infer,render};
}
