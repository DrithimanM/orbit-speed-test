/* Orbit: plain browser JavaScript. No build tools, frameworks, or tracking. */
const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;
const $ = id => document.getElementById(id);
const MEASURE_MS = 22000;
const CF = {id:'cloudflare', name:'Cloudflare · automatic edge', type:'cloudflare', base:'https://speed.cloudflare.com/'};
let servers = [], locationPoint = null, scanning = false, locating = false;
let controller = null, connection = {}, current = null, historyRecords = [];
let selectedId = 'auto';
let locationAttempt = null, locationSource = 'none';

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
  for (const id of ['start','scan','locate','server-select','stream-count']) $(id).disabled = busy;
  for (const id of ['location-choice','apply-location']) $(id).disabled = scanning || Boolean(controller);
  $('cancel').hidden = !controller;
  $('start-label').textContent = controller ? 'TEST IN FLIGHT' : locating ? 'LOCATING…' : scanning ? 'FINDING ROUTE…' : 'START TEST';
  $('start').setAttribute('aria-label',controller ? 'Speed test in progress' : locating || scanning ? 'Preparing the test route' : 'Start speed test');
  document.body.classList.toggle('running', Boolean(controller));
  document.body.classList.toggle('preparing', locating || scanning);
}
function updateDial(value=0,unit='Mbps') {
  const fraction=SpeedCore.dialFraction(value);
  $('dial-needle').setAttribute('transform',`translate(${fraction*296} 0)`);
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

// Device fixes and city suggestions stay in memory; no reverse-geocoding service.
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
  let suggested;
  try {suggested=SpeedCore.suggestedLocation(Intl.DateTimeFormat().resolvedOptions().timeZone);}catch { /* Optional suggestion. */ }
  if(suggested) {
    locationPoint=[...suggested.point];locationSource='suggested';
    select.value=String(SpeedCore.locations.indexOf(suggested));
    showLocation(suggested.name,'Suggested area · browser timezone, not a device fix');
  }else{
    select.value='none';showLocation('No location filter','Choose a city or use your device location');
  }
  return locate();
}
async function applyLocation() {
  if(EMBEDDED || scanning || controller)return;
  const choice=$('location-choice').value;
  const city=/^\d{1,2}$/.test(choice) ? SpeedCore.locations[Number(choice)] : null;
  if(choice!=='none' && !city)return;
  locationAttempt?.abort();locationAttempt=null;locating=false;
  locationPoint=city ? [...city.point] : null;locationSource=city ? 'manual' : 'none';selectedId='auto';
  showLocation(city ? city.name : 'No location filter',city ? 'Selected area · approximate city center' : 'Servers compared by measured latency');
  $('location-status').textContent=city ? 'Using this city to shortlist servers. This changes the search area, not your network location.' : 'Comparing available servers without a distance filter.';
  closeLocationEditor();setBusy();
  await discoverServers();
}
async function locate() {
  if (EMBEDDED || controller || scanning || locating) return;
  if (!navigator.geolocation) { $('location-status').textContent = 'Device location is unavailable. Using the displayed search area; you can change it.'; await discoverServers(); return; }
  const attempt=new AbortController();locationAttempt=attempt;
  locating = true; setBusy();
  $('location-status').textContent = 'Checking device location… Allow the browser prompt, or choose a search area with Change location.';
  try {
    const position = await new Promise((resolve,reject) => {
      const finish=(callback,value)=>{clearTimeout(timer);attempt.signal.removeEventListener('abort',abort);callback(value);};
      const abort=()=>finish(reject,{name:'AbortError'});
      // A dismissed permission prompt must not leave the launch control stuck.
      const timer=setTimeout(()=>finish(reject,{code:3}),15000);
      attempt.signal.addEventListener('abort',abort,{once:true});
      try {navigator.geolocation.getCurrentPosition(position=>finish(resolve,position),error=>finish(reject,error),{enableHighAccuracy:false,timeout:12000,maximumAge:300000});}catch(error){finish(reject,error);}
    });
    if(attempt.signal.aborted)return;
    const point=[position.coords.latitude,position.coords.longitude];
    if(!SpeedCore.validPoint(point))throw new Error('Invalid device location');
    locationPoint=point;locationSource='device';selectedId='auto';
    showLocation(SpeedCore.locationName(point),'Device location · approximate area');
    $('location-status').textContent = 'Device location found. Finding nearby servers; coordinates stay in this page.';
    closeLocationEditor();
  } catch (error) {
    if(attempt.signal.aborted)return;
    $('location-status').textContent = (error.code === 1 ? 'Location permission was denied. ' : 'Device location could not be determined. ')+(locationPoint ? 'Using the displayed search area. Change it if you are elsewhere.' : 'Comparing servers by latency. You can choose a city instead.');
  } finally { if(locationAttempt===attempt){locationAttempt=null;locating=false;setBusy();} }
  if(attempt.signal.aborted)return;
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

function delay(ms,signal) {
  return new Promise(resolve=>{
    if(signal.aborted){resolve();return;}
    const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
    const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});
  });
}
function showDiagnostics(record) {
  $('diag-state').textContent=record ? record.status==='complete' ? 'COMPLETE DATASET' : 'LIVE / PARTIAL DATA' : 'WAITING FOR SAMPLES';
  $('diag-mode').textContent=record ? `${record.streams || 1} HTTP stream${record.streams===4?'s':''}${record.measurementVersion===2?' · wall time':' · legacy'}` : 'Select a measurement mode';
  $('diag-p95').textContent=record?.pings?.length ? `${format(SpeedCore.percentile(record.pings,.95))} ms · n=${record.pings.length}` : '—';
  for(const direction of ['download','upload']){
    const result=record?.[direction], values=result?.loadedPings || [];
    $('loaded-'+direction).textContent=values.length ? `${format(SpeedCore.median(values))} ms` : '—';
    $('loaded-'+direction+'-detail').textContent=values.length ? `${record.pingMs===undefined ? 'Baseline pending' : `${SpeedCore.median(values)-record.pingMs>=0?'+':''}${format(SpeedCore.median(values)-record.pingMs)} ms vs idle`} · n=${values.length}` : 'HTTP RTT during transfer';
  }
  const total=(record?.download?.bytes || 0)+(record?.upload?.bytes || 0);
  const requests=(record?.download?.requests || 0)+(record?.upload?.requests || 0);
  const retries=(record?.download?.retries || 0)+(record?.upload?.retries || 0);
  $('diag-volume').textContent=record ? `${(total/1000000).toFixed(1)} MB · ${record.measurementVersion===2 ? requests+' requests' : 'legacy record'}` : '—';
  $('diag-retries').textContent=record?.measurementVersion===2 ? `${retries} transfer retries · ${(record.download?.probeFailures || 0)+(record.upload?.probeFailures || 0)} missed RTT probes` : record ? 'Not recorded in legacy tests' : '—';
}
function reservePayload(run,bytes) {
  if(run.reserved+bytes>8000000000){const error=new Error('The 8 GB safety budget was reached. Use single-stream mode or test again.');error.code='LIMIT';throw error;}
  run.reserved+=bytes;
}
async function bandwidth(server,direction,record,run) {
  const cap=SpeedCore.transferCap(server.type,direction);
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
    if(delta>=500 || (final && delta>0 && result.bytes>lastBytes)){
      result.points.push({seconds:result.durationMs/1000,mbps:(result.bytes-lastBytes)*8/delta/1000});
      lastSample=result.durationMs;lastBytes=result.bytes;drawSpeed(record);
    }
    $('flight-time').textContent=`T + ${(result.durationMs/1000).toFixed(0).padStart(2,'0')} s`;
    status(`${direction==='download'?'Download':'Upload'} · ${record.streams} stream${record.streams===4?'s':''} · ${(result.durationMs/1000).toFixed(0)} / 22 s minimum`);
    $('progress').value=(direction==='download'?10:55)+Math.min(45,result.durationMs/MEASURE_MS*45);
    $(direction).textContent=format(result.mbps);$('live-value').textContent=format(result.mbps);updateDial(result.mbps);
    $(`${direction}-detail`).textContent=`${(result.durationMs/1000).toFixed(1)} s · ${(result.bytes/1000000).toFixed(0)} MB`;
    showDiagnostics(record);
  };
  // Separate HTTP probes share the loaded connection. This is not ICMP or packet loss.
  const monitor=(async()=>{
    while(!signal.aborted && performance.now()-started<MEASURE_MS && result.loadedPings.length+result.probeFailures<100){
      try {const sample=await request(testURL(server,'ping'),{},signal,4000);if(!signal.aborted)result.loadedPings.push(sample.ms);}
      catch {if(!signal.aborted)result.probeFailures++;}
      if(!signal.aborted)await delay(1000,signal);
    }
  })();
  const worker=async()=>{
    let size=250000;
    while(performance.now()-started<MEASURE_MS){
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
      if(server.type==='cloudflare')captureMetadata(response.response);
      update();
      size=Math.round(Math.min(cap,Math.max(65536,size*1200/response.ms)));
    }
  };
  update();const ticker=setInterval(update,500);
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
  const record={id:crypto.randomUUID(),date:new Date().toISOString(),status:'running',server:server.name,serverId:server.id,pings:[],download:null,upload:null,streams:run.streams,measurementVersion:2};
  if(recoveryFrom)record.recoveryFrom=recoveryFrom;
  current=record;connection={};let stage='Preflight';
  for(const id of ['download','upload','ping','jitter','live-value'])$(id).textContent='—';
  for(const id of ['download','upload'])$(`${id}-detail`).textContent='Sustained average';
  $('server').textContent=server.name;$('diag-endpoint').textContent=new URL(server.base).hostname;
  $('route-note').textContent=recoveryFrom ? `Previous endpoint failed. Starting a separate test on ${server.name}.` : `Testing ${server.name}.`;
  $('ip').textContent='Detecting…';$('isp').textContent='Detecting…';$('progress').value=0;
  drawSpeed(record);drawPings();showRatings();showDiagnostics(record);updateDial();
  await saveRecord(record);
  try {
    phase('ping','CHECKING ROUTE');status(`Checking ${server.name}…`);
    await connectionInfo(controller.signal);controller.signal.throwIfAborted();
    // Larger than discovery probes, still separate from the timed measurement.
    reservePayload(run,1048576+262144);
    const preflight=await request(testURL(server,'download',1048576),{},controller.signal,10000);
    if(preflight.body.byteLength<1048576 || !preflight.response.headers.get('content-type')?.includes('application/octet-stream'))throw new Error('Endpoint did not return test data');
    await request(testURL(server,'upload'),{method:'POST',body:new Uint8Array(262144),headers:{'Content-Type':'text/plain'}},controller.signal,10000);
    stage='Idle latency';phase('ping','MEASURING IDLE RTT');
    await request(testURL(server,'ping'),{},controller.signal);
    for(let i=0;i<10;i++){
      record.pings.push((await request(testURL(server,'ping'),{},controller.signal)).ms);
      $('ping').textContent=format(SpeedCore.median(record.pings));$('jitter').textContent=format(SpeedCore.jitter(record.pings));
      $('live-value').textContent=$('ping').textContent;updateDial(SpeedCore.median(record.pings),'ms');$('progress').value=i+1;drawPings(record.pings);showDiagnostics(record);
    }
    record.pingMs=SpeedCore.median(record.pings);record.jitterMs=SpeedCore.jitter(record.pings);
    stage='Download';record.downloadMbps=(await bandwidth(server,'download',record,run)).mbps;
    stage='Upload';record.uploadMbps=(await bandwidth(server,'upload',record,run)).mbps;
    record.status='complete';record.server=endpointLabel(server);$('server').textContent=record.server;
    $('progress').value=100;phase(null,'MISSION COMPLETE');$('live-value').textContent=format(record.downloadMbps);updateDial(record.downloadMbps);$('live-label').textContent='Download · sustained average';
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
  if(EMBEDDED || controller || scanning || locating)return {error:'Another operation is running.'};
  if(!servers.length)await discoverServers();
  if(controller || scanning || locating)return {error:'Another operation is running.'};
  const automatic=selectedId==='auto';
  const candidates=automatic ? servers.filter(s=>s.available).slice(0,2) : servers.filter(s=>s.id===selectedId && s.available);
  if(!candidates.length){status('No reachable endpoint selected. Scan servers to find another route.');return {error:'No server'};}
  const run={streams:Number($('stream-count').value)===1?1:4,reserved:0,stopped:false};
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
      current=record;drawSpeed(record);drawPings(record.pings);showRatings(record);showDiagnostics(record);$('diag-endpoint').textContent=record.server;$('route-note').textContent='Saved measurement · '+record.server;
      for(const [id,key] of [['download','downloadMbps'],['upload','uploadMbps'],['ping','pingMs'],['jitter','jitterMs']])$(id).textContent=completed ? format(record[key]):'—';
      for(const direction of ['download','upload'])$(`${direction}-detail`).textContent=completed ? `${(record[direction].durationMs/1000).toFixed(1)} s · ${(record[direction].bytes/1000000).toFixed(0)} MB`:'Incomplete · partial trace';
      $('server').textContent=record.server;$('live-value').textContent=completed ? format(record.downloadMbps):'—';$('live-unit').textContent='Mbps';$('flight-time').textContent='HISTORY';
      updateDial(completed ? record.downloadMbps : 0);phase(null,'RECORDED FLIGHT');status(`Viewing ${new Date(record.date).toLocaleString()} · ${record.status}${record.error ? ' · '+record.error:''}`);
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
$('retry').addEventListener('click',()=>{selectedId='auto';renderServers();startTest();});
$('scan').addEventListener('click',discoverServers);
$('locate').addEventListener('click',locate);
$('change-location').addEventListener('click',()=>{
  const editor=$('location-editor');editor.hidden=!editor.hidden;
  $('change-location').setAttribute('aria-expanded',String(!editor.hidden));
  if(!editor.hidden)$('location-choice').focus();
});
$('apply-location').addEventListener('click',applyLocation);
if(EMBEDDED){
  document.body.replaceChildren(node('p','Open Orbit directly in its own tab to use network tests.'));
}else{
drawSpeed();drawPings();showRatings();showDiagnostics();updateDial();
loadHistory();
initializeLocation();

} // End top-level page initialization.
