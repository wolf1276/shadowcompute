import { it,expect } from 'vitest';
import { CompactInferenceAdapter,compactSource } from '../src/compact-inference.js';
import { Gateway,InferenceError } from '../src/gateway.js';
import { bytes32,pureCircuits } from '../../contracts/contract/index.js';
const good='```compact\npragma language_version 0.28;\nimport CompactStandardLibrary;\nexport ledger count: Counter;\nexport circuit tick(): [] { count.increment(1); }\n```';
const bad='```compact\npragma language_version 0.28;\nimport CompactStandardLibrary;\nexport circuit tick(): [] { this is not Compact; }\n```';
it('repairs using actual compiler diagnostics under one paid gateway admission',async()=>{
 const prompts:string[]=[];const model={async infer(p:string){prompts.push(p);return prompts.length===1?bad:good;}};
 const instance=bytes32(),bearer=bytes32(),nullifier=Buffer.from(bytes32()).toString('hex');
 const g=new Gateway({instance,async receipt(){return {binding:pureCircuits.receiptBinding(bearer,instance),expires:BigInt(Math.floor(Date.now()/1000)+300)};}},new CompactInferenceAdapter(model),':memory:');
 const request={prompt:'Write a Compact counter',redemption:{nullifier,bearer:Buffer.from(bearer).toString('hex')}};
 try{
  const response=await g.infer(request);expect(response.response).toContain('syntax/type check passed');expect(prompts).toHaveLength(2);expect(prompts[1]).toContain('Compiler diagnostics:');expect(prompts[1]).toContain('parse error');
  expect((await g.infer(request)).cached).toBe(true);expect(prompts).toHaveLength(2);
  expect(g.db.prepare('SELECT count(*) AS n FROM requests').get()?.n).toBe(1);
 }finally{g.close();}
});
it('stops after three invalid drafts and permits reconciliation/retry without a new credit',async()=>{
 let calls=0;const adapter=new CompactInferenceAdapter({async infer(){calls++;return bad;}});
 const error=await adapter.infer('Write a counter').catch(e=>e);
 expect(error).toBeInstanceOf(InferenceError);expect(error.safeToRetry).toBe(true);expect(calls).toBe(3);
});
it('rejects wrong versions, external includes and nonstandard imports before compilation',()=>{
 for(const source of ['pragma language_version 0.23;','pragma language_version 0.28; include "private-file";','pragma language_version 0.28; import OtherLibrary;'])expect(()=>compactSource(source)).toThrow();
 expect(compactSource(good)).toContain('export circuit tick');
});
