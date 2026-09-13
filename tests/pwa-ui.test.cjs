const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('dist/pwa.js','utf8');
function emitter(object={}) {const listeners={};object.addEventListener=(name,fn)=>(listeners[name]??=[]).push(fn);object.emit=async(name,event={})=>{for(const fn of listeners[name]||[])await fn(event);};return object;}
function setup({standalone=false,installing=false,unsupported=false}={}) {
  const elements=new Map(),classes=new Set();
  const el=id=>{if(!elements.has(id))elements.set(id,emitter({textContent:'',hidden:false,disabled:false,open:false,showModal(){this.open=true;},close(){this.open=false;}}));return elements.get(id);};
  const active=emitter({state:'activated'}),candidate=emitter({state:'installing'});
  const reg=emitter({active:installing?null:active,installing:installing?candidate:null,waiting:null,updates:0,async update(){this.updates++;}});
  const service=emitter({calls:0,async register(){this.calls++;return reg;}});
  const nav={onLine:true,serviceWorker:service};if(unsupported)delete nav.serviceWorker;
  const window=emitter({isSecureContext:true,matchMedia:()=>emitter({matches:standalone})});window.self=window;window.top=window;
  const context=vm.createContext({window,navigator:nav,document:{getElementById:el,baseURI:'https://example.github.io/orbit-speed-test/',body:{classList:{contains:name=>classes.has(name)}}},URL,console});
  vm.runInContext(source,context);
  return {el,window,nav,reg,candidate,active,service,classes,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('installed app retains an accessible information and update control',async()=>{
  const app=setup({standalone:true});await app.flush();
  assert.equal(app.el('install-label').textContent,'App info');assert.equal(app.el('install-app').hidden,false);
  await app.el('install-app').emit('click');assert.equal(app.el('install-dialog').open,true);assert.equal(app.el('install-help').open,false);
  assert.match(app.el('install-status').textContent,/Offline history is ready/);
});
test('failed first-time offline installation reports failure and can be retried',async()=>{
  const app=setup({installing:true});await app.flush();
  app.reg.installing=null;app.candidate.state='redundant';await app.candidate.emit('statechange');
  assert.match(app.el('install-status').textContent,/could not finish/);
  app.service.register=async()=>{app.service.calls++;app.reg.active=app.active;return app.reg;};
  await app.el('check-app-update').emit('click');assert.equal(app.service.calls,2);assert.equal(app.reg.updates,0);assert.match(app.el('install-status').textContent,/up to date/);
});
test('update requests are blocked during measurements or offline',async()=>{
  const app=setup();await app.flush();app.classes.add('running');
  await app.el('check-app-update').emit('click');assert.equal(app.reg.updates,0);assert.match(app.el('install-status').textContent,/Finish the current test/);
  app.classes.clear();app.nav.onLine=false;await app.el('check-app-update').emit('click');assert.equal(app.reg.updates,0);assert.match(app.el('install-status').textContent,/Reconnect/);
});
test('failed update checks report the error without claiming the app is current',async()=>{
  const app=setup();await app.flush();app.reg.update=async()=>{throw new Error('offline');};
  await app.el('check-app-update').emit('click');assert.match(app.el('install-status').textContent,/Could not check/);assert.equal(app.el('check-app-update').disabled,false);
});
test('downloaded updates stay waiting and explain how to activate safely',async()=>{
  const app=setup();await app.flush();app.reg.waiting=app.candidate;app.reg.installing=null;
  await app.reg.emit('updatefound');assert.equal(app.el('app-update').hidden,false);assert.match(app.el('install-status').textContent,/close all Orbit windows/);
  assert.equal(app.reg.waiting,app.candidate); // No forced activation or reload.
});
test('unsupported browsers keep installation help without exposing a broken update action',async()=>{
  const app=setup({unsupported:true});await app.flush();
  assert.equal(app.el('check-app-update').disabled,true);await app.el('install-app').emit('click');assert.equal(app.el('install-dialog').open,true);
});
