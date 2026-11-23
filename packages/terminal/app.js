import {createTransport} from './transport.js';
import {initPrepaid} from './prepaid.js';
import {setupSteps,onboardingState,inferenceExperience,progressDescription,elapsedLabel} from './experience.js';
import {initVault} from './vault.js';
import {promptCapacity} from './capacity.js';
import {listWallets,connectWallet} from './wallet.js';
const $=id=>document.getElementById(id);
let browserAllowance=null,browserJobs=[],browserBusy=false,browserProgress=null,setup=onboardingState(),lastSetup='',lastAdapter='',chosenModel='',prepaidBalance={available:'0',purchased:'0'};
function appBusy(){return state.busy||browserBusy;}
let connectBusy=false;
let walletConnection=null,wallets=[],state={credits:[],jobs:[],busy:false},active=null,lastTranscript='',privacy=false,vaultOpen=false,creditChoice='';
const transport=createTransport({location,storage:sessionStorage});
const api=(path,body)=>transport.request(path,body);

function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function selectJob(job){active=job.id;privacy=false;vaultOpen=false;lastTranscript='';$('prompt').value='';render();}
function message(label,content,className){const el=text('article','',`message ${className}`);el.append(text('div',label,'message-label'),text('pre',content));return el;}
function render(){
 const jobs=[...state.jobs,...browserJobs];
 const job=jobs.find(j=>j.id===active);
 const credits=browserAllowance??state.credits;
 const ready=credits.filter(c=>c.status==='ready');
 const prepaid=state.funding==='prepaid',catalog=state.models??[];
 chosenModel=job?.model??(catalog.some(entry=>entry.id===chosenModel)?chosenModel:state.defaultModel??catalog[0]?.id??'');
 const selection=catalog.find(entry=>entry.id===chosenModel),adapter=selection?.adapter??state.adapter;
 const optionsSignature=JSON.stringify(catalog);if($('ai-model').dataset.catalog!==optionsSignature){$('ai-model').replaceChildren(...catalog.map(entry=>{const option=text('option',entry.label);option.value=entry.id;return option;}));$('ai-model').dataset.catalog=optionsSignature;}
 $('ai-model').value=chosenModel;$('ai-model').disabled=appBusy()||!!job;$('model-cost').textContent=`${selection?.credits??1} credit / request`;
 const capacity=prepaid?{label:`${prepaidBalance.available} credits available`,description:'Prepaid credits. Unspent private notes can be refunded; one credit authorizes a request.',percent:BigInt(prepaidBalance.purchased)>0n?Number(BigInt(prepaidBalance.available)*100n/BigInt(prepaidBalance.purchased)):0}:promptCapacity(credits),experience=inferenceExperience(adapter);
 $('welcome-copy').textContent=prepaid?'Pay with stablecoins. Use one credit balance across configured AI models.':'Your capital pays for your AI. Your identity stays private.';
 $('welcome-eyebrow').textContent=prepaid?'PREPAID AI · POWERED BY MIDNIGHT':'PRIVATE AI · POWERED BY MIDNIGHT';
 $('funding-label').textContent=prepaid?'Prepaid · refundable unused credits':'Powered by simulated yield';$('funding-status').textContent=prepaid?'Prepaid · TESTNET':'Yield: SIMULATED';
 $('capacity-meter').setAttribute('aria-label',prepaid?'Prepaid prompt capacity':'Yield-backed prompt capacity');$('send').title=prepaid?'Send prompt using prepaid credits':'Send prompt using yield allowance';
 $('vault-tab').textContent=prepaid?'AI credits':'Private vault';$('prepaid-model-name').textContent=selection?.label??'Choose a model';

 if(lastAdapter!==adapter){
  lastAdapter=adapter;$('prompt').placeholder=experience.placeholder;$('ai-capability').textContent=experience.label;$('ai-mode-note').textContent=experience.note;
  $('suggestions').replaceChildren(...experience.suggestions.map(suggestion=>{const button=text('button',suggestion.label);button.onclick=()=>{$('prompt').value=suggestion.prompt;render();$('prompt').focus();};return button;}));
 }
 const legacyReady=browserAllowance===null&&state.credits.some(c=>c.status==='ready');
 $('setup-guide').hidden=prepaid||!!job||privacy||setup.complete||legacyReady;
 if(JSON.stringify(setup)!==lastSetup){lastSetup=JSON.stringify(setup);$('setup-steps').replaceChildren(...setupSteps.map((label,index)=>{const item=text('li','',setup.done[index]?'done':index===setup.index?'current':'');const marker=text('span',setup.done[index]?'✓':String(index+1),'step-marker');item.append(marker,text('span',label));if(index===setup.index)item.setAttribute('aria-current','step');return item;}));}
 $('setup-description').textContent=setup.description;$('setup-action').textContent=setup.label;$('setup-action').disabled=appBusy();$('setup-backup-confirm').hidden=!setup.backupOffered;
 const running=jobs.find(j=>j.status==='working'),operation=browserBusy?browserProgress:running;
 $('operation-progress').hidden=!operation;document.querySelector('.terminal-pane').classList.toggle('show-setup',!$('setup-guide').hidden||!!operation);
 if(operation){const description=progressDescription(operation.stage);if($('operation-stage').textContent!==description)$('operation-stage').textContent=description;$('operation-elapsed').textContent=elapsedLabel(operation.startedAt);}

 $('capacity-label').textContent=capacity.label;$('capacity-tooltip').textContent=capacity.description;
 $('capacity-meter').setAttribute('aria-valuenow',String(capacity.percent));$('capacity-meter').setAttribute('aria-valuetext',capacity.description);
 $('capacity-fill').setAttribute('stroke-dashoffset',String(100-capacity.percent));
 $('network-label').textContent=state.network==='preview'?'Midnight Preview':'Midnight devnet';$('network-side').textContent=state.network??'local';$('network-foot').textContent=state.network??'local';
 $('model').textContent=(state.model||'').split('/').at(-1)||'Local model';
 $('wallet-connect').disabled=appBusy()||connectBusy;
 $('connection').textContent=appBusy()?'Proof / inference in progress':'Connected';
 $('thread-title').textContent=job?job.prompt.slice(0,42):'New thread';
 $('threads').replaceChildren(...jobs.map(j=>{const b=text('button','',`thread ${j.id===active?'active':''}`);b.append(text('span',j.status==='working'?'◌':j.status==='failed'?'◦':'●'),text('span',j.prompt.slice(0,34)));b.title=j.prompt;b.onclick=()=>selectJob(j);return b;}));
 const options=credits.map(c=>({value:c.id,label:`${c.id.replace('.json','')} · ${c.status}`}));
 const chosen=job?.credit||ready.find(c=>c.id===creditChoice)?.id||ready[0]?.id||'';
 if(JSON.stringify(options)!==$('credit').dataset.options){$('credit').replaceChildren(...options.map(o=>{const el=text('option',o.label);el.value=o.value;return el;}));$('credit').dataset.options=JSON.stringify(options);}
 $('credit').value=chosen;$('credit').disabled=!!job||appBusy();
 $('send').disabled=appBusy()||!chosen||!!job||!$('prompt').value.trim()||privacy||!experience.suggestions.length;
 $('prompt').disabled=!!job||appBusy();
 $('vault-page').hidden=!vaultOpen||prepaid;$('prepaid-page').hidden=!vaultOpen||!prepaid;$('scroll').hidden=vaultOpen;document.querySelector('.terminal-pane').classList.toggle('vault-open',vaultOpen);
 $('welcome').hidden=!!job||privacy||vaultOpen||!$('setup-guide').hidden;$('transcript').hidden=privacy;$('privacy').hidden=!privacy||prepaid;$('prepaid-privacy').hidden=!privacy||!prepaid;$('compose-area').hidden=privacy||vaultOpen;
 $('terminal-tab').classList.toggle('active',!privacy&&!vaultOpen);$('privacy-tab').classList.toggle('active',privacy);$('vault-tab').classList.toggle('active',vaultOpen);
 $('suggestions').hidden=!!job;document.querySelector('.terminal-pane').classList.toggle('has-job',!!job);document.querySelector('.terminal-pane').classList.toggle('show-privacy',privacy);
 $('status').textContent=appBusy()?progressDescription(operation?.stage):job?.status==='done'?`Completed · ${job.answer?.cached?'cached response':prepaid?'paid with one prepaid credit':'funded by simulated yield'}`:job?.status==='failed'?'Your allowance is reserved. Retry the identical prompt.':ready.length?(prepaid?'Credits ready. Choose a model and send a prompt.':'Your yield allowance is ready to use'):prepaid?'No prepaid credits yet. Open AI credits to add funds.':state.network==='preview'?'No Preview yield allowance yet. Connecting a wallet does not fund it.':'No prompt allowance available. Claim funded simulated yield to continue.';
 const signature=JSON.stringify(job);
 if(signature!==lastTranscript){
  lastTranscript=signature;$('transcript').replaceChildren();
  if(job){
   $('transcript').append(message('YOU',job.prompt,'user'));
   if(job.status==='working')$('transcript').append(message('AI  /  WORKING','Your request is running. Follow its current stage above.\nRetrying the identical prompt uses the same allowance.','pending'));
   else if(job.status==='failed'){
    const el=message('REQUEST NEEDS ATTENTION',job.error,'error');const actions=text('div','','message-actions');const retry=text('button','Retry same paid request');retry.onclick=()=>submit(job.credit,job.prompt,job.model);retry.disabled=appBusy();actions.append(retry);el.append(actions);$('transcript').append(el);
   }else{
    const el=message('AI RESPONSE',job.answer.response,'assistant');const actions=text('div','','message-actions');const copy=text('button','Copy response');copy.onclick=async()=>{try{await navigator.clipboard.writeText(job.answer.response);copy.textContent='Copied';}catch{copy.textContent='Select text to copy';}};const download=text('button','Save response');download.onclick=()=>{const blob=new Blob([job.answer.response],{type:'text/plain'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shadowcompute-response.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};const next=text('button','New prompt');next.onclick=newThread;actions.append(copy,download,next);el.append(actions);$('transcript').append(el);
   }
   $('scroll').scrollTop=$('scroll').scrollHeight;
  }
 }
}
async function refresh(){try{state=await api('/api/state');render();}catch(e){$('status').textContent=e.message;$('connection').textContent='Disconnected';$('send').disabled=true;}}
async function submit(credit,prompt,model){
 $('send').disabled=true;
 try{if(state.funding==='prepaid'){await prepaidClient.infer(credit,prompt,model,active);return;}if(browserAllowance!==null){await vaultClient.infer(credit,prompt,model);return;}const job=await api('/api/ask',{credit,prompt,...(model?{model}:{})});active=job.id;$('prompt').value='';await refresh();}catch(e){$('status').textContent=e.message;}
}
$('composer').onsubmit=e=>{e.preventDefault();if(!appBusy()&&!active&&inferenceExperience((state.models??[]).find(entry=>entry.id===chosenModel)?.adapter??state.adapter).suggestions.length)void submit($('credit').value,$('prompt').value.trim(),chosenModel||undefined);};
$('prompt').oninput=render;
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('composer').requestSubmit();}};
$('credit').onchange=()=>{creditChoice=$('credit').value;};
function newThread(){document.querySelector('.sidebar').classList.remove('open');active=null;privacy=false;vaultOpen=false;creditChoice='';$('prompt').value='';render();$('prompt').focus();}
$('new-thread').onclick=newThread;$('terminal-home').onclick=newThread;
$('refresh').onclick=refresh;
$('terminal-tab').onclick=()=>{privacy=false;vaultOpen=false;render();};
$('privacy-tab').onclick=()=>{privacy=true;vaultOpen=false;render();};
let refreshTimer;
async function startConnection(){
 await api('/api/session');state=await api('/api/state');active=(state.jobs.find(j=>j.status==='working')||state.jobs.at(-1))?.id||null;render();$('connection').textContent='Connected';clearInterval(refreshTimer);refreshTimer=setInterval(refresh,2000);
}
const companionDialog=$('companion-dialog');
$('companion-settings').hidden=!transport.hosted;
$('companion-settings').onclick=()=>{if(!appBusy())companionDialog.showModal();};
companionDialog.addEventListener('cancel',event=>event.preventDefault());
$('companion-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('companion-error').textContent='Connecting…';try{transport.configure($('companion-url').value.trim(),$('companion-code').value.trim());await startConnection();$('companion-code').value='';companionDialog.close();}catch(error){$('companion-error').textContent=error.message;}finally{button.disabled=false;}};
$('companion-url').onchange=()=>{try{$('companion-pair-link').href=new URL('/pair',$('companion-url').value).href;}catch{}};
if(transport.hosted){$('network-label').textContent='Companion required';$('connection').textContent='Not paired';$('funding-status').textContent='Companion offline';$('funding-label').textContent='Connect your computer to load its state';$('send').disabled=true;}
(async()=>{try{if(transport.configured)await startConnection();else companionDialog.showModal();}catch(error){$('status').textContent=error.message;if(transport.hosted){$('companion-error').textContent=error.message;companionDialog.showModal();}}})();

$('menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');

document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.sidebar').classList.remove('open');});

$('wallet-connect').onclick=async()=>{
 const button=$('wallet-connect'),choice=$('wallet-choice'),message=$('wallet-message');
 if(walletConnection){walletConnection=null;currentVault().walletChanged();button.textContent='Connect wallet';button.title='';choice.hidden=true;message.textContent='Disconnected from this page. Revoke permissions in your wallet if needed.';return;}
 wallets=listWallets(window.midnight);
 if(!wallets.length){message.textContent='No compatible Midnight wallet found. Open this page in a browser with a Midnight wallet extension, unlock it, and refresh.';return;}
 if(wallets.length>1&&choice.hidden){choice.replaceChildren(...wallets.map(({id,name})=>{const option=text('option',name);option.value=id;return option;}));choice.hidden=false;message.textContent='Choose a wallet, then select Connect wallet.';return;}
 const selected=wallets.find(w=>w.id===choice.value)??wallets[0];
 connectBusy=true;button.disabled=true;message.textContent='Approve the connection in your wallet.';
 try{walletConnection=await connectWallet(selected.wallet,state.network==='preview'?'preview':'undeployed');button.textContent=walletConnection.address.slice(0,14)+'…'+walletConnection.address.slice(-6);button.title='Disconnect from this page';currentVault().walletChanged();if(vaultOpen)void currentVault().open();message.textContent='Wallet connected. Open Private vault to unlock your position notes.';choice.hidden=true;}
 catch{walletConnection=null;message.textContent='Wallet connection failed or was declined. Check that your wallet is unlocked and set to the correct network.';}
 finally{connectBusy=false;button.disabled=false;}
};

const vaultClient=initVault({api,wallet:()=>walletConnection,network:()=>state.network,onAllowance:value=>{browserAllowance=value;render();},onRequests:(jobs,focus)=>{browserJobs=jobs;if(focus)active=focus;render();},onBusy:value=>{browserBusy=value;if(!value)browserProgress=null;render();},onSetup:value=>{setup=value;render();},onProgress:value=>{browserProgress=value;render();}});
$('vault-tab').onclick=()=>{vaultOpen=true;privacy=false;render();void currentVault().open();};

$('setup-action').onclick=()=>{
 if(appBusy())return;
 if(setup.action==='wallet-connect'){$('wallet-connect').click();return;}
 if(setup.action==='terminal-tab'){$('terminal-tab').click();return;}
 vaultOpen=true;privacy=false;render();void currentVault().open();
 if(setup.action==='vault-password'){$('vault-unlock').scrollIntoView({block:'nearest'});($('vault-password-choice').open?$('vault-password'):$('vault-passkey-unlock')).focus();return;}
 const target=$(setup.action);target?.scrollIntoView({block:'nearest'});target?.focus();if(target&&!target.disabled)target.click();
};

const prepaidClient=initPrepaid({api,wallet:()=>walletConnection,network:()=>state.network,onAllowance:value=>{browserAllowance=value;render();},onRequests:(jobs,focus)=>{browserJobs=jobs;if(focus)active=focus;render();},onBusy:value=>{browserBusy=value;if(!value)browserProgress=null;render();},onProgress:value=>{browserProgress=value;render();},onBalance:value=>{prepaidBalance=value;render();}});
function currentVault(){return state.funding==='prepaid'?prepaidClient:vaultClient;}
$('ai-model').onchange=()=>{chosenModel=$('ai-model').value;render();};
