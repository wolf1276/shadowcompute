import {spawnSync} from 'node:child_process';
const result=spawnSync('compact',['compile','+0.36.1',...(process.argv.includes('--skip-zk')?['--skip-zk']:[]),'packages/contracts/contract/prepaid-credit.compact','packages/contracts/contract/managed/prepaid-credit'],{stdio:'inherit'});
process.exitCode=result.status??1;
