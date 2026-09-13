/* Reviewed endpoint allowlist. Catalog updates cannot expand it at runtime. */
const OrbitSecurity = (() => {
  const endpoints = new Set([
  "https://man.speedtest.clouvider.net/backend/garbage.php",
  "https://man.speedtest.clouvider.net/backend/empty.php",
  "https://dal.speedtest.clouvider.net/backend/garbage.php",
  "https://dal.speedtest.clouvider.net/backend/empty.php",
  "https://ash.speedtest.clouvider.net/backend/garbage.php",
  "https://ash.speedtest.clouvider.net/backend/empty.php",
  "https://phx.speedtest.clouvider.net/backend/garbage.php",
  "https://phx.speedtest.clouvider.net/backend/empty.php",

  "https://ams.speedtest.clouvider.net/backend/garbage.php",
  "https://ams.speedtest.clouvider.net/backend/empty.php",
  "https://amsspeed.sharktech.net/backend/garbage.php",
  "https://amsspeed.sharktech.net/backend/empty.php",
  "https://argalasti.skoultsos.eu/backend/garbage.php",
  "https://argalasti.skoultsos.eu/backend/empty.php",
  "https://atl.speedtest.clouvider.net/backend/garbage.php",
  "https://atl.speedtest.clouvider.net/backend/empty.php",
  "https://speedtest1.sox.rs/librespeed/backend/garbage.php",
  "https://speedtest1.sox.rs/librespeed/backend/empty.php",
  "https://chispeed.sharktech.net/backend/garbage.php",
  "https://chispeed.sharktech.net/backend/empty.php",
  "https://denspeed.sharktech.net/backend/garbage.php",
  "https://denspeed.sharktech.net/backend/empty.php",
  "https://fra.speedtest.clouvider.net/backend/garbage.php",
  "https://fra.speedtest.clouvider.net/backend/empty.php",
  "https://speed.fs-it.systems/backend/garbage.php",
  "https://speed.fs-it.systems/backend/empty.php",
  "https://mispeed.rackgenius.com/backend/garbage.php",
  "https://mispeed.rackgenius.com/backend/empty.php",
  "https://www.librespeed.fi/backend/garbage.php",
  "https://www.librespeed.fi/backend/empty.php",
  "https://lasspeed.sharktech.net/backend/garbage.php",
  "https://lasspeed.sharktech.net/backend/empty.php",
  "https://lon.speedtest.clouvider.net/backend/garbage.php",
  "https://lon.speedtest.clouvider.net/backend/empty.php",
  "https://la.speedtest.clouvider.net/backend/garbage.php",
  "https://la.speedtest.clouvider.net/backend/empty.php",
  "https://laxspeed.sharktech.net/backend/garbage.php",
  "https://laxspeed.sharktech.net/backend/empty.php",
  "https://nyc.speedtest.clouvider.net/backend/garbage.php",
  "https://nyc.speedtest.clouvider.net/backend/empty.php",
  "https://speed1.e-caps.net/backend/garbage.php",
  "https://speed1.e-caps.net/backend/empty.php",
  "https://speedtest.kamilszczepanski.com/garbage.php",
  "https://speedtest.kamilszczepanski.com/empty.php",
  "https://speedtest.cesnet.cz/backend/garbage.php",
  "https://speedtest.cesnet.cz/backend/empty.php",
  "https://librespeed.turris.cz/backend/garbage.php",
  "https://librespeed.turris.cz/backend/empty.php",
  "https://st-be-rm2.infra.garr.it/garbage.php",
  "https://st-be-rm2.infra.garr.it/empty.php",
  "https://librespeed.a573.net/backend/garbage.php",
  "https://librespeed.a573.net/backend/empty.php"
]);
  const metadata = new Set([
    'https://speed.cloudflare.com/__down', 'https://speed.cloudflare.com/__up',
    'https://stat.ripe.net/data/whats-my-ip/data.json',
    'https://stat.ripe.net/data/network-info/data.json',
    'https://stat.ripe.net/data/as-overview/data.json',
    'https://librespeed.org/backend-servers/servers.php'
  ]);
  function approvedURL(value, pageURL) {
    const page=new URL(pageURL), url=new URL(value,page);
    if(url.username || url.password || url.hash) throw new Error('Unapproved request URL');
    const local=new URL('servers.json',page);
    if(url.href===local.href) return url.href;
    if(url.protocol!=='https:' || url.port) throw new Error('HTTPS is required for remote requests');
    if(!endpoints.has(url.origin+url.pathname) && !metadata.has(url.origin+url.pathname)) throw new Error('Unreviewed request destination');
    return url.href;
  }
  function approvedServer(item) {
    if(!item || typeof item.name!=='string' || item.name.length>160 || !Number.isSafeInteger(item.id) || item.id<0 || typeof item.server!=='string') return false;
    try {
      const base=new URL((item.server.startsWith('//')?'https:':'')+item.server.replace(/\/?$/, '/'));
      if(base.protocol!=='https:' || base.username || base.password || base.port || base.search || base.hash) return false;
      return ['dlURL','ulURL','pingURL'].every(key=>{
        if(typeof item[key]!=='string' || item[key].length>200) return false;
        const url=new URL(item[key],base);
        return !url.username && !url.password && !url.search && !url.hash && url.origin===base.origin && endpoints.has(url.href);
      });
    } catch {return false;}
  }
  // Consume binary bodies without retaining them; bound decoded JSON before parsing.
  async function readBody(response, limit, json=false) {
    const size=Number(response.headers.get('content-length'));
    if(Number.isFinite(size) && size>limit) {await response.body?.cancel();throw new Error('Response exceeds safety limit');}
    if(!response.body) return json ? JSON.parse('') : {byteLength:0};
    const reader=response.body.getReader();let total=0;const chunks=[];
    try {
      while(true){
        const {done,value}=await reader.read();if(done)break;
        total+=value.byteLength;
        if(total>limit){await reader.cancel();throw new Error('Response exceeds safety limit');}
        if(json)chunks.push(value);
      }
    } finally {reader.releaseLock();}
    if(!json)return {byteLength:total};
    const data=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(data));
  }
  const finite=n=>typeof n==='number' && Number.isFinite(n) && n>=0 && n<=1e12;
  function validIP(value) {
    if(typeof value!=='string' || value.length>45)return false;
    if(/^(\d{1,3}\.){3}\d{1,3}$/.test(value))return value.split('.').every(part=>Number(part)<=255);
    if(!/^[a-fA-F0-9:.]+$/.test(value) || !value.includes(':'))return false;
    try {return new URL(`https://[${value}]/`).hostname.startsWith('[');}catch{return false;}
  }
  const recordKeys=new Set(['id','date','status','server','serverId','pings','download','upload','pingMs','jitterMs','downloadMbps','uploadMbps','finished','error','streams','measurementVersion','recoveryFrom','network']);
  function validNetwork(n) {
    return n && typeof n==='object' && Object.keys(n).length===4 && Object.keys(n).every(k=>['type','source','effectiveType','saveData'].includes(k)) &&
      ['unknown','wifi','ethernet','cellular','3g','4g','5g','bluetooth','wimax','mixed','other','none'].includes(n.type) &&
      ['browser','manual','unavailable'].includes(n.source) && ['unknown','slow-2g','2g','3g','4g'].includes(n.effectiveType) && typeof n.saveData==='boolean' &&
      (!['3g','4g','5g'].includes(n.type) || n.source==='manual');
  }
  function validRecord(r) {
    if(!r || typeof r!=='object' || Object.keys(r).some(key=>!recordKeys.has(key)) || typeof r.id!=='string' || r.id.length>100 || typeof r.date!=='string' || !Number.isFinite(Date.parse(r.date)) || typeof r.server!=='string' || r.server.length>200 || !['running','failed','cancelled','complete'].includes(r.status))return false;
    if(r.network!==undefined && !validNetwork(r.network))return false;
    if(r.streams!==undefined && ![1,4].includes(r.streams))return false;
    if(r.measurementVersion!==undefined && r.measurementVersion!==2)return false;
    if(r.recoveryFrom!==undefined && (typeof r.recoveryFrom!=='string' || r.recoveryFrom.length>200))return false;
    if(r.serverId!==undefined && (typeof r.serverId!=='string' || r.serverId.length>100))return false;
    if(r.finished!==undefined && (typeof r.finished!=='string' || !Number.isFinite(Date.parse(r.finished))))return false;
    if(!Array.isArray(r.pings) || r.pings.length>100 || !r.pings.every(finite))return false;
    for(const key of ['download','upload']){
      const data=r[key];if(data==null)continue;
      if(Object.keys(data).some(k=>!['bytes','durationMs','transferMs','mbps','points','loadedPings','probeFailures','requests','retries'].includes(k)))return false;
      if(data.loadedPings!==undefined && (!Array.isArray(data.loadedPings) || data.loadedPings.length>100 || !data.loadedPings.every(finite)))return false;
      for(const field of ['probeFailures','requests','retries'])if(data[field]!==undefined && (!Number.isSafeInteger(data[field]) || data[field]<0 || data[field]>1000))return false;
      if(!finite(data.bytes)||!finite(data.durationMs)||!finite(data.transferMs)||!finite(data.mbps)||!Array.isArray(data.points)||data.points.length>1000||!data.points.every(p=>p && Object.keys(p).every(k=>['seconds','mbps'].includes(k)) && finite(p.seconds)&&finite(p.mbps)))return false;
    }
    if(r.status==='complete' && (!r.download || !r.upload || !['downloadMbps','uploadMbps','pingMs','jitterMs'].every(k=>finite(r[k]))))return false;
    return !r.error || (typeof r.error==='string' && r.error.length<1000);
  }
  return {approvedURL,approvedServer,readBody,validRecord,validNetwork,validIP};
})();
if(typeof module!=='undefined')module.exports=OrbitSecurity;
