// Local preview only: fixed public assets, loopback binding, no proxy or upload route.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../dist/',import.meta.url);
const port=Number(process.env.PORT || 8000);
if(!Number.isInteger(port) || port<0 || port>65535)throw new Error('Invalid PORT');
const assets=new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html',['index.html','text/html; charset=utf-8']],
  ...['app.js','core.js','security.js'].map(name=>['/'+name,[name,'text/javascript; charset=utf-8']]),
  ['/styles.css',['styles.css','text/css; charset=utf-8']],
  ['/servers.json',['servers.json','application/json; charset=utf-8']],
  ['/rocket.png',['rocket.png','image/png']],
]);
const html=await readFile(new URL('index.html',root),'utf8');
const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  const actualPort=server.address().port;
  res.setHeader('Content-Security-Policy',policy+"; frame-ancestors 'none'");
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Cache-Control','no-store');
  const hosts=new Set([`localhost:${actualPort}`,`127.0.0.1:${actualPort}`]);
  const finish=(code,message)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.method==='HEAD'?'':message);};
  if(!hosts.has(req.headers.host))return finish(403,'Unapproved host');
  if(req.headers.origin && ![...hosts].some(host=>req.headers.origin===`http://${host}`))return finish(403,'Cross-origin request denied');
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return finish(405,'Method not allowed');}
  if(req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0)>0)return finish(400,'Request body not allowed');
  let path;
  try {path=new URL(req.url,`http://${req.headers.host}`).pathname;}catch{return finish(400,'Invalid URL');}
  const asset=assets.get(path);if(!asset)return finish(404,'Not found');
  try {
    const data=await readFile(fileURLToPath(new URL(asset[0],root)));
    res.writeHead(200,{'Content-Type':asset[1],'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);
  }catch{return finish(500,'Asset unavailable');}
});
server.requestTimeout=10000;server.headersTimeout=5000;server.keepAliveTimeout=5000;server.maxConnections=64;
server.listen(port,'127.0.0.1',()=>console.log(`Orbit: http://localhost:${server.address().port}`));
