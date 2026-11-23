import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
const output=new URL('./dist/',import.meta.url);
test('publishes only the static asset allowlist and resolves every local module import',async()=>{
 const files=await readdir(output);
 assert.deepEqual(files.sort(),['index.html','app.js','style.css','city.png','wallet.js','capacity.js','vault.js','vault-store.js','vault-passkey.js','experience.js','prepaid.js','prepaid-notes.js','transport.js','mera.js','compact-example.js','deployment.json'].sort());
 for(const name of files.filter(name=>name.endsWith('.js'))){const source=await readFile(new URL(name,output),'utf8');for(const match of source.matchAll(/from\s*['"]\.\/([^'"]+)['"]/g))assert(files.includes(match[1]),`Unresolved browser module ${match[1]}`);}
 const deployment=JSON.parse(await readFile(new URL('deployment.json',output),'utf8'));assert.equal(deployment.publicPrepaidContractsDeployed,false);assert.match(deployment.backend,/companion/);
 const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8'));const csp=config.headers[0].headers.find(header=>header.key==='Content-Security-Policy').value;assert(csp.includes("script-src 'self'"));assert(!csp.includes('unsafe-eval'));assert(!csp.includes('https://*'));
});
