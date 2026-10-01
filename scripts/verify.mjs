import {spawnSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
const run=args=>{const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);};
for(const dir of ['dist','scripts','tests'])for(const file of await readdir(dir))if(/\.(?:js|mjs|cjs)$/.test(file))run(['--check',dir+'/'+file]);
run(['scripts/version-shell.mjs','--check']);
run(['scripts/audit-assets.mjs']);
const tests=(await readdir('tests')).filter(file=>file.endsWith('.test.cjs')).map(file=>'tests/'+file);
run(['--test','--test-concurrency=1',...tests]);run(['tests/integration.cjs']);
if(process.argv.includes('--browser'))run(['tests/browser-release.cjs']);
