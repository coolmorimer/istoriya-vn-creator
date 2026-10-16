import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// Keep generated projects and screenshots off the nearly full repository drive.
export async function createQaDirectory(prefix){
 if(!/^[a-z0-9-]+$/.test(prefix))throw Error('Invalid QA directory prefix');
 const base=path.resolve(process.env.ISTORIYA_QA_ROOT??path.join(process.env.LOCALAPPDATA??os.tmpdir(),'IstoriyaQA'));
 await fs.mkdir(base,{recursive:true});return fs.mkdtemp(path.join(base,prefix));
}
