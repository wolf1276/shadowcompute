import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {terminalServer} from '../src/terminal.js';
import type {PrepaidVault} from '../src/prepaid-vault.js';
it('protects prepaid routes and forwards only model, prompt and anonymous receipt to inference',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-prepaid-http-'));let forwarded:unknown;
 const upstream=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);forwarded=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('content-type','application/json');res.end(JSON.stringify({response:'Test answer',chargedCredits:1,cached:false}));});await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const service={busy:false,async status(){return {funding:'prepaid'};},async payment(){return {commitment:'public commitment'};},start(){return {id:'private-credit-job',status:'working'};},relay:{async drain(){}}} as unknown as PrepaidVault;
 const app=terminalServer({directory:dir,assets:resolve('packages/terminal'),model:'test',funding:'prepaid',prepaidVault:service,gatewayUrl:`http://127.0.0.1:${(upstream.address() as {port:number}).port}`,models:[{id:'test-model',label:'Test',adapter:'mock',credits:1}]});await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(app.address() as {port:number}).port}`;
 try{
  expect((await fetch(url+'/prepaid.js')).status).toBe(200);expect((await fetch(url+'/prepaid-notes.js')).status).toBe(200);
  expect((await fetch(url+'/api/prepaid/status')).status).toBe(403);const {token}=await(await fetch(url+'/api/session')).json();const headers={origin:url,'content-type':'application/json','x-console-token':token};
  expect((await fetch(url+'/api/prepaid/status',{headers})).status).toBe(200);
  expect((await fetch(url+'/api/prepaid/start',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'})).status).toBe(403);
  const started=await fetch(url+'/api/prepaid/start',{method:'POST',headers,body:'{}'});expect(started.status).toBe(202);
  const state=await(await fetch(url+'/api/state',{headers})).text();expect(state).not.toContain('private-credit-job');expect(JSON.parse(state)).toMatchObject({funding:'prepaid',yield:'NONE'});
  const request={prompt:'Test prompt',model:'test-model',redemption:{nullifier:'aa'.repeat(32),bearer:'bb'.repeat(32)}};
  const response=await fetch(url+'/api/prepaid/inference',{method:'POST',headers,body:JSON.stringify({...request,seed:'PRIVATE NOTE SEED',wallet:'PRIVATE WALLET'})});expect(response.status).toBe(200);expect(forwarded).toEqual(request);expect(await response.text()).not.toContain('PRIVATE');
 }finally{await new Promise<void>(r=>app.close(()=>r()));await new Promise<void>(r=>upstream.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
