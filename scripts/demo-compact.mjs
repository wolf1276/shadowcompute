import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
assert.equal(process.env.AI_ADAPTER,'opencode-compact','Use the real compiler-validated OpenCode adapter for this demo');
const credit=process.argv[2];assert(credit,'Usage: npm run demo:compact -- PRIVATE_CREDIT_NOTE_FILE');
const dir=join('artifacts',`generated-budget-${Date.now()}`);mkdirSync(dir,{recursive:true});
const answerFile=join(dir,'answer.txt');
const prompt=readFileSync('demos/compact-prompt.txt','utf8');
const ai=spawnSync('npm',['run','ask','--',credit],{input:prompt,encoding:'utf8',timeout:450000,maxBuffer:2_000_000});
writeFileSync(answerFile,ai.stdout??'');
if(ai.status!==0){console.error(ai.stderr);throw new Error('Credit-gated generation did not succeed. Preserve its receipt; do not redeem another credit to retry the same request.');}
console.info(ai.stdout);
for(const args of [['run','check:generated','--',answerFile,dir],['run','deploy:generated','--',dir]]){
 const run=spawnSync('npm',args,{stdio:'inherit',timeout:300000});assert.equal(run.status,0,`Demo step failed: npm ${args.join(' ')}`);
}
const skill=process.env.OPENCODE_SKILL??'.opencode/skills/midnight-compact/SKILL.md';
const evidence={network:'undeployed',model:process.env.OPENCODE_MODEL,adapter:'OpenCode → local Ollama → Compact compiler',yield:'SIMULATED',creditCost:1,maximumDraftsPerAttempt:3,skill,skillSha256:createHash('sha256').update(readFileSync(skill)).digest('hex'),sourceSha256:createHash('sha256').update(readFileSync(join(dir,'private-budget.compact'))).digest('hex'),verification:JSON.parse(readFileSync(join(dir,'verification.json'),'utf8')),deployment:JSON.parse(readFileSync(join(dir,'deployment.json'),'utf8')),at:new Date().toISOString()};
writeFileSync(join(dir,'demo.json'),JSON.stringify(evidence,null,2));writeFileSync('artifacts/opencode-compact-demo.json',JSON.stringify(evidence,null,2));
console.info('One yield-funded credit → skill-guided local AI → compiler checked → behavior tested → real Midnight deployment/proof.');
