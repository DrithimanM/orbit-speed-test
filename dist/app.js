/* Orbit: plain browser JavaScript. No build tools, frameworks, or tracking. */
const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;
const $ = id => document.getElementById(id);
const PROFILES = Object.freeze({quick:{label:'Quick Probe',durationMs:5000},sustained:{label:'Sustained Flight',durationMs:15000}});
let activeProfile = 'quick';
const CF = {id:'cloudflare', name:'Cloudflare · automatic edge', type:'cloudflare', base:'https://speed.cloudflare.com/',provider:'Cloudflare'};
let servers = [], locationPoint = null, scanning = false, locating = false;
let controller = null, connection = {}, current = null, historyRecords = [];
let selectedId = 'auto';
let locationAttempt = null, locationSource = 'none';
let metadataController = null, metadataUpdated = 0;
const networkAPI = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
const format = value => Number.isFinite(value) ? (value < 10 ? value.toFixed(2) : value.toFixed(1)) : '—';
function status(text) { $('status').textContent = text; }
function profile() { return PROFILES[activeProfile]; }
function setProgress(value) {
  const safe=Math.max(0,Math.min(100,Number(value)||0)), progress=$('progress');
  progress.setAttribute('aria-valuenow',String(safe));
  const fill=progress.querySelector?.('i');
  if(fill)fill.style.transform=`scaleX(${safe/100})`;
}
function setBusy() {
  const offline = navigator.onLine === false;
  const busy = offline || scanning || locating || Boolean(controller);
  for (const id of ['start','scan','server-select','stream-count','server-scope','provider-filter','profile-toggle']) $(id).disabled = busy;
  for (const id of ['location-choice','apply-location']) $(id).disabled = scanning || Boolean(controller);
  $('network-choice').disabled=Boolean(controller);
  $('refresh-connection').disabled=offline || Boolean(controller || metadataController);
  $('cancel').hidden = !controller;
  $('start-label').textContent = controller ? 'Measuring' : scanning ? 'Locking route…' : offline ? 'Offline' : 'Start probe';
  $('start').setAttribute('aria-label',controller ? 'Speed test in progress' : scanning ? 'Locking the test route' : offline ? 'Reconnect to run a speed test' : 'Start speed test');
  document.body.classList.toggle('running', Boolean(controller));
  document.body.classList.toggle('preparing', locating || scanning);
}
function updateDial(value=0,unit='Mbps') {
  const fraction=SpeedCore.dialFraction(value);
  $('dial-needle').setAttribute('transform',`rotate(${-135+fraction*270} 180 171)`);
  document.body.setAttribute('data-speed-tier',value>300?'high':value>50?'medium':'low');
  $('dial-fill').setAttribute('stroke-dashoffset',String(100-fraction*100));
  $('dial-scale').textContent=`0–1,000 ${unit}${value>1000?' · above dial range':''}`;
}
function phase(name, label) {
  $('phase').textContent = label;
  document.body.setAttribute('data-phase',name || 'idle');
  for (const id of ['ping','download','upload']) $(`${id}-card`).classList.toggle('active', name === id);
  $('live-label').textContent = name ? `${name === 'ping' ? 'HTTP latency' : name + ' · running average'}` : label;
  $('live-unit').textContent = name === 'ping' ? 'ms' : 'Mbps';
  if(name==='ping')updateDial(0,'ms');
}

// Includes full response consumption and supports cancelling a fetch or a stalled body.
async function request(url, options = {}, signal, timeout = 20000, asJson = false) {
  if(EMBEDDED)throw new Error('Open Orbit in its own tab to use network tests.');
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]);
  const started = performance.now();
  const safeURL=OrbitSecurity.approvedURL(url,document.baseURI);
  const response = await fetch(safeURL, {...options, redirect:'error', referrerPolicy:'no-referrer', credentials:'omit', cache:'no-store', signal:combined});
  if (!response.ok) {const error=new Error(`HTTP ${response.status} from ${new URL(safeURL).hostname}`);error.status=response.status;throw error;}
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
function captureMetadata(response, target=connection) {
  const get = name => response.headers.get(`cf-meta-${name}`);
  if (OrbitSecurity.validIP(get('ip'))) target.ip = get('ip');
  if (/^[1-9]\d{0,9}$/.test(get('asn') || '') && Number(get('asn'))<=4294967295) target.asn = get('asn');
  if (/^[A-Z]{3}$/.test(get('colo') || '')) target.colo = get('colo');
}
function redactIP(value) {
  if(!OrbitSecurity.validIP(value))return 'Unavailable';
  if(value.includes(':'))return value.split(':').slice(0,3).map(part=>part || '0').join(':')+'::****';
  const parts=value.split('.');return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
}
function showIP() { $('ip').textContent=$('unmask-ip').checked && connection.ip ? connection.ip : redactIP(connection.ip); }
function currentNetwork() {
  return SpeedCore.networkSnapshot(networkAPI,$('network-choice').value,navigator.onLine);
}
function showNetwork() {
  const network=currentNetwork();
  $('network-type').textContent=SpeedCore.networkLabels[network.type];
  $('network-source').textContent=network.source==='manual' ? 'Selected by you · not device verified' : network.source==='browser' ? 'Reported by this browser' : 'This browser hides the interface type';
  $('network-estimate').textContent=(network.effectiveType==='unknown' ? 'Performance class not exposed' : `${network.effectiveType.toUpperCase()}-like performance · browser estimate, not the radio generation`)+(network.saveData ? ' · Data Saver is on' : '');
}
async function connectionInfo(signal) {
  if (navigator.onLine === false) return;
  metadataController?.abort();
  const attempt=new AbortController();metadataController=attempt;
  const combined=signal ? AbortSignal.any([signal,attempt.signal]) : attempt.signal;
  const next={};connection={};metadataUpdated=0;
  $('ip').textContent='Detecting…';$('isp').textContent='Looking up network…';$('asn').textContent='—';
  $('connection-status').textContent='Identifying the public connection via Cloudflare and RIPEstat…';setBusy();
  try {
    const lookup = async (endpoint,resource) => (await request(`https://stat.ripe.net/data/${endpoint}/data.json${resource ? '?resource='+encodeURIComponent(resource) : ''}`,{},combined,5000,true)).body.data;
    try {captureMetadata((await request(testURL(CF,'ping'),{},combined,4000)).response,next);} catch {combined.throwIfAborted();}
    if(!next.ip) {
      const ip=(await lookup('whats-my-ip'))?.ip;
      if(OrbitSecurity.validIP(ip))next.ip=ip;
    }
    if(!next.ip)throw new Error('Public IP unavailable');
    if(metadataController===attempt) { connection=next;showIP(); }
    if(!next.asn) {
      const asns=(await lookup('network-info',next.ip))?.asns;
      const candidate=Array.isArray(asns) ? asns[0] : undefined;
      if(/^[1-9]\d{0,9}$/.test(String(candidate)) && Number(candidate)<=4294967295)next.asn=String(candidate);
    }
    if(next.asn) {
      const holder=(await lookup('as-overview',`AS${next.asn}`))?.holder;
      if(typeof holder==='string' && holder.trim().length && holder.length<=200)next.isp=holder.trim();
    }
  } catch { /* Metadata failure never prevents a throughput test. */ }
  finally {
    if(metadataController===attempt) {
      connection=next;metadataController=null;
      metadataUpdated=combined.aborted ? 0 : Date.now();
      showIP();$('isp').textContent=next.isp || (next.asn ? 'Name lookup unavailable' : 'Lookup unavailable');$('asn').textContent=next.asn ? `AS${next.asn}` : 'Unavailable';
      $('connection-status').textContent=next.isp ? 'Detected · registered network holder. A VPN or upstream carrier may appear instead of your retail ISP.' : 'Could not fully identify this connection. Refresh to retry; speed tests still work.';
      setBusy();
    }
  }
}

// Route preferences are manual only. Orbit never requests device GPS location.
function showLocation(name,source) {
  $('location-name').textContent=name;
  $('location-source').textContent=source;
}
function closeLocationEditor() {
  $('location-editor').hidden=true;
  $('change-location').setAttribute('aria-expanded','false');
}
function initializeLocation() {
  const select=$('location-choice');
  select.replaceChildren(new Option('No location filter · compare by latency','none'));
  for(const [index,city] of SpeedCore.locations.entries())select.append(new Option(city.name,String(index)));
  select.value='none'; locationPoint=null; locationSource='none';
  showLocation('No GPS routing','Manual city preference is optional; automatic selection uses edge RTT.');
  if (navigator.onLine === false) {
    $('location-status').textContent='Offline · route lock resumes when you reconnect.';
    return;
  }
  return discoverServers();
}
async function applyLocation() {
  if(EMBEDDED || scanning || controller)return;
  const choice=$('location-choice').value;
  const city=/^\d{1,2}$/.test(choice) ? SpeedCore.locations[Number(choice)] : null;
  if(choice!=='none' && !city)return;
  locationAttempt?.abort();locationAttempt=null;locating=false;
  locationPoint=city ? [...city.point] : null;locationSource=city ? 'manual' : 'none';selectedId='auto';
  showLocation(city ? city.name : 'No location filter',city ? 'Selected area · approximate city center' : 'Servers compared by measured latency');
  $('location-status').textContent=city ? 'Using this optional city preference to shortlist servers. No device location was requested.' : 'Comparing available servers by measured latency.';
  closeLocationEditor();setBusy();
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
  return {id:`libre-${item.id}`,name:item.name,base:base.href,type:'librespeed',provider:base.hostname.endsWith('.clouvider.net')?'Clouvider':base.hostname.endsWith('.sharktech.net')?'Sharktech':'Community / research',dlURL:item.dlURL,ulURL:item.ulURL,pingURL:item.pingURL,
    distance:locationPoint && coordinates ? SpeedCore.distance(locationPoint,coordinates) : null};
}
async function probe(server) {
  try {
    // Route lock intentionally measures one bounded HTTP RTT per candidate.
    // AbortSignal.timeout makes the entire parallel window at most 800 ms.
    const sample=await request(testURL(server,'ping'),{},AbortSignal.timeout(800),800);
    server.latency=sample.ms;server.available=true;
  } catch { server.available = false; server.latency = null; }
}
async function discoverServers() {
  if (navigator.onLine === false || scanning || controller || locating) return;
  scanning = true; setBusy();
  $('scan-status').textContent = 'Locking a route from network edge RTT…';
  try {
    const snapshot = (await request('servers.json',{},undefined,5000,true)).body;
    OrbitUI.setCatalog(snapshot);
    const catalog = Array.isArray(snapshot.servers) ? snapshot.servers : [];
    const seen=new Set();
    const candidates = catalog.slice(0,1000).flatMap(item => { try { const server=normalizeServer(item,snapshot.cities);if(!server)return [];const key=new URL(server.pingURL,server.base).href;if(seen.has(key))return [];seen.add(key);return [server]; } catch { return []; } });
    candidates.sort((a,b)=>(a.distance ?? Infinity)-(b.distance ?? Infinity));
    const provider=$('provider-filter').value;
    const matches=server=>provider==='independent' ? server.type!=='cloudflare' : ['Cloudflare','Clouvider','Sharktech','Community / research'].includes(provider) ? server.provider===provider : true;
    const pool=[{...CF},...candidates].filter(matches);
    const expanded=$('server-scope').value==='all';
    // A small, simultaneous pool makes auto-lock responsive. Cloudflare remains
    // a deterministic fallback if no reviewed endpoint answers in the window.
    servers=pool.slice(0,expanded ? 12 : 8);
    if(!servers.some(server=>server.id==='cloudflare'))servers.unshift({...CF});
    $('catalog-summary').textContent=`${candidates.length} reviewed endpoints + Cloudflare · ${servers.length} parallel edge probes`;
    await Promise.allSettled(servers.map(probe));
    servers.sort((a,b)=>(a.latency ?? Infinity)-(b.latency ?? Infinity));
    const valid = servers.filter(s=>s.available);
    if(!valid.length){const fallback=servers.find(server=>server.id==='cloudflare')||{...CF};fallback.available=true;fallback.latency=null;servers=[fallback];}
    if (!valid.some(s=>s.id===selectedId)) selectedId='auto';
    renderServers();
    const best=servers.find(server=>server.available);
    $('scan-status').textContent = best?.latency !== null ? `ARMED · ${best.name} · ${Math.round(best.latency)} ms edge RTT.` : 'ARMED · Cloudflare anycast fallback.';
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
    const text=node('span',server.name);text.append(node('small',server.distance !== null && server.distance !== undefined ? `${server.provider} · ≈ ${Math.round(server.distance).toLocaleString()} km` : server.type==='cloudflare' ? 'Cloudflare · automatically routed edge' : `${server.provider} · distance unavailable`));
    button.append(text,node('strong',latency));
    button.classList.toggle('selected',selectedId===server.id || (selectedId==='auto' && server===servers.find(s=>s.available)));
    button.addEventListener('click',()=>{if(controller || scanning) return;selectedId=server.id;renderServers();});list.append(button);
  }
  select.value=selectedId;
  OrbitUI.updateRoute(servers,selectedId);
}

// Graphs are SVG data plots, generated from measured samples, never random decoration.
function svgElement(tag, attrs, text) {
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  if(text!==undefined) el.textContent=text;
  return el;
}
function drawSpeed(record) { OrbitUI.drawThroughput(record); }
function drawPings(values=[]) {
  const svg=$('ping-chart');svg.replaceChildren();
  if(!values.length){svg.append(svgElement('text',{x:130,y:42,fill:'#9baac4','font-size':12,'text-anchor':'middle'},'Waiting for latency samples'));return;}
  const max=Math.max(1,...values)*1.15;
  const points=values.map((value,index)=>`${12+index/Math.max(1,values.length-1)*236},${60-value/max*50}`).join(' ');
  svg.append(svgElement('polyline',{points,fill:'none',stroke:'#ffca83','stroke-width':2}));
  values.forEach((value,index)=>svg.append(svgElement('circle',{cx:12+index/Math.max(1,values.length-1)*236,cy:60-value/max*50,r:3,fill:'#ffca83'})));
  svg.append(svgElement('text',{x:248,y:74,fill:'#9baac4','font-size':9,'text-anchor':'end'},`${Math.min(...values).toFixed(0)}–${Math.max(...values).toFixed(0)} ms`));
}
function showRatings(record) { OrbitUI.renderRatings(record); }

function delay(ms,signal) {
  return new Promise(resolve=>{
    if(signal.aborted){resolve();return;}
    const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
    const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});
  });
}
function showDiagnostics(record) {
  $('diag-state').textContent=record ? record.status==='complete' ? 'COMPLETE DATASET' : 'LIVE / PARTIAL DATA' : 'WAITING FOR SAMPLES';
  $('diag-network').textContent=SpeedCore.networkLabel(record?.network);
  $('diag-mode').textContent=record ? `${record.streams || 1} HTTP stream${record.streams===4?'s':''}${record.measurementVersion===2?' · wall time':' · legacy'}` : 'Select a measurement mode';
  $('diag-p95').textContent=record?.pings?.length ? `${format(SpeedCore.percentile(record.pings,.95))} ms · n=${record.pings.length}` : '—';
  for(const direction of ['download','upload']){
    const result=record?.[direction], values=result?.loadedPings || [];
    $('loaded-'+direction).textContent=values.length ? `${format(SpeedCore.median(values))} ms` : '—';
    $('loaded-'+direction+'-detail').textContent=values.length ? `${record.pingMs===undefined ? 'Baseline pending' : `${SpeedCore.median(values)-record.pingMs>=0?'+':''}${format(SpeedCore.median(values)-record.pingMs)} ms vs idle`} · n=${values.length}` : 'HTTP RTT during transfer';
  }
  const deltas=['download','upload'].map(direction=>{
    const values=record?.[direction]?.loadedPings || [];
    return record?.pingMs!==undefined && values.length ? SpeedCore.median(values)-record.pingMs : null;
  }).filter(Number.isFinite);
  const delta=deltas.length ? Math.max(...deltas) : null;
  const grade=SpeedCore.bufferbloatGrade(delta) || '—';
  $('jitter').textContent=delta===null?'—':format(delta);
  $('buffer-detail').textContent=delta===null?'Grade — · loaded vs idle':`Grade ${grade} · ${delta>=0?'+':''}${format(delta)} ms loaded RTT`;
  const total=(record?.download?.bytes || 0)+(record?.upload?.bytes || 0);
  const requests=(record?.download?.requests || 0)+(record?.upload?.requests || 0);
  const retries=(record?.download?.retries || 0)+(record?.upload?.retries || 0);
  $('diag-volume').textContent=record ? `${(total/1000000).toFixed(1)} MB · ${record.measurementVersion===2 ? requests+' requests' : 'legacy record'}` : '—';
  $('diag-retries').textContent=record?.measurementVersion===2 ? `${retries} transfer retries · ${(record.download?.probeFailures || 0)+(record.upload?.probeFailures || 0)} missed RTT probes` : record ? 'Not recorded in legacy tests' : '—';
  OrbitUI.renderTelemetry(record);
}
function reservePayload(run,bytes) {
  if(run.reserved+bytes>8000000000){const error=new Error('The 8 GB safety budget was reached. Use single-stream mode or test again.');error.code='LIMIT';throw error;}
  run.reserved+=bytes;
}
async function bandwidth(server,direction,record,run) {
  const cap=SpeedCore.transferCap(server.type,direction,server.provider);
  const payload=direction==='upload' ? new Uint8Array(cap) : null;
  if(payload)for(let offset=0;offset<payload.length;offset+=65536)crypto.getRandomValues(payload.subarray(offset,Math.min(offset+65536,payload.length)));
  const result={bytes:0,transferMs:0,durationMs:0,mbps:0,points:[],loadedPings:[],probeFailures:0,requests:0,retries:0};record[direction]=result;
  const local=new AbortController(), signal=AbortSignal.any([controller.signal,local.signal]);
  const started=performance.now();let lastSample=0,lastBytes=0,firstError;
  updateDial();phase(direction,direction==='download' ? 'DOWNLINK ACTIVE' : 'UPLINK ACTIVE');
  const update=(final=false)=>{
    result.durationMs=Math.max(.1,performance.now()-started);result.transferMs=result.durationMs;
    result.mbps=result.bytes*8/result.durationMs/1000;
    const delta=result.durationMs-lastSample;
    if(delta>=100 || (final && delta>0 && result.bytes>lastBytes)){
      result.points.push({seconds:result.durationMs/1000,mbps:(result.bytes-lastBytes)*8/delta/1000});
      lastSample=result.durationMs;lastBytes=result.bytes;drawSpeed(record);
    }
    $('flight-time').textContent=`T + ${(result.durationMs/1000).toFixed(0).padStart(2,'0')} s`;
    status(`${direction==='download'?'Download':'Upload'} · ${record.streams} stream${record.streams===4?'s':''} · ${(result.durationMs/1000).toFixed(1)} / ${(run.durationMs/1000).toFixed(0)} s`);
    setProgress((direction==='download'?5:52.5)+Math.min(47.5,result.durationMs/run.durationMs*47.5));
    $(direction).textContent=format(result.mbps);$('live-value').textContent=format(result.mbps);updateDial(result.mbps);
    $(`${direction}-detail`).textContent=`${(result.durationMs/1000).toFixed(1)} s · ${(result.bytes/1000000).toFixed(0)} MB`;
    showDiagnostics(record);
  };
  // Separate HTTP probes share the loaded connection. This is not ICMP or packet loss.
  const monitor=(async()=>{
    while(!signal.aborted && performance.now()-started<run.durationMs && result.loadedPings.length+result.probeFailures<100){
      try {const sample=await request(testURL(server,'ping'),{},signal,1000);if(!signal.aborted)result.loadedPings.push(sample.ms);}
      catch {if(!signal.aborted)result.probeFailures++;}
      if(!signal.aborted)await delay(250,signal);
    }
  })();
  const worker=async()=>{
    let size=250000;
    while(performance.now()-started<run.durationMs){
      signal.throwIfAborted();
      if(result.requests>=1000 || performance.now()-started>90000){const error=new Error('Measurement safety limit reached.');error.code='LIMIT';throw error;}
      let response;
      for(let attempt=0;attempt<2;attempt++){
        signal.throwIfAborted();
        const planned=direction==='download' && server.type==='librespeed' ? Math.ceil(size/1048576)*1048576 : size;
        if(result.requests>=1000){const error=new Error('Request safety limit reached.');error.code='LIMIT';throw error;}
        reservePayload(run,planned);result.requests++;
        try {
          response=await request(testURL(server,direction,size),direction==='upload' ? {method:'POST',body:payload.subarray(0,size),headers:{'Content-Type':'text/plain'}} : {},signal);
          if(direction==='download'){
            if(!response.response.headers.get('content-type')?.includes('application/octet-stream') || !response.body.byteLength || (server.type==='cloudflare' && response.body.byteLength!==size))throw new Error('Invalid or incomplete download payload');
          }
          break;
        }catch(error){
          if(signal.aborted || attempt || error.code==='LIMIT')throw error;
          result.retries++;size=Math.max(65536,Math.floor(size/2));await delay(200,signal);
        }
      }
      result.bytes+=direction==='download' ? response.body.byteLength : size;
      if(server.type==='cloudflare') {const metadata={};captureMetadata(response.response,metadata);if(metadata.colo)connection.colo=metadata.colo;}
      update();
      size=Math.round(Math.min(cap,Math.max(65536,size*1200/response.ms)));
    }
  };
  update();const ticker=setInterval(update,100);
  try {
    const workers=Array.from({length:record.streams},()=>worker().catch(error=>{firstError ||= error;local.abort();}));
    await Promise.all(workers);
    if(firstError)throw firstError;
    update(true);return result;
  }finally{clearInterval(ticker);local.abort();await monitor;}
}
function endpointLabel(server) {
  return server.type==='cloudflare' && connection.colo ? `Cloudflare · ${connection.colo==='DXB' ? 'Dubai (DXB)' : connection.colo}` : server.name;
}
function failureMessage(error,server,stage) {
  if(error.code==='LIMIT')return error.message;
  const host=new URL(server.base).hostname;
  const reason=error.name==='TimeoutError' ? 'request timed out' : error instanceof TypeError ? 'request was blocked or the connection failed' : error.message;
  return `${stage} at ${host}: ${reason}.`;
}
async function testAttempt(server,run,recoveryFrom) {
  const record={id:crypto.randomUUID(),date:new Date().toISOString(),status:'running',server:server.name,serverId:server.id,pings:[],download:null,upload:null,streams:run.streams,profile:run.profile,measurementVersion:2,network:currentNetwork()};
  if(recoveryFrom)record.recoveryFrom=recoveryFrom;
  current=record;let stage='Preflight';
  for(const id of ['download','upload','ping','jitter','live-value'])$(id).textContent='—';
  for(const id of ['download','upload'])$(`${id}-detail`).textContent='Sustained average';
  $('server').textContent=server.name;$('diag-endpoint').textContent=new URL(server.base).hostname;
  $('route-note').textContent=recoveryFrom ? `Previous endpoint failed. Starting a separate test on ${server.name}.` : `Testing ${server.name}.`;
  setProgress(0);
  drawSpeed(record);drawPings();showRatings();showDiagnostics(record);updateDial();
  await saveRecord(record);
  try {
    phase('ping','CHECKING ROUTE');status(`Checking ${server.name}…`);
    if(metadataController || Date.now()-metadataUpdated>60000)await connectionInfo(controller.signal);controller.signal.throwIfAborted();
    // Larger than discovery probes, still separate from the timed measurement.
    reservePayload(run,1048576+262144);
    const preflight=await request(testURL(server,'download',1048576),{},controller.signal,10000);
    if(preflight.body.byteLength<1048576 || !preflight.response.headers.get('content-type')?.includes('application/octet-stream'))throw new Error('Endpoint did not return test data');
    await request(testURL(server,'upload'),{method:'POST',body:new Uint8Array(262144),headers:{'Content-Type':'text/plain'}},controller.signal,10000);
    stage='Idle latency';phase('ping','MEASURING IDLE RTT');
    await request(testURL(server,'ping'),{},controller.signal);
    for(let i=0;i<4;i++){
      record.pings.push((await request(testURL(server,'ping'),{},controller.signal)).ms);
      $('ping').textContent=format(SpeedCore.median(record.pings));$('jitter').textContent=format(SpeedCore.jitter(record.pings));
      $('live-value').textContent=$('ping').textContent;updateDial(SpeedCore.median(record.pings),'ms');setProgress(i+1);drawPings(record.pings);showDiagnostics(record);
    }
    record.pingMs=SpeedCore.median(record.pings);record.jitterMs=SpeedCore.jitter(record.pings);
    stage='Download';record.downloadMbps=(await bandwidth(server,'download',record,run)).mbps;
    stage='Upload';record.uploadMbps=(await bandwidth(server,'upload',record,run)).mbps;
    record.status='complete';record.server=endpointLabel(server);$('server').textContent=record.server;
    setProgress(100);phase(null,'MISSION COMPLETE');$('live-value').textContent=format(record.downloadMbps);updateDial(record.downloadMbps);$('live-label').textContent=`${run.profile==='quick'?'Quick':'Sustained'} downlink average`;
    status('Test complete. Throughput and latency under load are ready.');showRatings(record);
  }catch(error){
    record.status=controller.signal.aborted ? 'cancelled' : 'failed';
    record.error=record.status==='cancelled' ? 'Test cancelled.' : failureMessage(error,server,stage);
    run.stopped=controller.signal.aborted || error.code==='LIMIT';
    updateDial();document.body.classList.toggle('error',record.status==='failed');phase(null,record.status==='cancelled'?'FLIGHT CANCELLED':'ENDPOINT INTERRUPTED');
    status(`${record.error} Partial data is labelled below; no quality rating assigned.`);
    for(const id of ['download','upload','ping','jitter','live-value'])$(id).textContent='—';
    for(const id of ['download','upload'])$(`${id}-detail`).textContent='Incomplete · partial trace';
    if(record.status==='failed' && !run.stopped){server.available=false;server.latency=null;}
  }finally{
    record.finished=new Date().toISOString();showDiagnostics(record);await saveRecord(record);
  }
  return record;
}
async function startTest() {
  if(navigator.onLine === false){status('Reconnect to run a speed test. Saved flights are available below.');return {error:'Offline'};}
  if(EMBEDDED || controller || scanning || locating)return {error:'Another operation is running.'};
  if(!servers.length)await discoverServers();
  if(controller || scanning || locating)return {error:'Another operation is running.'};
  const automatic=selectedId==='auto';
  const candidates=automatic ? servers.filter(s=>s.available).slice(0,2) : servers.filter(s=>s.id===selectedId && s.available);
  if(!candidates.length){status('No reachable endpoint selected. Scan servers to find another route.');return {error:'No server'};}
  const selectedProfile=profile();
  const run={streams:Number($('stream-count').value)===1?1:4,profile:activeProfile,durationMs:selectedProfile.durationMs,reserved:0,stopped:false};
  controller=new AbortController();setBusy();document.body.classList.remove('error');$('retry').hidden=true;
  let record,recoveryFrom;
  try {
    for(const server of candidates){
      document.body.classList.remove('error');
      record=await testAttempt(server,run,recoveryFrom);
      if(record.status==='complete' || run.stopped)break;
      recoveryFrom=server.name;
    }
  }finally{
    controller=null;setBusy();renderServers();
    $('retry').hidden=record?.status!=='failed' || run.stopped || !servers.some(s=>s.available);
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
  if(!current && !controller){
    const last=historyRecords.filter(record=>record.status==='complete').sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(last)viewRecord(last);
  }
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
function renderHistory() { OrbitUI.renderHistory(historyRecords); }
function viewRecord(record) {
  if(controller){status('Finish or cancel the current test before viewing another flight.');return false;}
  const completed=record.status==='complete';
  current=record;drawSpeed(record);drawPings(record.pings);showRatings(record);showDiagnostics(record);
  $('route-note').textContent='Saved measurement · '+record.server;
  for(const [id,key] of [['download','downloadMbps'],['upload','uploadMbps'],['ping','pingMs'],['jitter','jitterMs']])$(id).textContent=completed ? format(record[key]):'—';
  for(const direction of ['download','upload'])$(`${direction}-detail`).textContent=completed ? `${(record[direction].durationMs/1000).toFixed(1)} s · ${(record[direction].bytes/1000000).toFixed(0)} MB`:'Incomplete · partial trace';
  $('server').textContent=record.server;$('live-value').textContent=completed ? format(record.downloadMbps):'—';$('live-unit').textContent='Mbps';$('flight-time').textContent='SAVED FLIGHT';
  updateDial(completed ? record.downloadMbps : 0);phase(null,'RECORDED FLIGHT');
  $('live-label').textContent=completed ? 'Download · sustained average' : 'Incomplete measurement';
  status(`Viewing ${new Date(record.date).toLocaleString()} · ${record.status}${record.error ? ' · '+record.error:''}`);
  setProgress(completed ? 100:0);
  document.body.classList.toggle('error',record.status==='failed');
  return true;
}
// Interface event wiring.
$('server-select').addEventListener('change',event=>{selectedId=event.target.value;renderServers();});
$('start').addEventListener('click',startTest);
$('cancel').addEventListener('click',()=>controller?.abort());
$('retry').addEventListener('click',()=>{selectedId='auto';renderServers();startTest();});
$('scan').addEventListener('click',discoverServers);
for(const id of ['server-scope','provider-filter'])$(id).addEventListener('change',()=>{selectedId='auto';discoverServers();});
$('unmask-ip').addEventListener('change',showIP);
$('profile-toggle').addEventListener('click',()=>{
  if(controller || scanning)return;
  activeProfile=activeProfile==='quick'?'sustained':'quick';
  const sustained=activeProfile==='sustained';
  $('profile-toggle').setAttribute('aria-checked',String(sustained));
  $('profile-toggle').setAttribute('aria-label',`Test profile: ${profile().label}`);
  $('profile-duration').textContent=`${profile().durationMs/1000} s per direction`;
  $('status').textContent=`${profile().label} armed · route lock uses edge RTT.`;
});
$('network-choice').addEventListener('change',showNetwork);
$('refresh-connection').addEventListener('click',()=>connectionInfo());
networkAPI?.addEventListener?.('change',showNetwork);
window.addEventListener('online',()=>{showNetwork();setBusy();});window.addEventListener('offline',()=>{showNetwork();setBusy();});
$('change-location').addEventListener('click',()=>{
  const editor=$('location-editor');editor.hidden=!editor.hidden;
  $('change-location').setAttribute('aria-expanded',String(!editor.hidden));
  if(!editor.hidden)$('location-choice').focus();
});
$('apply-location').addEventListener('click',applyLocation);
if(EMBEDDED){
  document.body.replaceChildren(node('p','Open Orbit directly in its own tab to use network tests.'));
}else{
OrbitUI.init({getHistory:()=>historyRecords,selectRecord:viewRecord,getCatalog:async()=>(await request('servers.json',{},undefined,5000,true)).body});
drawSpeed();drawPings();showRatings();showDiagnostics();updateDial();
loadHistory();
showNetwork();setBusy();
if(navigator.onLine === false){
  $('isp').textContent='Unavailable offline';$('ip').textContent='Unavailable offline';
  $('connection-status').textContent='Reconnect to refresh IP and ISP information.';
  $('scan-status').textContent='Offline · reconnect to discover servers.';
  status('Offline · view or export your saved flights below.');
  window.addEventListener('online',()=>{connectionInfo();discoverServers();},{once:true});
}else{connectionInfo();}
initializeLocation();

} // End top-level page initialization.
