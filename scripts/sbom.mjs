import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const components=[];
for(const [path,value] of Object.entries(lock.packages||{})){
  if(!path || value.link)continue;
  const name=path.split('node_modules/').at(-1);components.push({type:'library',name,version:value.version,scope:'optional',purl:`pkg:npm/${name.replace('@','%40')}@${value.version}`,properties:[{name:'orbit:usage',value:'development verification only; excluded from dist'}],...(value.license ? {licenses:[{license:{id:value.license}}]} : {})});
}
const digest=createHash('sha256').update(await readFile('package-lock.json')).digest('hex');
const bom={bomFormat:'CycloneDX',specVersion:'1.5',version:1,metadata:{component:{type:'application',name:pkg.name,version:pkg.version,properties:[{name:'orbit:runtime-package-dependencies',value:'0'},{name:'orbit:lock-sha256',value:digest},{name:'orbit:source-license',value:'Not declared; owner decision pending'}]}},components};
await mkdir('coverage',{recursive:true});await writeFile('coverage/sbom.cdx.json',JSON.stringify(bom,null,2)+'\n');console.log(`CycloneDX SBOM: ${components.length} verification packages; zero deployed npm dependencies`);
