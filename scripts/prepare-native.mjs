import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.artifacts/native-resources');
await fs.mkdir(root,{recursive:true});
await fs.copyFile(process.execPath,path.join(root,'node.exe'));
await fs.cp('runtime',path.join(root,'runtime'),{recursive:true});
await fs.cp('public',path.join(root,'public'),{recursive:true});
await fs.cp('../renpy-8.5.3-sdk',path.join(root,'renpy-sdk'),{recursive:true,filter:source=>!/(?:[\\/](?:tmp|saves)[\\/]|[\\/]rapt[\\/](?:project[\\/]|sdk\.txt$)|\.(?:log|jks|keystore)$|[\\/](?:log|traceback|errors)\.txt$|[\\/]local\.properties$)/i.test(source)});
console.log('Prepared native runtime resources; Node is used only by the transitional RenPy compiler.');
