import { spawnSync } from 'node:child_process';
for (const name of ['smoke', 'test-token', 'shadow-vault', 'prepaid-credit']) {
 const p = spawnSync('compact', ['compile', '+0.36.1', ...(process.argv.includes('--skip-zk') ? ['--skip-zk'] : []), `packages/contracts/contract/${name}.compact`, `packages/contracts/contract/managed/${name}`], {stdio:'inherit'});
 if (p.status !== 0) process.exit(p.status ?? 1);
}
