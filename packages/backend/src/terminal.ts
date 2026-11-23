import type {PrepaidVault} from './prepaid-vault.js';
import type {ModelInfo} from './gateway.js';
import type {BrowserVault} from './browser-vault.js';
import { createServer } from 'node:http';
import { randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { readFileSync,readdirSync,existsSync,realpathSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { GatewayError,validateRequest } from './gateway.js';

type Answer={response:string;chargedCredits:number;cached:boolean};
type Job={model?:string;stage?:string;startedAt?:number;id:string;credit:string;prompt:string;status:'working'|'done'|'failed';answer?:Answer;error?:string};
type Options={directory:string;assets:string;run?:(file:string,prompt:string,onProgress?:(stage:string)=>void)=>Promise<Answer>;adapter?:string;models?:readonly ModelInfo[];defaultModel?:string;funding?:string;prepaidVault?:PrepaidVault;model:string;network?:string;vault?:string;browserVault?:BrowserVault;gatewayUrl?:string;allowedOrigin?:string};
export function runCredit(file:string,prompt:string,onProgress?:(stage:string)=>void,model?:string):Promise<Answer>{
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','--env-file-if-exists=.env','scripts/ask.ts',file,'--json','--progress',...(model?['--model',model]:[])],{stdio:['pipe','pipe','pipe'],detached:true});
  let output='',progressBuffer='',size=0;const decoder=new StringDecoder('utf8');
  const stop=()=>{if(child.pid){try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}};
  const timer=setTimeout(stop,450000);
  child.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>2_000_000)stop();else{const decoded=decoder.write(b);output+=decoded;progressBuffer+=decoded;let newline;while((newline=progressBuffer.indexOf('\n'))>=0){const line=progressBuffer.slice(0,newline);progressBuffer=progressBuffer.slice(newline+1);try{const event=JSON.parse(line);if(event.type==='progress'&&['authorizing','requesting-ai'].includes(event.stage))onProgress?.(event.stage);}catch{}}}});
  child.stderr.on('data',(b:Buffer)=>{size+=b.length;if(size>2_000_000)stop();});
  child.stdin.on('error',()=>{});child.stdin.end(prompt);
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Could not start credit client. Check the local terminal service.'));});
  child.on('close',code=>{
   clearTimeout(timer);output+=decoder.end();
   if(code!==0)return reject(new Error('Request did not complete. Keep this credit and retry the identical prompt; reconciliation may be required. No second credit was submitted.'));
   try{
    const answer=JSON.parse(output.trim().split('\n').at(-1)!);
    if(typeof answer.response!=='string'||answer.chargedCredits!==1||typeof answer.cached!=='boolean')throw new Error();
    resolve(answer);
   }catch{reject(new Error('Response could not be read. Preserve this credit for reconciliation.'));}
  });
 });
}
export function terminalServer(options:Options){
 const allowedOrigin=options.allowedOrigin;if(allowedOrigin){const url=new URL(allowedOrigin);if(url.protocol!=='https:'||url.origin!==allowedOrigin||url.username||url.password)throw new Error('Companion origin must be one exact HTTPS origin');}
 const directory=realpathSync(options.directory),token=randomBytes(32).toString('hex');
 const jobs=new Map<string,Job>();let busy=false;
 const credits=()=>readdirSync(directory).filter(n=>/^credit-[1-9][0-9]*\.json$/.test(n)).sort().map(id=>({id,status:existsSync(join(directory,id+'.redemption'))?'redeemed':'ready'}));
 const app=createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  try{
   const port=(app.address() as {port:number}).port;
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host??''))throw new GatewayError(403,'Invalid local host');
   const origin=req.headers.origin,url=req.url??'/';
   const remote=!!allowedOrigin&&origin===allowedOrigin;
   if(origin&&!remote&&![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin))throw new GatewayError(403,'Use an approved companion origin');
   if(req.headers['sec-fetch-site']==='cross-site'&&!remote)throw new GatewayError(403,'Cross-site access denied');
   if(remote){
    res.setHeader('access-control-allow-origin',allowedOrigin!);res.setHeader('vary','Origin');
    if(!url.startsWith('/api/')||url==='/api/session')throw new GatewayError(403,'Pair locally; remote session discovery is forbidden');
    if(req.method==='OPTIONS'){res.setHeader('access-control-allow-methods','GET, POST, OPTIONS');res.setHeader('access-control-allow-headers','content-type, x-console-token');res.setHeader('access-control-allow-private-network','true');res.writeHead(204);res.end();return;}
   }
   if(req.method==='GET'&&['/','/app.js','/style.css','/city.png','/wallet.js','/capacity.js','/vault.js','/vault-store.js','/vault-passkey.js','/mera.js','/experience.js','/compact-example.js','/prepaid.js','/prepaid-notes.js','/transport.js','/pair','/pair.js'].includes(url)){
    const file=url==='/'?'index.html':url==='/pair'?'pair.html':url.slice(1);
    res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.png')?'image/png':'text/css; charset=utf-8');
    res.end(readFileSync(join(options.assets,file)));return;
   }
   if(req.method==='GET'&&url==='/api/session'){json({token});return;}
   const supplied=String(req.headers['x-console-token']??'');
   if(!/^[0-9a-f]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))throw new GatewayError(403,'Reload the terminal to reconnect');
   if(options.prepaidVault&&url.startsWith('/api/prepaid/')){
    const service=options.prepaidVault;
    if(req.method==='GET'&&url==='/api/prepaid/status'){json(await service.status());return;}
    if(req.method!=='POST'||!origin)throw new GatewayError(403,'Use a same-origin credit request');
    if(!req.headers['content-type']?.startsWith('application/json'))throw new GatewayError(415,'Use JSON');
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>20_000_000)throw new GatewayError(413,'Credit request too large');chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError(400,'Invalid JSON');}
    if(url==='/api/prepaid/test-funds'){if(typeof body?.recipient!=='string'||!/^0x[0-9a-f]{40}$/i.test(body.recipient))throw new GatewayError(400,'Invalid test wallet');json(await service.relay.source.fundTestWallet(body.recipient));return;}
    if(url==='/api/prepaid/start'){json(service.start(body),202);return;}
    if(url==='/api/prepaid/poll'){json(service.poll(body?.id));return;}
    if(url==='/api/prepaid/reply'){service.reply(body?.id,body?.requestId,body?.value,body?.error);json({ok:true});return;}
    if(url==='/api/prepaid/reconcile'){json(await service.reconcile(body?.note));return;}
    if(url==='/api/prepaid/recover'){json(await service.recover(body?.seed));return;}
    if(url==='/api/prepaid/payment'){json(await service.payment(body?.note));return;}
    if(url==='/api/prepaid/inference'){
     const request=validateRequest(body);
     const upstream=await fetch(`${options.gatewayUrl}/v1/inference`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(385000)});
     const answer=await upstream.json();json(answer,upstream.status);
     // Settlement is independent of retryable inference; the private credit was consumed on Midnight.
     void service.relay.drain().catch(()=>{});return;
    }
    throw new GatewayError(404,'Unknown prepaid request');
   }
   if(options.browserVault&&url.startsWith('/api/vault/')){
    if(req.method==='GET'&&url==='/api/vault/status'){json(await options.browserVault.status());return;}
    if(req.method!=='POST'||!origin)throw new GatewayError(403,'Use a same-origin vault request');
    if(!req.headers['content-type']?.startsWith('application/json'))throw new GatewayError(415,'Use JSON');
    let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>20_000_000)throw new GatewayError(413,'Vault request too large');chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError(400,'Invalid JSON');}
    if(url==='/api/vault/redeem'){json(options.browserVault.startRedemption(body),202);return;}
    if(url==='/api/vault/inference'){
     const request=validateRequest(body);
     const upstream=await fetch(`${options.gatewayUrl??'http://127.0.0.1:8787'}/v1/inference`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(385000)});
     const answer=await upstream.json();json(answer,upstream.status);return;
    }
    if(url==='/api/vault/start'){json(options.browserVault.start(body),202);return;}
    if(url==='/api/vault/poll'){json(options.browserVault.poll(body?.id));return;}
    if(url==='/api/vault/reply'){options.browserVault.reply(body?.id,body?.requestId,body?.value,body?.error);json({ok:true});return;}
    if(url==='/api/vault/allowance'){json(await options.browserVault.allowances(body?.credits));return;}
    if(url==='/api/vault/reconcile'){json(await options.browserVault.reconcile(body?.note));return;}
    throw new GatewayError(404,'Unknown vault request');
   }
   if(req.method==='GET'&&url==='/api/state'){json({credits:credits(),jobs:[...jobs.values()],busy,vaultBusy:options.prepaidVault?.busy??options.browserVault?.busy??false,funding:options.funding??'simulated-yield',models:options.models??[],defaultModel:options.defaultModel,adapter:options.adapter??'unknown',model:options.model,network:options.network??'local',vault:options.vault??'',yield:options.funding==='prepaid'?'NONE':'SIMULATED'});return;}
   if(req.method!=='POST'||url!=='/api/ask')throw new GatewayError(404,'Not found');
   if(!origin)throw new GatewayError(403,'Origin required');
   if(!req.headers['content-type']?.startsWith('application/json'))throw new GatewayError(415,'Use JSON');
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of req){size+=chunk.length;if(size>20000)throw new GatewayError(413,'Request too large');chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError(400,'Invalid JSON');}
   const {credit,prompt,model}=body??{};
   if(model!==undefined&&(typeof model!=='string'||!options.models?.some(entry=>entry.id===model)))throw new GatewayError(400,'Choose an available model');
   if(typeof prompt!=='string'||!prompt.trim()||Buffer.byteLength(prompt)>16000)throw new GatewayError(400,'Prompt must contain 1–16000 bytes');
   if(typeof credit!=='string'||!credits().some(c=>c.id===credit))throw new GatewayError(400,'Choose a credit from this local session');
   const previous=[...jobs.values()].find(j=>j.credit===credit);
   if(previous&&(previous.prompt!==prompt||previous.model!==model))throw new GatewayError(409,'This credit is bound to its original prompt. Choose a fresh credit.');
   if(previous?.status==='done'){json(previous);return;}
   if(busy)throw new GatewayError(409,'Wait for the current proof/inference to finish');
   if(jobs.size>=100&&!previous)throw new GatewayError(409,'Session history is full. Restart the local terminal.');
   const file=realpathSync(join(directory,credit));
   if(file!==join(directory,credit))throw new GatewayError(400,'Linked credit files are not permitted');
   const job:Job=previous??{id:randomUUID(),credit,prompt,model,status:'working'};
   job.status='working';job.startedAt=Date.now();job.stage='starting';delete job.error;jobs.set(job.id,job);busy=true;
   void (options.run??runCredit)(file,prompt,stage=>{job.stage=stage;},model).then(answer=>{job.answer=answer;job.status='done';}).catch(()=>{job.status='failed';job.error='No completed response. Retry this exact prompt with the same credit. If it remains uncertain, use operator reconciliation.';}).finally(()=>{busy=false;});
   json(job,202);
  }catch(e){json({error:e instanceof GatewayError?e.message:'Local terminal unavailable'},e instanceof GatewayError?e.status:503);}
 });
 let settlements:ReturnType<typeof setInterval>|undefined;
 if(options.prepaidVault){app.on('listening',()=>{settlements=setInterval(()=>{void options.prepaidVault!.relay.drain().catch(()=>{});},15000);settlements.unref();});app.on('close',()=>{if(settlements)clearInterval(settlements);});}
 return app;
}
export function localCreditDirectory(root:string,input:string){
 const base=realpathSync(resolve(root,'.private-states')),dir=realpathSync(resolve(root,input));
 if(!dir.startsWith(base+'/'))throw new Error('Terminal credits must be inside .private-states');
 return dir;
}
