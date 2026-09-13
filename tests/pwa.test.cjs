const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('dist/sw.js','utf8');
function worker(base='https://example.github.io/orbit-speed-test/') {
  const handlers={}, deleted=[], opened=[], fetched=[], entries=[];
  const cache={addAll:async requests=>entries.push(...requests),match:async url=>({cached:url})};
  vm.runInNewContext(source,{
    URL,Request,self:{location:{href:base+'sw.js'},addEventListener:(name,fn)=>handlers[name]=fn},
    caches:{open:async name=>{opened.push(name);return cache;},keys:async()=>[
      'unrelated-app', 'orbit-shell:/another-app/:old', 'orbit-shell:/orbit-speed-test/:old', ...opened
    ],delete:async name=>deleted.push(name)},fetch:async request=>{fetched.push(request);return 'live';}
  });
  return {handlers,deleted,opened,fetched,entries,cache};
}
test('manifest launches inside its own scope at localhost and GitHub project paths',()=>{
  const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'Orbit Speed Test');
  for(const base of ['http://localhost:8000/','https://example.github.io/orbit-speed-test/']){
    for(const key of ['id','start_url','scope'])assert.equal(new URL(manifest[key],base).href,base);
    assert.equal(new URL(manifest.shortcuts[0].url,base).href,base+'#history-section');
  }
  for(const size of [192,512]){
    const icon=manifest.icons.find(item=>item.sizes===`${size}x${size}`);assert.ok(icon);
    const bytes=fs.readFileSync('dist/'+icon.src);
    assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  for(const [name,size] of [['favicon-48.png',48],['apple-touch-icon.png',180]]){const bytes=fs.readFileSync('dist/'+name);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
  assert.equal(manifest.shortcuts[0].icons.length,2);
  const html=fs.readFileSync('dist/index.html','utf8');
  assert.match(html,/href="favicon-48.png" type="image\/png" sizes="48x48"/);
  assert.match(html,/rel="apple-touch-icon" href="apple-touch-icon.png" sizes="180x180"/);
  assert.match(html,/manifest-src 'self'/);assert.match(html,/worker-src 'self'/);
  assert.match(html,/trusted-types orbit-worker; require-trusted-types-for 'script'/);
});
test('worker precaches only the bounded local shell, without credentials or redirects',async()=>{
  const w=worker();let installation;
  w.handlers.install({waitUntil:promise=>installation=promise});await installation;
  assert.ok(w.entries.length>0 && w.entries.length<20);
  for(const request of w.entries){
    const url=new URL(request.url);assert.equal(url.origin,'https://example.github.io');
    assert.equal(url.pathname.split('/')[1],'orbit-speed-test');
    assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');assert.equal(request.cache,'reload');
    assert.ok(fs.existsSync('dist/'+url.pathname.split('/').at(-1)));
  }
  assert.doesNotMatch(source,/skipWaiting\s*\(|clients\.claim\s*\(/);
});
test('measurements, metadata, uploads and unrelated same-origin resources bypass the worker',()=>{
  const w=worker();
  for(const [url,method] of [
    ['https://speed.cloudflare.com/__down?bytes=1000','GET'],
    ['https://stat.ripe.net/data/whats-my-ip/data.json','GET'],
    ['https://librespeed.org/backend-servers/servers.php','GET'],
    ['https://ash.speedtest.clouvider.net/backend/empty.php','POST'],
    ['https://example.github.io/orbit-speed-test/index.html','POST'],
    ['https://example.github.io/another-app/index.html','GET'],
    ['https://example.github.io/orbit-speed-test/unknown.json','GET']
  ]) w.handlers.fetch({request:new Request(url,{method}),respondWith:()=>assert.fail('Intercepted '+url)});
  assert.equal(w.opened.length,0);
});
test('offline navigation with a release query returns the canonical cached shell',async()=>{
  const w=worker();let response;
  w.handlers.fetch({request:new Request('https://example.github.io/orbit-speed-test/?release=abc'),respondWith:promise=>response=promise});
  assert.equal((await response).cached,'https://example.github.io/orbit-speed-test/index.html');
  assert.equal(w.fetched.length,0);
  w.cache.match=async()=>undefined;
  w.handlers.fetch({request:new Request('https://example.github.io/orbit-speed-test/app.js'),respondWith:promise=>response=promise});
  assert.equal(await response,'live');assert.equal(w.fetched.length,1);
});
test('activation removes only older caches for this exact app scope',async()=>{
  const w=worker();let install,activation;
  w.handlers.install({waitUntil:promise=>install=promise});await install;
  w.handlers.activate({waitUntil:promise=>activation=promise});await activation;
  assert.deepEqual(w.deleted,['orbit-shell:/orbit-speed-test/:old']);
});
test('a failed shell download rejects installation and leaves the active worker alone',async()=>{
  const w=worker();w.cache.addAll=async()=>{throw new Error('offline');};let installation;
  w.handlers.install({waitUntil:promise=>installation=promise});
  await assert.rejects(installation,/offline/);assert.equal(w.deleted.length,0);
});
