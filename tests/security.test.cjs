const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const security=require('../dist/security.js');
const page='https://example.github.io/orbit-speed-test/';
const catalog=JSON.parse(fs.readFileSync('dist/servers.json','utf8'));
test('only reviewed HTTPS destinations and the local catalog are allowed',()=>{
  assert.equal(security.approvedURL('servers.json',page),page+'servers.json');
  for(const url of ['http://example.com','https://127.0.0.1','https://2130706433','https://[::1]','https://169.254.169.254/latest/meta-data','https://evil.example/a','https://stat.ripe.net/other','https://stat.ripe.net:444/data/network-info/data.json','https://user:pass@speed.cloudflare.com/__down','//evil.example/a','javascript:alert(1)','data:text/html,a','/secrets'])assert.throws(()=>security.approvedURL(url,page),url);
  assert.ok(security.approvedURL('https://speed.cloudflare.com/__down?bytes=100',page));
});
test('catalog URLs cannot expand the allowlist or inject credentials or paths',()=>{
  const item=catalog.servers[0];assert.equal(security.approvedServer(item),true);
  for(const patch of [{server:'https://evil.example/'},{server:'https://127.0.0.1/'},{dlURL:'https://evil.example/steal'},{dlURL:'//evil.example/steal'},{dlURL:'garbage.php?redirect=evil'},{name:'x'.repeat(161)},{id:'1'},{server:item.server+'?redirect=evil'}])assert.equal(security.approvedServer({...item,...patch}),false,JSON.stringify(patch));
});
test('streamed binary bodies are counted without retained payloads',async()=>{
  assert.deepEqual(await security.readBody(new Response(new Uint8Array(64)),64),{byteLength:64});
});
test('oversized declared or streamed bodies are rejected',async()=>{
  await assert.rejects(security.readBody(new Response(new Uint8Array(65)),64),/safety limit/);
  await assert.rejects(security.readBody(new Response('x',{headers:{'content-length':'999'}}),64),/safety limit/);
});
test('JSON is bounded and malformed JSON is rejected',async()=>{
  assert.deepEqual(await security.readBody(new Response('{"a":1}'),64,true),{a:1});
  await assert.rejects(security.readBody(new Response('not JSON'),64,true));
  await assert.rejects(security.readBody(new Response('x'.repeat(100)),64,true),/safety limit/);
});
test('corrupt history cannot enter rating and graph rendering',()=>{
  const record={id:'test',date:'2026-09-12T10:00:00Z',server:'Example',status:'running',pings:[],download:null,upload:null};
  assert.equal(security.validRecord(record),true);
  for(const patch of [{date:'bad'},{status:'complete'},{pings:[Infinity]},{pings:new Array(101).fill(1)},{server:'x'.repeat(201)},{download:{points:[{}]}}])assert.equal(security.validRecord({...record,...patch}),false);
});
test('static policy blocks inline scripts, objects, forms and referrer leakage',()=>{
  const html=fs.readFileSync('dist/index.html','utf8');
  assert.match(html,/script-src 'self'/);assert.match(html,/object-src 'none'/);assert.match(html,/base-uri 'none'/);assert.match(html,/form-action 'none'/);assert.match(html,/name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html,/unsafe-inline|unsafe-eval|\son\w+=/i);
  const app=fs.readFileSync('dist/app.js','utf8');
  assert.doesNotMatch(app,/innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/);
  assert.match(app,/redirect:'error'/);assert.match(app,/credentials:'omit'/);
});
test('the CSP includes every reviewed endpoint origin',()=>{
  const html=fs.readFileSync('dist/index.html','utf8');
  for(const item of catalog.servers){const url=new URL(item.server);assert.ok(html.includes(url.origin),url.origin);}
});
test('IP metadata is syntax-checked before ISP lookup',()=>{
  for(const ip of ['192.0.2.1','2001:db8::1','::ffff:192.0.2.1'])assert.equal(security.validIP(ip),true,ip);
  for(const ip of ['999.1.2.3','192.0.2.1&resource=secret','example.com','<script>','1:2:3:4:5:6:7:8:9','x'.repeat(100),null])assert.equal(security.validIP(ip),false,String(ip));
});
test('history rejects hidden fields and extreme values',()=>{
  const record={id:'test',date:'2026-09-12T10:00:00Z',server:'Example',status:'running',pings:[],download:null,upload:null};
  for(const patch of [{ip:'192.0.2.1'},{location:[1,2]},{finished:'invalid'},{serverId:{}},{pings:[Number.MAX_VALUE]}])assert.equal(security.validRecord({...record,...patch}),false);
});
test('Pages workflow uses immutable action revisions and deploys only the static directory',()=>{
  const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
  const actions=[...workflow.matchAll(/uses:\s+([^\s]+)/g)].map(match=>match[1]);
  assert.ok(actions.length>=4);
  for(const action of actions)assert.match(action,/^actions\/[\w-]+@[a-f0-9]{40}$/);
  assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/path: dist/);assert.doesNotMatch(workflow,/pull_request_target/);
});
test('new measurement diagnostics stay bounded and legacy history remains valid',()=>{
  const base={id:'legacy',date:'2026-09-13T10:00:00Z',server:'Example',status:'running',pings:[],download:null,upload:null};
  assert.equal(security.validRecord(base),true);
  const transfer={bytes:10,durationMs:100,transferMs:100,mbps:.0008,points:[],loadedPings:[10],probeFailures:0,requests:1,retries:0};
  assert.equal(security.validRecord({...base,streams:4,measurementVersion:2,download:transfer}),true);
  for(const patch of [{streams:8},{measurementVersion:3},{recoveryFrom:'x'.repeat(201)},{download:{...transfer,loadedPings:[Infinity]}},{download:{...transfer,loadedPings:Array(101).fill(1)}},{download:{...transfer,requests:1001}},{download:{...transfer,probeFailures:-1}},{download:{...transfer,ip:'192.0.2.1'}}])assert.equal(security.validRecord({...base,...patch}),false);
});

test('network labels are bounded and radio generations require a manual source',()=>{
  const network={type:'5g',source:'manual',effectiveType:'4g',saveData:false};
  assert.equal(security.validNetwork(network),true);
  for(const patch of [{source:'browser'},{ip:'192.0.2.1'},{ssid:'home'},{effectiveType:'5g'},{saveData:'false'},{type:'<img>'}])assert.equal(security.validNetwork({...network,...patch}),false);
  const record={id:'test',date:'2026-09-13T10:00:00Z',server:'Example',status:'running',pings:[],download:null,upload:null,network};
  assert.equal(security.validRecord(record),true);assert.equal(security.validRecord({...record,network:{...network,ip:'192.0.2.1'}}),false);
});
test('reviewed catalog additions and metadata retain exact URL boundaries',()=>{
  assert.equal(catalog.servers.length,26);assert.ok(catalog.servers.every(security.approvedServer));
  for(const host of ['man','dal','ash','phx'])assert.ok(security.approvedURL(`https://${host}.speedtest.clouvider.net/backend/empty.php?cors=true`,page));
  assert.ok(security.approvedURL('https://stat.ripe.net/data/whats-my-ip/data.json',page));
  assert.ok(security.approvedURL('https://librespeed.org/backend-servers/servers.php',page));
  assert.throws(()=>security.approvedURL('https://librespeed.org/other',page));
  assert.throws(()=>security.approvedURL('https://chi.speedtest.clouvider.net/backend/empty.php',page));
});
