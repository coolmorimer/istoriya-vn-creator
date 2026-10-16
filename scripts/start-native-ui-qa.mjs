// Starts only our QA EXE on a new non-input Windows desktop. No OS input injection.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
const index=process.argv.indexOf('--resume');
const timeoutIndex=process.argv.indexOf('--timeout-seconds'),timeoutSeconds=timeoutIndex<0?600:Number(process.argv[timeoutIndex+1]);
if(!Number.isInteger(timeoutSeconds)||timeoutSeconds<30||timeoutSeconds>3600)throw Error('QA timeout must be between 30 and 3600 seconds.');
const qaBase=path.join(process.env.LOCALAPPDATA??os.tmpdir(),'IstoriyaQA');
if(index<0)await fs.mkdir(qaBase,{recursive:true});
const root=index>=0?await fs.realpath(process.argv[index+1]):await fs.mkdtemp(path.join(qaBase,'native-ui-'));
const executable=path.resolve('src-tauri/target/release/istoriya.exe');
await fs.access(executable);
const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const run=await fs.mkdtemp(path.join(root,'run-')),request=path.join(run,'request.json');
await fs.writeFile(request,JSON.stringify({executable,arguments:[index>=0?'--verify-ui-resume':'--verify-ui',root],directory:path.dirname(executable),logPath:path.join(run,'output.log'),resultPath:path.join(run,'process-result.json'),timeoutSeconds,closeSignal:path.join(run,'close-request')},null,2));
const metadata={root,run,endpoint:`http://127.0.0.1:${port}`,closeSignal:path.join(run,'close-request'),executable,startedAt:new Date().toISOString()};
await fs.mkdir('.artifacts',{recursive:true});
await fs.writeFile('.artifacts/native-ui-qa-location.json',JSON.stringify(metadata,null,2));
const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/run-isolated-game.ps1'),'-Request',request],{
 windowsHide:true,stdio:'inherit',env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port} --mute-audio`},
});
const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
console.log(JSON.stringify(metadata,null,2));
const code=await completion;
console.log(`Isolated native UI exited: ${code}; evidence: ${run}`);
process.exitCode=code??1;
