const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function harness(overrides={}) {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',value:id==='provider-filter'?'all':id==='stream-count'?'3':'none',hidden:false,disabled:false,dataset:{},style:{},children:[],classList:{toggle(){},remove(){},contains(){return false;}},setAttribute(){},getAttribute(){return 'false';},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},addEventListener(){},querySelector(){return null;},focus(){}});
    return elements.get(id);
  };
  const doc={baseURI:'http://localhost:8000/',getElementById:element,body:element('body'),createElement:()=>element(Symbol()),createTextNode:text=>({textContent:text}),createElementNS:()=>element(Symbol())};
  const ctx=vm.createContext({URL,AbortSignal,AbortController,crypto:webcrypto,performance,Uint8Array,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,console,document:doc,navigator:{onLine:true},window:{},Option:function(text,value){this.text=text;this.value=value;},OrbitSecurity:require('../dist/security.js'),OrbitUI:new Proxy({},{get:()=>()=>{}}),...overrides});
  for(const file of ['dist/core.js','dist/telemetry.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
  const app=fs.readFileSync('dist/app.js','utf8');
  vm.runInContext(app.slice(0,app.indexOf('// Interface event wiring.')),ctx,{filename:'dist/app.js'});
  return {ctx,element,run:source=>vm.runInContext(source,ctx)};
}
module.exports={harness};
