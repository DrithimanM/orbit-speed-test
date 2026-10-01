import {readFile,readdir} from 'node:fs/promises';
const directory=process.argv[2]||'coverage/codeql';
const files=(await readdir(directory)).filter(name=>name.endsWith('.sarif'));
if(!files.length)throw new Error('CodeQL produced no SARIF evidence');
let blocking=0;
for(const file of files){const report=JSON.parse(await readFile(directory+'/'+file,'utf8'));for(const run of report.runs||[]){const rules=run.tool?.driver?.rules||[];for(const result of run.results||[]){const rule=rules.find(rule=>rule.id===result.ruleId)||rules[result.ruleIndex];const severity=Number(rule?.properties?.['security-severity']);if(severity>=7 || result.level==='error'){blocking++;console.error(`Blocking SAST result: ${result.ruleId}`);}}}}
if(blocking)throw new Error(`${blocking} blocking CodeQL result(s)`);console.log('CodeQL SARIF gate: no security severity >= 7 or error-level results');
