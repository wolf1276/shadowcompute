import {onboardingState,unlockPresentation} from './experience.js';
import {passkeyError} from './vault-passkey.js';
import {openVaultStore,openVaultWithPasskey,vaultUnlockHint,newPosition,nextPosition,randomSecret,earnedYield,acquireVaultLock} from './vault-store.js';
const $=id=>document.getElementById(id);
export function initVault({api,wallet,network,onAllowance,onRequests,onBusy,onSetup,onProgress}){
 let store=null,account='',config=null,busy=false,restore=null,releaseStoreLock=null,unlockVersion=0,unlockHint={},passwordLayout='',backupOffered=false,progressStartedAt=0;
 const feedback=message=>{$('vault-status').textContent=message;};
 const current=()=>wallet()?.address;
 function progress(stage,startedAt=progressStartedAt){onProgress?.({stage,startedAt});}
 function beginProgress(stage){progressStartedAt=Date.now();progress(stage);}
 async function refreshUnlockHint(){
  const address=current();if(!address||!config){unlockHint={};render();return;}
  try{const hint=await vaultUnlockHint(localStorage,`${network()}:${config.vault}:${address}`,restore,location.hostname);if(current()===address&&!store){unlockHint=hint;render();}}catch{unlockHint={};render();}
 }
 function lock(){unlockVersion++;store?.close?.();releaseStoreLock?.();releaseStoreLock=null;store=null;account='';backupOffered=false;$('vault-password').value='';render();onAllowance?.(null);onRequests?.([]);onBusy?.(false);void refreshUnlockHint();}
 function render(){
  if(account&&account!==current()){store?.close?.();releaseStoreLock?.();releaseStoreLock=null;store=null;account='';}
  $('vault-unlock').hidden=!!store;$('vault-dashboard').hidden=!store;
  onBusy?.(busy);
  const ipHost=location.hostname==='127.0.0.1';
  $('vault-passkey-host').hidden=!ipHost;$('vault-passkey-localhost').href=`http://localhost:${location.port}`;
  const supported=!ipHost&&globalThis.isSecureContext&&!!globalThis.PublicKeyCredential&&!!navigator.credentials;
  const view=unlockPresentation({...unlockHint,supported});
  $('vault-passkey-unlock').hidden=!view.showPasskey;$('vault-passkey-unlock').classList.toggle('vault-primary',view.passkeyFirst);
  $('vault-unlock-description').textContent=view.description;$('vault-password-label').textContent=view.passwordLabel;$('vault-unlock-submit').textContent=view.submitLabel;
  const layout=JSON.stringify(view);if(layout!==passwordLayout){$('vault-password-choice').open=view.passwordOpen;passwordLayout=layout;}
  $('vault-passkey-unlock').disabled=busy||!supported;$('vault-unlock-submit').disabled=busy;$('vault-password').disabled=busy;$('vault-restore-new').disabled=busy;
  const active=store?.data.positions.filter(p=>p.status==='active')??[];
  const claimReady=!!config&&active.some(p=>earnedYield(p.note,config)>=BigInt(config.rewardUnit)*315360000000n)&&BigInt(config.reserve)>=BigInt(config.allocated)+BigInt(config.rewardUnit);
  const setup=onboardingState({connected:!!wallet(),data:store?.data,claimReady});onSetup?.({...setup,backupOffered:!!store&&backupOffered&&!store.data.setupBackupConfirmed});
  $('setup-backup-confirm').disabled=busy;
  for(const name of ['mint','deposit','claim','withdraw','backup'])$('vault-'+name).classList.toggle('next-action',setup.action==='vault-'+name);
  if(!store)return;
  $('vault-passkey-enable').disabled=busy||!!store.data.pending||store.hasPasskey||!supported;$('vault-passkey-enable').textContent=store.hasPasskey?'Passkey enabled':'Enable passkey unlock';
  $('vault-principal').textContent=config?String(BigInt(config.lotSize)*BigInt(active.length)):'—';
  $('vault-apy').textContent=config?`${Number(config.apyBps)/100}%`:'—';
  const numerator=config?active.reduce((sum,p)=>sum+earnedYield(p.note,config),0n):0n;
  $('vault-earned').textContent=config?`${numerator/315360000000n}.${String((numerator%315360000000n)*100n/315360000000n).padStart(2,'0')}`:'—';
  $('vault-denomination').textContent=config?`One deposit lot = ${config.lotSize} test-token units. The test-asset faucet mints this supported asset; your wallet still needs test DUST for fees. Simulation clock: ${config.simulatedSeconds} seconds; only the demo operator advances it. Withdrawals return one whole lot and forfeit its unclaimed simulated yield. Claimed allowance survives withdrawal.`:'Reading the contract…';
  const pending=store.data.pending;
  $('vault-pending').hidden=!pending;
  $('vault-pending-title').textContent=busy?'Transaction in progress':'Transaction needs reconciliation';$('vault-pending-message').textContent=busy?'Complete the wallet approval when requested. Your encrypted recovery journal is saved.':'Keep the pending journal. An interrupted transaction can still finalize; check its status before trying again.';
  for(const id of ['vault-mint','vault-deposit','vault-claim','vault-withdraw'])$(id).disabled=busy||!!pending||!config||!wallet();
  if(config){$('vault-claim-note').textContent=!active.length?'Deposit a lot to start accruing simulated yield.':!active.some(p=>earnedYield(p.note,config)>=BigInt(config.rewardUnit)*315360000000n)?'No claimable simulated yield yet. The demo operator advances the on-chain clock.':BigInt(config.reserve)<BigInt(config.allocated)+BigInt(config.rewardUnit)?'The reward reserve is fully allocated. Your principal remains withdrawable.':'Your simulated yield is eligible. Claim it to fund your prompt allowance.';$('vault-claim').disabled||=!active.some(p=>earnedYield(p.note,config)>=BigInt(config.rewardUnit)*315360000000n)||BigInt(config.reserve)<BigInt(config.allocated)+BigInt(config.rewardUnit);$('vault-withdraw').disabled||=!active.length;}
  $('vault-import').disabled=busy;$('vault-restore-new').disabled=busy;
  $('vault-refresh').disabled=busy;$('vault-lock').disabled=busy;$('vault-reconcile').disabled=busy;
  $('vault-history').replaceChildren(...store.data.history.slice().reverse().map(h=>{const row=document.createElement('div');row.className='vault-history-row';const label=document.createElement('span');label.textContent=`${h.action} · confirmed`;const tx=document.createElement('code');tx.textContent=h.txId;row.append(label,tx);return row;}));
  if(!store.data.history.length)$('vault-history').textContent='Your confirmed vault transactions will appear here.';
  onAllowance?.(store.data.credits.map(c=>({id:c.id,status:c.onChain==='missing'?'invalid':c.receipt||c.onChain==='spent'?'redeemed':c.bearer?'reserved':c.onChain==='active'?'ready':'checking'})));
  onRequests?.(store.data.inferences??[]);
 }
 async function refresh(){try{config=await api('/api/vault/status');if(!store)await refreshUnlockHint();
  if(store&&!busy&&store.data.credits.length){const statuses=await api('/api/vault/allowance',{credits:store.data.credits.map(c=>({id:c.id,secret:c.secret}))});const updated=structuredClone(store.data);for(const status of statuses){const c=updated.credits.find(c=>c.id===status.id);c.onChain=!status.exists?'missing':status.spent?'spent':'active';}await store.save(updated);}
  render();if(!busy&&!store?.data.pending)feedback(store?'Private notes unlocked. Actions require wallet approval.':'Connect your wallet and unlock your private notes.');}catch{feedback('Could not read the deployed vault. Check the local app and Preview indexer.');}}
 async function unlock(event,passkey=false){event?.preventDefault();
  if(busy)return;if(!wallet())return feedback('Connect your Midnight wallet first.');
  const version=++unlockVersion;let acquired=null;busy=true;beginProgress('unlocking');render();
  try{
   if(!config)throw new Error('Wait for the contract to load.');
   const address=current(),scope=`${network()}:${config.vault}:${address}`;
   acquired=await acquireVaultLock(navigator.locks,scope);
   const opened=passkey?await openVaultWithPasskey(localStorage,scope,{rpId:location.hostname},restore):await openVaultStore(localStorage,$('vault-password').value,scope,restore);
   if(version!==unlockVersion||current()!==address){opened.close();throw new Error('Wallet changed or vault was locked. Try unlocking again.');}
   store=opened;releaseStoreLock=acquired;acquired=null;account=address;restore=null;
   const data=structuredClone(store.data);data.inferences??=[];
   for(const credit of data.credits)credit.onChain='checking';
   for(const request of data.inferences){if(request.status==='working'){request.status='failed';request.error='Interrupted request. Retry the same allowance and prompt to reconcile it.';}}
   await store.save(data);$('vault-password').value='';
  }catch(error){acquired?.();lock();feedback(passkey?passkeyError(error):error.message);}
  finally{busy=false;render();}
  if(store){await refresh();if(store)feedback(store.passkeyRecoveryNeeded?'Password unlocked. Damaged passkey metadata was ignored; enable a new passkey and download a fresh backup.':'Vault unlocked. Keep your recovery password and download a current encrypted backup.');}
 }
 async function enablePasskey(){
  if(!store||busy||store.data.pending)return;
  busy=true;beginProgress('creating-passkey');render();feedback('Create a passkey in your authenticator. Keep the recovery password.');
  try{await store.enablePasskey({rpId:location.hostname});feedback('Passkey enabled. Download a fresh encrypted backup; keep the recovery password for lost-passkey recovery.');}
  catch(error){feedback(passkeyError(error));}
  finally{busy=false;render();}
 }
 async function save(data){await store.save(data);render();}
 function history(data,action,txId){if(!data.history.some(h=>h.txId===txId))data.history.push({action,txId,at:new Date().toISOString()});}
 async function finish(result){
  const data=structuredClone(store.data),pending=data.pending;if(!pending)return;
  if(pending.action==='deposit')data.positions.push({id:pending.positionId,note:pending.note,status:'active'});
  if(pending.action==='withdraw')data.positions.find(p=>p.id===pending.positionId).status='withdrawn';
  if(pending.action==='claim'){data.positions.find(p=>p.id===pending.positionId).note=result.next??pending.next;data.credits.push({id:crypto.randomUUID(),secret:pending.note.creditSecret,onChain:'active'});}
  history(data,pending.action,result.txId??pending.txId??'confirmed by ledger reconciliation');data.pending=null;await save(data);feedback('Confirmed on Midnight. Your private notes have been updated.');await refresh();
 }
 async function drive(id){
  const deadline=Date.now()+600000;
  while(Date.now()<deadline){
   const job=await api('/api/vault/poll',{id});progress(job.stage,job.startedAt??progressStartedAt);
   if(job.txId&&store.data.pending?.txId!==job.txId){const data=structuredClone(store.data);data.pending.txId=job.txId;await save(data);}
   if(job.status==='done'){await finish(job.result);return;}
   if(job.status==='failed'){
    if(!job.submissionAttempted){const data=structuredClone(store.data);data.pending=null;await save(data);feedback('No transaction was submitted. The wallet may have declined, funds may be insufficient, or the proof could not be built. Refresh before retrying.');}
    else feedback('Submission outcome needs reconciliation. Keep your pending journal and check the chain.');
    return;
   }
   if(job.request){
    const pending=store.data.pending;
    if(pending.handledRequests?.includes(job.request.id))throw new Error('A wallet request may already have completed. Reconcile before trying again.');
    const data=structuredClone(store.data);data.pending.handledRequests=[...(pending.handledRequests??[]),job.request.id];await save(data);
    let value,error=false;
    feedback(job.request.method==='submitTransaction'?'Submitting the wallet-approved transaction…':'Approve the transaction in your wallet.');
    try{if(!wallet()||current()!==account||(await wallet().api.getUnshieldedAddress()).unshieldedAddress!==account)throw new Error('Wallet changed');value=job.request.method==='balanceUnsealedTransaction'?await wallet().api.balanceUnsealedTransaction(job.request.tx):await wallet().api.submitTransaction(job.request.tx);}
    catch{error=true;}
    await api('/api/vault/reply',{id,requestId:job.request.id,value:value??null,error});
   }
   await new Promise(r=>setTimeout(r,800));
  }
  throw new Error('Confirmation is taking longer than expected. Keep your pending journal and reconcile.');
 }
 async function action(name){
  if(!store||!wallet())return feedback('Connect your wallet and unlock the vault first.');
  if(busy||store.data.pending)return;
  busy=true;beginProgress('preparing-proof');render();
  try{
   config=await api('/api/vault/status');
   const position=store.data.positions.find(p=>p.status==='active'&&(name!=='claim'||earnedYield(p.note,config)>=BigInt(config.rewardUnit)*315360000000n));
   if(['claim','withdraw'].includes(name)&&!position)throw new Error('No eligible private position.');
   const note=name==='deposit'?newPosition(config.simulatedSeconds):position?.note;
   const pending={action:name,positionId:position?.id??crypto.randomUUID(),note,next:name==='claim'?nextPosition(note,config):undefined,nonce:name==='mint'?randomSecret():undefined,handledRequests:[]};
   const data=structuredClone(store.data);data.pending=pending;await save(data);
   if((await wallet().api.getUnshieldedAddress()).unshieldedAddress!==account)throw new Error('Wallet account changed. Lock the vault and reconnect.');
   const keys=await wallet().api.getShieldedAddresses();
   const job=await api('/api/vault/start',{action:name,note:pending.note,next:pending.next,nonce:pending.nonce,keys});
   const next=structuredClone(store.data);next.pending.operationId=job.id;await save(next);feedback('Building a real Midnight transaction and proof…');await drive(job.id);
  }catch(e){if(store?.data.pending&&!store.data.pending.operationId){const data=structuredClone(store.data);data.pending=null;await save(data);}feedback(e.message||'Keep the pending journal and reconcile before retrying.');}
  finally{busy=false;render();}
 }
 async function reconcile(){
  if(!store?.data.pending||busy)return;busy=true;beginProgress('confirming');render();
  try{
   const pending=store.data.pending;
   if(pending.operationId){let job;try{job=await api('/api/vault/poll',{id:pending.operationId});}catch{}
    if(job?.status==='done'){await finish(job.result);return;}
    if(job?.status==='working'){feedback('Resuming the existing operation; no replacement transaction is created.');await drive(pending.operationId);return;}
    if(job?.status==='failed'&&!job.submissionAttempted){const data=structuredClone(store.data);data.pending=null;await save(data);feedback('The operation failed before submission. You can refresh and retry.');return;}
   }
   if(!pending.note){feedback('Use the saved transaction ID and wallet history to reconcile this mint. Do not mint a replacement automatically.');return;}
   const check=await api('/api/vault/reconcile',{note:pending.note});
   if(pending.action==='deposit'&&check.exists&&!check.spent){await finish({});return;}
   if(pending.action==='withdraw'&&check.spent){await finish({});return;}
   if(pending.action==='claim'&&check.spent){const next=await api('/api/vault/reconcile',{note:pending.next});if(next.exists&&!next.spent){await finish({next:pending.next});return;}}
   feedback('The expected final state is not visible yet. Preserve this journal and check again; no replacement was sent.');
  }catch(e){feedback(e.message||'Reconciliation unavailable. Keep the journal.');}finally{busy=false;render();}
 }
 async function infer(creditId,prompt,model){
  if(!store||current()!==account)throw new Error('Unlock your private vault first.');
  if(busy||store.data.pending)throw new Error('Finish the pending vault action first.');
  let request=store.data.inferences?.find(r=>r.credit===creditId);
  if(request&&(request.prompt!==prompt||request.model!==model))throw new Error('This allowance is reserved for its original prompt.');
  if(request?.status==='done')return request.answer;
  const credit=store.data.credits.find(c=>c.id===creditId);if(!credit)throw new Error('No private allowance selected.');if(!request&&credit.onChain!=='active')throw new Error('Refresh the vault to verify this private allowance first.');
  busy=true;beginProgress('authorizing');
  try{
   const data=structuredClone(store.data);data.inferences??=[];
   request=data.inferences.find(r=>r.credit===creditId);
   if(!request){request={id:crypto.randomUUID(),credit:creditId,prompt,...(model?{model}:{}),status:'working',startedAt:Date.now()};data.inferences.push(request);}else{request.status='working';request.startedAt=Date.now();delete request.error;}
   const owned=data.credits.find(c=>c.id===creditId);owned.bearer??=randomSecret();await save(data);onRequests?.(store.data.inferences,request.id);
   const requestId=request.id;
   if(!owned.receipt){
    let job;
    if(owned.redemptionJob){try{job=await api('/api/vault/poll',{id:owned.redemptionJob});}catch{}}
    if(!job||job.status==='failed'){
     job=await api('/api/vault/redeem',{secret:owned.secret,bearer:owned.bearer});
     const pending=structuredClone(store.data);pending.credits.find(c=>c.id===creditId).redemptionJob=job.id;await save(pending);
    }
    const deadline=Date.now()+900000;
    while(job.status!=='done'){progress(job.stage);
     if(job.status==='failed')throw new Error('Redemption not confirmed. Retry this same allowance and prompt.');
     if(Date.now()>deadline)throw new Error('Redemption is still pending. Preserve this allowance.');
     await new Promise(r=>setTimeout(r,1000));job=await api('/api/vault/poll',{id:job.id});
    }
    const redeemed=structuredClone(store.data);redeemed.credits.find(c=>c.id===creditId).receipt=job.result.redemption;
    if(job.result.txId)history(redeemed,'Anonymous allowance redemption',job.result.txId);await save(redeemed);
   }
   const receipt=store.data.credits.find(c=>c.id===creditId).receipt;
   progress('requesting-ai');
   const answer=await api('/api/vault/inference',{prompt,redemption:receipt,...(request.model?{model:request.model}:{})});
   const finished=structuredClone(store.data),done=finished.inferences.find(r=>r.id===requestId);done.status='done';done.answer=answer;await save(finished);onRequests?.(store.data.inferences,requestId);return answer;
  }catch(e){
   if(store){const failed=structuredClone(store.data),entry=failed.inferences?.find(r=>r.credit===creditId);if(entry){entry.status='failed';entry.error=e.message||'Keep this same allowance for reconciliation.';await save(failed);onRequests?.(store.data.inferences,entry.id);}}
   throw e;
  }finally{busy=false;render();}
 }
 $('vault-unlock-form').onsubmit=event=>unlock(event);
 $('vault-passkey-unlock').onclick=()=>unlock(null,true);$('vault-passkey-enable').onclick=enablePasskey;
 for(const name of ['mint','deposit','claim','withdraw'])$('vault-'+name).onclick=()=>action(name);
 $('vault-refresh').onclick=refresh;$('vault-lock').onclick=lock;$('vault-reconcile').onclick=reconcile;
 $('vault-backup').onclick=()=>{if(!store||busy)return;const url=URL.createObjectURL(new Blob([store.backup()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`shadowcompute-vault-${network()}-encrypted.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);backupOffered=true;render();};
 $('setup-backup-confirm').onclick=async()=>{if(!store||busy||!backupOffered)return;try{const data=structuredClone(store.data);data.setupBackupConfirmed=true;await save(data);feedback('Recovery backup acknowledged. Download a fresh backup after deposits and claims.');}catch(error){feedback(error.message);}};
 $('vault-import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000)throw new Error('Backup is too large');await store.import(await file.text());render();feedback('Encrypted backup restored.');}catch(e){feedback(e.message);}};
 $('vault-restore-new').onchange=async e=>{try{const file=e.target.files[0];if(file?.size>2_000_000)throw new Error('Backup is too large');restore=file?await file.text():null;await refreshUnlockHint();feedback('Backup selected. Connect the original wallet, then use its recovery password or included passkey on the original hostname.');}catch(e){feedback(e.message);}};
 document.querySelectorAll('.vault-import').forEach(label=>{label.tabIndex=0;label.setAttribute('role','button');label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();label.querySelector('input').click();}};});
 window.addEventListener('pagehide',lock);
 return {open:refresh,walletChanged:lock,render,infer,get data(){return store?.data;}};
}
