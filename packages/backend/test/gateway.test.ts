import { describe,it,expect } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Gateway,MockAdapter,ProviderAdapter,InferenceError,validateRequest,type ReceiptSource } from '../src/gateway.js';
import { bytes32,pureCircuits } from '../../contracts/contract/index.js';
const hex=(x:Uint8Array)=>Buffer.from(x).toString('hex');
function fixture(){
 const bearer=bytes32(),n=bytes32(),instance=bytes32();
 const receipt={binding:pureCircuits.receiptBinding(bearer,instance),expires:2000n};
 const source:ReceiptSource={instance,receipt:async(key)=>hex(key)===hex(n)?receipt:null};
 const body={prompt:'test prompt',redemption:{nullifier:hex(n),bearer:hex(bearer)}};
 return {source,body,receipt};
}
describe('anonymous inference gateway (receipt source injected; chain verification covered by local suite)',()=>{
 it('rejects malformed, absent, mismatched and expired receipts',async()=>{
  const f=fixture(),g=new Gateway(f.source,new MockAdapter(),':memory:',()=>1000000);
  try{
   for(const b of [null,{}, {prompt:'',redemption:{}},{prompt:'x'.repeat(16001),redemption:f.body.redemption}])expect(()=>validateRequest(b)).toThrow();
   await expect(g.infer({...f.body,redemption:{...f.body.redemption,nullifier:hex(bytes32())}})).rejects.toThrow(/valid finalized/);
   await expect(g.infer({...f.body,redemption:{...f.body.redemption,bearer:hex(bytes32())}})).rejects.toThrow(/valid finalized/);
   f.receipt.expires=999n;await expect(g.infer(f.body)).rejects.toThrow(/expired/);
  }finally{g.close();}
 });
 it('charges once across retries and process restarts and refuses another prompt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'shadow-gateway-')),path=join(dir,'test.db'),f=fixture();let calls=0;
  const adapter={async infer(){calls++;return 'actual result';}};
  let g=new Gateway(f.source,adapter,path,()=>1000000);
  try{
   expect((await g.infer(f.body)).cached).toBe(false);g.close();g=new Gateway(f.source,adapter,path,()=>3000000);
   expect((await g.infer(f.body)).cached).toBe(true);expect(calls).toBe(1);
   await expect(g.infer({...f.body,prompt:'changed'})).rejects.toThrow(/another request/);
   await expect(g.infer({...f.body,redemption:{...f.body.redemption,bearer:hex(bytes32())}})).rejects.toThrow();
  }finally{g.close();rmSync(dir,{recursive:true});}
 });
 it('serializes concurrent requests, including separate gateway instances on one database',async()=>{
  const f=fixture(),dir=mkdtempSync(join(tmpdir(),'shadow-race-')),path=join(dir,'test.db');let finish!:(x:string)=>void;let calls=0;
  const adapter={infer:async()=>{calls++;return new Promise<string>(r=>{finish=r;});}};
  const a=new Gateway(f.source,adapter,path,()=>1000000),b=new Gateway(f.source,adapter,path,()=>1000000);
  try{
   const first=a.infer(f.body);await new Promise(r=>setTimeout(r,5));
   await expect(b.infer(f.body)).rejects.toThrow(/pending|admitted/);finish('done');await first;expect(calls).toBe(1);
  }finally{a.close();b.close();rmSync(dir,{recursive:true});}
 });
 it('lets known failures retry the same paid request without a second credit',async()=>{
  const f=fixture();let calls=0;
  const g=new Gateway(f.source,{async infer(){if(++calls===1)throw new InferenceError(true);return 'recovered';}},':memory:',()=>1000000);
  try{await expect(g.infer(f.body)).rejects.toThrow(/without another credit/);expect((await g.infer(f.body)).response).toBe('recovered');expect(calls).toBe(2);}finally{g.close();}
 });
 it('holds uncertain provider outcomes for reconciliation instead of blindly running twice',async()=>{
  const f=fixture();let calls=0;
  const g=new Gateway(f.source,{async infer(){calls++;throw new Error('sensitive provider error');}},':memory:',()=>1000000);
  try{await expect(g.infer(f.body)).rejects.toThrow(/uncertain/);await expect(g.infer(f.body)).rejects.toThrow(/reconciliation/);expect(calls).toBe(1);}finally{g.close();}
 });
 it('executes the real HTTP provider adapter with configured auth, model and response parsing',async()=>{
  let payload:unknown,auth:unknown;
  const app=createServer(async(req,res)=>{auth=req.headers.authorization;const chunks=[];for await(const c of req)chunks.push(c);payload=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'provider output'}}]}));});
  await new Promise<void>(r=>app.listen(0,'127.0.0.1',r));
  try{
   const port=(app.address() as {port:number}).port;
   const provider=new ProviderAdapter(`http://127.0.0.1:${port}/chat/completions`,'test-key','test-model');
   expect(await provider.infer('private prompt')).toBe('provider output');expect(auth).toBe('Bearer test-key');
   expect(payload).toMatchObject({model:'test-model',messages:[{role:'user',content:'private prompt'}]});
  }finally{await new Promise<void>(r=>app.close(()=>r()));}
 });
});
