// Offline release boundary checks; never print possible credential values.
import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const worker=await readFile('dist/sw.js','utf8'),shell=JSON.parse(worker.match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set([...shell,'sw.js','.nojekyll','rocket.png']);
let bytes=0;const manifest=[];
for(const name of await readdir('dist')){
  if(!allowed.has(name) || !(await stat('dist/'+name)).isFile())throw new Error(`Unexpected deploy asset: ${name}`);
  const body=await readFile('dist/'+name);bytes+=body.length;
  manifest.push({file:name,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});
}
for(const name of allowed)await stat('dist/'+name);
if(bytes>2*1024*1024)throw new Error('Public artifact exceeds the 2 MiB release budget');
const sourceFiles=spawnSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).stdout.trim().split('\n');
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,/\bAKIA[A-Z0-9]{16}\b/,/\bgh[pousr]_[A-Za-z0-9]{36,}\b/];
for(const file of sourceFiles){
  if(!/\.(?:js|mjs|cjs|json|ya?ml|md|html|css|toml)$/.test(file))continue;
  const text=await readFile(file,'utf8');if(patterns.some(pattern=>pattern.test(text)))throw new Error(`Possible credential in ${file}; run redacted Gitleaks locally`);
}
const html=await readFile('dist/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML IDs');
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(https?:|data:)/.test(m[1]))continue;
  if(!allowed.has(m[1]))throw new Error(`Unreviewed local HTML asset: ${m[1]}`);
}
console.log(JSON.stringify({status:'passed',artifactBytes:bytes,runtimeThirdPartyScripts:0,files:manifest},null,2));
