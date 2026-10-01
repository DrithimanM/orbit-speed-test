const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./app-harness.cjs');
const fs=require('node:fs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const binary=(bytes,ms=10)=>({body:{byteLength:bytes},response:{headers:new Headers({'content-type':'application/octet-stream'})},ms});
test('idle latency uses bounded GET, keeps every tail sample, and preserves first-byte timing',async()=>{
  const h=harness();let calls=0;
  h.ctx.fake=async(url,options,signal,timeout)=>{assert.deepEqual({...options},{});assert.equal(timeout,5000);calls++;return {...binary(0),ms:calls===11?1000:10,firstByteMs:5};};
  h.run('request=fake');const result=await h.ctx.measureApplicationLatency('https://speed.cloudflare.com/__down?bytes=0',new AbortController().signal);
  assert.equal(calls,11);assert.equal(result.samples.length,10);assert.equal(result.samples.at(-1),1000);assert.equal(result.median,10);assert.equal(result.firstByteMs,5);
});
test('latency cancellation aborts before further samples',async()=>{
  const h=harness(),controller=new AbortController();let calls=0;
  h.ctx.fake=async()=>{calls++;controller.abort();return binary(0);};h.run('request=fake');
  await assert.rejects(h.ctx.measureApplicationLatency('https://speed.cloudflare.com/__down?bytes=0',controller.signal),{name:'AbortError'});assert.equal(calls,1);
});
test('discovery respects each provider filter and never invents availability',async()=>{
  const catalog=JSON.parse(fs.readFileSync('dist/servers.json','utf8'));
  for(const filter of ['independent','Clouvider','Sharktech','Cloudflare','all']){
    const h=harness();h.element('provider-filter').value=filter;h.element('server-scope').value='all';h.ctx.catalog=catalog;
    h.run('request=async()=>({body:catalog});probe=async server=>{server.available=false;server.latency=null;}');
    await h.ctx.discoverServers();const servers=h.run('servers');assert.ok(servers.length);
    if(filter==='independent')assert.ok(servers.every(s=>s.type!=='cloudflare'));
    else if(filter!=='all')assert.ok(servers.every(s=>s.provider===filter));
    assert.ok(servers.every(s=>!s.available));assert.match(h.element('scan-status').textContent,/No reachable/);
    assert.equal(h.run('scanning'),false);
  }
});
test('all-server mode exposes the entire reviewed catalog within its bound',async()=>{
  const h=harness();h.ctx.catalog=JSON.parse(fs.readFileSync('dist/servers.json','utf8'));h.element('server-scope').value='all';
  h.run('request=async()=>({body:catalog});probe=async server=>{server.available=true;server.latency=10;}');await h.ctx.discoverServers();
  assert.equal(h.run('servers.length'),Math.min(40,h.ctx.catalog.servers.length+1));
});
async function phase({streams=3,direction='download',failure,cancel=false}={}){
  const h=harness(),abort=new AbortController();let active=0,maxActive=0,calls=0,successful=0;
  h.ctx.abort=abort;h.run('controller=abort');
  h.ctx.fake=async(url,options,signal)=>{
    if(new URL(url).searchParams.get('bytes')==='0')return binary(0,5);
    calls++;active++;maxActive=Math.max(maxActive,active);
    try {await wait(12);signal.throwIfAborted();if(failure && failure(calls))throw failure(calls);const bytes=direction==='download'?Number(new URL(url).searchParams.get('bytes')):options.body.byteLength;successful+=bytes;return binary(direction==='download'?bytes:0,12);}finally{active--;}
  };
  h.run('request=fake');const record={streams,pings:[10],status:'running'},run={durationMs:45,reserved:0};
  if(cancel)setTimeout(()=>abort.abort(),15);
  let error,result;try{result=await h.ctx.bandwidth({id:'cloudflare',type:'cloudflare',base:'https://speed.cloudflare.com/',provider:'Cloudflare'},direction,record,run);}catch(e){error=e;}
  return {h,error,result:result||record[direction],run,maxActive,calls,successful};
}
test('parallel throughput counts aggregate payload over one wall clock',async()=>{
  for(const direction of ['download','upload']){
    const p=await phase({direction});assert.equal(p.error,undefined);assert.equal(p.maxActive,3);assert.equal(p.result.bytes,p.successful);assert.equal(p.result.mbps,p.successful*8/p.result.durationMs/1000);assert.ok(p.run.reserved>=p.result.bytes);assert.ok(p.result.points.length);
  }
});
test('single stream stays single, retries are counted, and failed payloads are excluded',async()=>{
  const p=await phase({streams:1,failure:n=>n===1?new Error('Transient outage'):null});assert.equal(p.error,undefined);assert.equal(p.maxActive,1);assert.equal(p.result.retries,1);assert.equal(p.result.bytes,p.successful);assert.ok(p.run.reserved>p.result.bytes);
});
test('provider rejection is terminal and HTTP 429 is never immediately retried',async()=>{
  const error=Object.assign(new Error('Rate limited'),{status:429});const p=await phase({streams:1,failure:()=>error});assert.equal(p.error.status,429);assert.equal(p.calls,1);assert.equal(p.result.retries,0);
});
test('cancellation leaves a labelled partial phase and settles all workers',async()=>{
  const p=await phase({cancel:true});assert.equal(p.error.name,'AbortError');assert.ok(Number.isFinite(p.result.durationMs));assert.ok(Number.isFinite(p.result.mbps));assert.ok(p.result.requests<=6);
});
test('invalid binary payload fails instead of producing a successful speed score',async()=>{
  const h=harness();h.run('controller=new AbortController()');h.ctx.fake=async()=>binary(1);h.run('request=fake');
  const record={streams:1,status:'running'},run={durationMs:30,reserved:0};await assert.rejects(h.ctx.bandwidth({type:'cloudflare',base:'https://speed.cloudflare.com/'},'download',record,run),/Invalid or incomplete/);assert.equal(record.download.bytes,0);assert.equal(record.download.retries,1);
});
test('shared budget fails before issuing the request and never exceeds 8 GB',()=>{
  const h=harness(),run={reserved:7999999999};assert.throws(()=>h.ctx.reservePayload(run,2),/8 GB/);assert.equal(run.reserved,7999999999);h.ctx.reservePayload(run,1);assert.equal(run.reserved,8000000000);
});
test('automatic recovery makes separate attempts; manual selection and cancellation never switch',async()=>{
  for(const mode of ['auto','manual','cancel','rate-limit']){
    const h=harness();h.element('stream-count').value='3';let attempts=[];
    h.ctx.fake=async(server,run,recoveryFrom)=>{attempts.push({server:server.id,recoveryFrom});if(mode==='cancel'||mode==='rate-limit')run.stopped=true;return {status:attempts.length===1?'failed':'complete'};};
    h.run(`servers=[{id:'one',available:true,name:'One'},{id:'two',available:true,name:'Two'}];selectedId=${JSON.stringify(mode==='manual'?'one':'auto')};testAttempt=fake;renderServers=()=>{}`);
    await h.ctx.startTestUnlocked();assert.equal(attempts.length,mode==='auto'?2:1);if(mode==='auto')assert.equal(attempts[1].recoveryFrom,'One');assert.equal(h.run('controller'),null);
  }
});
test('origin-scoped lock prevents another tab from interfering with a measurement',async()=>{
  const h=harness({navigator:{onLine:true,locks:{request:async(name,opts,fn)=>{assert.equal(name,'orbit-speed-test:measurement');assert.equal(opts.ifAvailable,true);return fn(null);}}}});
  h.run('startTestUnlocked=()=>{throw new Error("Should not launch")}');const result=await h.ctx.startTest();assert.equal(result.error,'Another tab is measuring');
});
test('request boundary handles timeout and cancellation without leaking credentials or following redirects',async()=>{
  const h=harness({fetch:(url,options)=>new Promise((resolve,reject)=>{
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.cache,'no-store');
    options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});
  })});
  // Node's AbortSignal.timeout timer is unref'ed; the mocked fetch has no real socket.
  const keepAlive=setInterval(()=>{},1000);
  try {await assert.rejects(h.ctx.request('https://speed.cloudflare.com/__down?bytes=0',{},undefined,20),{name:'TimeoutError'});}finally{clearInterval(keepAlive);}
  const controller=new AbortController();const promise=h.ctx.request('https://speed.cloudflare.com/__down?bytes=0',{},controller.signal,1000);controller.abort();await assert.rejects(promise,{name:'AbortError'});
});
test('storage failure retains exportable session history and resets failed database handles',async()=>{
  let calls=0;
  const h=harness({indexedDB:{open(){calls++;const request={};setTimeout(()=>{request.error=new Error('Quota unavailable');request.onerror();},2);return request;}}});
  const record={id:'memory',date:new Date().toISOString(),status:'running',server:'Cloudflare',pings:[],download:null,upload:null,ip:'192.0.2.1'};
  await h.ctx.saveRecord(record);await h.ctx.saveRecord({...record,status:'cancelled'});assert.equal(calls,2);assert.equal(h.run('historyRecords.length'),1);assert.equal(h.run('historyRecords[0].status'),'cancelled');assert.equal(h.run('historyRecords[0].ip'),undefined);assert.match(h.element('storage-status').textContent,/could not be saved/);
});
test('storage timeout settles and a late successful open is safely closed',async()=>{
  let request,closed=false;
  const h=harness({indexedDB:{open(){request={};return request;}}});
  await assert.rejects(h.ctx.database(),/timed out/);request.result={close(){closed=true;}};request.onsuccess();assert.equal(closed,true);assert.equal(h.run('dbPromise'),null);
});
test('HTTP 429 stops endpoint recovery and preserves an explicitly failed history entry',async()=>{
  const h=harness();h.ctx.calls=[];h.run('controller=new AbortController();metadataUpdated=Date.now();saveRecord=async record=>calls.push({...record});request=async()=>{const error=new Error("HTTP 429");error.status=429;throw error;}');
  const run={streams:3,profile:'quick',durationMs:10,reserved:0,stopped:false};
  const record=await h.ctx.testAttempt({id:'cloudflare',name:'Cloudflare',type:'cloudflare',base:'https://speed.cloudflare.com/'},run);assert.equal(record.status,'failed');assert.equal(run.stopped,true);assert.equal(h.ctx.calls.length,2);assert.equal(h.ctx.calls.at(-1).status,'failed');
});
