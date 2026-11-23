import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({
 entryPoints:['scripts/mera-browser.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'packages/terminal/mera.js',
 banner:{js:`/* @license Mera 0.2.0\n${readFileSync('node_modules/@category-labs/mera/LICENSE-MIT','utf8')}\n*/`},
});

writeFileSync('packages/terminal/compact-example.js',`// Generated from the independently tested demo task.\nexport const compactExample=${JSON.stringify(readFileSync('demos/compact-prompt.txt','utf8'))};\n`);
