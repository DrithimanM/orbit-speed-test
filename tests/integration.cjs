const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const core=fs.readFileSync('dist/core.js','utf8');
const source=fs.readFileSync('dist/app.js','utf8').split('// Interface event wiring.')[0];
const stored=new Map();
function setup(mode='good',geo='denied') {
  let tick=0;const elements=new Map();const urls=[];let geoCallbacks;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.textContent='';this.classList={toggle(){},remove(){}};this.value=0;this.hidden=false;}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}setAttribute(name,value){this.attrs[name]=value;}focus(){}addEventListener(){}scrollIntoView(){}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const db={transaction(){const tx={objectStore(){return {put(record){stored.set(record.id,structuredClone(record));queueMicrotask(()=>tx.oncomplete?.());},getAll(){const req={};queueMicrotask(()=>{req.result=[...stored.values()].map(v=>structuredClone(v));req.onsuccess?.();});return req;}};}};return tx;}};
  const context=vm.createContext({console,URL,URLSearchParams,TextDecoder,OrbitUI:{updateRoute(){},setCatalog(){},drawThroughput(){},renderRatings(){},renderTelemetry(){},renderHistory(){}},OrbitSecurity:require('../dist/security.js'),Option:class extends Element {constructor(text,value){super('option');this.textContent=text;this.value=value;}},document:{baseURI:'http://localhost:8000/',getElementById:el,createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),body:el('body'),querySelector:()=>el('dashboard')},navigator:{geolocation:geo==='unsupported'?undefined:{getCurrentPosition:(resolve,reject)=>{geoCallbacks={resolve,reject};if(geo==='granted')resolve({coords:{latitude:25.2,longitude:55.27}});else if(geo==='invalid')resolve({coords:{latitude:Infinity,longitude:55}});else if(geo==='denied')reject({code:1});}}},Intl:{DateTimeFormat:()=>({resolvedOptions:()=>({timeZone:'Asia/Dubai'})})},indexedDB:{open(){const req={};queueMicrotask(()=>{if(mode==='storage'){req.error=new Error('quota');req.onerror?.();}else{req.result=db;req.onsuccess?.();}});return req;}},performance:{now:()=>tick},crypto:require('node:crypto').webcrypto,AbortController,AbortSignal,setInterval:()=>1,clearInterval(){},setTimeout:(fn,ms)=>setTimeout(fn,geo==='timeout'?1:ms),clearTimeout,Blob,matchMedia:()=>({matches:true}),fetch:async(url,options)=>{
    urls.push(String(url)); tick+=200;
    if(String(url).includes('speed.cloudflare.com/__down') && Number(new URL(url).searchParams.get('bytes'))>10000000)throw new TypeError('CORS after HTTP 403');
    if(String(url).includes('.clouvider.net/') && options.method==='POST' && options.body.byteLength>1000000)throw new Error('HTTP 413: Request Entity Too Large');
    if(mode==='metadata-failed' && (String(url).includes('speed.cloudflare.com') || String(url).includes('ripe.net')))throw new TypeError('metadata blocked');
    if(mode==='ripe-failed' && String(url).includes('ripe.net'))throw new TypeError('RIPE blocked');
    if(mode==='failed')throw new TypeError('offline');
    if(mode==='cancel' && String(url).includes('__down'))return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    if(mode==='cf-failed' && String(url).includes('speed.cloudflare.com'))throw new TypeError('Endpoint unavailable');
    const headers={get:k=>({'content-type':'application/octet-stream','cf-meta-ip':mode==='no-cf-ip'?null:'192.0.2.1','cf-meta-colo':'DXB'}[k]||null)};
    let payload={};
    if(String(url).endsWith('/servers.json'))payload=JSON.parse(fs.readFileSync('dist/servers.json','utf8'));
    if(String(url).includes('librespeed.org/backend-servers/servers.php'))payload=JSON.parse(fs.readFileSync('dist/servers.json','utf8')).servers.slice(0,22);
    if(String(url).includes('whats-my-ip'))payload={data:{ip:'192.0.2.2'}};
    if(String(url).includes('network-info'))payload={data:{asns:[15802]}};
    if(String(url).includes('as-overview'))payload={data:{holder:'Test ISP'}};
    let bytes=0;
    if(String(url).startsWith('https:')) {const u=new URL(url);bytes=u.searchParams.has('bytes')?Number(u.searchParams.get('bytes')):u.searchParams.has('ckSize')?Number(u.searchParams.get('ckSize'))*1048576:0;}
    const encoded=new TextEncoder().encode(JSON.stringify(payload)); const isJSON=String(url).includes('.json') || String(url).includes('ripe.net') || String(url).includes('servers.php'); let sent=false;
    return {ok:true,headers,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:isJSON?encoded:{byteLength:bytes}}),releaseLock(){},cancel:async()=>{}})}};
  }});
  vm.runInContext(core+'\n'+source,context);
  return {context,el,urls,callbacks:()=>geoCallbacks};
}
(async()=>{
  const app=setup();const run=s=>vm.runInContext(s,app.context);
  assert.equal(run('SpeedCore.median([1,2,9,10])'),5.5);
  assert.equal(run('SpeedCore.jitter([10,20,15])'),7.5);
  assert.equal(run('SpeedCore.distance([25,55],[25,55])'),0);
  assert.ok(run('SpeedCore.distance([25.2,55.3],[51.5,-.1])')>5000);
  assert.equal(run("SpeedCore.ratings({downloadMbps:100,uploadMbps:20,pingMs:25,jitterMs:3})[0].grade"),'Responsive');
  assert.equal(run("SpeedCore.ratings({downloadMbps:100,uploadMbps:20,pingMs:200,jitterMs:50})[0].grade"),'High latency');
  await run('locate()'); assert.match(app.el('location-status').textContent,/denied/);assert.ok(run('servers.length')>1);assert.ok(run('servers.every(s=>s.available)'));
  assert.ok(run('SpeedCore.locations.every(city=>SpeedCore.validPoint(city.point))'));
  assert.equal(run("SpeedCore.suggestedLocation('Etc/UTC')"),undefined);
  const geoRun=(app,source)=>vm.runInContext(source,app.context);
  const detected=setup('good','granted');await geoRun(detected,'initializeLocation()');
  assert.match(detected.el('location-name').textContent,/Near Dubai/);
  assert.equal(geoRun(detected,'locationSource'),'device');assert.ok(geoRun(detected,'servers.length')<=13);
  assert.ok(detected.urls.every(url=>!url.includes('25.2') && !url.includes('55.27')));
  for(const state of ['denied','invalid','timeout','unsupported']){
    const fallback=setup('good',state);await geoRun(fallback,'initializeLocation()');
    assert.equal(geoRun(fallback,'locationSource'),'suggested');assert.equal(fallback.el('location-name').textContent,'Dubai, UAE');
    assert.equal(geoRun(fallback,'locating || scanning'),false);assert.equal(fallback.el('start').disabled,false);
    assert.equal(geoRun(fallback,'current'),null); // Startup probes must not run a full test.
  }
  const pendingGeo=setup('good','pending');const initial=geoRun(pendingGeo,'initializeLocation()');
  pendingGeo.el('location-choice').value=String(geoRun(pendingGeo,"SpeedCore.locations.findIndex(city=>city.name==='London, UK')"));
  await geoRun(pendingGeo,'applyLocation()');await initial;
  pendingGeo.callbacks().resolve({coords:{latitude:25.2,longitude:55.27}});await new Promise(r=>setImmediate(r));
  assert.equal(pendingGeo.el('location-name').textContent,'London, UK');assert.equal(geoRun(pendingGeo,'locationSource'),'manual');
  assert.equal(pendingGeo.urls.filter(url=>url.endsWith('/servers.json')).length,1);
  pendingGeo.el('location-choice').value='none';await geoRun(pendingGeo,'applyLocation()');
  assert.equal(geoRun(pendingGeo,'locationPoint'),null);assert.ok(geoRun(pendingGeo,"servers.filter(s=>s.type==='librespeed').every(s=>s.distance===null)"));
  pendingGeo.el('location-choice').value='999';await geoRun(pendingGeo,'applyLocation()');assert.equal(geoRun(pendingGeo,'locationPoint'),null);
  run('updateDial(500)');assert.equal(app.el('dial-needle').attrs.transform,'rotate(0 180 171)');
  run('updateDial(2500)');assert.equal(app.el('dial-needle').attrs.transform,'rotate(135 180 171)');assert.match(app.el('dial-scale').textContent,/above dial range/);
  run("updateDial(250,'ms')");assert.match(app.el('dial-scale').textContent,/ms/);
  // Interface technology is never inferred from throughput or effectiveType.
  assert.equal(run("SpeedCore.networkSnapshot({effectiveType:'4g'},'auto',true).type"),'unknown');
  assert.equal(run("SpeedCore.networkSnapshot({type:'wifi',effectiveType:'4g'},'auto',true).type"),'wifi');
  assert.equal(run("SpeedCore.networkSnapshot({type:'ethernet'},'auto',true).source"),'browser');
  assert.equal(run("SpeedCore.networkSnapshot({type:'cellular',effectiveType:'4g'},'auto',true).type"),'cellular');
  assert.equal(run("SpeedCore.networkSnapshot({type:'cellular'},'5g',true).source"),'manual');
  assert.equal(run("SpeedCore.networkSnapshot(null,'wifi',false).type"),'none');
  assert.equal(run("SpeedCore.networkSnapshot(null,'<script>',true).type"),'unknown');
  const meta=setup('no-cf-ip');await geoRun(meta,'connectionInfo()');
  assert.equal(meta.el('ip').textContent,'192.0.2.2');assert.equal(meta.el('isp').textContent,'Test ISP');assert.equal(meta.el('asn').textContent,'AS15802');
  assert.ok(meta.urls.some(url=>url.includes('whats-my-ip')));assert.equal(geoRun(meta,'current'),null);
  meta.context.fetch=async()=>{throw new TypeError('new connection blocked');};await geoRun(meta,'connectionInfo()');
  assert.equal(meta.el('isp').textContent,'Lookup unavailable');assert.equal(meta.el('ip').textContent,'Unavailable');
  const stale=setup();const initialFetch=stale.context.fetch;let releaseOld,firstRequest=true;
  stale.context.fetch=(url,options)=>{if(firstRequest){firstRequest=false;return new Promise(resolve=>{releaseOld=()=>initialFetch(url,options).then(resolve);});}return initialFetch(url,options);};
  const oldLookup=geoRun(stale,'connectionInfo()');await geoRun(stale,'connectionInfo()');
  stale.context.fetch=async()=>{throw new TypeError('new route unavailable');};await geoRun(stale,'connectionInfo()');
  await releaseOld();await oldLookup;assert.equal(stale.el('isp').textContent,'Lookup unavailable');assert.equal(stale.el('ip').textContent,'Unavailable');
  const noRipe=setup('ripe-failed');await geoRun(noRipe,'connectionInfo()');assert.equal(noRipe.el('ip').textContent,'192.0.2.1');assert.equal(noRipe.el('isp').textContent,'Lookup unavailable');
  const catalogTest=setup();catalogTest.el('server-scope').value='all';await geoRun(catalogTest,'discoverServers()');
  assert.equal(geoRun(catalogTest,'servers.length'),27); // Live list must not remove reviewed additions.
  catalogTest.el('provider-filter').value='independent';await geoRun(catalogTest,'discoverServers()');
  assert.equal(geoRun(catalogTest,'servers.length'),26);assert.equal(geoRun(catalogTest,"servers.some(s=>s.type==='cloudflare')"),false);
  assert.equal(geoRun(catalogTest,"servers.filter(s=>s.base.includes('man.speedtest') || s.base.includes('dal.speedtest') || s.base.includes('ash.speedtest') || s.base.includes('phx.speedtest')).length"),4);
  catalogTest.el('provider-filter').value='Sharktech';await geoRun(catalogTest,'discoverServers()');assert.ok(geoRun(catalogTest,"servers.length>0 && servers.every(s=>s.provider==='Sharktech')"));
  catalogTest.el('provider-filter').value='Cloudflare';await geoRun(catalogTest,'discoverServers()');assert.equal(geoRun(catalogTest,'servers.length'),1);
  app.el('network-choice').value='5g';run('showNetwork()');assert.match(app.el('network-source').textContent,/Selected by you/);
  // Manual server selection must be used for both measurement directions.
  run("selectedId=servers.find(s=>s.type==='librespeed').id");
  app.el('stream-count').value='1';
  const result=await run('startTest()');
  assert.equal(result.status,'complete');assert.ok(result.download.transferMs>=22000);assert.ok(result.upload.transferMs>=22000);
  assert.equal(result.downloadMbps,result.download.bytes*8/result.download.durationMs/1000);
  assert.ok(result.download.points.length>2);assert.ok(result.upload.points.length>2);assert.equal(result.pings.length,10);
  assert.ok(app.urls.some(u=>u.includes('ckSize=')));assert.equal(run('historyRecords.length'),1);assert.equal(stored.size,1);
  const again=setup();await vm.runInContext('loadHistory()',again.context);assert.equal(vm.runInContext('historyRecords[0].status',again.context),'complete');
  assert.equal(JSON.stringify([...stored.values()]).includes('192.0.2.1'),false);
  assert.equal(result.network.type,'5g');assert.equal(result.network.source,'manual');
  assert.equal(result.measurementVersion,2);assert.equal(result.streams,1);
  assert.ok(result.download.loadedPings.length>0);assert.ok(result.upload.loadedPings.length>0);
  assert.ok(require('../dist/security.js').validRecord(result));
  const parallel=setup();parallel.el('stream-count').value='4';
  vm.runInContext('servers=[{...CF,available:true}]',parallel.context);
  const parallelResult=await vm.runInContext('startTest()',parallel.context);
  assert.equal(parallelResult.status,'complete');assert.equal(parallelResult.streams,4);
  assert.ok(parallelResult.download.durationMs>=22000 && parallelResult.upload.durationMs>=22000);
  assert.equal(parallelResult.downloadMbps,parallelResult.download.bytes*8/parallelResult.download.durationMs/1000);
  const cfSizes=parallel.urls.filter(u=>u.includes('speed.cloudflare.com/__down')).map(u=>Number(new URL(u).searchParams.get('bytes')));
  assert.ok(Math.max(...cfSizes)<=8000000);assert.ok(Math.max(...cfSizes)>1000000);
  const recovery=setup('cf-failed');recovery.el('stream-count').value='1';
  vm.runInContext("servers=[{...CF,available:true}, {...normalizeServer("+JSON.stringify(JSON.parse(fs.readFileSync('dist/servers.json','utf8')).servers[0])+",{}),available:true}]",recovery.context);
  const recovered=await vm.runInContext('startTest()',recovery.context);
  assert.equal(recovered.status,'complete');assert.equal(recovered.recoveryFrom,'Cloudflare · automatic edge');
  assert.equal(vm.runInContext('historyRecords.length',recovery.context),2);
  assert.equal(vm.runInContext("historyRecords[0].status",recovery.context),'failed');
  const manualFailure=setup('cf-failed');
  vm.runInContext("selectedId='cloudflare';servers=[{...CF,available:true},{...CF,id:'another',available:true}]",manualFailure.context);
  assert.equal((await vm.runInContext('startTest()',manualFailure.context)).status,'failed');
  assert.equal(vm.runInContext('historyRecords.length',manualFailure.context),1);
  assert.equal(run('SpeedCore.percentile([10,20,30,40],.95)'),38.5);
  assert.equal(run("SpeedCore.transferCap('librespeed','upload','Clouvider')"),1000000);
  assert.equal(run("SpeedCore.transferCap('cloudflare','upload','Cloudflare')"),8000000);
  assert.throws(()=>run('reservePayload({reserved:7999999999},2)'),/8 GB safety budget/);
  const fail=setup('failed');vm.runInContext('servers=[{...CF,available:true}]',fail.context);const failed=await vm.runInContext('startTest()',fail.context);assert.equal(failed.status,'failed');assert.equal(fail.el('download').textContent,'—');
  const cancel=setup('cancel');vm.runInContext('servers=[{...CF,available:true}]',cancel.context);const pending=vm.runInContext('startTest()',cancel.context);await new Promise(r=>setImmediate(r));vm.runInContext('controller.abort()',cancel.context);assert.equal((await pending).status,'cancelled');
  const quota=setup('storage');vm.runInContext('servers=[{...CF,available:true}]',quota.context);await vm.runInContext('startTest()',quota.context);assert.match(quota.el('storage-status').textContent,/could not be saved/);
  console.log('PASS: truthful access types, manual network history, startup ISP lookup, RIPE IP fallback, failed metadata clearing, merged catalog, provider filters, new server coverage, median, jitter, distance, ratings, automatic location, fallback, manual override, late callback protection, dial scale, Cloudflare request cap, parallel throughput, loaded RTT, automatic failover, manual endpoint isolation, discovery, manual endpoint selection, 22-second durations, throughput units, graphs, history persistence without IP, failure, cancellation, storage errors.');
})().catch(e=>{console.error(e);process.exit(1)});
