// Opt-in, small GET-only smoke test. No full speed tests, uploads or identifying metadata.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
  if(!process.argv.includes('--live'))throw new Error('Live probes require explicit --live; never run against providers in CI');
  const origin=process.env.ORBIT_PROBE_ORIGIN||'https://drithimanm.github.io/orbit-speed-test/';
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.route(origin+'**',async route=>{let name=new URL(route.request().url()).pathname.slice(new URL(origin).pathname.length)||'index.html';if(!/^[a-z0-9.-]+$/.test(name))return route.abort();try{const body=await fs.readFile(path.join('dist',name));return route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':'application/octet-stream',body});}catch{return route.abort();}});
    await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
    const page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>typeof request==='function');
    const catalog=JSON.parse(await fs.readFile('dist/servers.json','utf8'));
    const endpoints=[{id:'cloudflare',type:'cloudflare',base:'https://speed.cloudflare.com/',name:'Cloudflare',provider:'Cloudflare'},...catalog.servers.map(item=>({id:'libre-'+item.id,name:item.name,type:'librespeed',base:((item.server.startsWith('//')?'https:':'')+item.server).replace(/\/?$/,'/'),pingURL:item.pingURL,dlURL:item.dlURL}))];
    const results=await page.evaluate(async endpoints=>{
      const queue=[...endpoints],results=[];
      const worker=async()=>{while(queue.length){const endpoint=queue.shift(),started=performance.now();try{const response=await request(testURL(endpoint,'ping'),{},undefined,7000);results.push({id:endpoint.id,name:endpoint.name,ping:'passed',httpStatus:response.response.status,elapsedMs:Math.round(performance.now()-started)});}catch(error){results.push({id:endpoint.id,name:endpoint.name,ping:'failed',error:error.name,status:error.status||null});}}};await Promise.all(Array.from({length:4},worker));
      // One bounded payload contract check per available operator, not capacity testing.
      const seen=new Set();for(const endpoint of endpoints){const operator=endpoint.type==='cloudflare'?'Cloudflare':endpoint.base.includes('clouvider')?'Clouvider':endpoint.base.includes('sharktech')?'Sharktech':'Community';if(seen.has(operator)||!results.some(r=>r.id===endpoint.id&&r.ping==='passed'))continue;seen.add(operator);const bytes=endpoint.type==='cloudflare'?65536:1048576;const row=results.find(r=>r.id===endpoint.id);try{const r=await request(testURL(endpoint,'download',bytes),{},undefined,7000);row.downloadContract=r.body.byteLength===bytes&&r.response.headers.get('content-type')?.includes('application/octet-stream')?'passed':'failed';row.payloadBytes=r.body.byteLength;}catch(error){row.downloadContract='failed';row.downloadError=error.name;}}
      return results;
    },endpoints);
    const report={checkedAt:new Date().toISOString(),origin,scope:'Browser CORS and small GET payloads from one network only; no SLA, scale or upload evidence',results};await fs.mkdir('coverage',{recursive:true});await fs.writeFile('coverage/provider-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checked:results.length,reachable:results.filter(r=>r.ping==='passed').length,payloadChecks:results.filter(r=>r.downloadContract).map(r=>({id:r.id,status:r.downloadContract}))}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
