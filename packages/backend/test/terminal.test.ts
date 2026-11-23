import {BrowserVault} from '../src/browser-vault.js';
import {LOCAL_CONFIG} from '../src/config.js';
import { it,expect,vi } from 'vitest';
import { request,createServer } from 'node:http';
import { mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { terminalServer,runCredit } from '../src/terminal.js';
import {savePrivate} from '../src/notes.js';
it('serves a local terminal, keeps credentials server-side and binds retries to one credit',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-terminal-'));
 writeFileSync(join(dir,'credit-1.json'),'SECRET CREDIT OPENING');writeFileSync(join(dir,'credit-2.json'),'SECOND SECRET');
 let calls=0;let finish!:(v:{response:string;chargedCredits:number;cached:boolean})=>void;
 const app=terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'local/test',network:'preview',vault:'test-vault',adapter:'opencode-compact',run:async(file,prompt,onProgress)=>{calls++;onProgress?.('authorizing');expect(file).toBe(join(dir,'credit-1.json'));expect(prompt).toBe('Write code');return new Promise(r=>{finish=r;});}});
 await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{
  expect((await fetch(url)).status).toBe(200);
  expect((await fetch(url+'/vault.js')).status).toBe(200);expect((await fetch(url+'/vault-store.js')).status).toBe(200);
  for(const asset of ['/vault-passkey.js','/mera.js','/experience.js','/compact-example.js']){const response=await fetch(url+asset);expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('text/javascript');if(asset==='/mera.js'){const source=await response.text();expect(source).toContain('Copyright (c) 2026 Category Labs');expect(source).toContain('decryptSecretVaultWithPasskey');}}
  const markup=await(await fetch(url)).text();expect(markup).toContain('id="vault-passkey-unlock"');expect(markup).toContain('id="vault-passkey-enable"');
  const background=await fetch(url+'/city.png');expect(background.status).toBe(200);expect(background.headers.get('content-type')).toBe('image/png');
  const {token}=await (await fetch(url+'/api/session')).json();
  expect((await fetch(url+'/api/state')).status).toBe(403);
  expect((await fetch(url+'/api/state',{headers:{'x-console-token':'z'.repeat(64)}})).status).toBe(403);
  expect((await fetch(url+'/api/session',{headers:{origin:'https://evil.example'}})).status).toBe(403);
  const badHost=await new Promise<number>(resolve=>{const r=request(url+'/api/session',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode!);});r.end();});expect(badHost).toBe(403);
  const headers={'x-console-token':token,origin:url,'content-type':'application/json'};
  const post=(credit:string,prompt:string)=>fetch(url+'/api/ask',{method:'POST',headers,body:JSON.stringify({credit,prompt})});
  const initial=await (await fetch(url+'/api/state',{headers})).text();expect(initial).not.toContain('SECRET');expect(initial).not.toContain(dir);expect(JSON.parse(initial)).toMatchObject({network:'preview',vault:'test-vault',adapter:'opencode-compact'});
  expect((await post('../credit-1.json','Write code')).status).toBe(400);
  expect((await post('credit-1.json','x'.repeat(21000))).status).toBe(413);
  const started=await post('credit-1.json','Write code');expect(started.status).toBe(202);expect(await started.json()).toMatchObject({stage:'authorizing',startedAt:expect.any(Number)});
  expect((await post('credit-2.json','Other')).status).toBe(409);
  finish({response:'Real result',chargedCredits:1,cached:false});await new Promise(r=>setTimeout(r,10));
  expect((await post('credit-1.json','Write code')).status).toBe(200);expect(calls).toBe(1);
  expect((await post('credit-1.json','Different prompt')).status).toBe(409);
  const state=await(await fetch(url+'/api/state',{headers})).json();expect(state.jobs[0].answer.response).toBe('Real result');
  symlinkSync('/etc/passwd',join(dir,'credit-3.json'));expect((await post('credit-3.json','Read')).status).toBe(400);
 }finally{await new Promise<void>(r=>app.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
it('preserves a failed request for same-credit retry without admitting a different prompt',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-terminal-'));writeFileSync(join(dir,'credit-1.json'),'private');let calls=0;
 const app=terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'test',run:async()=>{if(++calls===1)throw new Error('SECRET');return {response:'Recovered',chargedCredits:1,cached:false};}});
 await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{const {token}=await(await fetch(url+'/api/session')).json();const headers={origin:url,'content-type':'application/json','x-console-token':token};const post=()=>fetch(url+'/api/ask',{method:'POST',headers,body:JSON.stringify({credit:'credit-1.json',prompt:'same'})});await post();await new Promise(r=>setTimeout(r,10));const failed=await(await fetch(url+'/api/state',{headers})).text();expect(failed).not.toContain('SECRET');expect(failed).toContain('failed');await post();await new Promise(r=>setTimeout(r,10));expect(calls).toBe(2);const state=await(await fetch(url+'/api/state',{headers})).json();expect(state.jobs).toHaveLength(1);expect(state.jobs[0].answer.response).toBe('Recovered');}
 finally{await new Promise<void>(r=>app.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});

it('does not overwrite an unresolved redemption journal when the terminal retries',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-pending-')),file=join(dir,'credit-1.json');
 writeFileSync(file,'private note');writeFileSync(file+'.pending','original bearer recovery journal');
 try{await expect(runCredit(file,'same prompt')).rejects.toThrow('Keep this credit');expect(readFileSync(file+'.pending','utf8')).toBe('original bearer recovery journal');expect(existsSync(file+'.redemption')).toBe(false);}
 finally{rmSync(dir,{recursive:true,force:true});}
});

it('requires same-origin session authorization for private vault requests and does not list private jobs',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-vault-http-'));
 const vault=new BrowserVault(LOCAL_CONFIG,{address:'aa'.repeat(32),tokenAddress:'bb'.repeat(32),color:'cc'.repeat(32)});
 const start=vi.spyOn(vault,'start').mockReturnValue({id:'private-operation',status:'working'});
 const app=terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'test',browserVault:vault});
 await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{
  const {token}=await(await fetch(url+'/api/session')).json();
  const headers={'x-console-token':token,origin:url,'content-type':'application/json'};
  const body=JSON.stringify({action:'deposit',note:{secret:'PRIVATE OPENING'}});
  expect((await fetch(url+'/api/vault/start',{method:'POST',headers:{...headers,origin:'https://evil.example'},body})).status).toBe(403);
  expect(start).not.toHaveBeenCalled();
  expect((await fetch(url+'/api/vault/start',{method:'POST',headers,body})).status).toBe(202);expect(start).toHaveBeenCalledOnce();
  const state=await(await fetch(url+'/api/state',{headers})).text();expect(state).not.toContain('PRIVATE OPENING');expect(state).not.toContain('private-operation');
  expect((await fetch(url+'/api/vault/poll',{method:'POST',headers,body:JSON.stringify({id:'unknown'})})).status).toBe(404);
  expect((await fetch(url+'/api/vault/inference',{method:'POST',headers,body:'{}'})).status).toBe(400);
 }finally{await new Promise<void>(r=>app.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});

it('streams real CLI progress for a saved receipt without authorizing it again',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-progress-')),file=join(dir,'credit-1.json');
 savePrivate(file+'.redemption',{nullifier:'aa'.repeat(32),bearer:'bb'.repeat(32)});
 const upstream=createServer((req,res)=>{req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify({response:'Test model response',chargedCredits:1,cached:true}));});
 await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const original=process.env.GATEWAY_URL;process.env.GATEWAY_URL=`http://127.0.0.1:${(upstream.address() as {port:number}).port}`;
 try{const stages:string[]=[];const answer=await runCredit(file,'Same saved prompt',stage=>stages.push(stage));expect(stages).toEqual(['requesting-ai']);expect(answer.cached).toBe(true);expect(existsSync(file+'.pending')).toBe(false);}
 finally{if(original===undefined)delete process.env.GATEWAY_URL;else process.env.GATEWAY_URL=original;await new Promise<void>(resolve=>upstream.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}
});
