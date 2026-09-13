/* Orbit: plain browser JavaScript. No build tools, frameworks, or tracking. */
const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;
const $ = id => document.getElementById(id);
const MEASURE_MS = 22000;
const CF = {id:'cloudflare', name:'Cloudflare · automatic edge', type:'cloudflare', base:'https://speed.cloudflare.com/'};
let servers = [], locationPoint = null, scanning = false, locating = false;
let controller = null, connection = {}, current = null, historyRecords = [];
let selectedId = 'auto';

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
const format = value => Number.isFinite(value) ? (value < 10 ? value.toFixed(2) : value.toFixed(1)) : '—';
function status(text) { $('status').textContent = text; }
function setBusy() {
  const busy = scanning || locating || Boolean(controller);
  for (const id of ['start','scan','locate','server-select']) $(id).disabled = busy;
  $('cancel').hidden = !controller;
  $('start').textContent = controller ? 'In flight…' : 'Start Test ↗';
  document.body.classList.toggle('running', Boolean(controller));
}
function phase(name, label) {
  $('phase').textContent = label;
  for (const id of ['ping','download','upload']) $(`${id}-card`).classList.toggle('active', name === id);
  $('live-label').textContent = name ? `${name === 'ping' ? 'HTTP latency' : name + ' · running average'}` : label;
  $('live-unit').textContent = name === 'ping' ? 'ms' : 'Mbps';
}

// Includes full response consumption and supports cancelling a fetch or a stalled body.
async function request(url, options = {}, signal, timeout = 20000, asJson = false) {
  if(EMBEDDED)throw new Error('Open Orbit in its own tab to use network tests.');
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]);
  const started = performance.now();
  const safeURL=OrbitSecurity.approvedURL(url,document.baseURI);
  const response = await fetch(safeURL, {...options, redirect:'error', referrerPolicy:'no-referrer', credentials:'omit', cache:'no-store', signal:combined});
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
  const body = await OrbitSecurity.readBody(response,asJson ? 1048576 : 17*1048576,asJson);
  return {body, response, ms:Math.max(0.1, performance.now()-started)};
}
function testURL(server, kind, bytes=0) {
  const cf = server.type === 'cloudflare';
  const path = cf ? (kind === 'upload' ? '__up' : '__down') : server[kind === 'ping' ? 'pingURL' : kind === 'download' ? 'dlURL' : 'ulURL'];
  const url = new URL(path, server.base);
  if (cf && kind !== 'upload') url.searchParams.set('bytes', kind === 'ping' ? '0' : String(bytes));
  if (!cf) {
    url.searchParams.set('cors','true');
    if (kind === 'download') url.searchParams.set('ckSize',String(Math.max(1,Math.ceil(bytes/1048576))));
  }
  url.searchParams.set('nonce',crypto.randomUUID());
  return url.href;
}
function captureMetadata(response) {
  const get = name => response.headers.get(`cf-meta-${name}`);
  if (OrbitSecurity.validIP(get('ip'))) connection.ip = get('ip');
  if (/^[1-9]\d{0,9}$/.test(get('asn') || '') && Number(get('asn'))<=4294967295) connection.asn = get('asn');
  if (/^[A-Z]{3}$/.test(get('colo') || '')) connection.colo = get('colo');
}
async function connectionInfo(signal) {
  try {
    const result = await request(testURL(CF,'ping'),{},signal,6000);
    captureMetadata(result.response);
    $('ip').textContent = connection.ip || 'Unavailable';
    if (!connection.ip) return;
    const lookup = async (endpoint, resource) => (await request(`https://stat.ripe.net/data/${endpoint}/data.json?resource=${encodeURIComponent(resource)}`,{},signal,5000,true)).body.data;
    if (!connection.asn) connection.asn = String((await lookup('network-info',connection.ip)).asns?.[0] || '');
    if (/^[1-9]\d{0,9}$/.test(connection.asn) && Number(connection.asn)<=4294967295) {
      const holder=(await lookup('as-overview',`AS${connection.asn}`)).holder;
      if(typeof holder==='string' && holder.length<=200)connection.isp=holder;
    }
  } catch { /* Metadata is optional, independently of test availability. */ }
  finally {
    $('ip').textContent = connection.ip || 'Unavailable';
    $('isp').textContent = connection.isp || (connection.asn ? `AS${connection.asn}` : 'Unavailable');
  }
}

// Browser location never leaves this page. City coordinates come from the bundled catalog.
async function locate() {
  if (EMBEDDED || controller || scanning || locating) return;
  if (!navigator.geolocation) { $('location-status').textContent = 'Location is unsupported. Scanning by latency instead.'; await discoverServers(); return; }
  locating = true; setBusy();
  $('location-status').textContent = 'Waiting for location permission…';
  try {
    const position = await new Promise((resolve,reject) => {
      // Browser permission prompts may not count toward geolocation's own timeout.
      const timer=setTimeout(()=>reject({code:3}),15000);
      navigator.geolocation.getCurrentPosition(position=>{clearTimeout(timer);resolve(position);},error=>{clearTimeout(timer);reject(error);},{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
    });
    locationPoint = [position.coords.latitude,position.coords.longitude];
    $('location-status').textContent = 'Location enabled. Finding nearby city centers; coordinates stay in this page.';
  } catch (error) {
    $('location-status').textContent = error.code === 1 ? 'Location permission was denied. Enable it in browser site settings or scan without location.' : 'Location could not be determined. Scanning without a distance filter.';
  } finally { locating = false; setBusy(); }
  await discoverServers();
}
function normalizeServer(item, cities) {
  if(!OrbitSecurity.approvedServer(item))return null;
  const raw = item.server?.startsWith('//') ? `https:${item.server}` : item.server;
  const base = new URL(raw.endsWith('/') ? raw : raw + '/');
  if (base.protocol !== 'https:' || base.username || base.password || base.port || !base.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(base.hostname)) return null;
  for (const field of ['dlURL','ulURL','pingURL']) {
    if (typeof item[field] !== 'string' || new URL(item[field],base).origin !== base.origin) return null;
  }
  const rawCoordinates = Object.hasOwn(cities,item.name.split(',')[0]) ? cities[item.name.split(',')[0]] : null;
  const coordinates = Array.isArray(rawCoordinates) && rawCoordinates.length===2 && rawCoordinates.every(Number.isFinite) && Math.abs(rawCoordinates[0])<=90 && Math.abs(rawCoordinates[1])<=180 ? rawCoordinates : null;
  return {id:`libre-${item.id}`,name:item.name,base:base.href,type:'librespeed',dlURL:item.dlURL,ulURL:item.ulURL,pingURL:item.pingURL,
    distance:locationPoint && coordinates ? SpeedCore.distance(locationPoint,coordinates) : null};
}
async function probe(server) {
  try {
    await request(testURL(server,'ping'),{},undefined,2500); // Connection warm-up.
    const pings = [];
    for (let i=0;i<3;i++) pings.push((await request(testURL(server,'ping'),{},undefined,2500)).ms);
    // Verify that both transfer directions are usable before recommending an endpoint.
    const check = await request(testURL(server,'download',1024),{},undefined,4000);
    if (!check.response.headers.get('content-type')?.includes('application/octet-stream') || check.body.byteLength < 1024) throw new Error('Invalid download');
    await request(testURL(server,'upload'),{method:'POST',body:new Uint8Array(1024),headers:{'Content-Type':'text/plain'}},undefined,4000);
    server.latency = SpeedCore.median(pings); server.available = true;
  } catch { server.available = false; server.latency = null; }
}
async function discoverServers() {
  if (scanning || controller || locating) return;
  scanning = true; setBusy();
  $('scan-status').textContent = 'Loading the public server catalog…';
  try {
    const snapshot = (await request('servers.json',{},undefined,5000,true)).body;
    let catalog = snapshot.servers;
    let catalogLabel = `bundled catalog (${snapshot.updated})`;
    try {
      const live = (await request('https://raw.githubusercontent.com/librespeed/speedtest/master/server-list.json',{},undefined,5000,true)).body;
      if (Array.isArray(live) && live.length && live.length<=500) { catalog = live; catalogLabel = 'live LibreSpeed catalog'; }
    } catch { /* Bundled snapshot keeps discovery available if the catalog host fails. */ }
    const seen=new Set();
    const candidates = catalog.slice(0,500).flatMap(item => { try { const server=normalizeServer(item,snapshot.cities);if(!server)return [];const key=new URL(server.pingURL,server.base).href;if(seen.has(key))return [];seen.add(key);return [server]; } catch { return []; } });
    candidates.sort((a,b)=>(a.distance ?? Infinity)-(b.distance ?? Infinity));
    // With location: eight nearest known city centers. Otherwise cover the available catalog.
    servers = [{...CF},...candidates.slice(0,locationPoint ? 8 : 40)];
    let done=0, cursor=0;
    const worker = async () => {
      while(cursor < servers.length) {
        const server = servers[cursor++];
        await probe(server); done++;
        $('scan-status').textContent = `Checking latency and transfers… ${done}/${servers.length}`;
      }
    };
    await Promise.all([worker(),worker(),worker()]);
    servers.sort((a,b)=>(a.latency ?? Infinity)-(b.latency ?? Infinity));
    const valid = servers.filter(s=>s.available);
    if (!valid.some(s=>s.id===selectedId)) selectedId='auto';
    renderServers();
    $('scan-status').textContent = valid.length ? `${valid.length} reachable · ${catalogLabel}. Recommended: ${valid[0].name} (${Math.round(valid[0].latency)} ms). Lowest among these candidates, not every server worldwide.` : 'No test servers could be reached. Check your connection or blockers, then scan again.';
  } catch {
    servers=[]; renderServers(); $('scan-status').textContent='Could not load the server catalog. Reload or try scanning again.';
  } finally { scanning=false; setBusy(); }
}
function renderServers() {
  const select=$('server-select');select.replaceChildren(new Option('Automatic · lowest measured latency','auto'));
  const list=$('server-list');list.replaceChildren();
  for (const server of servers) {
    const latency=server.available ? `${Math.round(server.latency)} ms` : 'Unavailable';
    const option=new Option(`${server.name} · ${latency}`,server.id);option.disabled=!server.available;select.append(option);
    const button=node('button',undefined,'server-option');button.type='button';button.disabled=!server.available;
    const text=node('span',server.name);text.append(node('small',server.distance !== null && server.distance !== undefined ? `≈ ${Math.round(server.distance).toLocaleString()} km · city center` : server.type==='cloudflare' ? 'Automatically routed edge' : 'Distance unavailable'));
    button.append(text,node('strong',latency));
    button.classList.toggle('selected',selectedId===server.id || (selectedId==='auto' && server===servers.find(s=>s.available)));
    button.addEventListener('click',()=>{if(controller || scanning) return;selectedId=server.id;renderServers();});list.append(button);
  }
  select.value=selectedId;
}

// Graphs are SVG data plots, generated from measured samples, never random decoration.
function svgElement(tag, attrs, text) {
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  if(text!==undefined) el.textContent=text;
  return el;
}
function drawSpeed(record) {
  const svg=$('speed-chart');svg.replaceChildren();
  const series=[record?.download?.points || [],record?.upload?.points || []];
  const maxY=Math.max(10,...series.flat().map(p=>p.mbps))*1.12;
  const maxX=Math.max(22,...series.flat().map(p=>p.seconds));
  for(let i=0;i<=4;i++) {
    const y=12+i*38;
    svg.append(svgElement('line',{x1:43,y1:y,x2:628,y2:y,stroke:'#28364d','stroke-width':1}));
    svg.append(svgElement('text',{x:36,y:y+4,fill:'#9baac4','font-size':10,'text-anchor':'end'},Math.round(maxY*(1-i/4))));
    svg.append(svgElement('text',{x:43+i*146,y:185,fill:'#9baac4','font-size':10,'text-anchor':'middle'},`${Math.round(maxX*i/4)}s`));
  }
  series.forEach((points,index)=>{
    if(!points.length)return;
    const coords=points.map(p=>`${43+p.seconds/maxX*585},${164-p.mbps/maxY*152}`).join(' ');
    const color=index ? '#ae9bff' : '#79f6dc';
    svg.append(svgElement('polyline',{points:coords,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round'}));
    const last=points.at(-1);svg.append(svgElement('circle',{cx:43+last.seconds/maxX*585,cy:164-last.mbps/maxY*152,r:3,fill:color}));
  });
  if(!series.flat().length)svg.append(svgElement('text',{x:335,y:92,fill:'#9baac4','font-size':13,'text-anchor':'middle'},'Your throughput trace will appear here'));
}
function drawPings(values=[]) {
  const svg=$('ping-chart');svg.replaceChildren();
  if(!values.length){svg.append(svgElement('text',{x:130,y:42,fill:'#9baac4','font-size':12,'text-anchor':'middle'},'Waiting for latency samples'));return;}
  const max=Math.max(1,...values)*1.15;
  const points=values.map((value,index)=>`${12+index/Math.max(1,values.length-1)*236},${60-value/max*50}`).join(' ');
  svg.append(svgElement('polyline',{points,fill:'none',stroke:'#ffca83','stroke-width':2}));
  values.forEach((value,index)=>svg.append(svgElement('circle',{cx:12+index/Math.max(1,values.length-1)*236,cy:60-value/max*50,r:3,fill:'#ffca83'})));
  svg.append(svgElement('text',{x:248,y:74,fill:'#9baac4','font-size':9,'text-anchor':'end'},`${Math.min(...values).toFixed(0)}–${Math.max(...values).toFixed(0)} ms`));
}
function showRatings(result) {
  const ratings=result?.status==='complete' ? SpeedCore.ratings(result) : ['Online gaming','Video streaming','Cloud gaming','Video calls'].map(name=>({name,grade:'Awaiting test',detail:'Complete a test to estimate connection quality.'}));
  $('ratings').replaceChildren();
  for(const rating of ratings) {
    const card=node('article',undefined,'panel rating-card');
    card.append(node('h3',rating.name),node('strong',rating.grade,rating.grade==='Limited' ? 'limited' : ''),node('p',rating.detail));$('ratings').append(card);
  }
  $('overall').textContent=result?.status==='complete' ? (result.downloadMbps>=25 && result.uploadMbps>=5 && result.pingMs<80 && result.jitterMs<20 ? 'Strong connection' : 'See your ratings') : 'Awaiting a test';
}

async function bandwidth(server,direction,record) {
  const payload=direction==='upload' ? new Uint8Array(8000000) : null;
  if(payload)for(let offset=0;offset<payload.length;offset+=65536)crypto.getRandomValues(payload.subarray(offset,Math.min(offset+65536,payload.length)));
  const result={bytes:0,transferMs:0,durationMs:0,mbps:0,points:[]};record[direction]=result;
  let size=250000;
  const started=performance.now();
  phase(direction,direction==='download' ? 'DOWNLINK ACTIVE' : 'UPLINK ACTIVE');
  const update=()=>{
    const seconds=(performance.now()-started)/1000;
    $('flight-time').textContent=`T + ${seconds.toFixed(0).padStart(2,'0')} s`;
    status(`Measuring ${direction} · ${seconds.toFixed(0)} s elapsed · 22 s minimum`);
    $('progress').value=(direction==='download'?10:55)+Math.min(45,result.transferMs/MEASURE_MS*45);
  };
  update();const ticker=setInterval(update,300);
  try {
    while(result.transferMs<MEASURE_MS) {
      if(performance.now()-started>90000 || result.points.length>=1000 || (record.download?.bytes || 0)+(record.upload?.bytes || 0)>=8000000000)throw new Error('Test safety limit reached. Try a different server.');
      controller.signal.throwIfAborted();
      const response=await request(testURL(server,direction,size),direction==='upload' ? {method:'POST',body:payload.subarray(0,size),headers:{'Content-Type':'text/plain'}} : {},controller.signal);
      if(server.type==='cloudflare') captureMetadata(response.response);
      if(direction==='download') {
        if(!response.response.headers.get('content-type')?.includes('application/octet-stream'))throw new Error('The server did not return valid test data.');
        if(server.type==='cloudflare' && response.body.byteLength!==size)throw new Error('The download was incomplete.');
        if(!response.body.byteLength)throw new Error('The download was empty.');
      }
      const bytes=direction==='download' ? response.body.byteLength : size;
      result.bytes+=bytes;result.transferMs+=response.ms;result.durationMs=performance.now()-started;
      result.mbps=result.bytes*8/result.durationMs/1000;
      result.points.push({seconds:result.durationMs/1000,mbps:bytes*8/response.ms/1000});
      $(direction).textContent=format(result.mbps);$('live-value').textContent=format(result.mbps);
      $(`${direction}-detail`).textContent=`${(result.durationMs/1000).toFixed(1)} s · ${(result.bytes/1000000).toFixed(0)} MB`;
      drawSpeed(record);update();
      size=Math.round(Math.min(direction==='download'?16000000:8000000,Math.max(250000,size*1500/response.ms)));
    }
    return result;
  } finally {clearInterval(ticker);}
}
function endpointLabel(server) {
  return server.type==='cloudflare' && connection.colo ? `Cloudflare · ${connection.colo==='DXB' ? 'Dubai (DXB)' : connection.colo}` : server.name;
}
async function startTest() {
  if(EMBEDDED || controller || scanning || locating)return {error:'Another operation is running.'};
  if(!servers.length)await discoverServers();
  // Another action may have started while discovery yielded.
  if(controller || scanning || locating)return {error:'Another operation is running.'};
  const server=selectedId==='auto' ? servers.find(s=>s.available) : servers.find(s=>s.id===selectedId && s.available);
  if(!server){status('No reachable server selected. Scan servers and try again.');return {error:'No server'};}
  controller=new AbortController();setBusy();document.body.classList.remove('error');
  const record={id:crypto.randomUUID(),date:new Date().toISOString(),status:'running',server:server.name,serverId:server.id,pings:[],download:null,upload:null};
  current=record;connection={};
  for(const id of ['download','upload','ping','jitter','live-value'])$(id).textContent='—';
  for(const id of ['download','upload'])$(`${id}-detail`).textContent='Sustained average';
  $('server').textContent=server.name;$('ip').textContent='Detecting…';$('isp').textContent='Detecting…';$('progress').value=0;
  drawSpeed(record);drawPings();showRatings();
  await saveRecord(record); // Record the attempt immediately, even if the page closes mid-test.
  try {
    phase('ping','ESTABLISHING CONTACT');status('Identifying your connection…');
    await connectionInfo(controller.signal);controller.signal.throwIfAborted();
    await request(testURL(server,'ping'),{},controller.signal);
    for(let i=0;i<10;i++){
      record.pings.push((await request(testURL(server,'ping'),{},controller.signal)).ms);
      $('ping').textContent=format(SpeedCore.median(record.pings));$('jitter').textContent=format(SpeedCore.jitter(record.pings));
      $('live-value').textContent=$('ping').textContent;$('progress').value=i+1;drawPings(record.pings);
    }
    record.pingMs=SpeedCore.median(record.pings);record.jitterMs=SpeedCore.jitter(record.pings);
    record.downloadMbps=(await bandwidth(server,'download',record)).mbps;
    record.uploadMbps=(await bandwidth(server,'upload',record)).mbps;
    record.status='complete';record.server=endpointLabel(server);$('server').textContent=record.server;
    $('progress').value=100;phase(null,'MISSION COMPLETE');status('Test complete. Sustained averages are shown.');showRatings(record);
  } catch(error) {
    record.status=controller.signal.aborted ? 'cancelled' : 'failed';
    record.error=record.status==='cancelled' ? 'Test cancelled.' : (error.name==='TimeoutError' ? 'A test request timed out. Try another server.' : error instanceof TypeError ? 'Could not reach the selected server. Try another server or check blockers.' : error.message);
    document.body.classList.toggle('error',record.status==='failed');phase(null,record.status==='cancelled'?'FLIGHT CANCELLED':'CONNECTION INTERRUPTED');status(`${record.error} Partial traces are shown; no quality rating assigned.`);
    // Partial curves remain visible, but final result numbers must not imply success.
    for(const id of ['download','upload','ping','jitter','live-value'])$(id).textContent='—';
    for(const id of ['download','upload'])$(`${id}-detail`).textContent='Incomplete · see partial trace';
  } finally {
    record.finished=new Date().toISOString();
    await saveRecord(record);controller=null;setBusy();
  }
  return record;
}

// IndexedDB avoids a fixed history-count cap. Quota errors are reported, never hidden.
let dbPromise;
function database() {
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('orbit-speed-test',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('tests',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('History database is blocked by another tab.'));
  });
  return dbPromise;
}
async function loadHistory() {
  try {
    const db=await database();
    const previous=historyRecords;
    historyRecords=await new Promise((resolve,reject)=>{const req=db.transaction('tests').objectStore('tests').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const valid=historyRecords.filter(OrbitSecurity.validRecord);
    if(valid.length!==historyRecords.length)$('storage-status').textContent='Some invalid history entries were ignored. Stored data was not deleted.';
    // Keep attempts that may have started while the database read was pending.
    historyRecords=[...new Map([...valid,...previous.filter(OrbitSecurity.validRecord)].map(record=>[record.id,record])).values()];
  } catch {$('storage-status').textContent='Browser storage is unavailable. This session’s history will not survive a reload; export it to keep a copy.';}
  renderHistory();
}
async function saveRecord(record) {
  const index=historyRecords.findIndex(item=>item.id===record.id);
  if(index===-1) historyRecords.push(record); else historyRecords[index]=record;
  try {
    const db=await database();
    await new Promise((resolve,reject)=>{const tx=db.transaction('tests','readwrite');tx.objectStore('tests').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  } catch {$('storage-status').textContent='This result could not be saved. Browser storage may be full or blocked. Export history before leaving.';}
  renderHistory();
}
function renderHistory() {
  const tbody=$('history');tbody.replaceChildren();
  $('history-empty').hidden=historyRecords.length>0;
  for(const record of [...historyRecords].sort((a,b)=>b.date.localeCompare(a.date))) {
    const tr=node('tr');
    const completed=record.status==='complete';
    for(const text of [new Date(record.date).toLocaleString(),record.server,completed ? `${format(record.downloadMbps)} Mbps`:'—',completed ? `${format(record.uploadMbps)} Mbps`:'—',completed ? `${format(record.pingMs)} / ${format(record.jitterMs)} ms`:'—',record.status==='running' ? 'Unfinished / in another tab' : record.status])tr.append(node('td',text));
    const td=node('td');const button=node('button','View','secondary');button.type='button';
    button.addEventListener('click',()=>{
      if(controller){status('Finish or cancel the current test before viewing history.');return;}
      current=record;drawSpeed(record);drawPings(record.pings);showRatings(record);
      for(const [id,key] of [['download','downloadMbps'],['upload','uploadMbps'],['ping','pingMs'],['jitter','jitterMs']])$(id).textContent=completed ? format(record[key]):'—';
      for(const direction of ['download','upload'])$(`${direction}-detail`).textContent=completed ? `${(record[direction].durationMs/1000).toFixed(1)} s · ${(record[direction].bytes/1000000).toFixed(0)} MB`:'Incomplete · partial trace';
      $('server').textContent=record.server;$('live-value').textContent=completed ? format(record.downloadMbps):'—';$('live-unit').textContent='Mbps';$('flight-time').textContent='HISTORY';
      phase(null,'RECORDED FLIGHT');status(`Viewing ${new Date(record.date).toLocaleString()} · ${record.status}${record.error ? ' · '+record.error:''}`);
      $('progress').value=completed ? 100:0;
      document.querySelector('.dashboard').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });td.append(button);tr.append(td);tbody.append(tr);
  }
}
$('export').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(historyRecords,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download=`orbit-history-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('server-select').addEventListener('change',event=>{selectedId=event.target.value;renderServers();});
$('start').addEventListener('click',startTest);
$('cancel').addEventListener('click',()=>controller?.abort());
$('scan').addEventListener('click',discoverServers);
$('locate').addEventListener('click',locate);
if(EMBEDDED){
  document.body.replaceChildren(node('p','Open Orbit directly in its own tab to use network tests.'));
}else{
drawSpeed();drawPings();showRatings();
// Third-party probes and location access require an explicit user action.
loadHistory();
$('scan-status').textContent='Scan servers to find a route, or use your location to narrow the search.';

if(document.modelContext?.registerTool) {
  try {Promise.resolve(document.modelContext.registerTool({
    name:'start_network_speed_test',description:'Run the selected server test for at least 22 seconds per direction, potentially using several GB. Saves a local history entry.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},
    execute:input=>{if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length)throw new Error('Expected an empty object.');return startTest();}
  })).catch(()=>{});}catch {/* Optional API. */}
}

} // End top-level page initialization.
