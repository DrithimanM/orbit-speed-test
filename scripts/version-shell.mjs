import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../dist/', import.meta.url);
const worker = new URL('sw.js', root);
const source = await readFile(worker, 'utf8');
const files = JSON.parse(source.match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1]);
const hash = createHash('sha256');
for (const file of files) { hash.update(file + '\0'); hash.update(await readFile(new URL(file, root))); }
const version = hash.digest('hex').slice(0, 20);
if (process.argv.includes('--check')) {
  if (!source.includes(`const CACHE_VERSION = '${version}';`)) throw new Error('App assets changed. Run npm run cache:version before publishing.');
  console.log('Offline shell fingerprint is current.');
} else {
  await writeFile(worker, source.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`));
  console.log('Updated offline shell fingerprint: ' + version);
}
