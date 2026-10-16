// Tauri --no-bundle embeds the UI but does not refresh adjacent runtime files.
// Never leave an older compiler next to the newly built editor.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const source=path.resolve('.artifacts/native-resources'),destination=path.resolve('src-tauri/target/release/native');
await fs.access(path.join(source,'runtime/native-worker.mjs'));
await fs.cp(source,destination,{recursive:true});
const files=(await fs.readdir(path.join(source,'runtime'))).filter(name=>name.endsWith('.mjs')).sort(),hashes={};
for(const name of files){const digest=bytes=>createHash('sha256').update(bytes).digest('hex');const expected=digest(await fs.readFile(path.join(source,'runtime',name))),actual=digest(await fs.readFile(path.join(destination,'runtime',name)));if(actual!==expected)throw Error(`Native compiler copy differs: ${name}`);hashes[name]=actual;}
const {version}=JSON.parse(await fs.readFile('package.json','utf8'));
await fs.writeFile('.artifacts/native-runtime-check.json',JSON.stringify({version,source,destination,files:hashes},null,2));
console.log(`Synchronized native compiler ${version}: ${files.length} verified modules.`);
