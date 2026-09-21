import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('.artifacts/notices');
await fs.mkdir(output,{recursive:true});
for(const file of ['THIRD_PARTY_NOTICES.md','LICENSE']) await fs.copyFile(file,path.join(output,path.basename(file)));
for(const name of ['manrope','cormorant-garamond']) await fs.copyFile(`node_modules/@fontsource-variable/${name}/LICENSE`,path.join(output,`${name}-LICENSE.txt`));
const notices=[];
async function visit(dir) {
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if(!entry.isDirectory() || entry.name==='.bin') continue;
    const root=path.join(dir,entry.name);
    if(entry.name.startsWith('@')) {await visit(root);continue;}
    let pkg;try {pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));}catch{continue;}
    const files=(await fs.readdir(root)).filter(f=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(f));
    for(const file of files) {const full=path.join(root,file);if((await fs.stat(full)).isFile())notices.push(`\n===== ${pkg.name}@${pkg.version}: ${file} =====\n${await fs.readFile(full,'utf8')}`);}
    try {await visit(path.join(root,'node_modules'));}catch(error){if(error.code!=='ENOENT')throw error;}
  }
}
await visit('node_modules');
await fs.writeFile(path.join(output,'NODE_DEPENDENCY_LICENSES.txt'),notices.join('\n'));
console.log(`Collected ${notices.length} dependency notices`);
