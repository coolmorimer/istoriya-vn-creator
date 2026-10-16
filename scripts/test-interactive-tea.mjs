import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {compileProject} from '../runtime/compiler.mjs';
const base=path.join(process.env.LOCALAPPDATA??os.tmpdir(),'IstoriyaQA');await fs.mkdir(base,{recursive:true});
const root=await fs.mkdtemp(path.join(base,'interactive-tea-'));
const args=process.argv,packageIndex=args.indexOf('--package'),archive=packageIndex>=0?args[packageIndex+1]:null;
const exploration=`    advance until screen "istoriya_explore"
    assert not eval _istoriya_explore_ready("", "tea-recipe-received")
    click pos (920, 570)
    assert screen "istoriya_prop_verbs"
    click "Попросить рецепт"
    advance until eval (_last_say_what or "").startswith("Конечно. Мята")
    assert eval istoriya_inventory.get("tea-recipe", 0) == 1
    assert eval flag_tea_recipe_received is True
    advance until screen "istoriya_explore"
    assert eval _istoriya_explore_ready("", "tea-recipe-received")
    screenshot "tea-interactive.png"
    click "Инвентарь"
    assert screen "istoriya_inventory_screen"
    click "Закрыть"
    click "Продолжить"
`;
const original=await fs.readFile('tests/fixtures/tea-runtime-test.rpy','utf8');let name='',choices=0;
const fixture=original.split('\n').map(line=>{
 if(line.startsWith('testcase ')){name=line;choices=0;}
 if(line.trim()==='advance until screen "choice"'&&(choices++>0||name.includes('save_load_rollback')))return exploration+line;
 return line;
}).join('\n');
const fixturePath=path.join(root,'testcases.rpy');await fs.writeFile(fixturePath,fixture);
if(!archive){const project=JSON.parse(await fs.readFile('examples/tea-with-goblins/Чай вместо подвига — интерактивный проект.vnproject','utf8'));await compileProject(project,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});}
await fs.writeFile('.artifacts/interactive-tea-runtime-location.json',JSON.stringify({root,archive},null,2));
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop',...(archive?['--package',archive]:['--source',path.join(root,'project')]),'--fixture',fixturePath,'--qa-root',root],{stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
