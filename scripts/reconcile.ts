import { DatabaseSync } from 'node:sqlite';
const [nullifier,action,response]=process.argv.slice(2);
if(!nullifier||!/^[0-9a-f]{64}$/.test(nullifier)||!['retry','complete'].includes(action??''))throw new Error('Usage: npm run reconcile -- NULLIFIER retry | complete RESPONSE');
if(action==='complete'&&!response)throw new Error('A recovered provider response is required');
const db=new DatabaseSync(process.env.GATEWAY_DB??'.private-states/gateway.db');
try{
 const result=db.prepare("UPDATE requests SET status=?,response=?,updated=? WHERE nullifier=? AND status IN ('pending','uncertain')").run(action==='retry'?'retryable':'done',action==='complete'?response:null,Date.now(),nullifier);
 if(result.changes!==1)throw new Error('No pending/uncertain request found');
 console.info('Reconciled request. Retry uses the original paid receipt. Confirm the previous provider call did not complete before choosing retry.');
}finally{db.close();}
