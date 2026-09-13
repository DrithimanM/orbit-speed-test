const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
test('local server enforces security headers and exposes only public assets',async t=>{
  const child=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  const port=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server start timed out')),5000);
    child.stdout.on('data',data=>{const match=String(data).match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
    child.on('error',reject);child.on('exit',code=>{if(code)reject(new Error('Server failed'));});
  });
  const call=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
      let body='';res.on('data',data=>body+=data);res.on('end',()=>resolve({code:res.statusCode,headers:res.headers,body}));
    });req.on('error',reject);req.end();
  });
  const page=await call('/');assert.equal(page.code,200);
  assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal(page.headers['x-frame-options'],'DENY');assert.equal(page.headers['x-content-type-options'],'nosniff');
  assert.match(page.headers['permissions-policy'],/geolocation=\(self\)/);
  assert.equal(page.headers['referrer-policy'],'no-referrer');
  for(const path of ['/../README.md','/%2e%2e/README.md','/.git/config','/scripts/serve.mjs','/tests/security.test.cjs','/package.json'])assert.equal((await call(path)).code,404,path);
  assert.equal((await call('/',{host:'attacker.example'})).code,403);
  assert.equal((await call('/',{origin:'https://attacker.example'})).code,403);
  assert.equal((await call('/',{},'POST')).code,405);
  assert.equal((await call('/app.js',{},'HEAD')).body,'');
  assert.match((await call('/app.js')).headers['content-type'],/javascript/);
});
