import {it,expect} from 'vitest';
import {ModelRouter} from '../src/models.js';
import {Gateway,type ReceiptSource} from '../src/gateway.js';
import {bytes32,pureCircuits} from '../../contracts/contract/index.js';
it('routes configured models and binds a paid receipt to both model and prompt',async()=>{
 let small=0,large=0;
 const router=new ModelRouter([{info:{id:'small',label:'Small model',adapter:'opencode',credits:1},adapter:{async infer(){small++;return 'small answer';}}},{info:{id:'large',label:'Large model',adapter:'opencode',credits:1},adapter:{async infer(){large++;return 'large answer';}}}],'small');
 const instance=bytes32(),bearer=bytes32(),nullifier=bytes32();const source:ReceiptSource={instance,async receipt(){return {binding:pureCircuits.receiptBinding(bearer,instance),expires:BigInt(Math.floor(Date.now()/1000)+300)};}};
 const gateway=new Gateway(source,router,':memory:');const request={prompt:'Same prompt',model:'small',redemption:{nullifier:Buffer.from(nullifier).toString('hex'),bearer:Buffer.from(bearer).toString('hex')}};
 try{
  await expect(gateway.infer({...request,model:'unconfigured'})).rejects.toThrow('available model');expect(gateway.db.prepare('SELECT count(*) AS n FROM requests').get()).toMatchObject({n:0});
  expect((await gateway.infer(request)).response).toBe('small answer');expect((await gateway.infer(request)).cached).toBe(true);await expect(gateway.infer({...request,model:'large'})).rejects.toThrow('another request');expect(small).toBe(1);expect(large).toBe(0);router.models.splice(0,1);expect((await gateway.infer(request)).cached).toBe(true);
  expect(await router.infer('Other prompt','large')).toBe('large answer');expect(large).toBe(1);
 }finally{gateway.close();}
});
it('does not admit malformed or duplicate model catalogs',()=>{
 const adapter={async infer(){return 'answer';}};
 expect(()=>new ModelRouter([],'missing')).toThrow('Invalid');expect(()=>new ModelRouter([{info:{id:'bad/id',label:'Model',adapter:'provider',credits:1},adapter}],'bad/id')).toThrow('Invalid');
});
