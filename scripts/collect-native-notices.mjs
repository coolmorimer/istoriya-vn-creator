import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const output=path.resolve('.artifacts/notices');
await fs.mkdir(output,{recursive:true});
const cargo=path.join(os.homedir(),'.cargo/bin/cargo.exe');
const metadata=JSON.parse(execFileSync(cargo,['metadata','--locked','--format-version','1','--manifest-path','src-tauri/Cargo.toml'],{maxBuffer:32*1024*1024,encoding:'utf8'}));
const licenses=[];
for(const pkg of metadata.packages.filter(pkg=>pkg.source)) {
  const root=path.dirname(pkg.manifest_path);
  const files=(await fs.readdir(root)).filter(name=>/^(licen[sc]e|copying|notice)([-.]|$)/i.test(name));
  licenses.push(`\n===== ${pkg.name}@${pkg.version}: ${pkg.license??'see upstream'} =====\n${pkg.repository??''}`);
  for(const file of files){const full=path.join(root,file);if((await fs.stat(full)).isFile())licenses.push(`--- ${file} ---\n${await fs.readFile(full,'utf8')}`);}
}
await fs.writeFile(path.join(output,'RUST_DEPENDENCY_LICENSES.txt'),licenses.join('\n'));
await fs.copyFile('src-tauri/Cargo.lock',path.join(output,'Cargo.lock'));
const nodeVersion=process.versions.node;
const response=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`);
if(!response.ok)throw Error(`Node license unavailable: ${response.status}`);
await fs.writeFile(path.join(output,'NODE_RUNTIME_LICENSE.txt'),await response.text());
console.log(`Collected Rust notices and Node ${nodeVersion} runtime license.`);
