// Actual native Rust pipeline acceptance on an owned copy. Poison the old JS
// builder/GUI launcher: a successful package cannot be coming from that path.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createQaDirectory} from './qa-directory.mjs';
import {createProject} from '../src/domain/projectFactory.js';
import {compilerInternals} from '../runtime/compiler.mjs';

if(process.platform!=='win32')throw Error('Rust engine verification requires Windows and a freshly built release EXE.');
const root=await createQaDirectory('rust-engine-'),app=path.join(root,'app'),runtime=path.join(app,'native');
await fs.mkdir(runtime,{recursive:true});await fs.mkdir(path.join(root,'temp'));
const json=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const digest=async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex');
const source=path.resolve('src-tauri/target/release/istoriya.exe'),exe=path.join(app,'istoriya.exe');
await fs.copyFile(source,exe);
const shipped=path.resolve('src-tauri/target/release/native');
for(const directory of ['runtime','public'])await fs.cp(path.join(shipped,directory),path.join(runtime,directory),{recursive:true});
await fs.copyFile(path.join(shipped,'node.exe'),path.join(runtime,'node.exe'));
await fs.symlink(path.join(shipped,'renpy-sdk'),path.join(runtime,'renpy-sdk'),'junction');
await fs.writeFile(path.join(runtime,'runtime/builder.mjs'),"throw Error('QA: legacy Node build orchestration must not run');\n");
await fs.copyFile(path.join(runtime,'runtime/gui-template.mjs'),path.join(runtime,'runtime/gui-template-real.mjs'));
await fs.writeFile(path.join(runtime,'runtime/gui-template.mjs'),"export {validateGameGui} from './gui-template-real.mjs';\nexport async function generateGameGui(){throw Error('QA: Node must not launch SDK GUI generation');}\n");
await fs.copyFile(path.join(runtime,'runtime/native-worker.mjs'),path.join(runtime,'runtime/source-emitter-real.mjs'));
const operations=path.join(root,'emitter-operations.jsonl');
await fs.writeFile(path.join(runtime,'runtime/native-worker.mjs'),`import fs from 'node:fs/promises';\nconst request=JSON.parse(await fs.readFile(process.argv[2],'utf8'));\nawait fs.appendFile(${JSON.stringify(operations)},JSON.stringify({operation:request.operation,preparedGui:!!request.options?.preparedGui})+'\\n');\nawait import('./source-emitter-real.mjs');\n`);

async function command(name,executable,args,expected=0){
  let output='';const child=spawn(executable,args,{windowsHide:true,env:{...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')}});
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});
  const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  await fs.writeFile(path.join(root,name+'.log'),output);assert.equal(exitCode,expected,name);return output;
}

const project=createProject({title:'Rust конвейер — проверка',resolution:{width:1280,height:720}}),scene=Object.values(project.scenes)[0];
scene.actions=[{id:'intro',type:'narration',text:'Работает Rust конвейер'},{id:'choice',type:'choice',prompt:'Проверка ветвей',options:[{id:'first',text:'Первый путь',targetSceneId:'first'},{id:'second',text:'Второй путь',targetSceneId:'second'}]}];
for(const [id,text] of [['first','Первый финал'],['second','Второй финал']]){project.scenes[id]={id,title:text,characters:[],images:[],actions:[{id:'line',type:'narration',text},{id:'end',type:'end'}]};project.chapters[0].scenes.push(id);}
const fixture=path.join(root,'project.vnproject');await fs.writeFile(fixture,JSON.stringify(project));
const output=path.join(root,'native-check'),packages=path.join(output,'game');await fs.mkdir(packages,{recursive:true});
const stale=path.join(packages,'old-win.zip');await fs.writeFile(stale,'INTENTIONALLY INVALID STALE QA PACKAGE');
await command('native-first',exe,['--verify-native',fixture,output]);
const first=(await json(path.join(output,'result.json'))).build;
assert.equal(first.engine.orchestrator,'rust');assert.equal(first.engine.sourceEmitter,'javascript');
assert.notEqual(path.resolve(first.packagePath),stale);const firstDigest=await digest(first.packagePath);
await command('native-repeat',exe,['--verify-native',fixture,output]);
const second=(await json(path.join(output,'result.json'))).build;
assert.notEqual(second.packagePath,first.packagePath);assert.equal(await digest(first.packagePath),firstDigest);
assert.equal(await fs.readFile(stale,'utf8'),'INTENTIONALLY INVALID STALE QA PACKAGE');
const before=await fs.readdir(packages),broken=structuredClone(project);Object.values(broken.scenes)[0].actions[0].type=null;
const bad=path.join(root,'broken.vnproject');await fs.writeFile(bad,JSON.stringify(broken));
await command('native-invalid',exe,['--verify-native',bad,output],1);
assert.match(await fs.readFile(path.join(output,'error.txt'),'utf8'),/У действия не задан тип/);
assert.deepEqual(await fs.readdir(packages),before);assert.equal(await digest(first.packagePath),firstDigest);
const emitted=(await fs.readFile(operations,'utf8')).trim().split('\n').map(JSON.parse);
assert.equal(emitted.length,3);for(const entry of emitted){assert.equal(entry.operation,'compile');assert.equal(entry.preparedGui,true);}

const testcases=path.join(root,'testcases.rpy');
await fs.writeFile(testcases,`testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
    teardown:
        exit

testcase rust_pipeline_branches_and_save_load:
    run Start(${JSON.stringify(compilerInternals.asciiId(scene.id,'scene'))})
    advance until eval (_last_say_what or "") == "Работает Rust конвейер"
    assert eval (_last_say_what or "") == "Работает Rust конвейер"
    advance until screen "choice"
    run FileSave('rust-engine', confirm=False, page='qa')
    assert eval FileLoadable('rust-engine', page='qa')
    click "Первый путь"
    advance until eval (_last_say_what or "") == "Первый финал"
    assert eval (_last_say_what or "") == "Первый финал"
    run FileLoad('rust-engine', confirm=False, page='qa')
    pause 0.1
    assert screen "choice"
    click "Второй путь"
    advance until eval (_last_say_what or "") == "Второй финал"
    assert eval (_last_say_what or "") == "Второй финал"
`);
const games=[];
for(const startup of [false,true]){
  const result=await command(startup?'game-startup':'game-tests',process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',first.packagePath,'--qa-root',root,...(startup?['--startup']:['--fixture',testcases])]);
  const directory=result.split(/\r?\n/).find(l=>l.startsWith('Runtime QA: '))?.slice(12);assert.ok(directory);
  const checked=await json(path.join(directory,'result.json'));assert.equal(checked.passed,true);assert.equal(checked.runtimeException,false);games.push(checked);
}
const report={passed:true,version:JSON.parse(await fs.readFile('package.json','utf8')).version,root,executableSha256:await digest(exe),legacyNodeBuilderDisabled:true,nodeGuiGeneratorDisabled:true,sourceEmitterOperations:emitted,stalePackageRejected:true,existingPackagePreserved:true,invalidProjectRejected:true,first,second,games,ownerProfileChanged:false,osMouseAutomation:false,androidVerified:false,fullRustCompiler:false,fullProductionAccepted:false};
await fs.writeFile(path.join(root,'rust-engine-report.json'),JSON.stringify(report,null,2));
await fs.writeFile('.artifacts/rust-engine-location.json',JSON.stringify({root,reportPath:path.join(root,'rust-engine-report.json')},null,2));
console.log(JSON.stringify({passed:true,root,sourceEmitterOperations:emitted.length,scope:'Actual Rust EXE pipeline; Windows package and game; not full Rust compiler or production acceptance'}));
