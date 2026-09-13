const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const core=fs.readFileSync('dist/core.js','utf8');
const source=fs.readFileSync('dist/app.js','utf8').split("$('export').addEventListener")[0];
const stored=new Map();
function setup(mode='good') {
  let tick=0;const elements=new Map();const urls=[];
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.classList={toggle(){},remove(){}};this.value=0;this.hidden=false;}
    append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;}setAttribute(){}addEventListener(){}scrollIntoView(){}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const db={transaction(){const tx={objectStore(){return {put(record){stored.set(record.id,structuredClone(record));queueMicrotask(()=>tx.oncomplete?.());},getAll(){const req={};queueMicrotask(()=>{req.result=[...stored.values()].map(v=>structuredClone(v));req.onsuccess?.();});return req;}};}};return tx;}};
  const context=vm.createContext({console,URL,URLSearchParams,TextDecoder,OrbitSecurity:require('../dist/security.js'),Option:class extends Element {constructor(text,value){super('option');this.textContent=text;this.value=value;}},document:{baseURI:'http://localhost:8000/',getElementById:el,createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),body:el('body'),querySelector:()=>el('dashboard')},navigator:{geolocation:{getCurrentPosition:(_resolve,reject)=>reject({code:1})}},indexedDB:{open(){const req={};queueMicrotask(()=>{if(mode==='storage'){req.error=new Error('quota');req.onerror?.();}else{req.result=db;req.onsuccess?.();}});return req;}},performance:{now:()=>tick},crypto:require('node:crypto').webcrypto,AbortController,AbortSignal,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,Blob,matchMedia:()=>({matches:true}),fetch:async(url,options)=>{
    urls.push(String(url)); tick+=200;
    if(mode==='failed')throw new TypeError('offline');
    if(mode==='cancel' && String(url).includes('__down'))return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));
    const headers={get:k=>({'content-type':'application/octet-stream','cf-meta-ip':'192.0.2.1','cf-meta-colo':'DXB'}[k]||null)};
    let payload={};
    if(String(url).endsWith('/servers.json'))payload=JSON.parse(fs.readFileSync('dist/servers.json','utf8'));
    if(String(url).includes('githubusercontent'))payload=[];
    if(String(url).includes('network-info'))payload={data:{asns:[15802]}};
    if(String(url).includes('as-overview'))payload={data:{holder:'Test ISP'}};
    let bytes=0;
    if(String(url).startsWith('https:')) {const u=new URL(url);bytes=u.searchParams.has('bytes')?Number(u.searchParams.get('bytes')):u.searchParams.has('ckSize')?Number(u.searchParams.get('ckSize'))*1048576:0;}
    const encoded=new TextEncoder().encode(JSON.stringify(payload)); const isJSON=String(url).includes('.json') || String(url).includes('ripe.net'); let sent=false;
    return {ok:true,headers,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:isJSON?encoded:{byteLength:bytes}}),releaseLock(){},cancel:async()=>{}})}};
  }});
  vm.runInContext(core+'\n'+source,context);
  return {context,el,urls};
}
(async()=>{
  const app=setup();const run=s=>vm.runInContext(s,app.context);
  assert.equal(run('SpeedCore.median([1,2,9,10])'),5.5);
  assert.equal(run('SpeedCore.jitter([10,20,15])'),7.5);
  assert.equal(run('SpeedCore.distance([25,55],[25,55])'),0);
  assert.ok(run('SpeedCore.distance([25.2,55.3],[51.5,-.1])')>5000);
  assert.equal(run("SpeedCore.ratings({downloadMbps:100,uploadMbps:20,pingMs:25,jitterMs:3})[0].grade"),'Excellent');
  assert.equal(run("SpeedCore.ratings({downloadMbps:100,uploadMbps:20,pingMs:200,jitterMs:50})[0].grade"),'Limited');
  await run('locate()'); assert.match(app.el('location-status').textContent,/denied/);assert.ok(run('servers.length')>1);assert.ok(run('servers.every(s=>s.available)'));
  // Manual server selection must be used for both measurement directions.
  run("selectedId=servers.find(s=>s.type==='librespeed').id");
  const result=await run('startTest()');
  assert.equal(result.status,'complete');assert.ok(result.download.transferMs>=22000);assert.ok(result.upload.transferMs>=22000);
  assert.equal(result.downloadMbps,result.download.bytes*8/result.download.durationMs/1000);
  assert.ok(result.download.points.length>2);assert.ok(result.upload.points.length>2);assert.equal(result.pings.length,10);
  assert.ok(app.urls.some(u=>u.includes('ckSize=')));assert.equal(run('historyRecords.length'),1);assert.equal(stored.size,1);
  const again=setup();await vm.runInContext('loadHistory()',again.context);assert.equal(vm.runInContext('historyRecords[0].status',again.context),'complete');
  assert.equal(JSON.stringify([...stored.values()]).includes('192.0.2.1'),false);
  const fail=setup('failed');vm.runInContext('servers=[{...CF,available:true}]',fail.context);const failed=await vm.runInContext('startTest()',fail.context);assert.equal(failed.status,'failed');assert.equal(fail.el('download').textContent,'—');
  const cancel=setup('cancel');vm.runInContext('servers=[{...CF,available:true}]',cancel.context);const pending=vm.runInContext('startTest()',cancel.context);await new Promise(r=>setImmediate(r));vm.runInContext('controller.abort()',cancel.context);assert.equal((await pending).status,'cancelled');
  const quota=setup('storage');vm.runInContext('servers=[{...CF,available:true}]',quota.context);await vm.runInContext('startTest()',quota.context);assert.match(quota.el('storage-status').textContent,/could not be saved/);
  console.log('PASS: median, jitter, distance, ratings, location-denial fallback, discovery, manual endpoint selection, 22-second durations, throughput units, graphs, history persistence without IP, failure, cancellation, storage errors.');
})().catch(e=>{console.error(e);process.exit(1)});
