import { it,expect } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenCodeAdapter,parseOpenCodeOutput } from '../src/opencode.js';
const success=JSON.stringify({type:'text',part:{type:'text',text:'Real answer'}})+'\n'+JSON.stringify({type:'step_finish',part:{reason:'stop'}})+'\n';
it('accepts only a completed, text-only OpenCode answer',()=>{
 expect(parseOpenCodeOutput(success)).toBe('Real answer');
 for(const s of ['',JSON.stringify({type:'text',part:{text:'unfinished'}}),success+JSON.stringify({type:'error'}),'garbage',success+JSON.stringify({type:'tool_use',part:{type:'tool'}})])expect(()=>parseOpenCodeOutput(s)).toThrow();
 expect(()=>new OpenCodeAdapter({model:'opencode/paid-model'})).toThrow(/free/);
});
it('uses stdin, isolated config, denied tools and no inherited vault secrets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-cli-test-')),binary=join(dir,'fake-opencode');
 const skill=join(dir,'SKILL.md');writeFileSync(skill,'Mandatory Compact 0.28 context fixture');
 const profile=join(dir,'profile.json');writeFileSync(profile,JSON.stringify({provider:{demo:{npm:'test'}},agent:{evil:{}},mcp:{evil:{}}}));
 const script=`#!/usr/bin/env node
let prompt='';for await(const chunk of process.stdin)prompt+=chunk;
const c=JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);
if(!prompt.endsWith('a prompt; $(touch bad)')||!prompt.includes('Mandatory Compact 0.28 context fixture')||process.argv.includes(prompt)||process.env.PRIVATE_STATE_PASSWORD||c.permission['*']!=='deny'||c.tools['*']!==false||c.mcp||c.agent.evil||c.share!=='disabled'||!c.agent.shadow.prompt.includes('Mandatory Compact 0.28 context fixture')||c.agent.shadow.steps!==2)process.exit(2);
process.stdout.write(${JSON.stringify(success)});`;
 writeFileSync(binary,script,{mode:0o700});const old=process.env.PRIVATE_STATE_PASSWORD;process.env.PRIVATE_STATE_PASSWORD='must-not-leak';
 try{expect(await new OpenCodeAdapter({model:'demo/free',profile,binary,skillPath:skill}).infer('a prompt; $(touch bad)')).toBe('Real answer');}
 finally{if(old===undefined)delete process.env.PRIVATE_STATE_PASSWORD;else process.env.PRIVATE_STATE_PASSWORD=old;rmSync(dir,{recursive:true});}
});
it('fails closed on subprocess timeout or missing executable',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'shadow-cli-timeout-')),binary=join(dir,'sleep');
 writeFileSync(binary,'#!/usr/bin/env node\nsetInterval(()=>{},1000);',{mode:0o700});
 try{
  await expect(new OpenCodeAdapter({model:'opencode/beam-free',binary,timeoutMs:100}).infer('test')).rejects.toThrow();
  await expect(new OpenCodeAdapter({model:'opencode/beam-free',binary:join(dir,'absent')}).infer('test')).rejects.toThrow();
 }finally{rmSync(dir,{recursive:true});}
});
