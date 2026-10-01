const {chromium,firefox,webkit}=require(process.env.ORBIT_PLAYWRIGHT_MODULE||'playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const browsers={chromium,firefox,webkit};
(async()=>{
  const out=process.env.ORBIT_QA_OUTPUT||path.resolve('coverage/browser');await fs.mkdir(out,{recursive:true});
  const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  let browser;
  try{
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server did not start')),5000);server.stdout.on('data',data=>{const m=String(data).match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});server.on('error',reject);});
    const base=`http://localhost:${port}`;
    for(const name of (process.env.ORBIT_BROWSERS||'chromium,firefox,webkit').split(',')){
      browser=await browsers[name].launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(()=>{window.orbitUnhandled=[];window.addEventListener('unhandledrejection',event=>window.orbitUnhandled.push(String(event.reason)));});
      // Synthetic HTTP contracts only: no throughput or identifying traffic reaches public operators.
      await context.route('https://**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='stat.ripe.net')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({status:'ok',data:url.pathname.includes('whats-my-ip')?{ip:'192.0.2.1'}:url.pathname.includes('network-info')?{asns:[64500]}:{holder:'Synthetic Network'}})});
        if(url.pathname.includes('garbage.php')||url.pathname===' /__down'.trim()){
          const bytes=url.searchParams.has('bytes')?Number(url.searchParams.get('bytes')):Number(url.searchParams.get('ckSize')||0)*1048576;
          await new Promise(resolve=>setTimeout(resolve,bytes?15:4));return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/octet-stream',body:Buffer.alloc(bytes)});
        }
        if(url.pathname.includes('empty.php')||url.pathname==='/__up')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'text/plain',body:''});
        return route.abort();
      });
      await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#start').disabled);
      await page.locator('#open-routes').click();await page.selectOption('#provider-filter','independent');await page.waitForFunction(()=>!document.querySelector('#scan').disabled);
      assert.equal(await page.locator('#server-list').innerText().then(t=>t.includes('Cloudflare')),false);
      await page.selectOption('#provider-filter','Cloudflare');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
      await page.getByRole('button',{name:'Done',exact:true}).click();
      // Accelerate only the configured profile clock; execute the production engine unchanged.
      await page.evaluate(()=>{profile=()=>({label:'Quick Probe',durationMs:220});});
      await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent==='MISSION COMPLETE');
      const record=await page.evaluate(()=>current);assert.equal(record.measurementVersion,3);assert.equal(record.pings.length,10);assert.equal(record.status,'complete');assert.ok(record.downloadMbps>0);assert.ok(record.uploadMbps>0);assert.ok(record.download.durationMs>=220);
      assert.equal(await page.evaluate(r=>OrbitSecurity.validRecord(r),record),true);
      await page.reload();await page.waitForFunction(()=>document.querySelector('#history-count').textContent==='1');assert.notEqual(await page.locator('#download').innerText(),'—');
      for(const view of ['overview','telemetry','history']){
        await page.locator('#tab-'+view).click();
        const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
        await fs.writeFile(path.join(out,`${name}-${view}-axe.json`),JSON.stringify(audit,null,2));
        assert.deepEqual(audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],`${name} ${view} accessibility`);
        for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${view} overflow at ${width}`);}
      }
      await page.locator('#tab-overview').click();await page.setViewportSize({width:390,height:1000});
      await page.screenshot({path:path.join(out,`${name}-mobile.png`),fullPage:true});
      // Lock contention across tabs must not create a second flight or send payloads.
      const held=await context.newPage();await held.goto(base);await held.waitForFunction(()=>typeof startTest==='function');
      await held.evaluate(()=>{window.holdLock=navigator.locks.request('orbit-speed-test:measurement',()=>new Promise(resolve=>window.releaseLock=resolve));});
      await held.waitForFunction(()=>typeof window.releaseLock==='function');
      await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('another Orbit tab'));
      await held.evaluate(()=>window.releaseLock());await held.close();
      // Force cancellation while a phase is active and confirm it survives reload.
      await page.evaluate(()=>{profile=()=>({label:'Quick Probe',durationMs:5000});});await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='download');await page.locator('#cancel').click();await page.waitForFunction(()=>document.querySelector('#phase').textContent==='FLIGHT CANCELLED');
      assert.equal(await page.evaluate(()=>current.status),'cancelled');
      // The phase label changes before the final IndexedDB transaction settles.
      await page.waitForFunction(()=>controller===null);
      assert.equal(await page.evaluate(()=>OrbitSecurity.validRecord(current)),true);
      await page.reload();await page.waitForFunction(()=>document.querySelector('#history-count').textContent==='2');
      console.log(`${name}: both records persisted before offline transition`);
      // Offline shell must work with the actual service worker and preserve history.
      await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==='activated';});
      await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
      if(name==='webkit'){server.kill();}else{await context.route(base+'/**',route=>route.abort());}await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));await page.reload();console.log(`${name}: offline document loaded`);try{await page.waitForFunction(()=>document.querySelector('#history-count').textContent==='2');}catch(error){console.error(await page.evaluate(()=>({history:document.querySelector('#history-count')?.textContent,storage:document.querySelector('#storage-status')?.textContent,online:navigator.onLine,worker:!!navigator.serviceWorker.controller})));throw error;}await page.waitForFunction(()=>navigator.onLine===false && document.querySelector('#start').disabled);await page.locator('#tab-history').click();assert.equal(await page.locator('#history tr').count(),2);
      assert.deepEqual(await page.evaluate(()=>window.orbitUnhandled),[]);const expectedNetworkDiagnostics=name==='webkit'?errors.filter(message=>message.includes('due to access control checks.')):[];assert.deepEqual(errors.filter(message=>!expectedNetworkDiagnostics.includes(message)),[]);await fs.writeFile(path.join(out,`${name}-result.json`),JSON.stringify({browser:name,syntheticMeasurement:'passed',idleSamples:record.pings.length,accessibilityAA:'no automated violations',offline:'passed',cancellation:'passed',crossTabLock:'passed',expectedNetworkDiagnostics,errors:errors.filter(message=>!expectedNetworkDiagnostics.includes(message))},null,2));
      console.log(`PASS ${name}: production engine, persistence, route filters, cancellation, tab locking, offline shell, 320–1440px layouts and automated WCAG AA checks`);
      await context.close();await browser.close();browser=null;
    }
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
